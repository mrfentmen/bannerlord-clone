# Client wire-format files

Drop-in replacements for the campaign client's `public/world/` data files,
built from the pipeline's tables by `python -m worlddata wire`.

## What these are

Rowan's client (`clients/campaign`) reads exactly three files, with shapes
defined in `clients/campaign/src/world/types.ts`:

| File | Contents |
|---|---|
| `region.json` | V1 region name, bbox, and the zoom-12 terrarium tile list |
| `settlements.json` | 487 settlements inside the V1 bbox, biggest first |
| `network.json` | 439 road + 4,653 rail segments with real TIGER/Line geometry |

The client's own `public/world/` data covers the Northern Colorado Front
Range, fetched as a stopgap before this pipeline landed. Its DATA-MANIFEST.md
(section 5) names this directory's files the authoritative replacement:
"Agent 1's export is authoritative and wins wherever the two differ."

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
- Elevation tiles are **not** bundled: `region.json` lists the 2,236 zoom-12
  terrarium tiles covering the bbox; fetch them from the AWS Open Data
  `elevation-tiles-prod` bucket the same way the client's existing tooling does.

## Regenerating

```bash
cd services/world-data
python -m worlddata wire            # reads dist/, writes dist/wire/
python -m worlddata wire --out exports/wire   # refresh this directory
```

The wire step needs the full pipeline output (`dist/route_segments.parquet`
with geometry), not just the committed portable bundle — geometry is excluded
from `exports/` as regenerable. It fails loudly if that file is missing.

## Standing rule

Boss order 2026-09-30: OSS projects are reference only. No code in the builder
(`src/worlddata/client_wire.py`) comes from any OSS project — the tile math is
the standard slippy-map formula and the shapes are the client's own contract.
