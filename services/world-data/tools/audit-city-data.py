#!/usr/bin/env python3
"""Measure the city/settlement data defects found by the 2026-10-03 audit.

Every number in the audit report comes from this script, so the report can be
re-checked rather than believed. It reads only files already in the repository
and writes nothing.

    python tools/audit-city-data.py            # report, exit 0
    python tools/audit-city-data.py --strict   # exit 1 if any defect is present

Exit status is 1 under `--strict` while any of the bundle-level defects are
still in the published data. Those are the ones a pipeline re-run clears:

  * settlements with no coordinates, which is how the eight consolidated
    city-county governments shipped;
  * route edges shorter than the great-circle distance between their own
    endpoints;
  * dist artefacts whose content cannot be reproduced from their own tool.

The code-level defects - the dead boundary lookup, the route gate that was
declared and never read, the per-process hash, the garrison keys that matched
one section in six - are covered by tests/test_city_data_quality.py instead,
because those are held shut by the code and not by the data.
"""

from __future__ import annotations

import argparse
import collections
import gzip
import importlib.util
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SERVICE = REPO / "services" / "world-data"
sys.path.insert(0, str(SERVICE / "src"))

from worlddata.geo.wgs84 import haversine_km  # noqa: E402

EXPORTS = SERVICE / "exports"
DIST = SERVICE / "dist"
CLIENT_WORLD = REPO / "clients" / "campaign" / "public" / "world"

# Straight-line floor for the detour check, in km. Below this the two
# settlements are effectively the same point and the ratio is meaningless.
STRAIGHT_LINE_FLOOR_KM = 0.05


def read_table(path: Path) -> list[dict]:
    """Data rows of a committed jsonl.gz export, header record removed."""
    if not path.is_file():
        return []
    rows = []
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("_header"):
                continue
            rows.append(row)
    return rows


def load_tool(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SERVICE / "tools" / filename)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def report(title: str) -> None:
    print(f"\n{title}\n{'-' * len(title)}")


# ---------------------------------------------------------------------------


def audit_settlement_coordinates(settlements: list[dict]) -> list[str]:
    report("1. Settlement coordinates")
    if not settlements:
        print("  settlements.jsonl.gz is not present")
        return []

    problems = []
    missing = [row for row in settlements if row.get("latitude") is None or row.get("longitude") is None]
    print(f"  settlements: {len(settlements):,}")
    print(f"  with no latitude/longitude: {len(missing)}")
    for row in missing:
        print(
            f"    {row['settlement_id']:<58} {row['name']:<52} "
            f"pop {row['population']:>9,}  {row['size_class']}"
        )
    if missing:
        problems.append(
            f"{len(missing)} settlements ship with null coordinates; "
            "tools/build-territories.py and tools/build-metro-wire.py skip them entirely"
        )

    zero = [row for row in settlements if row.get("latitude") == 0 or row.get("longitude") == 0]
    print(f"  at exactly (0, 0): {len(zero)}")

    located = [row for row in settlements if row.get("latitude") is not None]
    if located:
        lats = [row["latitude"] for row in located]
        lons = [row["longitude"] for row in located]
        print(f"  latitude  range {min(lats):8.4f} .. {max(lats):8.4f}")
        print(f"  longitude range {min(lons):9.4f} .. {max(lons):9.4f}")
        outside = [row for row in located if not (18.0 <= row["latitude"] <= 72.0 and -180.0 <= row["longitude"] <= -60.0)]
        print(f"  outside the 50-states-plus-D.C. envelope: {len(outside)}")
        if outside:
            problems.append(f"{len(outside)} settlements fall outside the US envelope")

    null_area = [row for row in settlements if row.get("land_area_km2") is None]
    if null_area:
        print(f"  with no land_area_km2: {len(null_area)}")
    return problems


def audit_place_boundaries(settlements: list[dict]) -> list[str]:
    report("2. place_boundaries coverage")
    rows = read_table(EXPORTS / "place_boundaries.jsonl.gz")
    if not rows:
        print("  place_boundaries.jsonl.gz is not present")
        return []
    keys = {row["settlement_key"] for row in rows}
    print(f"  rows: {len(rows):,} over {len(keys):,} distinct settlement_key")
    settlements_with_position = {row["settlement_id"] for row in settlements if row.get("latitude") is not None}
    missing = sorted(settlements_with_position - keys)
    print(f"  settlements with no boundary row: {len(missing)} {missing[:5]}")

    name_keyed = [row["settlement_id"] for row in settlements if "-nm-" in row["settlement_id"]]
    print(f"  name-keyed settlement ids (PLACE 00000): {len(name_keyed)}")
    for sid in name_keyed:
        print(f"    {sid}")
    problems = []
    if name_keyed:
        problems.append(
            f"{len(name_keyed)} settlements are keyed on (state FIPS, name) rather than on a place "
            "FIPS, so they cannot join to place_boundaries by settlement_key even once the lookup "
            "is fixed; settlement_id derivation needs the resolved place FIPS"
        )
    return problems


def audit_routes(settlements: list[dict]) -> list[str]:
    report("3. Route edges against the crow-flies distance")
    routes = read_table(EXPORTS / "routes.jsonl.gz")
    if not routes:
        print("  routes.jsonl.gz is not present")
        return []
    points = {
        row["settlement_id"]: (row["longitude"], row["latitude"])
        for row in settlements
        if row.get("longitude") is not None
    }
    print(f"  routes: {len(routes):,} {dict(collections.Counter(row['kind'] for row in routes))}")

    shorter = collections.Counter()
    below_half = collections.Counter()
    worst = []
    for row in routes:
        left = points.get(row["from_settlement_id"])
        right = points.get(row["to_settlement_id"])
        if left is None or right is None:
            continue
        straight = haversine_km(left, right)
        if straight <= STRAIGHT_LINE_FLOOR_KM:
            continue
        if row["distance_km"] < straight:
            shorter[row["kind"]] += 1
            worst.append((row["distance_km"] / straight, straight, row))
        if row["distance_km"] < straight * 0.5:
            below_half[row["kind"]] += 1
    worst.sort(key=lambda item: item[0])

    for kind in sorted(shorter):
        total = sum(1 for row in routes if row["kind"] == kind)
        print(
            f"  {kind:<5} edges shorter than the straight line: {shorter[kind]:>5} of {total:>5} "
            f"({shorter[kind] / total:5.1%}); below the 0.5 gate: {below_half[kind]:>5}"
        )
    for ratio, straight, row in worst[:5]:
        print(
            f"    {row['route_id']:<34} {row['distance_km']:7.2f} km vs {straight:7.2f} km "
            f"straight ({ratio:.3f}x), {row['segment_count']} segment(s)"
        )

    problems = []
    if shorter:
        problems.append(
            f"{sum(shorter.values()):,} committed route edges are shorter than the great-circle "
            f"distance between their own endpoints ({sum(below_half.values()):,} of them below the "
            "configured 0.5 gate); travel.min_segment_gc_fraction was declared in config and read "
            "by nothing"
        )
    return problems


def audit_route_segment_gate(settlements: list[dict]) -> list[str]:
    report("4. What the route gate would remove, measured on the segment table")
    segment_table = DIST / "route_segments.parquet"
    if not segment_table.is_file():
        print(f"  {segment_table.name} is not present; run the pipeline to measure this")
        return []
    try:
        import pyarrow.parquet as pq
    except ImportError:
        print("  pyarrow is not installed; cannot read the segment table")
        return []
    table = pq.read_table(
        segment_table,
        columns=["segment_id", "kind", "length_km", "from_settlement_id", "to_settlement_id"],
    ).to_pydict()
    points = {
        row["settlement_id"]: (row["longitude"], row["latitude"])
        for row in settlements
        if row.get("longitude") is not None
    }
    kept = collections.Counter()
    dropped = collections.Counter()
    for index in range(len(table["segment_id"])):
        left = table["from_settlement_id"][index]
        right = table["to_settlement_id"][index]
        if left is None or right is None or left == right:
            continue
        a = points.get(left)
        b = points.get(right)
        if a is None or b is None:
            continue
        straight = haversine_km(a, b)
        if straight <= 0.0:
            continue
        kind = table["kind"][index]
        if table["length_km"][index] >= straight * 0.5:
            kept[kind] += 1
        else:
            dropped[kind] += 1
    total = sum(kept.values()) + sum(dropped.values())
    print(f"  snapped non-loop segments judged: {total:,}")
    for kind in sorted(set(kept) | set(dropped)):
        share = dropped[kind] / max(1, kept[kind] + dropped[kind])
        print(f"    {kind:<5} kept {kept[kind]:>6,}  dropped {dropped[kind]:>6,}  ({share:5.1%})")
    return []


def audit_notable_slots(settlements: list[dict]) -> list[str]:
    report("5. Notable slots")
    path = DIST / "notable-slots.jsonl.gz"
    if not path.is_file():
        print("  dist/notable-slots.jsonl.gz is not present")
        return []
    tool = load_tool("audit_build_notable_slots", "build-notable-slots.py")
    committed = read_table(path)
    committed_bands = collections.Counter(row["band"] for row in committed)
    pipeline_bands = collections.Counter(row["size_class"] for row in settlements)
    print(f"  dist/ bands:         {dict(sorted(committed_bands.items()))}")
    print(f"  pipeline size_class: {dict(sorted(pipeline_bands.items()))}")
    print(f"  total slots committed: {sum(row['slot_count'] for row in committed):,}")
    rebuilt = sum(
        tool.notable_slots(row["population"], row["size_class"], row["settlement_id"])["slot_count"]
        for row in settlements
    )
    print(f"  total slots with the current tool: {rebuilt:,}")

    mismatched = sum(1 for row in committed if row.get("band") != row.get("size_class"))
    ids = [row["settlement_id"] for row in committed]
    repeat = tool.notable_slots(2377, "village", "01-00124") == tool.notable_slots(2377, "village", "01-00124")
    print(f"  tool output is a pure function of its inputs: {repeat}")
    print(f"  duplicate settlement ids: {len(ids) - len(set(ids))}")

    problems = []
    if committed_bands != pipeline_bands:
        differing = sum(
            1
            for row, source in zip(committed, settlements, strict=False)
            if row["settlement_id"] == source["settlement_id"] and row["band"] != source["size_class"]
        )
        problems.append(
            f"{differing} settlements are banded by build-notable-slots.py differently from the "
            "pipeline's own size_class; POI tags are derived from the tool's answer"
        )
    return problems


def audit_garrison(settlements: list[dict]) -> list[str]:
    report("6. Garrison baselines")
    path = DIST / "garrison-baselines.jsonl.gz"
    if not path.is_file():
        print("  dist/garrison-baselines.jsonl.gz is not present")
        return []
    tool = load_tool("audit_build_garrison", "build-garrison-baselines.py")
    committed = read_table(path)
    committed_pairs = collections.Counter((row["section_key"], row["garrison_factor"]) for row in committed)
    print("  committed (section, factor):")
    for key, count in sorted(committed_pairs.items()):
        print(f"    {key[0]:<20} {key[1]:<8} {count:>6,}")
    print(f"  tool's factor per real section: {tool.DEFAULT_GARRISON_FACTOR}")
    print(f"  total garrison committed: {sum(row['garrison_baseline'] for row in committed):,}")
    rebuilt = sum(int((row["population"] or 0) * tool.DEFAULT_GARRISON_FACTOR) for row in settlements)
    print(f"  total garrison with one constant: {rebuilt:,}")
    distinct = len({factor for _, factor in committed_pairs})
    problems = []
    if distinct > 1:
        problems.append(
            "committed garrisons use more than one policy factor, keyed on section names that "
            "matched at most one of the six real section keys"
        )
    return problems


def audit_poi_tags() -> list[str]:
    report("7. POI tags")
    path = DIST / "poi-tags.jsonl.gz"
    if not path.is_file():
        print("  dist/poi-tags.jsonl.gz is not present")
        return []
    rows = read_table(path)
    types = collections.Counter()
    sources = collections.Counter()
    for row in rows:
        for poi in row["pois"]:
            types[poi["poi_type"]] += 1
            sources[poi["source"]] += 1
    print(f"  settlements: {len(rows):,}")
    print(f"  poi types:   {dict(sorted(types.items()))}")
    print(f"  poi sources: {dict(sorted(sources.items()))}")
    villages = sum(1 for row in rows if row.get("band") == "village")
    halls = sum(1 for row in rows if any(p["poi_type"] == "town_hall" for p in row["pois"]))
    print(f"  settlements given a town_hall: {halls:,}, of which villages: {villages:,}")
    return [
        f"{halls:,} settlements are given a town_hall POI by a rule the tool labels "
        f"'universal', including {villages:,} places the pipeline classes as villages; "
        f"{types['marketplace']:,} marketplaces come from a 'band_rule' and "
        f"{types['arena']:,} arenas from a hardcoded 500,000 population threshold. "
        "No POI dataset is declared in src/worlddata/datasets.py"
    ]


def audit_metro_wire() -> list[str]:
    report("8. Metro wire")
    root = DIST / "wire"
    if not root.is_dir():
        print("  dist/wire is not present")
        return []
    empty = []
    for path in sorted(root.glob("*/network.json")) + sorted(root.glob("*/travel.json")):
        document = json.loads(path.read_text(encoding="utf-8"))
        if not document.get("edges"):
            empty.append(path.relative_to(root).as_posix())
    metros = sorted(p.name for p in root.iterdir() if p.is_dir())
    print(f"  metro dirs: {metros}")
    print(f"  files with an empty edge list: {len(empty)} {empty}")
    return (
        [f"{len(empty)} metro wire files carry an empty edge list and a 'TBD' note: {empty}"]
        if empty
        else []
    )


def _point_in_polygon(polygon: list[list[float]], x: float, y: float) -> bool:
    inside = False
    count = len(polygon)
    j = count - 1
    for i in range(count):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _territory_rings(document: dict) -> dict[str, list[tuple[list[list[float]], tuple[float, float, float, float]]]]:
    """Each faction's exterior rings with a bounding box, from either wire shape.

    `territories.json` v2 is a MultiPolygon: `polygon` is a list of polygons and
    the first ring of each is its exterior. The single-ring hull it replaced is
    accepted too, so this audit can measure the file as it stands rather than
    refusing to read the shape it is here to complain about.
    """
    rings: dict[str, list[tuple[list[list[float]], tuple[float, float, float, float]]]] = {}
    for item in document["territories"]:
        first = item["polygon"][0]
        if first and isinstance(first[0][0], (int, float)):
            exteriors = [item["polygon"]]
        else:
            exteriors = [polygon[0] for polygon in item["polygon"]]
        boxes = []
        for ring in exteriors:
            lons = [point[0] for point in ring]
            lats = [point[1] for point in ring]
            boxes.append((ring, (min(lons), max(lons), min(lats), max(lats))))
        rings[item["faction"]] = boxes
    return rings


def audit_territories(settlements: list[dict]) -> list[str]:
    report("9. Faction territories")
    path = CLIENT_WORLD / "territories.json"
    if not path.is_file():
        print("  the deployed territories.json is not present")
        return []
    document = json.loads(path.read_text(encoding="utf-8"))
    print(f"  wire_version: {document.get('wire_version')}")
    print(f"  generated stamp: {document.get('generated')}")
    print(f"  coordinate order: {document.get('coordinateOrder')}")
    hulls = _territory_rings(document)
    located = [row for row in settlements if row.get("longitude") is not None]

    swallowed = collections.Counter()
    own_territory = 0
    examples = []
    for faction, boxes in hulls.items():
        for row in located:
            for ring, (west, east, south, north) in boxes:
                if not (west <= row["longitude"] <= east and south <= row["latitude"] <= north):
                    continue
                if not _point_in_polygon(ring, row["longitude"], row["latitude"]):
                    continue
                if row["section_key"] == faction:
                    own_territory += 1
                else:
                    swallowed[faction] += 1
                    if len(examples) < 6:
                        examples.append((row["name"], row["section_key"], faction, row["population"]))
                break
    total = sum(swallowed.values())
    print(f"  territories: {len(hulls)}")
    for faction, boxes in sorted(hulls.items()):
        vertices = sum(len(ring) for ring, _ in boxes)
        west = min(box[0] for _, box in boxes)
        east = max(box[1] for _, box in boxes)
        south = min(box[2] for _, box in boxes)
        north = max(box[3] for _, box in boxes)
        print(
            f"    {faction:<20} {len(boxes):>4} polygons {vertices:>7,} pts  "
            f"lon {west:9.3f}..{east:8.3f}  lat {south:6.3f}..{north:6.3f}"
        )
    print(f"  settlements inside their own faction's territory: {own_territory} of {len(located):,}")
    print(f"  settlements inside a territory that is not their faction's: {total} of {len(located):,}")
    for name, own, drawn, population in examples:
        print(f"    {name} ({own}, pop {population:,}) drawn inside {drawn}")
    absent = len(settlements) - len(located)
    print(f"  settlements absent from every territory for want of coordinates: {absent}")

    problems = []
    if total:
        problems.append(
            f"{total} settlements are drawn inside a faction territory that is not their own, because the "
            "polygon is not the union of member state polygons"
        )
    if absent:
        problems.append(f"{absent} settlements are absent from every territory")
    if not document.get("generated"):
        problems.append("territories.json carries no 'generated' run stamp")
    return problems


def audit_battle_patch() -> list[str]:
    report("10. Battle patch placeholders")
    sys.path.insert(0, str(SERVICE / "src"))
    from worlddata.battle_patch import build_patch

    patch = build_patch("18-36003", 39.7771, -86.1463, 888578, 220, seed=42)
    heightfield = patch["heightfield"]
    water = patch["water_mask"]
    print(f"  heightfield: {len(heightfield)} samples, distinct values {sorted(set(heightfield))}")
    print(f"  water_mask:  {len(water)} samples, true count {sum(1 for v in water if v)}")
    print(f"  biome:       {patch['biome']}")
    print(f"  cover objects: {len(patch['cover_objects'])}")
    a = build_patch("18-36003", 39.7771, -86.1463, 888578, 220, seed=42)
    b = build_patch("18-36003", 39.7771, -86.1463, 888578, 220, seed=42)
    print(f"  byte-identical for the same settlement and seed: {a == b}")
    return [
        "build_patch writes a 64x64 heightfield of zeros and a water mask of all False, labelled "
        "as placeholders in the source; dist_to_coast_km and dist_to_river_km are passed as None so "
        "the coastal and river branches of classify_biome can never fire",
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--strict", action="store_true", help="exit 1 if any defect is present")
    arguments = parser.parse_args()

    settlements = read_table(EXPORTS / "settlements.jsonl.gz")
    problems: list[str] = []
    problems += audit_settlement_coordinates(settlements)
    problems += audit_place_boundaries(settlements)
    problems += audit_routes(settlements)
    problems += audit_route_segment_gate(settlements)
    problems += audit_notable_slots(settlements)
    problems += audit_garrison(settlements)
    problems += audit_poi_tags()
    problems += audit_metro_wire()
    problems += audit_territories(settlements)
    problems += audit_battle_patch()

    report(f"Defects present in the published data: {len(problems)}")
    for index, problem in enumerate(problems, start=1):
        print(f"  {index}. {problem}")
    if problems and not arguments.strict:
        print("\n  (--strict would exit 1)")
    return 1 if problems and arguments.strict else 0


if __name__ == "__main__":
    raise SystemExit(main())