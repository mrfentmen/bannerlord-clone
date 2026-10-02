# World-data portable export

Generated 2026-09-30 by the Phase 0 pipeline (`python -m worlddata run`).
Every table is published twice: **JSONL** (`.jsonl.gz`, universal) and
**Parquet** (`.parquet`, columnar). No database required — this directory is
the portable Contract A deliverable.

## Tables

| File | Rows | Contents |
|---|---|---|
| `settlements` | 13,189 | Every settlement: id, name, state, section, size class, lat/lon, 2020 population base |
| `notables` | 48,319 | Generated notable persons per settlement |
| `place_boundaries` | 32,037 | Census place polygons, for settlement-to-polygon matching |
| `state_profiles` | 51 | Per-state profile: 50 states + D.C. |
| `sections` | 6 | The six sides and their states |
| `section_ratings` | 30 | Six resource ratings × six sides (computed, then checked) |
| `routes` | 13,274 | Settlement-to-settlement road/rail edges |
| `terrain_samples` | 13,181 | Elevation samples per settlement |
| `ports` | 81 | Ports from Natural Earth |
| `regions` | 1 | Region rollup |
| `state_boundaries` | 51 | State boundary references |
| `schema.json` | — | Column definitions for every table |
| `MANIFEST.json` | — | Source datasets, digests, and run provenance |

## What is NOT here

`route_segments` (137,315 segment vertex lists, ~55 MB Parquet / ~63 MB
JSONL) is excluded: it is render geometry, regenerable in ~3 minutes with
`python -m worlddata --config config/world_data.toml run --skip-fetch
--skip-postgres --reuse-stages`. The `routes` table above already carries the
settlement-to-settlement edges the simulation needs.

## Verification

- Bundle self-consistency: `python -m worlddata verify-exports` checks each table's
  JSONL, Parquet, `schema.json` and `MANIFEST.json` row counts against each other and
  exits non-zero on any disagreement. `stamp-exports` re-derives the manifest's own
  export lines from the files on disk, and touches no data. `tests/test_exports_bundle.py`
  runs both, so the check is a gate rather than a command nobody types.
- Spot-check: 36 settlements against an independent 2020 census figure —
  24 agree within 1%, 1 disagree (Nashville-Davidson, 3.83%, recorded as a
  finding), 11 unverified. See `docs/SPOT_CHECK.md`.
- Section ratings: 13/30 exact vs FACTIONS.md targets, 24/30 within one band.
  See `docs/SECTION_RATINGS.md`.
- Full run record: `docs/PIPELINE_RUN.md`. Source digests: `docs/DATA_MANIFEST.md`.
