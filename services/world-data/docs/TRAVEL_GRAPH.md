# Travel graph

How the settlement-to-settlement travel network is built, measured, and
validated. Regenerated per pipeline run; the numbers below are from the
2026-10-01 run.

## Snap radii (Tier 1A-2)

Road/rail line endpoints snap to the nearest settlement within a per-class
radius. The old global 20 km rule was replaced after measuring the actual
snap-distance distribution against the national TIGER/Line layers
(`tools/measure-snap-rates.py`):

| class     | radius | national p50 | p95  | p99   | justification |
|-----------|-------:|-------------:|-----:|------:|---------------|
| primary   | 15 km  | 4.71 km      | 14.32| 18.27 | just past p95; cuts the 15-20 km phantom tail |
| secondary | 12 km  | 4.20 km      | 12.84| 18.01 | just past p95; secondary network is denser |
| rail      | 10 km  | 3.59 km      | 13.54| 18.08 | stations sit inside settlements; the 10-20 km rail snaps were the 2026-09-30 phantom-audit zone |

Impact of the retune (both-ends snap rate):

| layer | 20 km rule | per-class | delta |
|-------|-----------:|----------:|------:|
| roads (national) | 92.6% | 86.0% | -6.6pp, concentrated in the phantom tail |
| rail (national)  | 94.4% | 82.4% | -12.0pp |
| NYC / LA / Houston / Miami | ~100% | 92-100% | metros barely moved |

Config lives in `[travel].snap_radius_km_by_class` in `config/world_data.toml`;
every value is validated positive at load and all three classes are required.

## The graph (Tier 1A-9)

`tools/build-travel-graph.py` reads the pipeline's `routes` + `settlements`
exports and writes `dist/travel-graph.json`:

- **nodes**: 13,181 settlements with coordinates (8 null-coordinate rows excluded)
- **edges**: 11,047 settlement-to-settlement routes, each carrying
  `length_km`, `road_class` (longest member segment's), `kind`
  (road/rail), `minutes` (sum of segment travel hours from the
  `[travel]` speed table), and `terrain`.

Terrain is a v1 heuristic from endpoint SRTM elevation
(plains <300 m, hills 300-900 m, mountains >900 m, unknown when either
endpoint lacks elevation). Only the V1 tile region has elevation, so most
edges report `unknown` until the NLCD stage (Tier 1B-22) provides real
per-edge terrain. Travel-time terrain multipliers land with it.

## Connectivity (Tier 1A-11/12)

`tools/check-connectivity.py` builds connected components and spot-checks A*
on 200 random pairs. 2026-10-01 result:

- **5,510 components; largest holds 5,845 of 13,181 settlements (44%)**
- 5,111 settlements have no edges at all
- A* agrees with the component map on 200/200 pairs

This is not a regression from the retune: the 20 km rule's graph was also
fragmented (4,409 components, largest 56%). The structural cause is that the
pipeline imports TIGER **primary** roads and rails only. Endpoint snapping
misses towns that sit beside a line's middle, and towns served only by
secondary/local roads have no lines at all. A 500-settlement sample found
only ~15% of isolated settlements within 5 km of a line interior
(`tools/measure-line-proximity.py`).

Planned remedies (Tier 1A-3/13/15): boundary-intersection connectors for
settlements near a line, ferry/water edges, and explicit `no_road` marking
for the genuinely off-network remainder. The connectivity check exits
non-zero while any settlement is unreachable, so the report cannot go stale
silently.

## Per-metro slices (Tier 1A-18)

Not yet built. The graph builder reads national exports; metro slices
(NYC/LA/Houston/Miami bounding boxes in `tools/measure-snap-rates.py`)
are a `--metro` filter away.
