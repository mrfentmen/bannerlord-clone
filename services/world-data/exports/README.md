# World-data portable export

Generated 2026-10-01 by the Phase 0 pipeline (`python -m worlddata run`).
Every table is published twice: **JSONL** (`.jsonl.gz`, universal) and
**Parquet** (`.parquet`, columnar). No database required — this directory is
the portable Contract A deliverable.

## Tables

| File | Rows | Contents |
|---|---|---|
| `settlements` | 13,189 | Every settlement: id, name, state, section, size class, lat/lon, 2020 population base |
| `state_profiles` | 51 | Per-state profile: 50 states + D.C. |
| `sections` | 6 | The six sides and their states |
| `section_ratings` | 30 | Six resource ratings × six sides (computed, then checked) |
| `routes` | 13,274 | Settlement-to-settlement road/rail edges |
| `terrain_samples` | 13,181 | Elevation samples per settlement |
| `ports` | 81 | Ports from Natural Earth |
| `regions` | 1 | Region rollup |
| `state_boundaries` | 51 | State boundary references |
| `place_boundaries` | 32,037 | Census place boundaries: id, name, state, LSAD area-type code, centroid lat/lon |
| `schema.json` | — | Column definitions for every table |
| `MANIFEST.json` | — | Source datasets, digests, and run provenance |

## What is NOT here

`route_segments` (137,315 segment vertex lists, ~55 MB Parquet / ~63 MB
JSONL) is excluded: it is render geometry, regenerable in ~3 minutes with
`python -m worlddata --config config/world_data.toml run --skip-fetch
--skip-postgres --reuse-stages`. The `routes` table above already carries the
settlement-to-settlement edges the simulation needs.

## Verification

- Spot-check: 36 settlements against an independent 2020 census figure —
  24 agree within 1%, 1 disagree (Nashville-Davidson, 3.83%, recorded as a
  finding), 11 unverified. See `docs/SPOT_CHECK.md`.
- Section ratings: 13/30 exact vs FACTIONS.md targets, 24/30 within one band.
  See `docs/SECTION_RATINGS.md`.
- Full run record: `docs/PIPELINE_RUN.md`. Source digests: `docs/DATA_MANIFEST.md`.
