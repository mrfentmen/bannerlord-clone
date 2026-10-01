"""Tests for the simulation settlement feed (worlddata.sim_feed).

What these check, and why it matters:

* The feed's JSON keys must be the exact Go field names of
  ``worldgen.Settlement`` (services/simulation/internal/worldgen/worldgen.go),
  because that struct has no json tags and Go matches keys case-insensitively.
  A renamed key would silently zero the field in the sim.
* SideID must follow the sim's Sides() order (1 Pacific Compact .. 6 Atlantic
  Corridor); the sim assigns towns to sides by this id.
* The projection, port proximity, and terrain mapping are checked against
  hand-computed answers so the sim's starting geography is real, not shifted.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from worlddata.sim_feed import (
    KM_PER_LEAGUE,
    SECTION_TO_SIDE_ID,
    build_sim_feed,
    haversine_km,
    lonlat_to_leagues,
    terrain_for,
)


# --- pure helpers -------------------------------------------------------------

def test_haversine_km_known_distance():
    # One degree of latitude is ~111.2 km.
    assert haversine_km(0.0, 0.0, 0.0, 1.0) == pytest.approx(111.2, abs=0.5)
    assert haversine_km(-85.0, 38.0, -85.0, 38.0) == pytest.approx(0.0)


def test_lonlat_to_leagues_centre_is_origin():
    x, y = lonlat_to_leagues(-83.5, 38.85, -83.5, 38.85)
    assert (x, y) == pytest.approx((0.0, 0.0))


def test_lonlat_to_leagues_scale():
    # One degree of longitude at 38.85 N is 111.32 * cos(38.85°) ≈ 86.75 km;
    # in leagues that is 86.75 / 4.828032.
    x, _ = lonlat_to_leagues(-82.5, 38.85, -83.5, 38.85)
    assert x == pytest.approx(86.75 / KM_PER_LEAGUE, rel=0.01)
    # North is negative y (y grows southward on the map plane).
    _, y = lonlat_to_leagues(-83.5, 39.85, -83.5, 38.85)
    assert y == pytest.approx(-110.57 / KM_PER_LEAGUE, rel=0.01)


def test_terrain_for_mapping():
    assert terrain_for(100.0, is_port=True) == 5   # Coast wins over elevation
    assert terrain_for(800.0, is_port=False) == 3  # Mountain
    assert terrain_for(300.0, is_port=False) == 2  # Hills
    assert terrain_for(50.0, is_port=False) == 0   # Plain
    assert terrain_for(None, is_port=False) == 0   # Missing elevation -> plain


def test_section_to_side_id_matches_sim_sides_order():
    # Order in services/simulation/internal/worldgen/worldgen.go Sides().
    assert SECTION_TO_SIDE_ID == {
        "pacific_compact": 1,
        "mountain_alliance": 2,
        "great_lakes_union": 3,
        "southern_compact": 4,
        "lone_star_frontier": 5,
        "atlantic_corridor": 6,
    }


# --- end to end on synthetic tables -------------------------------------------

def _write_parquet(path: Path, rows: list[dict]) -> None:
    import pyarrow as pa
    import pyarrow.parquet as pq

    pq.write_table(pa.Table.from_pylist(rows), path)


@pytest.fixture()
def tiny_dist(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    dist.mkdir()
    _write_parquet(dist / "regions.parquet", [{
        "region_name": "Test Valley",
        "bbox_south": 37.0, "bbox_west": -86.0,
        "bbox_north": 39.0, "bbox_east": -84.0,
    }])
    _write_parquet(dist / "state_profiles.parquet", [
        {"state_fips": "21", "abbreviation": "KY", "name": "Kentucky",
         "cropland_thousand_acres": 1000.0, "total_land_thousand_acres": 10000.0},
        {"state_fips": "39", "abbreviation": "OH", "name": "Ohio",
         "cropland_thousand_acres": 3000.0, "total_land_thousand_acres": 10000.0},
    ])
    _write_parquet(dist / "settlements.parquet", [
        {
            "settlement_id": "21-1", "name": "Portville city",
            "state_fips": "21", "state_name": "Kentucky",
            "section_key": "southern_compact",
            "latitude": 38.0, "longitude": -85.0,
            "elevation_m": 150.0, "population": 100000,
        },
        {
            "settlement_id": "39-1", "name": "Hilltown town",
            "state_fips": "39", "state_name": "Ohio",
            "section_key": "great_lakes_union",
            "latitude": 38.5, "longitude": -84.5,
            "elevation_m": 350.0, "population": 20000,
        },
        {
            # Outside the bbox: must be excluded.
            "settlement_id": "39-2", "name": "Faraway village",
            "state_fips": "39", "state_name": "Ohio",
            "section_key": "great_lakes_union",
            "latitude": 45.0, "longitude": -84.5,
            "elevation_m": 100.0, "population": 500,
        },
    ])
    # One port near Portville (38.0, -85.0): ~11 km away -> IsPort.
    _write_parquet(dist / "ports.parquet", [
        {"port_id": "p1", "name": "Test Port",
         "longitude": -84.9, "latitude": 38.05},
    ])
    return dist


def test_build_sim_feed_matches_go_struct(tiny_dist: Path, tmp_path: Path):
    out = tmp_path / "sim-feed"
    result = build_sim_feed(tiny_dist, out, retrieved="2026-09-30")

    assert result.settlement_count == 2
    assert result.port_count == 1
    assert result.warnings  # the forest/swamp gap note is always logged

    payload = json.loads((out / "settlements.json").read_text())
    # Contract: the file is a bare JSON array decodable as []worldgen.Settlement.
    assert isinstance(payload, list), type(payload).__name__

    meta = json.loads((out / "settlements.meta.json").read_text())
    assert meta["source"] == "agent-1-export"
    assert "public domain" in meta["licence"]
    assert meta["region"] == "Test Valley"
    assert meta["retrieved"] == "2026-09-30"
    assert meta["settlement_count"] == 2

    # Exact Go field names of worldgen.Settlement -- no more, no less.
    expected_keys = {"Name", "State", "SideID", "Population", "X", "Y",
                     "IsPort", "Terrain", "Farmland", "IsReal"}
    for row in payload:
        assert set(row.keys()) == expected_keys, set(row.keys()) ^ expected_keys

    by_name = {r["Name"]: r for r in payload}
    port = by_name["Portville"]
    hill = by_name["Hilltown"]

    # Portville: southern_compact -> SideID 4, near the port -> Coast.
    assert port["State"] == "Kentucky"
    assert port["SideID"] == 4
    assert port["Population"] == 100000.0
    assert port["IsPort"] is True
    assert port["Terrain"] == 5
    assert port["IsReal"] is True

    # Hilltown: great_lakes_union -> SideID 3, 350 m -> Hills, not a port.
    assert hill["SideID"] == 3
    assert hill["IsPort"] is False
    assert hill["Terrain"] == 2

    # Farmland: KY share 0.1, OH share 0.3, national mean 0.2 ->
    # multipliers 0.5 and 1.5.
    assert port["Farmland"] == pytest.approx(0.5)
    assert hill["Farmland"] == pytest.approx(1.5)

    # Projection: bbox centre is (-85.0, 38.0); Portville sits on it.
    assert (port["X"], port["Y"]) == pytest.approx((0.0, 0.0))
    # Hilltown is 0.5 deg east and 0.5 deg north of centre.
    assert hill["X"] == pytest.approx(0.5 * 111.32 * math.cos(math.radians(38.0)) / KM_PER_LEAGUE, rel=1e-6)
    assert hill["Y"] == pytest.approx(-0.5 * 110.57 / KM_PER_LEAGUE, rel=1e-6)

    # Biggest first.
    assert payload[0]["Name"] == "Portville"


def test_build_sim_feed_unknown_section_warns(tiny_dist: Path, tmp_path: Path):
    import pyarrow.parquet as pq

    rows = pq.read_table(tiny_dist / "settlements.parquet").to_pylist()
    rows[0] = {**rows[0], "section_key": "mystery_pact"}
    _write_parquet(tiny_dist / "settlements.parquet", rows)

    result = build_sim_feed(tiny_dist, tmp_path / "sim-feed")
    assert any("mystery_pact" in w for w in result.warnings)
    payload = json.loads((tmp_path / "sim-feed" / "settlements.json").read_text())
    assert payload[0]["SideID"] == 0
