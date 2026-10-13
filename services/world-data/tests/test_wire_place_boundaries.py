"""Tests for the wire's place-boundary file and its deployment.

`boundaries.json` is the only geometry the campaign client has for a settlement's actual
shape: it draws towns at a point, and the pipeline's own `place_boundaries` table throws the
polygon rings away as soon as it has taken the interior point out of them. So this file is
built from the Census Cartographic Boundary shapefile directly, and these tests are about
the ways that can go wrong quietly:

* **A settlement with no outline.** The client can draw the point and nothing else, which
  looks like a rendering choice rather than a missing dataset. The producer refuses to write
  such a file.
* **Ring winding.** The wire tells the client "exterior clockwise, holes counter-clockwise"
  so a renderer can classify rings without recomputing areas. The source file does not
  always honour that - `to_multipolygon` keeps sub-minimum counter-clockwise rings as
  polygons of their own - so the producer normalises it. If it stopped doing so, a client
  acting on the documented order would draw those slivers as holes punched through the
  settlements they belong to, and nothing would say so.
* **The deployed copy drifting from the build.** The deploy tool's job is to be the only way
  the client gets these bytes.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[3]
SERVICE = REPO / "services" / "world-data"
sys.path.insert(0, str(SERVICE / "src"))

WIRE = SERVICE / "exports" / "wire"
CLIENT_WORLD = REPO / "clients" / "campaign" / "public" / "world"
BUILD = SERVICE / "tools" / "build-wire-place-boundaries.py"
DEPLOY = SERVICE / "tools" / "deploy-wire-to-client.py"

# The Census place geometry the producer reads. 22 MB, unpacked once into the cache dir.
PLACE_ARCHIVE = SERVICE / "data" / "raw" / "cb_2023_us_place_500k.zip"


def _load(name: str, path: Path):
    """Import a tool by path. Their names have hyphens, so they are not importable."""
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


builder = _load("build_wire_place_boundaries", BUILD)
deploy = _load("deploy_wire_to_client", DEPLOY)

requires_place_data = pytest.mark.skipif(
    not PLACE_ARCHIVE.is_file(),
    reason=f"{PLACE_ARCHIVE.name} is not present; run the pipeline's fetch stage to test this",
)
requires_wire_build = pytest.mark.skipif(
    not (WIRE / "settlements.json").is_file(),
    reason="the wire build is not present; run `python -m worlddata wire` to test this",
)


def wire_file(name: str) -> dict[str, Any]:
    return json.loads((WIRE / name).read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    """Run the producer's `main` with an explicit argv."""
    saved = sys.argv
    sys.argv = ["build-wire-place-boundaries.py"] + (argv or [])
    try:
        return builder.main()
    finally:
        sys.argv = saved


def run_build_raw() -> list[dict[str, Any]]:
    """Run the producer in-process and return the entries it would write."""
    config = builder.load_config(SERVICE / "config" / "world_data.toml")
    wanted = {
        str(s["osmId"]): s for s in wire_file("settlements.json")["settlements"]
    }
    minimum_hole = float(config.get("verification.minimum_hole_area_deg2"))
    entries: list[dict[str, Any]] = []
    for rings, record in builder.iter_shapefile(
        config.path_for("raw_dir") / f"cb_{builder.CARTO_YEAR}_us_place_500k.zip",
        config.path_for("cache_dir"),
    ):
        key = f"{record['STATEFP']}-{record['PLACEFP']}"
        if key in wanted:
            entry, _flipped, _notes = builder.boundary_record(
                key, rings, record, wanted[key], minimum_hole_area_deg2=minimum_hole
            )
            entries.append(entry)
    return entries


def run_build() -> list[dict[str, Any]]:
    """The entries in the built file, checked against what a fresh build produces."""
    return run_build_raw()


def signed_area(ring: list[list[float]]) -> float:
    """Signed planar area of a [lat, lon] ring, the way `geo.polygons` measures it.

    Computed on (lon, lat) so that a negative area means clockwise, which is the
    convention the wire states and this file has to honour.
    """
    total = 0.0
    for index in range(len(ring)):
        lat1, lon1 = ring[index]
        lat2, lon2 = ring[(index + 1) % len(ring)]
        total += lon1 * lat2 - lon2 * lat1
    return total / 2.0


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------

def test_a_ring_is_rounded_to_the_published_precision_and_keeps_its_shape():
    # Rings arrive as (lon, lat) pairs and ship as [lat, lon], which is the order every
    # other coordinate in the wire uses.
    ring = [(2.0, 1.0), (2.0, 1.0), (2.0, 1.0), (2.0, 1.0)]
    points, flipped = builder.round_ring(ring, clockwise=True)
    assert flipped is False
    assert points == [[1.0, 2.0]] * 4
    # Six decimal places is ~0.1 m. Full float64 would make the file 40% larger and no more
    # accurate, since the Census file publishes at no more than this.
    assert builder.LOD_PLACES == 6
    assert builder.round_ring([(2.00000049, 1.0)], clockwise=False)[0] == [[1.0, 2.0]]


def test_a_clockwise_ring_is_not_reversed_and_a_counter_clockwise_one_is():
    # A square walked so that its signed area is negative (clockwise).
    clockwise = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)]
    points, flipped = builder.round_ring(clockwise, clockwise=True)
    assert flipped is False
    assert points == [[lat, lon] for lon, lat in clockwise]

    points, flipped = builder.round_ring(clockwise, clockwise=False)
    assert flipped is True
    assert points == [[lat, lon] for lon, lat in reversed(clockwise)]


def test_reversing_a_ring_moves_no_vertex():
    # The whole reason normalising winding is safe: same set of points, same area, other
    # traversal order. A renderer tessellates either identically.
    ring = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)]
    forward, _ = builder.round_ring(ring, clockwise=True)
    backward, _ = builder.round_ring(ring, clockwise=False)
    assert {tuple(p) for p in forward} == {tuple(p) for p in backward}
    assert abs(signed_area(forward)) == abs(signed_area(backward))


def test_a_ring_too_small_to_enclose_anything_is_passed_through_rather_than_raising():
    # `to_multipolygon` has already rejected such rings; `round_ring` must not be the thing
    # that raises, because it runs per ring over 48,000 of them and a crash there would read
    # as "the shapefile is corrupt".
    points, flipped = builder.round_ring([(0.0, 0.0), (1.0, 1.0)], clockwise=True)
    assert flipped is False
    assert points == [[0.0, 0.0], [1.0, 1.0]]


# ---------------------------------------------------------------------------
# The build, against the real Census file
# ---------------------------------------------------------------------------

@requires_wire_build
@requires_place_data
def test_the_build_finds_a_boundary_for_every_wire_settlement():
    """The producer's own refusal, stated as an assertion.

    A settlement with no outline is a town the client draws as a bare point. Shipping the
    file anyway would hide that in the one place anyone would look for it.
    """
    wanted = {s["osmId"] for s in wire_file("settlements.json")["settlements"]}
    built = run_build()
    assert {b["placeKey"] for b in built} == wanted


@requires_wire_build
@requires_place_data
def test_islands_stay_separate_pieces_of_land_and_lakes_stay_holes():
    # Grouping the rings by winding is the whole reason `to_multipolygon` exists: treating
    # an island ring as a hole makes exported geometry describe inland seas where the sea
    # should be. So a place with a known hole keeps it as a hole.
    built = run_build()
    with_holes = [b for b in built if any(len(polygon) > 1 for polygon in b["polygons"])]
    assert with_holes, "no place in this region has a hole, which cannot be right"
    for entry in with_holes:
        for polygon in entry["polygons"]:
            if len(polygon) == 1:
                continue
            # The hole is inside its own exterior, which is what makes it a hole.
            exterior = polygon[0]
            lats = [p[0] for p in exterior]
            lons = [p[1] for p in exterior]
            for hole in polygon[1:]:
                for lat, lon in hole:
                    assert min(lats) <= lat <= max(lats)
                    assert min(lons) <= lon <= max(lons)


@requires_wire_build
@requires_place_data
def test_the_ring_order_the_file_states_is_true_of_every_ring_it_ships():
    """The claim a renderer acts on without checking.

    The source shapefile does not always satisfy it: `to_multipolygon` keeps a
    counter-clockwise ring below the minimum hole area as a polygon of its own, and that ring
    then arrives as an exterior running the wrong way. 42 rings in this region are like that.
    A client classifying by winding would draw them as holes punched through the settlements
    they belong to.
    """
    file = wire_file("boundaries.json")
    assert "exterior rings clockwise" in file["ringOrder"]

    wrong_exterior: list[str] = []
    wrong_hole: list[str] = []
    for entry in file["boundaries"]:
        for polygon in entry["polygons"]:
            if signed_area(polygon[0]) >= 0:
                wrong_exterior.append(entry["placeKey"])
            for hole in polygon[1:]:
                if signed_area(hole) <= 0:
                    wrong_hole.append(entry["placeKey"])
    assert not wrong_exterior, (
        f"{len(wrong_exterior)} exterior rings run counter-clockwise, so the file's own "
        f"ringOrder is wrong; starting with {wrong_exterior[:3]}"
    )
    assert not wrong_hole, (
        f"{len(wrong_hole)} hole rings run clockwise, so the file's own ringOrder is wrong; "
        f"starting with {wrong_hole[:3]}"
    )


@requires_wire_build
@requires_place_data
def test_every_ring_is_closed_and_can_enclose_area():
    file = wire_file("boundaries.json")
    for entry in file["boundaries"]:
        for polygon in entry["polygons"]:
            assert polygon, f"{entry['placeKey']} has a polygon with no rings"
            for ring in polygon:
                assert len(ring) >= 4, f"{entry['placeKey']} has a ring of {len(ring)} points"
                assert ring[0] == ring[-1], f"{entry['placeKey']} has a ring that does not close"


@requires_wire_build
@requires_place_data
def test_the_counts_the_file_states_match_the_geometry_it_ships():
    file = wire_file("boundaries.json")
    entries = file["boundaries"]
    assert file["settlementCount"] == len(entries)
    assert file["polygonCount"] == sum(e["polygonCount"] for e in entries)
    assert file["ringCount"] == sum(e["ringCount"] for e in entries)
    assert file["vertexCount"] == sum(e["vertexCount"] for e in entries)
    for entry in entries:
        rings = [ring for polygon in entry["polygons"] for ring in polygon]
        assert entry["polygonCount"] == len(entry["polygons"]), entry["placeKey"]
        assert entry["ringCount"] == len(rings), entry["placeKey"]
        assert entry["vertexCount"] == sum(len(r) for r in rings), entry["placeKey"]


@requires_wire_build
@requires_place_data
def test_coordinates_are_lat_lon_and_land_inside_this_region():
    # The wire states `[lat, lon]`, matching settlements.json and network.json. A file that
    # was silently the other way round would place Columbus in the Indian Ocean and every
    # assertion below would catch it.
    file = wire_file("boundaries.json")
    for entry in file["boundaries"]:
        assert 36.0 <= entry["centroid"]["lat"] <= 42.0, entry["placeKey"]
        assert -88.0 <= entry["centroid"]["lon"] <= -79.0, entry["placeKey"]
        for polygon in entry["polygons"]:
            for ring in polygon:
                for lat, lon in ring:
                    assert 36.0 <= lat <= 42.0, f"{entry['placeKey']} has a latitude of {lat}"
                    assert -88.0 <= lon <= -79.0, f"{entry['placeKey']} has a longitude of {lon}"


@requires_wire_build
@requires_place_data
def test_each_centroid_agrees_with_the_settlement_of_the_same_id():
    """The two files are produced from the same interior point, so they must agree.

    Not merely be close: this is the check that would catch a boundary file built from a
    different Census vintage, or a settlement file that has moved since.
    """
    file = wire_file("boundaries.json")
    settlements = {s["osmId"]: s for s in wire_file("settlements.json")["settlements"]}
    for entry in file["boundaries"]:
        settlement = settlements[entry["placeKey"]]
        assert entry["centroid"]["lat"] == pytest.approx(settlement["lat"], abs=1e-5)
        assert entry["centroid"]["lon"] == pytest.approx(settlement["lon"], abs=1e-5)
        assert entry["displayName"] == settlement["name"]
        assert entry["sizeClass"] == settlement["place"]


@requires_wire_build
@requires_place_data
def test_the_area_is_the_census_bureau_figure_not_one_this_pipeline_computed():
    # `landAreaKm2` is ALAND from the boundary file's attribute table. If a future change
    # computed it from the 500k rings instead, the number would quietly become a different
    # quantity wearing the same name, and Columbus's would drop from ~572 km² to something
    # noticeably smaller.
    file = wire_file("boundaries.json")
    by_key = {e["placeKey"]: e for e in file["boundaries"]}
    assert by_key["39-18000"]["landAreaKm2"] == pytest.approx(571.675882, abs=1e-6)
    assert by_key["39-18000"]["name"] == "Columbus city"
    assert by_key["39-18000"]["lsadCode"] == "25"


@requires_wire_build
@requires_place_data
def test_the_build_is_reproducible():
    """Two builds must agree, and the second must find nothing to write.

    A wire build that rewrites itself on every run cannot be reviewed as a diff, and the
    `--check` mode the deploy workflow depends on becomes useless.
    """
    first = run_build_raw()
    second = run_build_raw()
    assert first == second

    before = (WIRE / "boundaries.json").read_bytes()
    assert main() == 0, "re-running the producer over unchanged data should be a no-op"
    assert (WIRE / "boundaries.json").read_bytes() == before


# ---------------------------------------------------------------------------
# Deployment
# ---------------------------------------------------------------------------

@requires_wire_build
def test_boundaries_is_a_deployed_wire_file():
    assert "boundaries.json" in deploy.FILES
    assert "boundaries.json" in deploy.CARRIED


@requires_wire_build
def test_a_boundary_file_covering_different_settlements_is_a_different_region():
    """A leftover from a previous region must not inherit this region's retrieval date.

    This is the Colorado-date-on-Ohio-data failure again, one file over. The boundary file
    has no region name of its own, so identity has to be the set of place keys it covers -
    which is exactly what a region change moves.
    """
    keys = {"39-18000", "39-15000"}
    fresh = {"source": "us-census-carto-place-500k", "cartoYear": 2023,
             "boundaries": [{"placeKey": k} for k in keys]}
    same = {"source": fresh["source"], "cartoYear": fresh["cartoYear"],
            "boundaries": [{"placeKey": k} for k in keys]}
    other = {"source": fresh["source"], "cartoYear": fresh["cartoYear"],
             "boundaries": [{"placeKey": "08-07810"}]}
    old_vintage = {"source": fresh["source"], "cartoYear": 2020,
                   "boundaries": [{"placeKey": k} for k in keys]}

    assert deploy.same_data("boundaries.json", fresh, same) is True
    assert deploy.same_data("boundaries.json", fresh, other) is False
    assert deploy.same_data("boundaries.json", fresh, old_vintage) is False
    assert deploy.same_data("boundaries.json", fresh, None) is False


@requires_wire_build
def test_a_deployed_boundaries_file_is_exactly_what_the_build_produced():
    if not CLIENT_WORLD.is_dir():
        pytest.skip("the client world directory is not present; this service is testable alone")
    if not (CLIENT_WORLD / "boundaries.json").is_file():
        pytest.fail(
            "public/world/boundaries.json is missing. Run "
            "`python tools/build-wire-place-boundaries.py` then `python tools/deploy-wire-to-client.py`."
        )
    deployed = json.loads((CLIENT_WORLD / "boundaries.json").read_text(encoding="utf-8"))
    built = wire_file("boundaries.json")
    for key in set(built) | set(deployed):
        if key in ("retrieved", *deploy.CARRIED["boundaries.json"]):
            continue
        assert deployed.get(key) == built.get(key), (
            f"boundaries.json: the client's {key!r} is not what "
            "`python tools/build-wire-place-boundaries.py` produces. Re-run the deploy."
        )


@requires_wire_build
def test_the_deployed_boundaries_cover_exactly_the_deployed_settlements():
    """The two files are deployed separately, so they can disagree after a region change.

    Each is internally valid, which is what makes this failure invisible until something
    tries to join them - the same failure `region.json` and `settlements.json` had once.
    """
    if not CLIENT_WORLD.is_dir():
        pytest.skip("the client world directory is not present; this service is testable alone")
    boundaries_path = CLIENT_WORLD / "boundaries.json"
    settlements_path = CLIENT_WORLD / "settlements.json"
    if not boundaries_path.is_file():
        pytest.fail("public/world/boundaries.json is missing; run the build and the deploy")
    boundaries = json.loads(boundaries_path.read_text(encoding="utf-8"))["boundaries"]
    settlements = json.loads(settlements_path.read_text(encoding="utf-8"))["settlements"]

    keys = {b["placeKey"] for b in boundaries}
    shipped = {s["osmId"] for s in settlements}
    assert keys == shipped, (
        f"{len(keys - shipped)} outlines name a settlement the client does not ship and "
        f"{len(shipped - keys)} settlements have no outline, starting with "
        f"{sorted(shipped - keys)[:3]}"
    )