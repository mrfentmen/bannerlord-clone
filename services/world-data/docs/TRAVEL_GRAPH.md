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

## Route gate: fragments shorter than the straight line

A snap radius decides whether a line endpoint *reaches* a town; it says nothing
about whether the line between two snapped endpoints is a journey. TIGER/Line
splits rail into yard leads, sidings and digitisation fragments, so with a 10 km
rail radius a 30-metre fragment whose two ends land inside the radius of two
different towns becomes a "route" between towns 19 km apart — shorter than the
straight line between its own endpoints, which no traveller can walk. In the
2026-10-01 export 6,154 of 9,648 rail edges were shorter than that line.

`[travel].min_segment_gc_fraction = 0.5` closes it, per fragment: a fragment
covering less than half the great-circle distance between its two settlements
stays in `route_segments` and forms no `routes` edge. It was declared in config
with this rationale and read by nothing until 2026-10-04, which is what made it a
comment rather than a rule.

Measured on the committed `dist/route_segments.parquet` with the gate applied:

| kind | snapped fragments judged | dropped by the gate | share |
|---|---:|---:|---:|
| rail | 11,895 | 4,918 | 41.4% |
| road | 8,440 | 997 | 11.8% |

Edges from that segment table go from 11,047 to 9,028. The run numbers elsewhere
in this document are from 2026-10-01 and predate the gate; they change on the
next pipeline run.

Two cases the gate deliberately keeps, because it removes manufactured edges and
not settlements from the graph: a fragment with an endpoint that has no
settlement position leaves the comparison undecidable and keeps its edge, and two
settlements at the same point have no straight-line distance to be short of. A
corridor whose every fragment falls below the gate loses its edge — the
convention is written per fragment in config, and the cost is a real connection
rather than a fabricated one.

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
on 200 random pairs. 2026-10-01 result (with connectors):

- **National: 16,487 edges, largest component 7,433 of 13,181 (56%)**
- **Metros: NYC 98%, LA 99%, Houston 97%, Miami 100%** — Tier 1A's target
- 2,391 settlements remain isolated (>8 km from any primary road/rail line)
- A* agrees with the component map on 200/200 pairs

### Connectors (Tier 1A-3, v1)

`tools/build-connectors.py` attaches isolated settlements to the network by
nearest-line (point-to-polyline) distance, not endpoint snapping. For a
settlement S near segment A-B at point P:

    S->A length = dist(S,P) + along-line(P,A)
    S->B length = dist(S,P) + along-line(P,B)

Edges are tagged `method="connector"`. v1 connected 2,720 of 5,111 isolated
settlements (53%) within the 8 km radius, adding 5,440 edges. The v2
refinement is Census place-boundary polygon intersection
(`method=intersection`).

The remaining 2,391 isolated settlements are genuinely off the primary
network (>8 km from any line). They need secondary-road imports or explicit
`no_road` marking (Tier 1A-13).

## Per-metro slices (Tier 1A-18)

Not yet built. The graph builder reads national exports; metro slices
(NYC/LA/Houston/Miami bounding boxes in `tools/measure-snap-rates.py`)
are a `--metro` filter away.
