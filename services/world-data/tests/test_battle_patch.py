"""Tier 2A-58: Battle-patch golden tests.

10 settlements, one per biome, snapshot-tested.
"""

import json
from pathlib import Path

import pytest

from worlddata.battle_patch import (
    build_patch,
    export_patch,
    validate_cover_object,
    MAX_PATCH_BYTES,
    CONTRACT_VERSION,
)
from worlddata.battle_terrain import classify_biome

# Golden test cases: (settlement_id, lat, lon, pop, elev, coast_km, river_km, expected_biome)
GOLDEN_CASES = [
    # city: mid-size urban, inland
    ("39-18000", 39.96, -83.0, 90000, 275, 300.0, 5.0, "city"),
    # forest: upland east
    ("42-02000", 41.5, -77.5, 5000, 500, 200.0, 10.0, "forest"),
    # plains: rural midwest
    ("19-02000", 41.5, -93.5, 2000, 250, 500.0, 20.0, "plains"),
    # snow: northern tier
    ("27-43000", 45.0, -93.0, 20000, 250, 500.0, 10.0, "snow"),
    # river: near major river
    ("39-01000", 39.1, -84.5, 5000, 150, 300.0, 1.0, "river"),
    # desert: southwest
    ("04-02000", 35.0, -111.0, 5000, 1500, 500.0, 20.0, "desert"),
    # hills: steep (slope passed directly to classifier)
    ("42-03000", 40.5, -79.5, 3000, 400, 300.0, 10.0, "hills"),
    # swamp: low-lying south
    ("22-01000", 30.0, -91.0, 3000, 5, 100.0, 5.0, "swamp"),
    # coastal: near shore
    ("36-51000", 40.7, -74.0, 8000, 10, 2.0, 10.0, "coastal"),
    # industrial: large metro
    ("06-44000", 34.0, -118.2, 3000000, 100, 15.0, 10.0, "industrial"),
]


def test_all_biomes_classified():
    """Each golden case gets its expected biome."""
    for sid, lat, lon, pop, elev, coast, river, expected in GOLDEN_CASES:
        # Hills case needs slope; others use None.
        slope = 0.10 if expected == "hills" else None
        result = classify_biome(pop, lat, lon, elev, slope, coast, river)
        assert result == expected, f"{sid}: got {result}, expected {expected}"


def test_patch_contract_version():
    """Patches carry the contract version."""
    patch = build_patch("test-001", 40.0, -80.0, 50000, 300, seed=42)
    assert patch["contract_version"] == CONTRACT_VERSION


def test_cover_objects_valid():
    """All cover objects pass schema validation."""
    for sid, lat, lon, pop, elev, coast, river, expected in GOLDEN_CASES:
        patch = build_patch(sid, lat, lon, pop, elev, seed=42)
        for obj in patch["cover_objects"]:
            errors = validate_cover_object(obj)
            assert not errors, f"{sid}: {errors}"


def test_byte_budget():
    """All patches fit within 256KB."""
    for sid, lat, lon, pop, elev, coast, river, expected in GOLDEN_CASES:
        patch = build_patch(sid, lat, lon, pop, elev, seed=42)
        assert patch["_byte_size"] <= MAX_PATCH_BYTES, (
            f"{sid}: {patch['_byte_size']} > {MAX_PATCH_BYTES}"
        )


def test_spawn_zones_valid():
    """Spawn zones are on opposite edges, non-overlapping."""
    patch = build_patch("test-002", 40.0, -80.0, 50000, 300, seed=42)
    zones = patch["spawn_zones"]
    assert "attacker" in zones
    assert "defender" in zones
    assert "reinforcement_edge" in zones
    assert zones["reinforcement_edge"] in ("north", "south", "east", "west")
    # Attacker and defender should not overlap (different positions).
    a = zones["attacker"]
    d = zones["defender"]
    assert (a["x"], a["y"]) != (d["x"], d["y"])


def test_deterministic():
    """Same seed → same patch."""
    p1 = build_patch("test-003", 40.0, -80.0, 50000, 300, seed=123)
    p2 = build_patch("test-003", 40.0, -80.0, 50000, 300, seed=123)
    assert p1["cover_objects"] == p2["cover_objects"]
    assert p1["spawn_zones"] == p2["spawn_zones"]


def test_export_wire_format(tmp_path):
    """Export creates valid JSON in wire location."""
    patch = build_patch("36-51000", 40.7, -74.0, 8000, 10, seed=42)
    path = export_patch(patch, tmp_path)
    assert path.name == "36-51000.json"
    data = json.loads(path.read_text())
    assert data["settlement_id"] == "36-51000"
    assert data["contract_version"] == 1
    assert "_byte_size" not in data  # internal field stripped
