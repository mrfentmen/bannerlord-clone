# Client wire-format files

Drop-in replacements for the campaign client's `public/world/` data files,
built from the pipeline's tables by `python -m worlddata wire`.

## What these are

Rowan's client (`clients/campaign`) reads four files, with shapes
defined in `clients/campaign/src/world/types.ts`:

| File | Contents | Built by |
|---|---|---|
| `region.json` | V1 region name, bbox, state coverage, and two terrarium tile tiers | `worlddata wire` |
| `settlements.json` | 487 settlements inside the V1 bbox, biggest first | `worlddata wire` |
| `network.json` | 439 road + 4,653 rail segments with real TIGER/Line geometry | `worlddata wire` |
| `boundaries.json` | 487 real Census place outlines, 623 polygons, 48,612 vertices | `tools/build-wire-place-boundaries.py` |

These are the files the client actually boots from. They are deployed into
`clients/campaign/public/world/` by `tools/deploy-wire-to-client.py`, and
`tests/test_wire_deploy.py` and `tests/test_exports_bundle.py` fail if the
deployed copies drift from this directory.

The client's own `tools/fetch-world-data.mjs` is **not** how this data is produced.
It always fetches the Northern Colorado Front Range, so running it over a deployed
region replaces Ohio data with Colorado data. The region is chosen in
`config/world_data.toml` under `[v1]`, not by that script.

## `network.json` carries one thing the wire build does not produce

`worlddata wire` writes `roads` and `rail`, which are *render* geometry: real TIGER/Line
polylines the client draws as they are. It does not write `travelEdges`, the
settlement-to-settlement weighted edge list the client actually pathfinds on, because the
wire build has no travel graph to take them from. `tools/build-wire-travel-edges.py` adds
them, from `dist/travel-graph.json`:

```bash
python tools/build-travel-graph.py       # dist/routes.jsonl.gz -> dist/travel-graph.json
python tools/build-wire-travel-edges.py  # -> exports/wire/network.json
python tools/deploy-wire-to-client.py    # copies it across like any other field
```

The travel graph merges `dist/connectors.jsonl.gz` when that file exists, and those
connector edges are the only thing giving a settlement with no road of its own any edges at
all. `dist/` is not committed, so on a checkout without it the graph has no connectors in
it: 474 edges with 150 of the 487 settlements unreachable, against the 590 and 84 that are
deployed. **An edge count that went down is the signature of a missing connector file, not
of a better map** — `tests/test_wire_deploy.py` pins the deployed edges' soundness and will
not catch a rebuild that quietly dropped 116 of them.

Until that file is in the wire build, `deploy.CARRIED` carries `travelEdges` and
`travelEdgesMeta` across a redeploy from the client's copy. That works, and
`tests/test_wire_deploy.py` pins it both ways — a deploy that stopped carrying them, and a
wire build that started producing them — so the arrangement cannot change unnoticed. The
field shapes are documented for the client in
`clients/campaign/public/world/DATA-MANIFEST.md` section 5.

## `boundaries.json` is built separately

`worlddata wire` cannot produce it. The pipeline's `place_boundaries` table has 32,037
real Census place outlines but no coordinates, because
`src/worlddata/transforms/boundaries.py` deliberately discards the polygon rings once it
has taken the interior point and the area out of them — holding 32,000 vertex lists alive
for the rest of the run is what got the pipeline OOM-killed twice. The rings are still in
`data/raw/cb_2023_us_place_500k.zip`, so `tools/build-wire-place-boundaries.py` reads that
archive again and keeps them for the 487 places this region ships:

```bash
cd services/world-data
python tools/build-wire-place-boundaries.py   # writes exports/wire/boundaries.json
python tools/deploy-wire-to-client.py         # deploy all four files
```

That tool runs after `worlddata wire`, not instead of it: it cuts the file to whatever
settlements `settlements.json` carries, so it needs that file to exist first.

Two things about the output worth knowing before trusting it:

- **Ring winding is normalised, not passed through.** The file states `exterior rings
  clockwise, holes counter-clockwise` so a renderer can classify a ring by winding instead
  of recomputing areas. The source shapefile does not always honour that, because
  `to_multipolygon` keeps a counter-clockwise ring too small to be a hole as a polygon of
  its own — 42 rings in this region, all of them Columbus-area slivers. Reversing a ring's
  vertex order moves no vertex and changes no area, so the fix is free and the stated
  contract is then true of every ring rather than most of them.
- **Nothing is simplified.** 487 places come to 48,612 vertices, about 1.2 MB of JSON, so
  every vertex the Census Bureau published reaches the client. Coordinates are rounded to
  six decimal places (~0.1 m), which is the precision the Census file publishes at.

This is generalised 500k cartography, not surveyed boundaries, and it is a separate licence
line from TIGER/Line even though both are public domain.

## Provenance

- Region: the pipeline's V1 decision — "Ohio River Valley (OH/KY metro
  cluster)", bbox 37.1–40.6 N, 85.3–81.6 W (`regions` table).
- Settlements: U.S. Census Bureau, Vintage 2023 sub-county population
  estimates, 2020 Census counts. Public domain. `osmId` carries the pipeline's
  stable `settlement_id` (state FIPS + place code), which survives re-runs the
  way an OSM node id would; the client's SettlementIndex also resolves by name.
- Roads/rail: U.S. Census Bureau, TIGER/Line 2023 Primary/Secondary Roads and
  Rail Lines. Public domain, no attribution required. Geometry is the real
  polyline from the `route_segments` table, reprojected to `[lat, lon]`.
- Place outlines: U.S. Census Bureau, Cartographic Boundary Files, 2023, 500k,
  place. Public domain, no attribution required. Joined to `settlements.json` by
  the Census settlement id (`state_fips-place_fips`), never by name; the file's
  `centroid` for a place is the same interior point the settlement's own `lat`/`lon`
  carries, so the two files agree exactly rather than approximately.
- Every one of the 487 settlements carries a real population figure and a
  `populationSource` citation. There are no null populations in this region.
  Every one of the 487 also carries a real boundary outline — the builder refuses
  to write a file missing any, rather than shipping a region where some towns have
  a shape and others are a bare dot with nothing saying why.

## Elevation tiles: two tiers

`region.json` names two tile tiers, and only the first is a boot dependency:

| Tier | Key | Zoom | Tiles for this bbox | On disk |
|---|---|---:|---:|---|
| Boot | `elevation` | 10 | 154 (11 × 14) | Committed, ~7.9 MB |
| Detail | `elevationDetail` | 12 | 2,236 | Fetched on demand, ~250 MB |

The client fetches every tile in `elevation` before it draws and throws a
retryable error on the first missing one, so the boot tier must be complete on
disk. At zoom 12 this bbox needs 2,236 tiles, which is not a thing to block a
game start on, so the full-resolution list is a separate key.

To fetch a tier:

```bash
python -m worlddata fetch-elevation \
  --region exports/wire/region.json \
  --out ../../clients/campaign/public/world \
  --tier boot
```

The tile list always comes from the client's own `region.json`, so re-bounding the
region cannot leave a stale list behind.

## Regenerating

```bash
cd services/world-data
python -m worlddata wire            # reads dist/, writes dist/wire/
python -m worlddata wire --out exports/wire   # refresh region/settlements/network
python tools/build-wire-place-boundaries.py   # then cut the outlines to those settlements
python tools/deploy-wire-to-client.py         # deploy all four files
```

The wire step needs the full pipeline output (`dist/route_segments.parquet`
with geometry), not just the committed portable bundle — geometry is excluded
from `exports/` as regenerable. It fails loudly if that file is missing.

The boundary step needs `data/raw/cb_2023_us_place_500k.zip`, which the fetch
stage puts there. It streams the archive once, keeps 487 of 32,608 records, and
finishes in about three seconds.

Check for drift without writing anything:

```bash
python tools/build-wire-place-boundaries.py --check
python tools/deploy-wire-to-client.py --check
```

## Standing rule

Boss order 2026-09-30: OSS projects are reference only. No code in the builder
(`src/worlddata/client_wire.py`) comes from any OSS project — the tile math is
the standard slippy-map formula and the shapes are the client's own contract.
