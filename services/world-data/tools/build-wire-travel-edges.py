#!/usr/bin/env python3
"""Build client wire travel edges (Tier 1A-10).

Matches OSM wire settlements to TIGER settlements by proximity, then exports
the TIGER travel-graph edges between matched settlements using OSM IDs.
The client gets a ready-to-pathfind edge list without parsing 137k segments.

Output: clients/campaign/public/world/network.json gains a "travelEdges" v2
array alongside the v1 geometry.
"""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SERVICE = REPO / "services" / "world-data"
WIRE = REPO / "clients" / "campaign" / "public" / "world"

sys.path.insert(0, str(SERVICE / "src"))
from worlddata.transforms.roads import haversine_km  # noqa: E402

MATCH_RADIUS_KM = 5.0


def main() -> int:
    # OSM wire settlements.
    wire = json.loads((WIRE / "settlements.json").read_text())
    osm_settlements = wire["settlements"]
    print(f"OSM wire settlements: {len(osm_settlements)}", flush=True)

    # TIGER settlements.
    tiger = {}
    with gzip.open(SERVICE / "dist" / "settlements.jsonl.gz", "rt") as h:
        for line in h:
            row = json.loads(line)
            if row.get("_header"):
                continue
            if row.get("longitude") is not None and row.get("latitude") is not None:
                tiger[row["settlement_id"]] = (row["longitude"], row["latitude"])
    print(f"TIGER settlements: {len(tiger)}", flush=True)

    # Match OSM -> TIGER by proximity. Brute force is fine (487 x 13k).
    osm_to_tiger = {}
    for s in osm_settlements:
        best = None
        for tid, (tlon, tlat) in tiger.items():
            d = haversine_km((s["lon"], s["lat"]), (tlon, tlat))
            if d <= MATCH_RADIUS_KM and (best is None or d < best[1]):
                best = (tid, d)
        if best:
            osm_to_tiger[s["osmId"]] = best[0]
    print(f"matched {len(osm_to_tiger)}/{len(osm_settlements)} OSM settlements", flush=True)

    tiger_to_osm = {v: k for k, v in osm_to_tiger.items()}

    # Travel graph edges between matched settlements.
    graph = json.loads((SERVICE / "dist" / "travel-graph.json").read_text())
    travel_edges = []
    for e in graph["edges"]:
        a = tiger_to_osm.get(e["from"])
        b = tiger_to_osm.get(e["to"])
        if a is None or b is None:
            continue
        travel_edges.append({
            "from": a,
            "to": b,
            "length_km": e["length_km"],
            "road_class": e["road_class"],
            "kind": e["kind"],
            "minutes": e["minutes"],
            "method": e.get("method", "snap"),
        })
    print(f"wire travel edges: {len(travel_edges)}", flush=True)

    # Merge into network.json as v2.
    network_path = WIRE / "network.json"
    network = json.loads(network_path.read_text())
    network["travelEdges"] = travel_edges
    network["travelEdgesMeta"] = {
        "count": len(travel_edges),
        "matched_settlements": len(osm_to_tiger),
        "note": "v2: settlement-to-settlement weighted edges from the TIGER "
                "travel graph, matched to OSM settlements by proximity. "
                "Pathfind on these; v1 geometry is for rendering.",
    }
    network_path.write_text(json.dumps(network), encoding="utf-8")
    print(f"updated {network_path}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
