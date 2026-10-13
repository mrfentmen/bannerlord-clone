#!/usr/bin/env python3
"""Build the client wire's travel edges from the pipeline's travel graph (Tier 1A-10).

Matches the wire's settlements to the travel graph's nodes, then exports the graph's
settlement-to-settlement edges between matched settlements using the wire's own ids. The
client gets a ready-to-pathfind edge list without parsing 137,000 render segments.

This used to read `dist/settlements.jsonl.gz`, which no longer exists, so the tool had
been dead since the pipeline stopped writing that file: a `FileNotFoundError` on the
second line of `main()`. The travel graph carries the node coordinates itself, so the
deleted file was never needed - the graph is both the edges and the nodes.

It also used to write straight into `clients/campaign/public/world/network.json`, which
is the *deployed* copy. That made the enrichment unreproducible from the repository: the
authoritative wire build at `exports/wire/network.json` never carried the edges, so the
only copy was the one about to be overwritten by the next deploy. It writes to the wire
build now, and `tools/deploy-wire-to-client.py` copies it across like any other field.

Usage:

    python tools/build-travel-graph.py                                    # the graph itself
    python tools/build-wire-travel-edges.py --check                       # report, write nothing
    python tools/build-wire-travel-edges.py                               # wire -> exports/wire
    python tools/deploy-wire-to-client.py                                 # then deploy
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SERVICE = REPO / "services" / "world-data"
sys.path.insert(0, str(SERVICE / "src"))

from worlddata.geo.wgs84 import haversine_km  # noqa: E402

WIRE = SERVICE / "exports" / "wire"
TRAVEL_GRAPH = SERVICE / "dist" / "travel-graph.json"

# A wire settlement is matched to a graph node within this distance when the two do not
# share an id. The wire build's `osmId` is the pipeline's own `settlement_id` (state FIPS
# + place code, see client_wire.py), so an id match is the normal case and the radius only
# covers a wire file produced by an older builder that used OSM node ids.
MATCH_RADIUS_KM = 5.0


def match_settlements(
    wire_settlements: list[dict], nodes: list[dict], *, radius_km: float
) -> tuple[dict[str, str], list[str]]:
    """wire osmId -> graph node id, plus the wire ids that matched nothing.

    Id equality first, then nearest node within ``radius_km``. Two settlements sharing a
    name or sitting close together is normal on this data, so a nearest-neighbour guess
    that quietly attached an edge to the wrong town would be worse than no edge at all -
    hence the unmatched list, which the caller reports.
    """
    by_id = {str(node["id"]): node for node in nodes}
    matched: dict[str, str] = {}
    unmatched: list[str] = []
    unmatched_nodes: list[dict] = []

    for settlement in wire_settlements:
        osm_id = str(settlement["osmId"])
        node = by_id.get(osm_id)
        if node is None:
            unmatched.append(osm_id)
            unmatched_nodes.append(settlement)
            continue
        matched[osm_id] = str(node["id"])

    for settlement, osm_id in zip(unmatched_nodes, unmatched):
        best: tuple[float, str] | None = None
        for node in nodes:
            distance = haversine_km(
                (settlement["lon"], settlement["lat"]), (node["lon"], node["lat"])
            )
            if distance <= radius_km and (best is None or distance < best[0]):
                best = (distance, str(node["id"]))
        if best is not None:
            matched[osm_id] = best[1]
            unmatched.remove(osm_id)

    return matched, unmatched


def travel_edges(graph_edges: list[dict], node_to_wire: dict[str, str]) -> list[dict]:
    """The graph's edges, rewritten with wire ids on both ends.

    The graph's `method` is kept when it has one: `connector` marks an edge added to
    reach a settlement with no route of its own, and dropping that label would make those
    edges indistinguishable from real routes between two towns.
    """
    edges = []
    for edge in graph_edges:
        a = node_to_wire.get(str(edge["from"]))
        b = node_to_wire.get(str(edge["to"]))
        if a is None or b is None:
            continue
        edges.append(
            {
                "from": a,
                "to": b,
                "length_km": edge["length_km"],
                "road_class": edge["road_class"],
                "kind": edge["kind"],
                "minutes": edge["minutes"],
                "method": edge.get("method", "snap"),
            }
        )
    return edges


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--wire", type=Path, default=WIRE, help="the wire build to read and write")
    parser.add_argument("--graph", type=Path, default=TRAVEL_GRAPH, help="dist/travel-graph.json")
    parser.add_argument("--check", action="store_true", help="report what would change and write nothing")
    arguments = parser.parse_args()

    graph_path = arguments.graph
    settlements_path = arguments.wire / "settlements.json"
    network_path = arguments.wire / "network.json"
    for path in (graph_path, settlements_path, network_path):
        if not path.is_file():
            print(f"edges: {path} does not exist", file=sys.stderr)
            if path == graph_path:
                print(
                    "edges: the travel graph is the pipeline's own output; build it with "
                    "`python tools/build-travel-graph.py` (which needs the routes export).",
                    file=sys.stderr,
                )
            else:
                print("edges: build the wire files first with `python -m worlddata wire`", file=sys.stderr)
            return 1

    graph = json.loads(graph_path.read_text(encoding="utf-8"))
    wire_settlements = json.loads(settlements_path.read_text(encoding="utf-8"))["settlements"]
    print(f"edges: {len(wire_settlements)} wire settlements, {len(graph['nodes'])} graph nodes", flush=True)

    # A graph where every edge is free still pathfinds - it just reaches whatever is
    # nearest and reports the trip as taking no time. That is exactly what the committed
    # `routes` export produced, because it was missing `travel_hours` and every reader
    # defaulted to zero. Refuse to write a cost-free graph rather than redeploying it.
    weighted = sum(1 for edge in graph["edges"] if edge.get("minutes", 0) > 0)
    if graph["edges"] and not weighted:
        print(
            f"edges: {len(graph['edges'])} edges and none of them has travel minutes. The "
            "routes export it was built from is missing `travel_hours`, so the travel "
            "times defaulted to zero. Fix the routes export (`python tools/repair-routes-export.py`) "
            "and rebuild the graph; writing this one would publish a map where every trip "
            "is free.",
            file=sys.stderr,
        )
        return 1

    matched, unmatched = match_settlements(wire_settlements, graph["nodes"], radius_km=MATCH_RADIUS_KM)
    print(f"edges: matched {len(matched)}/{len(wire_settlements)} wire settlements to graph nodes")
    if unmatched:
        print(
            f"edges: WARNING: {len(unmatched)} wire settlements matched no graph node and "
            f"will have no travel edges, starting with {', '.join(unmatched[:5])}",
            file=sys.stderr,
        )

    node_to_wire = {node_id: osm_id for osm_id, node_id in matched.items()}
    edges = travel_edges(graph["edges"], node_to_wire)
    minutes = sum(edge["minutes"] for edge in edges)
    print(f"edges: {len(edges)} travel edges, {minutes:,.1f} minutes total")
    if not edges:
        print("edges: no edges at all; refusing to write an empty travel graph", file=sys.stderr)
        return 1

    network = json.loads(network_path.read_text(encoding="utf-8"))
    existing = network.get("travelEdges")
    payload = {
        "travelEdges": edges,
        "travelEdgesMeta": {
            "count": len(edges),
            "matched_settlements": len(matched),
            "note": (
                "v2: settlement-to-settlement weighted edges from the pipeline's travel graph, "
                "matched to the wire's settlements by id (nearest within "
                f"{MATCH_RADIUS_KM:g} km where the ids differ). Pathfind on these; the v1 "
                "geometry is for rendering."
            ),
        },
    }
    if existing == payload["travelEdges"] and network.get("travelEdgesMeta") == payload["travelEdgesMeta"]:
        print("edges: the wire build already has these edges; unchanged")
        return 0

    if arguments.check:
        print(f"edges: --check, {network_path} would gain {len(edges)} travel edges (it has {len(existing or [])})")
        return 0

    network.update(payload)
    part = network_path.with_name(network_path.name + ".part")
    part.write_text(json.dumps(network, separators=(",", ":")), encoding="utf-8")
    part.replace(network_path)
    print(f"edges: updated {network_path}")
    print("edges: now run `python tools/deploy-wire-to-client.py` to copy it to the client")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())