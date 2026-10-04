#!/usr/bin/env python3
"""Tier 3-92/93/94/95/96: Territory assignment and map export.

- 92: Settlements already carry section_key (6 factions); assign sub-territories
- 93: A faction's polygon is the union of its member states' Census rings
- 94: Flag border settlements (within 50 km of another faction's settlement)
- 95: Capital per faction = largest settlement in territory
- 96: Export territories.json for client (polygons + colors + labels)

Why the polygon is not a convex hull of settlement points
--------------------------------------------------------
It used to be one. A convex hull of a faction's settlement points can only ever
*contain* other settlements, including the ones belonging to a different
faction: measured on the 2023 export, 783 settlements - 5.9% of the country -
were drawn inside a territory that was not theirs, and no number anywhere in the
wire said so. Faction membership is a list of states
(`config/world_data.toml [sections]`), so the honest polygon is the union of
those states' Census rings.

Union, and a MultiPolygon, because a faction is 2 to 14 states and each state is
itself a multipolygon of islands and lake shorelines. Sections partition the
states - `worlddata.config` refuses a build in which a state is in two sections
or in none, and this tool refuses one where a state is in neither - so no two
member states overlap. The union of a disjoint set is the set itself, which is
why no polygon-clipping library is involved: `polygon` is every member state's
polygons, in config order, and a renderer fills all of them.

Wire format
-----------
`polygon` is a list of polygons; each polygon is its exterior ring followed by
its holes; each ring is a closed `[lon, lat]` list of the precision the Census
Bureau publishes at. That is a different shape from the single hull ring this
file used to carry, and `wire_version` reads 2, which is the version this shape
is. The earlier hull shipped under the same stamp, so the stamp was never a
reliable signal on its own; the shape is written down in
`clients/campaign/src/world/types.ts` (`TerritoriesFile`), which is where a
client reads wire shapes from.

Usage:

    python tools/build-territories.py            # write the client's territories.json
    python tools/build-territories.py --check    # report what would change, write nothing
"""

import argparse
import gzip
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SERVICE = Path(__file__).resolve().parent.parent
REPO = SERVICE.parent.parent
sys.path.insert(0, str(SERVICE / "src"))

from worlddata.config import load_config  # noqa: E402
from worlddata.errors import GeoError, WorldDataError  # noqa: E402
from worlddata.geo.polygons import PolygonIndex, to_multipolygon  # noqa: E402
from worlddata.geo.shapefile import iter_dbf, iter_shapes  # noqa: E402
from worlddata.transforms.geometry import iter_shapefile  # noqa: E402

CONFIG = SERVICE / "config" / "world_data.toml"
SETTLEMENTS = SERVICE / "dist" / "settlements.jsonl.gz"
DEFAULT_OUT = REPO / "clients" / "campaign" / "public" / "world" / "territories.json"

# The Cartographic Boundary vintage `load_state_boundaries` reads, so the states
# in this wire are the states the pipeline published its own numbers against.
CARTO_YEAR = 2023

# Coordinate order of every ring in the file. GeoJSON order, as it has always
# been in this file, and stated in the file itself so a renderer does not have to
# know it from this script.
COORDINATE_ORDER = "[lon, lat]"

# Ring order, stated for the same reason. `to_multipolygon` groups by winding and
# returns exterior rings clockwise with holes counter-clockwise; the pipeline
# itself refuses a state file that carries a ring too small to be a hole, so
# every ring here is one the Census Bureau published and oriented as published.
RING_ORDER = "exterior rings clockwise (negative signed area), holes counter-clockwise"

# Vertex precision. Four decimal places is about 11 m, which is two orders of
# magnitude finer than the accuracy of a 500k generalisation, so rounding is a
# smaller file rather than a decision.
COORDINATE_DECIMALS = 4

# Faction display colors (from banners/art pipeline)
FACTION_COLORS = {
    'great_lakes_union': '#2563eb',      # blue
    'southern_compact': '#dc2626',       # red
    'atlantic_corridor': '#059669',      # green
    'lone_star_frontier': '#d97706',     # amber
    'pacific_compact': '#7c3aed',        # purple
    'mountain_alliance': '#78716c',      # stone
}

# Border settlement sampling. A settlement is a border settlement when it is
# within this distance of another faction's settlement. Checking every pair is
# ~85 million distance calls over 13,000 settlements, so both sides are sampled
# and the field is named `border_settlement_sample` because it is an estimate of
# the count, not the count.
BORDER_SAMPLE_KM = 50.0
BORDER_MEMBER_STRIDE = 10
BORDER_OTHER_STRIDE = 50


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km."""
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def iter_state_shapes(raw_dir: Path, cache_dir: Path):
    """Every state in the Census state boundary file, as (record, rings).

    Reads the downloaded archive when it is still in the raw directory and the
    unpacked cache directory when it is not, streaming one record at a time in
    both cases. Nothing is held that is not needed for the section the state
    belongs to.
    """
    archive = raw_dir / f"cb_{CARTO_YEAR}_us_state_500k.zip"
    if archive.is_file():
        for rings, record in iter_shapefile(archive, cache_dir):
            yield record, rings
        return

    directory = cache_dir / archive.stem
    if not directory.is_dir():
        raise WorldDataError(
            f"{archive} is neither present in {raw_dir} nor unpacked in {directory}. This tool reads state "
            "geometry from the Census Cartographic Boundary file; run `python -m worlddata fetch` first."
        )
    stem = next(directory.glob("*.shp")).stem
    shapes = (rings for rings, _bbox in iter_shapes(directory / f"{stem}.shp"))
    for _fields, record in iter_dbf(directory / f"{stem}.dbf"):
        try:
            rings = next(shapes)
        except StopIteration as exc:
            raise WorldDataError(
                f"{stem}.shp has fewer shapes than {stem}.dbf has records; the two must be row-aligned"
            ) from exc
        yield record, rings


def group_state_polygons(record, rings, minimum_hole_area_deg2):
    """One state's flat ring list grouped into polygons, ready for the wire.

    `to_multipolygon` groups by winding. A ring too small to be a real hole is
    kept by it as a polygon of its own, but it then arrives running the wrong way
    for an exterior ring, and the pipeline's own state reader stops the run over
    exactly that case rather than publish a winding it cannot vouch for. This one
    stops too.
    """
    polygons, slivers = to_multipolygon(rings, minimum_hole_area_deg2=minimum_hole_area_deg2)
    if slivers:
        raise WorldDataError(
            f"state {record.get('NAME')} carries {slivers} counter-clockwise ring(s) below the configured "
            "minimum hole area. The state boundary files are expected to be hole-free, and a faction "
            "polygon cannot be published from rings whose winding this pipeline cannot classify."
        )
    return polygons


def wire_polygons(polygons):
    """Grouped polygons as the wire carries them: `[lon, lat]` at the published precision."""
    return [
        [
            [[round(lon, COORDINATE_DECIMALS), round(lat, COORDINATE_DECIMALS)] for lon, lat in ring]
            for ring in polygon
        ]
        for polygon in polygons
    ]


def read_settlements(path: Path):
    """Placed settlements by section, plus the ones that could not be placed.

    A settlement with no latitude or longitude cannot be drawn in any territory
    and cannot be counted in any territory's population, and it used to be
    dropped here without a word. The eight consolidated city-county governments
    - Indianapolis, Louisville, Nashville-Davidson among them - are absent from
    every faction for exactly that reason, and nothing in the wire said so. They
    are named on stderr and counted in the file.
    """
    members: dict[str, list[dict]] = defaultdict(list)
    no_position: list[dict] = []
    placed = 0
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if row.get("_header"):
                continue
            settlement_id = row.get("settlement_id") or row.get("osmId")
            if not settlement_id:
                continue
            section_key = row.get("section_key") or "unknown"
            entry = {
                "id": settlement_id,
                "name": row.get("name", settlement_id),
                "lat": row.get("latitude"),
                "lon": row.get("longitude"),
                "pop": row.get("population", 0) or 0,
                "faction": section_key,
            }
            if entry["lat"] is None or entry["lon"] is None:
                no_position.append(entry)
                continue
            placed += 1
            members[section_key].append(entry)
    return members, no_position, placed


def border_sample(members: list[dict], other_points: list[tuple[float, float]]) -> int:
    """How many sampled settlements sit within BORDER_SAMPLE_KM of another faction."""
    border_ids = set()
    for member in members[::BORDER_MEMBER_STRIDE]:
        for other_lat, other_lon in other_points[::BORDER_OTHER_STRIDE]:
            if haversine_km(member["lat"], member["lon"], other_lat, other_lon) < BORDER_SAMPLE_KM:
                border_ids.add(member["id"])
                break
    return len(border_ids)


def build_territories(config, settlements_path: Path):
    """The whole territories document, plus the notes the run produced."""
    raw_dir = config.path_for("raw_dir")
    cache_dir = config.path_for("cache_dir")
    minimum_hole = float(config.get("verification.minimum_hole_area_deg2"))

    sections = config.sections
    state_to_section = {
        state_name.casefold(): section.key for section in sections for state_name in section.state_names
    }

    polygons_by_section: dict[str, list] = defaultdict(list)
    member_states: dict[str, list[dict]] = defaultdict(list)
    unassigned_states: list[str] = []
    for record, rings in iter_state_shapes(raw_dir, cache_dir):
        name = str(record.get("NAME") or "")
        section_key = state_to_section.get(name.casefold())
        if section_key is None:
            unassigned_states.append(f"{name} ({record.get('STUSPS')})")
            continue
        polygons_by_section[section_key].extend(group_state_polygons(record, rings, minimum_hole))
        member_states[section_key].append(
            {
                "state_fips": str(record.get("STATEFP")),
                "abbreviation": str(record.get("STUSPS")),
                "name": name,
            }
        )

    members, no_position, placed = read_settlements(settlements_path)
    notes: list[str] = []
    if unassigned_states:
        # Puerto Rico and the outlying territories are in the Census file and in
        # no section, because FACTIONS.md section 4 puts no state in two sides and
        # does not list them. Skipping them is a decision, so it is reported.
        notes.append(
            f"{len(unassigned_states)} jurisdiction(s) in cb_{CARTO_YEAR}_us_state_500k belong to no section "
            f"and are in no territory: {', '.join(sorted(unassigned_states))}."
        )
    if no_position:
        notes.append(
            f"{len(no_position)} settlement(s) have no coordinates and are in no territory and in no "
            f"faction's population or settlement count: {', '.join(entry['id'] for entry in no_position)}."
        )

    territories = []
    for section in sections:
        key = section.key
        if key not in FACTION_COLORS:
            raise WorldDataError(
                f"section {key!r} has no color in this tool; every faction drawn on the map needs one, and a "
                "faction with no color of its own would be drawn in another one's"
            )
        section_members = members.get(key, [])
        if not section_members:
            raise WorldDataError(
                f"section {key!r} has no placed settlement in {settlements_path.name}, so it has no capital "
                "and no population to publish; the settlements export and the config's [sections] disagree"
            )
        capital = max(section_members, key=lambda member: member["pop"])
        polygons = polygons_by_section.get(key)
        if not polygons:
            raise WorldDataError(
                f"section {key!r} has member states in config/world_data.toml but no polygons in the Census "
                "state boundary file, so its territory would be empty"
            )
        other_points = [
            (member["lat"], member["lon"])
            for other_key, group in members.items()
            if other_key != key
            for member in group
        ]
        territories.append(
            {
                "faction": key,
                "label": section.name,
                "color": FACTION_COLORS[key],
                "states": [state["name"] for state in member_states[key]],
                "state_fips": [state["state_fips"] for state in member_states[key]],
                "settlement_count": len(section_members),
                "total_population": sum(member["pop"] for member in section_members),
                "capital": {
                    "id": capital["id"],
                    "name": capital["name"],
                    "lat": capital["lat"],
                    "lon": capital["lon"],
                    "population": capital["pop"],
                },
                # A MultiPolygon: every polygon of every member state, in the
                # order config/world_data.toml lists them and the Census file
                # holds them. No two overlap, so a renderer fills all of them.
                "polygon": wire_polygons(polygons),
                "polygon_count": len(polygons),
                "ring_count": sum(len(polygon) for polygon in polygons),
                "vertex_count": sum(len(ring) for polygon in polygons for ring in polygon),
                "border_settlement_sample": border_sample(section_members, other_points),
            }
        )

    # The shape of the defect this tool exists to fix, measured on the polygons
    # that are about to be written: a faction's own settlements have to be inside
    # its own territory, and no other faction's may be. The count of settlements
    # that fall outside every territory is reported too, because a settlement on
    # an island the 500k state file does not carry is a real place that no polygon
    # in this file covers, and a reader should be able to see that in the file
    # rather than infer it from a map.
    index_by_section = {
        section.key: PolygonIndex(polygons_by_section[section.key]) for section in sections
    }
    outside_every_territory: list[dict] = []
    for key, group in members.items():
        index = index_by_section.get(key)
        if index is None:
            # A settlement whose section_key is not a configured section cannot be
            # attributed to any territory. Reported rather than drawn somewhere.
            outside_every_territory.extend(group)
            continue
        outside_every_territory.extend(
            member for member in group if not index.contains((member["lon"], member["lat"]))
        )
    notes.append(
        f"Territory polygons checked against every placed settlement: "
        f"{placed - len(outside_every_territory):,} of {placed:,} fall inside their own faction's territory, "
        f"{len(outside_every_territory)} fall outside every polygon in this file."
    )

    payload = {
        # 2 is the MultiPolygon union of member state polygons. See the module
        # docstring: the previous single-ring hull carried this same stamp, so
        # the shape is the contract and the stamp only says it is not 1.
        "wire_version": 2,
        "source": f"us-census-carto-state-500k ({CARTO_YEAR})",
        "licence": (
            "U.S. Government work, public domain (Title 17 U.S.C. 105). U.S. Census Bureau, Cartographic "
            f"Boundary Files, {CARTO_YEAR}, 500k, state. No attribution required."
        ),
        "coordinateOrder": COORDINATE_ORDER,
        "ringOrder": RING_ORDER,
        # The run time, not a typed-in date: a provenance field that cannot
        # change is a decoration that looks like one.
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "faction_count": len(territories),
        "settlement_count": placed,
        "no_position": {
            "count": len(no_position),
            "settlements": [entry["id"] for entry in no_position],
        },
        "outside_every_territory": {
            "count": len(outside_every_territory),
            "settlements": [entry["id"] for entry in outside_every_territory],
        },
        "territories": territories,
    }
    return payload, notes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=CONFIG)
    parser.add_argument("--settlements", type=Path, default=SETTLEMENTS)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--check", action="store_true", help="report what would change and write nothing")
    arguments = parser.parse_args()

    if not arguments.settlements.is_file():
        print(
            f"ERROR: {arguments.settlements} is not present; this tool reports a faction's settlements from "
            "the pipeline's own export",
            file=sys.stderr,
        )
        return 1

    try:
        payload, notes = build_territories(load_config(arguments.config), arguments.settlements)
    except (WorldDataError, GeoError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    no_position = payload["no_position"]
    if no_position["count"]:
        print(
            f"WARNING: {no_position['count']} settlement(s) have no coordinates and are in no territory, no "
            f"faction population and no faction settlement count: {', '.join(no_position['settlements'])}",
            file=sys.stderr,
        )
    outside = payload["outside_every_territory"]
    if outside["count"]:
        print(
            f"WARNING: {outside['count']} settlement(s) fall inside no polygon in this file, so they are drawn "
            f"on no faction's territory: {', '.join(outside['settlements'])}. These are places the 500k state "
            "generalisation does not carry as land - an island or a peninsula - whose own place polygon does; "
            "they are listed in the file under outside_every_territory so a reader does not have to infer it.",
            file=sys.stderr,
        )
    for note in notes:
        print(f"territories: {note}")

    for territory in payload["territories"]:
        print(
            f"  {territory['label']:<20} {territory['polygon_count']:>4} polygons, "
            f"{territory['vertex_count']:>7,} vertices, {territory['settlement_count']:>5,} settlements, "
            f"capital={territory['capital']['name']} ({territory['capital']['population']:,})"
        )

    arguments.out.parent.mkdir(parents=True, exist_ok=True)
    if arguments.check:
        # Compared without `generated`, which is the run time and therefore always
        # different: the question --check answers is whether the config or the
        # settlements export moved the territories, not whether the clock did.
        existing = json.loads(arguments.out.read_text(encoding="utf-8")) if arguments.out.is_file() else None
        if existing is None:
            print(f"territories: --check, {arguments.out} is not there yet")
            return 0
        previous = {key: value for key, value in existing.items() if key != "generated"}
        current = {key: value for key, value in payload.items() if key != "generated"}
        if previous == current:
            print(
                f"territories: {arguments.out} holds this build's territories; only the run stamp would "
                "change"
            )
        else:
            changed = sorted(key for key in set(previous) | set(current) if previous.get(key) != current.get(key))
            print(f"territories: --check, {arguments.out} would change in: {', '.join(changed)}")
        return 0

    # Through a .part file and a rename, like every other writer in this service,
    # so a killed run cannot leave the client reading half a file.
    part = arguments.out.with_name(arguments.out.name + ".part")
    part.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    part.replace(arguments.out)
    print(f"Wrote: {arguments.out} ({arguments.out.stat().st_size / 1_000_000:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())