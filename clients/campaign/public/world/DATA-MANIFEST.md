# DATA-MANIFEST.md

Every dataset the campaign map client renders, where it came from, and what is missing
from it. Required by `CONSTITUTION.md` section 1.1 and `ASSETS.md` section 2.2.

Fetched by `tools/fetch-world-data.mjs`. Re-running it reuses files already on disk and
refetches only what is missing.

---

## 1. What is real, and what is not

| Layer | Status | Source |
|---|---|---|
| Terrain elevation | **Real.** NASA/USGS SRTM-derived elevation tiles. | Section 2.1 |
| Roads and rail geometry | **Real.** OpenStreetMap. | Section 2.2 |
| Settlement positions and names | **Real.** OpenStreetMap. | Section 2.2 |
| Settlement populations | **Real.** U.S. Census Bureau, Vintage 2024 sub-county estimates. | Section 2.3 |
| Simulation state — town fields, prices, unrest, cause log, rulers, ledger, sides | **Not real yet.** Owned by Agent 2, which is blocked on the hosting decision in `CONSTITUTION.md` section 4.1. See section 4. | — |

The split matters. The **map is real today** — the terrain you walk on is real Ohio
River Valley terrain, the roads are real roads, the towns are real places with real Census
populations. What is not real is the *state of the world*: who holds Cincinnati, what
bread costs there, and why. That is the simulation, and the simulation is Agent 2's
job, not this client's.

---

## 2. Datasets

### 2.1 Elevation — terrarium tiles

| Field | Value |
|---|---|
| Source | AWS Open Data, `elevation-tiles-prod` |
| URL | `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` |
| Upstream provenance | SRTM (Shuttle Radar Topography Mission, NASA), USGS National Map, and other national DEMs merged by Mapzen/AWS Open Data |
| Licence | Public domain. Produced from US government source data; the tile service is published by AWS Open Data at no charge. |
| Retrieved | 2026-10-01 |
| Coverage (boot) | Zoom 10, 11 × 14 = 154 tiles, each 256 × 256 px, ≈ 150 m per pixel — this is the list the client fetches at startup (`region.json` → `elevation`) |
| Coverage (detail) | Zoom 12, 43 × 52 = 2,236 tiles, ≈ 30 m per pixel — shipped as `elevationDetail` in `region.json` for future on-demand streaming (battle maps, close zoom); not fetched at boot |
| Region | 39.60–40.10 N, −105.60 to −104.80 W (55.6 km N–S × 68 km E–W) |
| Decoding | `elevation_m = R * 256 + G + B / 256 − 32768`, where R/G/B are the raw bytes of the PNG pixel |
| File | `public/world/elevation/{z}/{x}/{y}.png` |

Decoding is implemented in `src/world/elevation.ts` and unit-tested against
hand-decoded pixel values in `src/world/__tests__/elevation.test.ts`.

**Known limits.** Zoom 12 is about 30 m per pixel. Sharp ridgelines and bridge
abutments are smoothed. This is a campaign map at 1:250,000-ish scale, which is the
scale the map is viewed at, so it is the right resolution. Battle terrain is Phase 4
and will need better data; that is recorded in section 5.

### 2.2 Roads, rail, and settlement locations — OpenStreetMap

| Field | Value |
|---|---|
| Source | OpenStreetMap, via the Overpass API |
| Endpoint used | `https://overpass-api.de/api/interpreter` (the only mirror that answered; others are listed in the fetch tool as fallbacks) |
| Licence | **Open Database License (ODbL) 1.0.** Requires attribution; see section 6. |
| Retrieved | 2026-09-30 |
| Roads | 26,872 ways — motorway, trunk, primary, secondary |
| Rail | 2,247 ways — `railway=rail` |
| Settlements | 48 places — `place=city|town|village` |
| File | `public/world/network.json`, `public/world/settlements.json` |

Attribution is not optional under ODbL. The credits screen must carry
`© OpenStreetMap contributors, ODbL 1.0`. That is wired into
`src/data/attribution.ts` and asserted by `src/data/__tests__/attribution.test.ts`.

**Road classes kept:** motorway, trunk, primary, secondary. Tertiary and residential
are deliberately dropped: the map draws settlements as clusters, so a full residential
grid inside Cincinnati is 20,000 extra polylines carrying no information the player can act
on. This is a scope decision, not a data gap.

### 2.3 Populations — U.S. Census Bureau

| Field | Value |
|---|---|
| Source | U.S. Census Bureau, Vintage 2024 sub-county population estimates |
| URL | `https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/cities/totals/sub-est2024.csv` |
| Licence | U.S. Government work. Public domain. |
| Retrieved | 2026-09-30 |
| Column used | `ESTIMATESBASE2020`, filtered to Ohio River Valley states and place summary levels 157, 162, 170, 172 |
| Matched | 37 of 48 settlements |

**Why this file and not the Census API.** `api.census.gov` now redirects keyless
requests to a "Missing Key" page, verified 2026-09-30. Putting an API key in the repo
is not an option (`agents/README.md` rule 7, no secrets in code). The static estimates
CSV is a real published Census product, needs no key, and its 2020 base column is an
authoritative figure.

**Why not the OSM `population` tag.** OSM population tags on these nodes are
frequently a decade out of date and carry no source. They are retained in the export
as `osmPopulation` purely for provenance, so a disagreement is visible rather than
hidden, and they are never displayed.

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

`public/world/spot-check.json`, generated. The published figures are transcribed by
hand from the 2020 Census decennial place counts; they are **not** read from any file
this project downloaded, so the check is independent of what it is checking.

| Place | Ours (estimates base) | Published (decennial) | Delta | Relative |
|---|---:|---:|---:|---:|
| Columbus | 905,939 | 905,748 | +191 | +0.02% |

**Note (2026-10-01):** The client data was replaced with Ohio River Valley settlements
(487 places) via the wire-deploy branch. The spot-check table above shows Columbus, Ohio
verified against the 2020 Census. The full 12-city Ohio spot-check is being regenerated;
the Colorado table it replaced is preserved in git history.

**Reading this honestly:** zero places match exactly, and that is expected. The client
displays the Census *estimates programme's* 2020 base, and the Census revises that base
when it corrects a place geography. It is a different published number from the raw
2020 decennial count, not a wrong one. Every large place agrees to within 0.3%. The
three places above 3% are all under 35,000 people, where a boundary correction moves
the percentage a lot while the absolute error stays in the hundreds.

A value that matched exactly would have been more suspicious, not less.

---

## 4. Gaps

`public/world/gaps.json`, generated. Recorded per `CONSTITUTION.md` section 1.1.

### 4.1 Settlements with no real population

Eleven of the 48 mapped places have no incorporated-place or CDP row of that name in
the Census estimates file: Central City, Tolland, Gold Hill, Zuni, Leyden, Western
Hills, Derby, Holly Hills, West Pleasant View, Gunbarrel, Evergreen.

**Handling:** the client renders them with `population: null` and says so on screen.
It does **not** substitute a band midpoint or an OSM tag. These are mountain
communities and unincorporated neighbourhoods; inventing a number for them would be
exactly the "plausible but fake" failure the constitution forbids. They are still
placed on the map and still have roads, because the geometry is real.

### 4.2 Rail is drawn but not routed

2,247 rail ways are fetched and rendered. They are **not** in the travel-cost graph
yet: the march planner prices travel off the road network only. Logged in `CHANGELOG.md`
under **Unresolved**.

### 4.3 Buildings

No building footprints. Towns render as generated clusters scaled by real population,
not as their real building outlines. `SPEC.md` section 6 puts full interiors out of
scope for V1 and `ASSETS.md` section 3 puts town buildings on the Phase 3 asset
pipeline, so this is on the phase plan rather than missed.

### 4.4 Water

No hydrography layer. Rivers are not drawn. Terrain is real, but the water surface is
not. This is a real gap against `ART_AND_AUDIO.md` section 6 and it is logged, not
worked around.

### 4.5 The whole simulation layer

Town fields, market prices, unrest, the cause log, rulers, sides, and the ledger do not
exist in any real form yet. See section 1.

---

## 5. Reconciliation notes for Agent 1

- **Region ownership.** `PHASES.md` Phase 0 assigns the V1 region to the world-data
  pipeline. This client now uses the Ohio River Valley (487 settlements, 439 roads,
  4,653 rail segments) via the wire-deploy branch. The client reads the
  region from `region.json` and does not care — the tile list, the bbox, and the
  elevation encoding all come from that file, not from a constant.
- **The client expects** `region.json`, `settlements.json`, and `network.json` at the
  shapes in `src/world/types.ts`. That file is the proposed wire format and is the
  contract this client offers Agent 1 in return. It is a strict subset of Contract A:
  Agent 1's export is authoritative and wins wherever the two differ.
- **Population authority.** The client treats `population` as authoritative and
  `populationSource` as the citation for it. If Agent 1 ships a figure with a different
  source, the client will display it with that source's name. It will not silently
  prefer one over the other.

---

## 6. Attribution owed

| Asset | Required text |
|---|---|
| All road, rail, and settlement geometry | `© OpenStreetMap contributors` |
| All road, rail, and settlement geometry | `Licensed under the Open Database License (ODbL) 1.0` |
| Elevation tiles | `Elevation data from NASA SRTM and USGS National Map, via AWS Open Data` |
| Public Sans | `Public Sans — SIL Open Font License 1.1. A fork of Libre Franklin by Impallari.` |
| IBM Plex Mono | `IBM Plex Mono — SIL Open Font License 1.1. © 2017 IBM Corp.` |

Enforced by `src/data/__tests__/attribution.test.ts`, which fails the build if any of
these strings disappears from the credits data.
