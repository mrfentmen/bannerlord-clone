#!/usr/bin/env python3
"""Build the client wire's place boundaries from the Census Cartographic Boundary file.

The campaign client reads settlements and roads out of `settlements.json` and
`network.json`, and has no geometry for the settlements themselves: it draws towns at a
point. `place_boundaries` in `exports/place_boundaries.jsonl.gz` has 32,037 real Census
place outlines but no coordinates, because `transforms/boundaries.py` deliberately
discards the polygon rings once it has taken the interior point and the area out of them
- keeping 32,000 vertex lists alive for the rest of the run is what got the pipeline
killed twice.

So the rings come from where they still are: the raw `cb_2023_us_place_500k.zip`, which
`load_place_boundaries` itself reads. Only the places the region already ships are taken,
which for the V1 Ohio River Valley region is 487 of the 32,037 - about 49,000 vertices,
roughly 0.7 MB of JSON. No simplification is applied and none is needed at that size, so
every vertex the Census Bureau published reaches the client.

The rings are grouped into polygons with the pipeline's own `to_multipolygon`, so
islands stay separate pieces of land and lakes stay holes, exactly as every other
consumer of this shapefile in this repository reads them.

This is the fourth wire file. `tools/deploy-wire-to-client.py` copies it into
`clients/campaign/public/world/` like the other three, and the client reads it from
`src/world/types.ts` (`BoundariesFile`).

Usage:

    python tools/build-wire-place-boundaries.py            # wire -> exports/wire
    python tools/build-wire-place-boundaries.py --check     # report drift, write nothing
    python tools/deploy-wire-to-client.py                   # then deploy
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SERVICE = REPO / "services" / "world-data"
sys.path.insert(0, str(SERVICE / "src"))

from worlddata.config import load_config  # noqa: E402
from worlddata.errors import GeoError  # noqa: E402
from worlddata.geo.polygons import interior_point, signed_area_deg2, to_multipolygon  # noqa: E402
from worlddata.transforms.geometry import iter_shapefile  # noqa: E402

WIRE = SERVICE / "exports" / "wire"
CONFIG = SERVICE / "config" / "world_data.toml"

# The Cartographic Boundary vintage the pipeline's `load_place_boundaries` reads. Kept in
# step with that function's `carto_year` default rather than discovered from the wire, so
# the archive name is one decision with one home.
CARTO_YEAR = 2023

# Vertex precision. Six decimal places is about 0.1 m, which is three orders of magnitude
# finer than the smallest feature on the map, and it is the precision the Census file
# publishes at - so rounding is not a decision, it is a smaller file.
LOD_PLACES = 6

# Ring order the client is told about, so a renderer can classify a ring without
# recomputing signed areas. Exterior rings clockwise, holes counter-clockwise - the
# shapefile specification's own convention, and the one `geo/polygons.py` reads.
#
# It is *normalised* rather than passed through, because the source file does not always
# satisfy it: `to_multipolygon` keeps a counter-clockwise ring too small to be a hole as a
# polygon of its own, and that ring then ships as a polygon's exterior while running the
# wrong way. 42 of the V1 region's 48,612 vertices are in rings like that. A client that
# classified rings by winding to build its fill would have drawn 42 slivers as holes
# punched through the settlements they belong to. Reversing a ring's vertex order moves no
# vertex and changes no area, so the fix is free and the shipped contract is then true of
# every ring in the file rather than true of most of them.
RING_ORDER = "exterior rings clockwise (negative signed area), holes counter-clockwise"

# Coordinates are [lat, lon], matching `settlements.json` and `network.json`. The client
# projects with `makeProjection`, which takes lat and lon in that order everywhere.
COORDINATE_ORDER = "[lat, lon]"


def round_ring(
    ring: list[tuple[float, float]], *, clockwise: bool
) -> tuple[list[list[float]], bool]:
    """One ring as [lat, lon] pairs at the published precision, running the right way.

    ``clockwise`` says which way the ring must run. `geo.polygons` measures signed area on
    (lon, lat), so a negative signed area is clockwise. Returns the ring and whether it
    had to be reversed; reversing changes the traversal order only, moving no vertex, so
    the area, centroid and outline are identical either way.

    See RING_ORDER for why the winding is normalised rather than documented around. A ring
    too small to enclose area cannot be classified, so it is passed through as it stands
    rather than made to raise here - `to_multipolygon` has already rejected such rings.
    """
    try:
        area = signed_area_deg2(ring)
    except GeoError:
        return [[round(lat, LOD_PLACES), round(lon, LOD_PLACES)] for lon, lat in ring], False
    flipped = (area <= 0) != clockwise
    if flipped:
        ring = list(reversed(ring))
    return [[round(lat, LOD_PLACES), round(lon, LOD_PLACES)] for lon, lat in ring], flipped


def orient_polygons(
    grouped: list[list[list[tuple[float, float]]]],
) -> tuple[list[list[list[list[float]]]], int]:
    """Every polygon oriented per RING_ORDER, plus how many rings had to be reversed.

    Only sliver rings need reversing in practice - `to_multipolygon` keeps a
    counter-clockwise ring too small to be a hole as a polygon of its own, and that ring
    then arrives as a polygon's exterior running the wrong way - which is why the count is
    reported rather than assumed to be zero.
    """
    polygons: list[list[list[list[float]]]] = []
    reversed_rings = 0
    for polygon in grouped:
        rings = []
        for index, ring in enumerate(polygon):
            oriented, flipped = round_ring(ring, clockwise=index == 0)
            rings.append(oriented)
            if flipped:
                reversed_rings += 1
        polygons.append(rings)
    return polygons, reversed_rings


def build_polygons(
    rings: list[list[tuple[float, float]]], *, minimum_hole_area_deg2: float
) -> tuple[list[list[list[list[float]]]], int, list[str]]:
    """Group one place's flat ring list into polygons and orient them.

    Returns (polygons, reversed_rings, notes). Each polygon is ``[exterior, *holes]``. A
    ring too small to be a real hole is kept as a polygon of its own and counted, which is
    what `to_multipolygon` does everywhere else in this pipeline; deleting it instead would
    make the shipped outline disagree with the `ring_count` the pipeline published for the
    same place.
    """
    grouped, sliver_count = to_multipolygon(rings, minimum_hole_area_deg2=minimum_hole_area_deg2)
    polygons, reversed_rings = orient_polygons(grouped)
    notes = (
        [
            f"{sliver_count} counter-clockwise ring(s) below the configured minimum hole area, "
            "kept as polygons of their own and reoriented clockwise"
        ]
        if sliver_count
        else []
    )
    return polygons, reversed_rings, notes


def boundary_record(
    key: str,
    rings: list[list[tuple[float, float]]],
    record: dict,
    settlement: dict,
    *,
    minimum_hole_area_deg2: float,
) -> tuple[dict, int, list[str]]:
    """One wire boundary entry for one place, plus what it took to orient."""
    polygons, reversed_rings, notes = build_polygons(
        rings, minimum_hole_area_deg2=minimum_hole_area_deg2
    )
    # The centroid comes from the grouped polygons, so it is the same number the pipeline
    # exported as this place's `latitude`/`longitude` - the client can cross-check the two
    # files and they agree rather than merely being close.
    longitude, latitude = interior_point(
        to_multipolygon(rings, minimum_hole_area_deg2=minimum_hole_area_deg2)[0]
    )
    land_m2 = record.get("ALAND")
    return (
        {
            # The wire settlement's own id (`settlement_id`, state FIPS + place code), so
            # the client joins boundaries to settlements by key rather than by name.
            "placeKey": key,
            "name": str(record.get("NAMELSAD") or record.get("NAME") or ""),
            "displayName": settlement.get("name"),
            # The classified size the wire's settlement already carries (city / town /
            # village), and the Census Bureau's own LSAD area-type code beside it. The two
            # are not the same thing: LSAD is what the Census Bureau calls the place, and
            # a "city" can be a Census-designated place. Both are carried rather than
            # reduced to one.
            "sizeClass": settlement.get("place"),
            "lsadCode": record.get("LSAD"),
            "landAreaKm2": (
                round(float(land_m2) / 1_000_000.0, 6)
                if isinstance(land_m2, (int, float))
                else None
            ),
            "centroid": {"lat": round(latitude, LOD_PLACES), "lon": round(longitude, LOD_PLACES)},
            "polygonCount": len(polygons),
            "ringCount": sum(len(polygon) for polygon in polygons),
            "vertexCount": sum(len(ring) for polygon in polygons for ring in polygon),
            "polygons": polygons,
        },
        reversed_rings,
        [f"{settlement.get('name', key)}: {note}" for note in notes],
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--wire", type=Path, default=WIRE, help="the wire build to read and write")
    parser.add_argument(
        "--config",
        type=Path,
        default=CONFIG,
        help="pipeline config, for the raw and cache directories",
    )
    parser.add_argument("--check", action="store_true", help="report what would change and write nothing")
    arguments = parser.parse_args()

    settlements_path = arguments.wire / "settlements.json"
    if not settlements_path.is_file():
        print(
            f"boundaries: {settlements_path} does not exist; build the wire files first with "
            "`python -m worlddata wire`",
            file=sys.stderr,
        )
        return 1

    config = load_config(arguments.config)
    raw_dir = config.path_for("raw_dir")
    cache_dir = config.path_for("cache_dir")
    archive = raw_dir / f"cb_{CARTO_YEAR}_us_place_500k.zip"
    if not archive.is_file():
        print(
            f"boundaries: {archive} does not exist. This tool reads the place geometry "
            "directly, which `python -m worlddata fetch` puts there.",
            file=sys.stderr,
        )
        return 1

    wire_settlements = json.loads(settlements_path.read_text(encoding="utf-8"))["settlements"]
    wanted = {str(s["osmId"]): s for s in wire_settlements}
    print(f"boundaries: {len(wanted)} wire settlements to match against {archive.name}", flush=True)

    minimum_hole = float(config.get("verification.minimum_hole_area_deg2"))
    boundaries: list[dict] = []
    notes: list[str] = []
    reversed_rings = 0
    scanned = 0
    for rings, record in iter_shapefile(archive, cache_dir):
        scanned += 1
        key = f"{record['STATEFP']}-{record['PLACEFP']}"
        settlement = wanted.get(key)
        if settlement is None:
            continue
        entry, flipped, entry_notes = boundary_record(
            key, rings, record, settlement, minimum_hole_area_deg2=minimum_hole
        )
        boundaries.append(entry)
        reversed_rings += flipped
        notes.extend(entry_notes)

    missing = sorted(set(wanted) - {entry["placeKey"] for entry in boundaries})
    print(f"boundaries: scanned {scanned} places, matched {len(boundaries)}/{len(wanted)}")
    if missing:
        # Not a warning. A settlement with no boundary is a town the client cannot draw a
        # footprint for, and shipping the file anyway would make the gap invisible in the
        # one place a reader would look for it - the client's own world directory.
        print(
            f"boundaries: {len(missing)} wire settlements have no place boundary in "
            f"{archive.name}, starting with {', '.join(missing[:5])}. Refusing to write a "
            "boundaries file that silently omits places the region ships; either the wire "
            "build kept a settlement the boundary file does not have, or the two were built "
            "from different Census vintages.",
            file=sys.stderr,
        )
        return 1
    if not boundaries:
        print("boundaries: matched nothing at all; refusing to write an empty file", file=sys.stderr)
        return 1

    vertices = sum(entry["vertexCount"] for entry in boundaries)
    payload = {
        "source": "us-census-carto-place-500k",
        "licence": (
            "U.S. Government work, public domain (Title 17 U.S.C. 105). Place boundaries: "
            f"U.S. Census Bureau, Cartographic Boundary Files, {CARTO_YEAR}, 500k, place. "
            "No attribution required."
        ),
        "retrieved": json.loads(settlements_path.read_text(encoding="utf-8"))["retrieved"],
        "coordinateOrder": COORDINATE_ORDER,
        "ringOrder": RING_ORDER,
        "cartoYear": CARTO_YEAR,
        "settlementCount": len(boundaries),
        "placeCount": len(boundaries),
        "polygonCount": sum(entry["polygonCount"] for entry in boundaries),
        "ringCount": sum(entry["ringCount"] for entry in boundaries),
        "vertexCount": vertices,
        "note": (
            "One entry per settlement in the deployed settlements.json, matched on the "
            "Census settlement id (`state_fips-place_fips`) rather than on name. Each entry's "
            "`polygons` is a list of polygons; each polygon is the exterior ring followed by "
            "its holes, each ring a closed [lat, lon] list running the way `ringOrder` says, "
            "and `sizeClass` is the wire settlement's own classification while `lsadCode` is "
            "the Census Bureau's. `centroid` is the pipeline's own interior point for the same "
            "place, so it matches that settlement's lat/lon in settlements.json. This is "
            f"generalised {CARTO_YEAR} 500k cartography, not surveyed boundaries."
        ),
        "boundaries": boundaries,
    }

    target = arguments.wire / "boundaries.json"
    if target.is_file():
        existing = json.loads(target.read_text(encoding="utf-8"))
        if existing == payload:
            print("boundaries: the wire build already has these boundaries; unchanged")
            return 0
    for note in notes[:8]:
        print(f"boundaries: NOTE: {note}", file=sys.stderr)
    if len(notes) > 8:
        print(f"boundaries: NOTE: and {len(notes) - 8} more", file=sys.stderr)

    print(
        f"boundaries: {len(boundaries)} places, "
        f"{payload['polygonCount']} polygons, {vertices:,} vertices, "
        f"{reversed_rings} ring(s) reoriented to match ringOrder"
    )
    if arguments.check:
        print(f"boundaries: --check, {target} would be rewritten")
        return 0

    # Through a .part file and a rename, like every other writer in this service, so a
    # killed run cannot leave the client reading half a file.
    part = target.with_name(target.name + ".part")
    part.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    part.replace(target)
    print(f"boundaries: wrote {target} ({target.stat().st_size / 1_000_000:.2f} MB)")
    print("boundaries: now run `python tools/deploy-wire-to-client.py` to copy it to the client")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())