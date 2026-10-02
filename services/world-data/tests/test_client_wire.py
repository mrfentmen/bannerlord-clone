"""Tests for the campaign-client wire-format builder (worlddata.client_wire).

What these check, and why it matters:

* The tile math is verified against the client's own known tiles: its
  region.json covers 39.6-40.1 N, -105.6--104.8 W with tiles x=846..847,
  y=1549..1556 at zoom 12. If our formula disagrees, the elevation layer
  would silently misalign.
* The wire shapes are checked against the field names in
  clients/campaign/src/world/types.ts, so a rename on either side fails here
  instead of in the browser.
* The end-to-end build runs on synthetic tables, so it never depends on the
  53 MB dist files being present.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from worlddata.client_wire import (
    build_wire_files,
    display_name,
    geometry_to_latlon,
    slippy_tile,
    tiles_for_bbox,
    touches_bbox,
)


# --- display names ----------------------------------------------------------

def test_display_name_strips_census_suffixes():
    assert display_name("Abbeville city") == "Abbeville"
    assert display_name("Addison town") == "Addison"
    assert display_name("Alexander City city") == "Alexander City"
    assert display_name("Dodge City town") == "Dodge City"
    assert display_name("Queens borough") == "Queens"


def test_display_name_leaves_real_names_alone():
    # Trailing tokens that are genuinely part of names must survive.
    assert display_name("Broken Bow") == "Broken Bow"
    assert display_name("Miami") == "Miami"
    assert display_name("Bala Cynwyd") == "Bala Cynwyd"


def test_display_name_never_returns_empty():
    assert display_name("city") == "city"


# --- tile math ----------------------------------------------------------------

def test_slippy_tile_matches_the_clients_known_tiles():
    # The client's region.json (Northern Colorado Front Range, 39.6-40.1 N,
    # -105.6--104.8 W) lists tiles x=846..847, y=1549..1556 at zoom 12.
    # The north-west corner must land on the first of those tiles.
    assert slippy_tile(-105.6, 40.1, 12) == (846, 1549)


def test_tiles_for_bbox_covers_both_corners():
    tiles = tiles_for_bbox(39.6, -105.6, 40.1, -104.8, 12)
    xs = {t["x"] for t in tiles}
    ys = {t["y"] for t in tiles}
    assert 846 in xs and 1549 in ys
    assert all(t["z"] == 12 for t in tiles)
    assert all(t["path"] == f"elevation/12/{t['x']}/{t['y']}.png" for t in tiles)


# --- geometry -----------------------------------------------------------------

def test_geometry_to_latlon_reprojects_pairs():
    # Pipeline stores [[lon, lat], ...] (as JSON text in parquet); the client
    # wants [[lat, lon], ...].
    coords = geometry_to_latlon("[[-85.0, 38.0], [-84.9, 38.1]]")
    assert coords == [[38.0, -85.0], [38.1, -84.9]]


def test_geometry_to_latlon_accepts_lists_and_skips_nulls():
    coords = geometry_to_latlon([[-85.0, 38.0], [None, None], [-84.9]])
    assert coords == [[38.0, -85.0]]


def test_geometry_to_latlon_returns_none_when_empty():
    assert geometry_to_latlon(None) is None
    assert geometry_to_latlon("[]") is None


def test_touches_bbox():
    assert touches_bbox([[38.0, -85.0]], 37.0, -86.0, 39.0, -84.0)
    assert not touches_bbox([[38.0, -85.0]], 39.5, -86.0, 40.0, -84.0)


# --- end to end on synthetic tables -------------------------------------------

def _write_parquet(path: Path, rows: list[dict]) -> None:
    import pyarrow as pa
    import pyarrow.parquet as pq

    table = pa.Table.from_pylist(rows)
    pq.write_table(table, path)


@pytest.fixture()
def tiny_dist(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    dist.mkdir()
    _write_parquet(dist / "regions.parquet", [{
        "region_name": "Test Valley",
        "bbox_south": 37.0, "bbox_west": -86.0,
        "bbox_north": 38.0, "bbox_east": -85.0,
    }])
    _write_parquet(dist / "state_profiles.parquet", [
        {"state_fips": "21", "abbreviation": "KY", "name": "Kentucky"},
    ])
    _write_parquet(dist / "settlements.parquet", [
        {
            "settlement_id": "21-12345", "name": "Testville city",
            "latitude": 37.5, "longitude": -85.5,
            "population": 50000, "size_class": "city", "state_fips": "21",
        },
        {
            # Outside the bbox: must be excluded.
            "settlement_id": "21-99999", "name": "Faraway town",
            "latitude": 40.0, "longitude": -85.5,
            "population": 1000, "size_class": "town", "state_fips": "21",
        },
    ])
    _write_parquet(dist / "route_segments.parquet", [
        {
            "segment_id": "road-1", "kind": "road", "name": "Main St",
            "road_class": "primary",
            "geometry": "[[-85.6, 37.4], [-85.4, 37.6]]",
        },
        {
            "segment_id": "rail-1", "kind": "rail", "name": "Test Line",
            "road_class": "rail",
            "geometry": "[[-85.7, 37.2], [-85.3, 37.8]]",
        },
        {
            # Misses the bbox: must be excluded.
            "segment_id": "road-2", "kind": "road", "name": "Far Rd",
            "road_class": "secondary",
            "geometry": "[[-80.0, 37.5], [-79.9, 37.6]]",
        },
    ])
    return dist


def test_build_wire_files_writes_the_three_wire_shapes(tiny_dist: Path, tmp_path: Path):
    out = tmp_path / "wire"
    result = build_wire_files(tiny_dist, out, retrieved="2026-09-30")

    assert result.settlement_count == 1
    assert result.road_count == 1
    assert result.rail_count == 1
    assert result.tile_count > 0
    assert result.detail_tile_count > result.tile_count
    assert result.warnings == []

    region = json.loads((out / "region.json").read_text())
    assert region["name"] == "Test Valley"
    assert region["bbox"] == {"south": 37.0, "west": -86.0, "north": 38.0, "east": -85.0}
    # Two tiers, because the client fetches the boot list before it draws anything
    # and the zoom-12 list over a real V1 bbox is 2,236 tiles and about 250 MB.
    assert region["elevation"]["encoding"] == "terrarium"
    assert region["elevation"]["zoom"] == 10
    assert region["elevation"]["tiles"], "tile list must not be empty"
    assert region["elevationDetail"]["zoom"] == 12
    assert region["elevationDetail"]["tiles"]
    assert len(region["elevationDetail"]["tiles"]) > len(region["elevation"]["tiles"])
    assert all(
        tile["path"].startswith("elevation/12/") for tile in region["elevationDetail"]["tiles"]
    ), "the detail tier must use its own zoom directory, or it collides with the boot tier"
    assert all(
        tile["path"].startswith("elevation/10/") for tile in region["elevation"]["tiles"]
    ), "the boot tier must use its own zoom directory"
    assert region["retrieved"] == "2026-09-30"

    settlements = json.loads((out / "settlements.json").read_text())
    assert settlements["source"] == "agent-1-export"
    assert "public domain" in settlements["licence"]
    (place,) = settlements["settlements"]
    assert place["osmId"] == "21-12345"
    assert place["name"] == "Testville"
    assert place["populationCensusName"] == "Testville city"
    assert place["place"] == "city"
    assert place["lat"] == 37.5 and place["lon"] == -85.5
    assert place["population"] == 50000
    assert "Census" in place["populationSource"]
    assert place["state"] == "Kentucky" and place["stateCode"] == "KY"

    network = json.loads((out / "network.json").read_text())
    assert network["source"] == "agent-1-export"
    assert "public domain" in network["licence"]
    (road,) = network["roads"]
    assert road["osmId"] == "road-1"
    assert road["highway"] == "primary"
    assert road["name"] == "Main St"
    assert road["coords"] == [[37.4, -85.6], [37.6, -85.4]]
    (rail,) = network["rail"]
    assert rail["osmId"] == "rail-1"
    assert rail["coords"] == [[37.2, -85.7], [37.8, -85.3]]


def test_build_wire_files_requires_dist_geometry(tiny_dist: Path, tmp_path: Path):
    (tiny_dist / "route_segments.parquet").unlink()
    with pytest.raises(FileNotFoundError, match="full pipeline output"):
        build_wire_files(tiny_dist, tmp_path / "wire")


def test_unknown_road_class_warns_but_passes_through(tiny_dist: Path, tmp_path: Path):
    import pyarrow.parquet as pq

    table = pq.read_table(tiny_dist / "route_segments.parquet")
    rows = table.to_pylist()
    rows[0] = {**rows[0], "road_class": "motorwayx"}
    _write_parquet(tiny_dist / "route_segments.parquet", rows)

    result = build_wire_files(tiny_dist, tmp_path / "wire")
    assert any("motorwayx" in w for w in result.warnings)
    network = json.loads((tmp_path / "wire" / "network.json").read_text())
    assert network["roads"][0]["highway"] == "motorwayx"
