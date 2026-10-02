# Client wire-format files

Drop-in replacements for the campaign client's `public/world/` data files,
built from the pipeline's tables by `python -m worlddata wire`.

## What these are

Rowan's client (`clients/campaign`) reads exactly three files, with shapes
defined in `clients/campaign/src/world/types.ts`:

| File | Contents |
|---|---|
| `region.json` | V1 region name, bbox, state coverage, and two terrarium tile tiers |
| `settlements.json` | 487 settlements inside the V1 bbox, biggest first |
| `network.json` | 439 road + 4,653 rail segments with real TIGER/Line geometry |

These are the files the client actually boots from. They are deployed into
`clients/campaign/public/world/` by `tools/deploy-wire-to-client.py`, and
`tests/test_exports_bundle.py` fails if the deployed copies drift from this
directory.

The client's own `tools/fetch-world-data.mjs` is **not** how this data is produced.
It always fetches the Northern Colorado Front Range, so running it over a deployed
region replaces Ohio data with Colorado data. The region is chosen in
`config/world_data.toml` under `[v1]`, not by that script.

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
- Every one of the 487 settlements carries a real population figure and a
  `populationSource` citation. There are no null populations in this region.

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
python -m worlddata wire --out exports/wire   # refresh this directory
python tools/deploy-wire-to-client.py         # deploy into the client
```

The wire step needs the full pipeline output (`dist/route_segments.parquet`
with geometry), not just the committed portable bundle — geometry is excluded
from `exports/` as regenerable. It fails loudly if that file is missing.

## Standing rule

Boss order 2026-09-30: OSS projects are reference only. No code in the builder
(`src/worlddata/client_wire.py`) comes from any OSS project — the tile math is
the standard slippy-map formula and the shapes are the client's own contract.
