#!/usr/bin/env python3
"""A* connectivity report for the travel graph (Tier 1A-11/12).

Loads dist/travel-graph.json, finds connected components, and reports the
share of settlements in the largest component. Exits non-zero when any
settlement is unreachable, listing the disconnected ones for the explicit
connector-stub / no_road handling Tier 1A-13 requires.

Also spot-checks A* route-finding on a sample of settlement pairs, because a
graph can be "connected" on paper while the pathfinder disagrees.
"""

from __future__ import annotations

import heapq
import json
import random
import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]
GRAPH = SERVICE / "dist" / "travel-graph.json"


def load_graph(path: Path):
    data = json.loads(path.read_text(encoding="utf-8"))
    nodes = {n["id"]: n for n in data["nodes"]}
    adj: dict[str, list[tuple[str, float]]] = {nid: [] for nid in nodes}
    for edge in data["edges"]:
        a, b = edge["from"], edge["to"]
        if a not in adj or b not in adj:
            continue
        w = edge["minutes"]
        adj[a].append((b, w))
        adj[b].append((a, w))
    return nodes, adj


def components(adj):
    seen: dict[str, int] = {}
    comp_id = 0
    for start in adj:
        if start in seen:
            continue
        stack = [start]
        seen[start] = comp_id
        while stack:
            node = stack.pop()
            for neighbour, _ in adj[node]:
                if neighbour not in seen:
                    seen[neighbour] = comp_id
                    stack.append(neighbour)
        comp_id += 1
    return seen


def astar(adj, nodes, start, goal):
    """A* with straight-line distance as the admissible heuristic."""
    def heuristic(nid):
        a, b = nodes[nid], nodes[goal]
        # Rough km per degree; admissible because no edge is faster than
        # straight-line flight at the fastest class speed.
        return ((a["lat"] - b["lat"]) ** 2 + (a["lon"] - b["lon"]) ** 2) ** 0.5 * 111.0 / 2.0

    open_heap = [(heuristic(start), 0.0, start)]
    best = {start: 0.0}
    while open_heap:
        _, cost, node = heapq.heappop(open_heap)
        if node == goal:
            return cost
        if cost > best.get(node, float("inf")):
            continue
        for neighbour, weight in adj[node]:
            new_cost = cost + weight
            if new_cost < best.get(neighbour, float("inf")):
                best[neighbour] = new_cost
                heapq.heappush(open_heap, (new_cost + heuristic(neighbour), new_cost, neighbour))
    return None


def main() -> int:
    if not GRAPH.exists():
        print(f"missing {GRAPH} — run tools/build-travel-graph.py first", file=sys.stderr)
        return 1
    nodes, adj = load_graph(GRAPH)
    comp = components(adj)

    sizes: dict[int, int] = {}
    for cid in comp.values():
        sizes[cid] = sizes.get(cid, 0) + 1
    ranked = sorted(sizes.items(), key=lambda kv: kv[1], reverse=True)
    largest_id, largest_size = ranked[0]
    total = len(nodes)
    print(f"settlements: {total:,}")
    print(f"components: {len(ranked)}")
    print(f"largest component: {largest_size:,} settlements ({largest_size / total:.2%})")
    for cid, size in ranked[1:6]:
        print(f"  component {cid}: {size} settlements")
    if len(ranked) > 6:
        print(f"  ... and {len(ranked) - 6} smaller components")

    isolated = [nid for nid, cid in comp.items() if sizes[cid] == 1 and not adj[nid]]
    print(f"isolated (no edges at all): {len(isolated)}")
    if isolated[:10]:
        print("  e.g. " + ", ".join(isolated[:10]))

    # A* spot check: 200 random pairs inside the largest component.
    members = [nid for nid, cid in comp.items() if cid == largest_id]
    rng = random.Random(20261001)
    failures = 0
    checked = 0
    for _ in range(200):
        a, b = rng.sample(members, 2)
        cost = astar(adj, nodes, a, b)
        checked += 1
        if cost is None:
            failures += 1
            print(f"  A* FAILED between {a} and {b} (same component!)")
    print(f"A* spot check: {checked - failures}/{checked} pairs reachable")

    if len(ranked) > 1 or failures:
        return 1
    print("OK: graph fully connected, A* agrees")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
