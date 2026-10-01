#!/usr/bin/env python3
"""Build settlement connector edges for isolated settlements (Tier 1A-3/13).

For each settlement with no route edges, finds the nearest road/rail segment
by point-to-polyline distance (not just endpoint snapping). If within the
connector radius, adds connector edges from the settlement to that segment's
endpoint settlements, with honest lengths:

    S -> A length = dist(S, nearest_pt) + along-line(nearest_pt, A)
    S -> B length = dist(S, nearest_pt) + along-line(nearest_pt, B)

This is v1: nearest-line, not polygon intersection. The plan's
method=intersection (Census place-boundary polygons) is the v2 refinement.
Connectors are tagged method="connector" so they stay distinguishable from
snapped routes.
"""

from __future__ import annotations

import gzip
import json
import math
import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE / "src"))

from worlddata.transforms.roads import haversine_km  # noqa: E402

CONNECTOR_RADIUS_KM = 8.0


def polyline_nearest(lon, lat, pts):
    """Return (dist_km, along_km_from_start, total_km) for nearest point."""
    best_d = float("inf")
    best_along = 0.0
    along = 0.0
    total = 0.0
    # Precompute cumulative distances.
    cum = [0.0]
    for i in range(1, len(pts)):
        cum.append(cum[-1] + haversine_km(pts[i - 1], pts[i]))
    total = cum[-1]
    for i in range(len(pts) - 1):
        ax, ay = pts[i]
        bx, by = pts[i + 1]
        dx, dy = bx - ax, by - ay
        seg_len = cum[i + 1] - cum[i]
        if dx == 0 and dy == 0:
            d = haversine_km((lon, lat), (ax, ay))
            a = cum[i]
        else:
            t = max(0.0, min(1.0, ((lon - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy)))
            cx, cy = ax + t * dx, ay + t * dy
            d = haversine_km((lon, lat), (cx, cy))
            a = cum[i] + t * seg_len
        if d < best_d:
            best_d = d
            best_along = a
    return best_d, best_along, total


def main() -> int:
    dist = SERVICE / "dist"
    # Load settlements with coordinates.
    settlements = {}
    with gzip.open(dist / "settlements.jsonl.gz", "rt") as h:
        for line in h:
            row = json.loads(line)
            if row.get("_header"):
                continue
            if row.get("longitude") is not None and row.get("latitude") is not None:
                settlements[row["settlement_id"]] = (
                    row["longitude"], row["latitude"], row.get("name", "")
                )
    print(f"settlements with coords: {len(settlements)}", flush=True)

    # Load routes to find isolated settlements.
    degree = {sid: 0 for sid in settlements}
    with gzip.open(dist / "routes.jsonl.gz", "rt") as h:
        for line in h:
            row = json.loads(line)
            if row.get("_header"):
                continue
            a, b = row["from_settlement_id"], row["to_settlement_id"]
            if a in degree:
                degree[a] += 1
            if b in degree:
                degree[b] += 1
    isolated = [sid for sid, d in degree.items() if d == 0]
    print(f"isolated: {len(isolated)}", flush=True)

    # Load segments with geometry into a coarse grid.
    # Grid cell ~0.2 degrees (~20km); query neighbours within radius.
    CELL = 0.2
    grid: dict[tuple[int, int], list] = {}
    n_seg = 0
    with gzip.open(dist / "route_segments.jsonl.gz", "rt") as h:
        for line in h:
            row = json.loads(line)
            if row.get("_header"):
                continue
            a, b = row["from_settlement_id"], row["to_settlement_id"]
            if not a or not b:
                continue
            try:
                pts = json.loads(row["geometry"])
            except (TypeError, ValueError):
                continue
            if len(pts) < 2:
                continue
            lons = [p[0] for p in pts]
            lats = [p[1] for p in pts]
            # Index by bbox cells.
            c0x, c0y = int(min(lons) / CELL), int(min(lats) / CELL)
            c1x, c1y = int(max(lons) / CELL), int(max(lats) / CELL)
            entry = (pts, a, b, row["kind"], row.get("road_class", "secondary"),
                     min(lons), min(lats), max(lons), max(lats))
            for cx in range(c0x, c1x + 1):
                for cy in range(c0y, c1y + 1):
                    grid.setdefault((cx, cy), []).append(entry)
            n_seg += 1
    print(f"indexed {n_seg} segments", flush=True)

    connectors = []
    connected = 0
    # Degrees per km approx (lon varies; use 111 for lat, conservative for lon).
    for sid in isolated:
        lon, lat, _ = settlements[sid]
        cx, cy = int(lon / CELL), int(lat / CELL)
        # Cells to cover the radius.
        span = int(CONNECTOR_RADIUS_KM / 111.0 / CELL) + 1
        candidates = []
        seen = set()
        for dx in range(-span, span + 1):
            for dy in range(-span, span + 1):
                for e in grid.get((cx + dx, cy + dy), []):
                    if id(e) in seen:
                        continue
                    seen.add(id(e))
                    candidates.append(e)
        best = None
        for pts, a, b, kind, rclass, *_ in candidates:
            d, along, total = polyline_nearest(lon, lat, pts)
            if d <= CONNECTOR_RADIUS_KM and (best is None or d < best[0]):
                best = (d, along, total, pts, a, b, kind, rclass)
        if best is None:
            continue
        d, along, total, pts, a, b, kind, rclass = best
        # Connector edges S->A and S->B.
        # along = distance from A (pts[0] is nearer A? not guaranteed).
        # We don't know which end is A; approximate: use proportional split.
        # Actually from_settlement corresponds to pts[0] by construction
        # (segments are stored from->to). Assume pts[0] ~ A, pts[-1] ~ B.
        d_to_a = along
        d_to_b = total - along
        # Speed for travel time: use class default.
        speed = {"primary": 88, "secondary": 64, "rail": 72}.get(rclass, 64)
        for target, leg in ((a, d_to_a), (b, d_to_b)):
            length = d + leg
            connectors.append({
                "from_settlement_id": sid,
                "to_settlement_id": target,
                "length_km": round(length, 3),
                "kind": kind,
                "road_class": rclass,
                "method": "connector",
                "travel_hours": round(length / speed, 4),
            })
        connected += 1

    print(f"connected via connectors: {connected}/{len(isolated)}", flush=True)
    print(f"connector edges: {len(connectors)}", flush=True)

    out = dist / "connectors.jsonl.gz"
    with gzip.open(out, "wt") as h:
        for c in connectors:
            h.write(json.dumps(c) + "\n")
    print(f"wrote {out}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
