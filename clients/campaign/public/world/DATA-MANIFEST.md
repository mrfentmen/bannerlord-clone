# DATA-MANIFEST.md

Every dataset the campaign map client renders, where it came from, and what is missing
from it. Required by `CONSTITUTION.md` section 1.1 and `ASSETS.md` section 2.2.

The three files this client reads are `region.json`, `settlements.json`, and
`network.json`. They are **built and deployed by `services/world-data`**, not fetched
by this client's own tooling:

```bash
cd services/world-data
python -m worlddata wire --out exports/wire   # build from the pipeline's tables
python tools/deploy-wire-to-client.py          # deploy into clients/campaign/public/world
```

`tools/fetch-world-data.mjs` remains the fallback for a region the pipeline has not
been configured for, and its output is for a *different* region: it always fetches the
Northern Colorado Front Range. Do not run it against this data — it will overwrite the
deployed files with Colorado ones. `tests/test_client_region_bundle.py` and
`src/world/loadRegion.test.ts` both fail if the two regions are mixed.

The region, bbox, tile list, and elevation encoding are read from `region.json` at
runtime. The client hard-codes none of them.

---

## 1. What is real, and what is not

| Layer | Status | Source |
|---|---|---|
| Terrain elevation | **Real.** NASA/USGS SRTM-derived elevation tiles. | Section 2.1 |
| Roads and rail geometry | **Real.** US Census TIGER/Line. | Section 2.2 |
| Settlement positions and names | **Real.** US Census TIGER/Line place geography + Census estimates. | Section 2.2, 2.3 |
| Settlement populations | **Real.** U.S. Census Bureau, Vintage 2023 sub-county estimates. | Section 2.3 |
| Simulation state — town fields, prices, unrest, cause log, rulers, ledger, sides | **Not real yet.** Owned by the simulation service. See section 4.5. | — |

The split matters. The **map is real today** — the terrain you walk on is real Ohio
River Valley terrain, the roads are real roads, the towns are real places with real Census
populations. What is not real is the *state of the world*: who holds Cincinnati, what
bread costs there, and why. That is the simulation, and the simulation is not this
client's job.

---

## 2. Datasets

### 2.1 Elevation — terrarium tiles

| Field | Value |
|---|---|
| Source | AWS Open Data, `elevation-tiles-prod` |
| URL | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` |
| Upstream provenance | SRTM (Shuttle Radar Topography Mission, NASA), USGS National Map, and other national DEMs merged by Mapzen/AWS Open Data |
| Licence | Public domain. Produced from US government source data; the tile service is published by AWS Open Data at no charge. |
| Retrieved | 2026-09-30 |
| Region | 37.10–40.60 N, 85.30–81.60 W (Ohio River Valley; ≈ 390 km N–S × 321 km E–W) |
| Decoding | `elevation_m = R * 256 + G + B / 256 − 32768`, where R/G/B are the raw bytes of the PNG pixel |
| File | `public/world/elevation/{z}/{x}/{y}.png` |

**Two tile tiers, and why.** `region.json` lists both, and the client fetches only the
first:

| Tier | Key in `region.json` | Zoom | Tiles | On disk |
|---|---|---:|---:|---|
| Boot | `elevation` | 10 | 154 (11 × 14) | Yes, committed — about 7.9 MB |
| Detail | `elevationDetail` | 12 | 2,236 | No, fetched on demand — about 250 MB |

`loadHeightfield` fetches every tile in `elevation` before the map draws, and throws a
retryable error on the first missing one rather than drawing a hole. That is why the
committed boot tier must be complete: it is a boot dependency. At zoom 12 this region
needs 2,236 tiles, which is not something to block a game start on, so the full-
resolution list is a separate key that a caller can fetch with
`python -m worlddata fetch-elevation --region <region.json> --out <dir> --tier detail`.

Decoding is implemented in `loadHeightfield` (`src/world/load.ts`) and unit-tested
against hand-decoded pixel values in `src/world/load.test.ts`, with the committed
`region.json` and the boot tier's files on disk checked by `src/world/loadRegion.test.ts`.

**Known limits.** Zoom 10 is about 122 m per pixel at this latitude, so the boot terrain
is coarse — ridgelines and river valleys are heavily smoothed. That is why the detail
tier exists. Battle terrain is Phase 4 and will need better data; that is recorded in
section 5.

### 2.2 Roads, rail, and settlement locations — US Census TIGER/Line

| Field | Value |
|---|---|
| Source | U.S. Census Bureau, TIGER/Line 2023 — Primary and Secondary Roads, Rail Lines, and Places |
| Upstream | Derived from USGS National Map and state sources by the Census Bureau |
| Licence | **U.S. Government work, public domain** (Title 17 U.S.C. 105). No attribution required. |
| Retrieved | 2026-09-30 |
| Roads | 439 segments — 280 primary, 159 secondary |
| Rail | 4,653 segments — `railway=rail` |
| Settlements | 487 places inside the V1 bbox, largest first |
| Travel graph | 590 settlement-to-settlement edges (`travelEdges`, `travelEdgesMeta`) |
| File | `public/world/network.json`, `public/world/settlements.json` |
| Attribution | Not required. The credit line in the in-game panel reads "US Census Bureau, TIGER/Line — public domain" (`src/ui/hud.ts`). |

**This is not OpenStreetMap.** The deployed geometry is TIGER/Line, so the ODbL
attribution the previous Colorado stopgap required does not apply to it. Two other
modules still carry OSM references (`src/scene/buildings.ts`, `src/scene/cityDemo.ts`)
for building footprints, which this region does not have — see section 4.3.

**Settlements span five states.** The V1 bbox crosses state lines, so the region
contains places in Indiana, Kentucky, Ohio, Virginia, and West Virginia. `region.json`
records this in `stateCoverage` with the basis for the claim, and the client falls back
to that when a settlement carries no per-row state code.

**Road classes kept:** primary and secondary. Tertiary and residential are not in the
source extract. That is a scope decision by the pipeline (`KNOWN_ROAD_CLASSES` in
`services/world-data/src/worlddata/client_wire.py`), not a data gap: the map draws
settlements as clusters, so a full residential grid inside Cincinnati is thousands of
extra polylines carrying no information the player can act on.

**`osmId` is a historical field name.** It carries the pipeline's stable
`settlement_id` (state FIPS + place code), not an OSM node id, because that is the
identifier that survives a re-run. The client's `SettlementIndex` also resolves by
name, so nothing depends on the id being an OSM one.

### 2.3 Populations — U.S. Census Bureau

| Field | Value |
|---|---|
| Source | U.S. Census Bureau, Vintage 2023 sub-county population estimates (`sub-est2023.csv`) |
| URL | `https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/cities/totals/sub-est2023.csv` |
| Licence | U.S. Government work. Public domain. |
| Retrieved | 2026-09-30 |
| Figure used | `ESTIMATESBASE2020` (the 2020 base), carried per settlement with its citation |
| Matched | 487 of 487 settlements — no settlement in this region lacks a real figure |
| Size classes | 3 city, 29 town, 455 village (cut at 100,000 and 25,000; see `src/design/tokens.ts`) |

Every settlement's `populationSource` names the vintage and the census year, so the
figure on screen is always traceable to a published column rather than to a heuristic.

**Why not the OSM `population` tag.** OSM population tags are frequently a decade out of
date and carry no source. `osmPopulation` is retained in the wire format purely for
provenance, so a disagreement stays visible, and it is never displayed. It is `null` for
all 487 rows in this region, because the data is TIGER/Line rather than OSM.

### 2.4 Typography

| Field | Value |
|---|---|
| Families | Public Sans (display, UI), IBM Plex Mono (all numerals) |
| Source | Google Fonts CDN at build time, then self-hosted from the repo |
| Licence | SIL Open Font License 1.1, both families |
| Licence copies | `assets/fonts/licences/PublicSans-OFL.txt`, `assets/fonts/licences/IBMPlexMono-OFL.txt` |
| Hashes | `assets/fonts/FONT-MANIFEST.json` |
| Total | 128,584 bytes across 10 woff2 files, latin + latin-ext only |

---

## 3. Spot check

The authoritative spot check is the pipeline's, at
**`services/world-data/docs/SPOT_CHECK.md`**: 36 settlements compared against published
2020 Census decennial counts, 24 agreeing within 1%, 1 disagreeing (Nashville-Davidson,
3.83%, recorded as a finding rather than smoothed over), and 11 with no published figure
to compare against, which are reported as `unverified` rather than dropped.

Those settlements are chosen across the whole national dataset, not just this region.
The region-local check for the settlements this client actually renders is
`public/world/spot-check.json`:

| Place | Ours (estimates base) | Published (decennial) | Delta | Relative | Verdict |
|---|---:|---:|---:|---:|---|
| Columbus | 905,939 | 905,748 | +191 | +0.02% | agree |

**Reading this honestly:** zero places match exactly, and that is expected. The client
displays the Census *estimates programme's* 2020 base, and the Census revises that base
when it corrects a place geography. It is a different published number from the raw
2020 decennial count, not a wrong one. A value that matched exactly would have been more
suspicious, not less.

The two figures come from different Census measures on purpose. The estimates base is
what the client's own simulation uses for town size; the decennial count is an
independent reference, so a disagreement between them is a real signal rather than a
round trip.

---

## 4. Gaps

`public/world/gaps.json`, generated. Recorded per `CONSTITUTION.md` section 1.1.

### 4.1 Settlements with no real population

**None in this region.** `public/world/gaps.json` recorded eleven Colorado places with
no Census figure at all — Central City, Tolland, Gold Hill, Zuni, Leyden, Western
Hills, Derby, Holly Hills, West Pleasant View, Gunbarrel, Evergreen — because that
stopgap region was fetched from OpenStreetMap and most of its nodes had no Census row
to match. Every one of the 487 settlements in the deployed region carries a real
`population` and a `populationSource` citation, so the `population: null` path in
`classifySettlement` is not taken by any row.

The handling is unchanged for a future region that does have such places: the client
renders them with `population: null` and says so on screen. It does **not** substitute a
band midpoint or an OSM tag. Inventing a number would be exactly the "plausible but
fake" failure the constitution forbids.

**`gaps.json` is stale and should be regenerated.** It still describes the Colorado
region and is not read by any code in `src/`. Treat it as a record to be replaced by the
pipeline when one is deployed, not as current state. The check that matters for the
deployed data is in `src/world/loadRegion.test.ts`, which reads the files themselves.

### 4.2 Rail is drawn but not routed

4,653 rail segments are in the data and rendered. Whether they are in the
travel-cost graph is the simulation's business, not the map client's: the client
draws the geometry and hands it over.

### 4.3 Buildings

No building footprints. Towns render as generated clusters scaled by real population,
not as their real building outlines. `SPEC.md` section 6 puts full interiors out of
scope for V1 and `ASSETS.md` section 3 puts town buildings on the Phase 3 asset
pipeline, so this is on the phase plan rather than missed. The pipeline ships
`notables.json` (48,319 national rows) and `territories.json` (6 faction polygons) but
this client reads neither.

### 4.4 Water

No hydrography layer. Rivers are not drawn, which is the most visible gap in a region
named for one. Terrain is real, but the water surface is not. This is a real gap
against `ART_AND_AUDIO.md` section 6 and it is logged, not worked around.

### 4.5 The whole simulation layer

Town fields, market prices, unrest, the cause log, rulers, sides, and the ledger do not
exist in any real form yet. See section 1.

---

## 5. The wire contract, and how to change the region

- **Who owns the data.** `services/world-data` builds it; this client consumes it. The
  client has no region of its own: the region name, bbox, tile list, elevation encoding,
  and state coverage all come from `region.json`, never from a constant in `src/`. That
  is what makes a region change a config edit rather than a code change.
- **The three files.** `region.json`, `settlements.json`, `network.json`, at the shapes
  in `src/world/types.ts`. That file is the contract the client offers in return. Where
  the pipeline's output and the client's type disagree, the pipeline wins and the client
  changes.
- **Extra fields are carried across a redeploy.** `wire_version`,
  `travelEdges`, and `travelEdgesMeta` are added by tools in `services/world-data/tools/`
  after the wire build, and `tools/deploy-wire-to-client.py` preserves them rather than
  dropping them. It also refuses to carry a `retrieved` date from a *different* region,
  which is how the Colorado date would otherwise have been stamped onto Ohio data.
- **Population authority.** The client treats `population` as authoritative and
  `populationSource` as the citation for it. If the pipeline ships a figure from a
  different source, the client displays it under that source's name. It will not silently
  prefer one over the other.
- **How to point this client at a different region.** Change `[v1] region_name` and
  `[v1] region_bbox` in `services/world-data/config/world_data.toml`, then:

  ```bash
  cd services/world-data
  python -m worlddata run --skip-fetch --skip-postgres --reuse-stages
  python -m worlddata wire --out exports/wire
  python tools/deploy-wire-to-client.py
  python -m worlddata fetch-elevation --region exports/wire/region.json \
    --out ../../clients/campaign/public/world --tier boot
  ```

  The client needs no code change. Fetching the boot tier is required, not optional: a
  `region.json` naming tiles that are not on disk means `loadHeightfield` throws and the
  map never draws.

---

## 6. Attribution owed

| Asset | Required text | Required? |
|---|---|---|
| All road, rail, and settlement geometry | `US Census Bureau, TIGER/Line` | Credit only — public domain |
| Elevation tiles | `Elevation data from NASA SRTM and USGS National Map, via AWS Open Data` | Credit only — public domain |
| Public Sans | `Public Sans — SIL Open Font License 1.1. A fork of Libre Franklin by Impallari.` | **Yes** — OFL |
| IBM Plex Mono | `IBM Plex Mono — SIL Open Font License 1.1. © 2017 IBM Corp.` | **Yes** — OFL |

**No OSM geometry is deployed**, so no ODbL attribution is owed for the map. The previous
Colorado stopgap was OpenStreetMap and did require `© OpenStreetMap contributors` under
ODbL 1.0; the deployed data is TIGER/Line, which is a U.S. Government work in the public
domain under Title 17 U.S.C. 105. `src/scene/buildings.ts` and `src/scene/cityDemo.ts`
still carry OSM references for building footprints, which this region does not have.

The two font licences are the only hard requirements. Both licence texts are committed
under `assets/fonts/licences/`.

The in-game credit panel is `src/ui/hud.ts`, and the credits it prints are
`dataRow("Roads, rail, and towns", "US Census Bureau, TIGER/Line — public domain")`
and the elevation line above.

---

## 7. Priority metros (Tier 2B-69)

Per-metro dataset status for the 4 priority metros. Bboxes are defined in
`services/world-data/config/world_data.toml` under `[metros.*]`. **This client does not
load any of them** — it reads the single region in its own `region.json`. The counts
below are the number of settlements at or above the configured 500-person minimum inside
each bbox, measured from the committed `exports/settlements.jsonl.gz`, and are recorded
here so the numbers are reproducible rather than asserted.

| Metro | Bbox [w, s, e, n] | Settlements | Gaps |
|---|---|---:|---|
| New York City (5 boroughs) | [-74.30, 40.40, -73.70, 40.90] | 80 | Building footprints not in the pipeline (4.3) |
| Los Angeles metro | [-118.70, 33.70, -117.80, 34.30] | 94 | Same |
| Houston metro | [-95.80, 29.50, -94.80, 30.20] | 49 | Same |
| Miami metro | [-80.40, 25.60, -80.00, 26.00] | 34 | Same |

To make one of these the client's region instead, change `[v1]` in the pipeline config,
rebuild the wire files, and redeploy — the client needs no code change, because the
region, bbox, and tile list are all read from `region.json`.

Note that each of these metros has no `elevation_tiles` entry in `[v1].elevation_tiles`,
which currently lists only the Ohio Valley SRTM tiles. Terrain for a metro would have to
come from the terrarium boot tier rather than the SRTM sample set.

**Total:** 257 metro settlements across the four bboxes. Barrier islands around Miami
would additionally need ferry edges, which TIGER/Line does not carry.
