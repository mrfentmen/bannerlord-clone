#!/usr/bin/env python3
"""Build dist/travel-graph.json: weighted nodes and edges for the campaign sim.

Reads the real pipeline exports (routes + settlements) and writes a single
JSON graph the game client and the Go sim can load without the full export
tables:

  {
    "nodes": [{"id", "name", "lat", "lon"}],
    "edges": [{"id", "from", "to", "length_km", "road_class", "kind",
               "minutes", "terrain"}]
  }

Edge weight (minutes) comes from the pipeline's per-segment travel hours,
which are length / class speed from [travel] in the config. Terrain is a v1
heuristic from the endpoint settlements' SRTM elevation (documented bands
below); only ~2% of settlements have elevation outside the V1 tile region, so
most edges report "unknown" until the NLCD land-cover stage (Tier 1B-22)
provides real per-edge terrain. No mock data: every node and edge traces to a
pipeline export row.

Usage:
    PYTHONPATH=services/world-data/src python tools/build-travel-graph.py
"""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
SERVICE = HERE.parents[1]
EXPORTS = SERVICE / "exports"
DIST = SERVICE / "dist"


def _read_jsonl_gz(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def _terrain(elev_a, elev_b) -> str:
    """v1 terrain heuristic from endpoint SRTM elevation.

    Bands are deliberately coarse: below 300 m is flat enough that roads run
    straight (plains), 300-900 m is rolling (hills), above 900 m the road
    geometry already understates true travel distance (mountains). Either
    endpoint unknown -> unknown; never guess.
    """
    if elev_a is None or elev_b is None:
        return "unknown"
    mean = (float(elev_a) + float(elev_b)) / 2.0
    if mean < 300.0:
        return "plains"
    if mean < 900.0:
        return "hills"
    return "mountains"


def main() -> int:
    # dist/ is the pipeline's fresh output; exports/ is the last published
    # copy. Prefer dist/ when it has the tables.
    source = DIST if (DIST / "routes.jsonl.gz").exists() else EXPORTS
    routes_path = source / "routes.jsonl.gz"
    settlements_path = source / "settlements.jsonl.gz"
    for path in (routes_path, settlements_path):
        if not path.exists():
            print(f"missing export: {path} — run the pipeline first", file=sys.stderr)
            return 1

    settlements = {}
    for row in _read_jsonl_gz(settlements_path):
        if row.get("_header"):
            continue
        settlements[row["settlement_id"]] = row

    nodes = []
    for sid, row in settlements.items():
        lat, lon = row.get("latitude"), row.get("longitude")
        if lat is None or lon is None:
            continue
        nodes.append({"id": sid, "name": row.get("name"), "lat": lat, "lon": lon})

    edges = []
    skipped = 0
    for row in _read_jsonl_gz(routes_path):
        if row.get("_header"):
            continue
        a, b = row["from_settlement_id"], row["to_settlement_id"]
        if a not in settlements or b not in settlements:
            skipped += 1
            continue
        edges.append(
            {
                "id": row["route_id"],
                "from": a,
                "to": b,
                "length_km": round(row["distance_km"], 3),
                "road_class": row.get("road_class", "secondary"),
                "kind": row["kind"],
                "minutes": round(row.get("travel_hours", 0.0) * 60.0, 2),
                "terrain": _terrain(
                    settlements[a].get("elevation_m"), settlements[b].get("elevation_m")
                ),
            }
        )

    # Merge connector edges (Tier 1A-3): settlement->network stubs for
    # isolated settlements, tagged method="connector".
    connectors_path = DIST / "connectors.jsonl.gz"
    n_conn = 0
    if connectors_path.exists():
        for row in _read_jsonl_gz(connectors_path):
            a, b = row["from_settlement_id"], row["to_settlement_id"]
            if a not in settlements or b not in settlements:
                skipped += 1
                continue
            edges.append(
                {
                    "id": f"connector:{a}->{b}",
                    "from": a,
                    "to": b,
                    "length_km": row["length_km"],
                    "road_class": row.get("road_class", "secondary"),
                    "kind": row["kind"],
                    "method": "connector",
                    "minutes": round(row.get("travel_hours", 0.0) * 60.0, 2),
                    "terrain": _terrain(
                        settlements[a].get("elevation_m"),
                        settlements[b].get("elevation_m"),
                    ),
                }
            )
            n_conn += 1
        print(f"merged {n_conn} connector edges", flush=True)

    DIST.mkdir(parents=True, exist_ok=True)
    out = DIST / "travel-graph.json"

    # Tier 1A-13: explicitly mark network status on every node. No settlement
    # is silently unreachable: "connected" (on a snapped route), "connector"
    # (joined via a connector edge), or "no_road" (>8 km from any primary
    # road/rail line — local-road access only, not in the TIGER primary set).
    # A node is "connector" iff it had no route edges before merging.
    route_degree = {}
    for e in edges:
        if e.get("method") == "connector":
            continue
        route_degree[e["from"]] = route_degree.get(e["from"], 0) + 1
        route_degree[e["to"]] = route_degree.get(e["to"], 0) + 1
    full_degree = {}
    for e in edges:
        full_degree[e["from"]] = full_degree.get(e["from"], 0) + 1
        full_degree[e["to"]] = full_degree.get(e["to"], 0) + 1
    for n in nodes:
        if full_degree.get(n["id"], 0) == 0:
            n["network_status"] = "no_road"
        elif route_degree.get(n["id"], 0) == 0:
            n["network_status"] = "connector"
        else:
            n["network_status"] = "connected"
    n_no_road = sum(1 for n in nodes if n["network_status"] == "no_road")

    # Write the explicit no_road list (Tier 1A-13: failures listed, not hidden).
    no_road_path = DIST / "no_road_settlements.json"
    no_road_list = [
        {"id": n["id"], "name": n["name"], "lat": n["lat"], "lon": n["lon"]}
        for n in nodes
        if n["network_status"] == "no_road"
    ]
    no_road_path.write_text(json.dumps(no_road_list, indent=1), encoding="utf-8")
    print(f"no_road settlements: {n_no_road} (list at {no_road_path.name})", flush=True)

    graph = {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "skipped_dangling_edges": skipped,
            "no_road_count": n_no_road,
            "terrain_note": "v1 heuristic from endpoint SRTM elevation; "
            "'unknown' where elevation is null (outside V1 tiles)",
        },
    }
    out.write_text(json.dumps(graph), encoding="utf-8")
    print(f"wrote {out}: {len(nodes):,} nodes, {len(edges):,} edges, {skipped} dangling skipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
