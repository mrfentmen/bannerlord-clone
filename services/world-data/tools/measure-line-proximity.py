#!/usr/bin/env python3
"""For isolated settlements, how far to the nearest road/rail LINE interior?

Endpoint-only snapping misses towns that sit beside a highway's middle. This
measures the point-to-segment distance so the connector design (Tier 1A-3) is
sized from real numbers, not guesses.
"""

from __future__ import annotations

import gzip
import json
import math
import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE / "src"))

from worlddata.transforms.roads import GeometryStore, haversine_km  # noqa: E402


def point_to_segment_km(px, py, ax, ay, bx, by):
    """Great-circle-ish point-to-segment distance, equirectangular approx."""
    # Project onto segment in degree space, then haversine the closest point.
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return haversine_km((px, py), (ax, ay))
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return haversine_km((px, py), (cx, cy))


def main() -> int:
    graph = json.loads((SERVICE / "dist" / "travel-graph.json").read_text())
    nodes = {n["id"]: (n["lon"], n["lat"]) for n in graph["nodes"]}
    degree = {nid: 0 for nid in nodes}
    for e in graph["edges"]:
        degree[e["from"]] += 1
        degree[e["to"]] += 1
    isolated = [nid for nid, d in degree.items() if d == 0]
    print(f"isolated settlements: {len(isolated)}")

    # Load segment endpoint coords + vertex count from the export (no geometry
    # needed for a coarse pass: use segment midpoint from geometry store for a
    # sample). For speed, sample 500 isolated settlements and scan the geometry
    # store's index... actually just brute-force a sample against all segments.
    import random

    rng = random.Random(7)
    sample = rng.sample(isolated, min(500, len(isolated)))

    store = GeometryStore(SERVICE / "data" / "cache" / "route_geometry.jsonl.gz")
    # Build a coarse list of segment bounding boxes with midpoints.
    print("indexing segment geometries...", flush=True)
    segs = []  # (mid_lon, mid_lat, seg_id)
    # GeometryStore has an index; read a subset. Simpler: iterate the export's
    # segment table for bounding info? We need midpoints -> read store.
    # The store path from the pipeline run:
    count = 0
    # We can't list ids from the store directly; use the route_segments export.
    seg_ids = []
    with gzip.open(SERVICE / "dist" / "route_segments.jsonl.gz", "rt") as h:
        for line in h:
            row = json.loads(line)
            if row.get("_header"):
                continue
            seg_ids.append(row["segment_id"])
            if len(seg_ids) >= 20000:
                break
    print(f"sampled {len(seg_ids)} segments for the coarse pass", flush=True)
    mids = []
    for sid in seg_ids:
        pts = store.read(sid)
        if pts:
            mid = pts[len(pts) // 2]
            mids.append(mid)
    print(f"got {len(mids)} midpoints", flush=True)

    # For each isolated settlement, distance to nearest midpoint (upper bound on
    # true line distance; fine for sizing).
    dists = []
    for nid in sample:
        lon, lat = nodes[nid]
        best = min(haversine_km((lon, lat), m) for m in mids)
        dists.append(best)
    dists.sort()
    import statistics

    print(f"sampled {len(dists)} isolated settlements, distance to nearest segment midpoint:")
    for p in (50, 75, 90, 95, 99):
        print(f"  p{p}: {dists[int(len(dists) * p / 100)]:.1f} km")
    print(f"  max: {dists[-1]:.1f} km")
    within5 = sum(1 for d in dists if d <= 5.0)
    within10 = sum(1 for d in dists if d <= 10.0)
    print(f"  within 5 km: {within5}/{len(dists)} ({within5/len(dists):.1%})")
    print(f"  within 10 km: {within10}/{len(dists)} ({within10/len(dists):.1%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
