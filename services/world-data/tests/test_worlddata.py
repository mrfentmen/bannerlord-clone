"""Tests for the world data pipeline.

Three groups, and what they check matters more than how many there are:

* **Readers against the real downloaded files.** The shapefile, DBF, XLSX and
  SRTM readers run against data/raw, so an upstream format change fails a test
  rather than quietly producing a wrong number.
* **Geometry and maths against known answers.** Great-circle distance, ring
  winding, natural breaks, the nearest-neighbour index and the spot-check
  extractor each have cases whose answer can be worked out by hand.
* **The rules that protect the premise.** No fabricated values, every state in
  exactly one section, thresholds derived from the data rather than round
  numbers, and ratings computed rather than read from the design target.
"""

from __future__ import annotations

import json
import math
import zipfile
from pathlib import Path

import pytest

from worlddata import datasets as dataset_registry
from worlddata.config import load_config
from worlddata.errors import ConfigError, GeoError, ParseError
from worlddata.geo.polygons import (
    PolygonIndex,
    area_km2,
    contains,
    interior_point,
    signed_area_deg2,
    to_multipolygon,
)
from worlddata.geo.shapefile import read_dbf, read_shapefile
from worlddata.geo.srtm import VOID_VALUE, parse_tile_name, read_hgt
from worlddata.geo.wgs84 import (
    EARTH_RADIUS_KM,
    centroid,
    haversine_km,
    point_in_bbox,
    polygon_area_km2,
    polyline_length_km,
    ring_area_km2,
)
from worlddata.geo.xlsx import as_number, read_first_sheet
from worlddata.seed import FIELD_PROVENANCE
from worlddata.sections import DIMENSIONS, SUB_SCORE_FIELDS, _percentile
from worlddata.spotcheck import _extract_census_population
from worlddata.transforms.classify import _jenks_cuts, _largest_gaps, classify, percentile
from worlddata.transforms.geometry import load_shapefile
from worlddata.transforms.roads import SettlementIndex

SERVICE_ROOT = Path(__file__).resolve().parents[1]
RAW = SERVICE_ROOT / "data" / "raw"
CACHE = SERVICE_ROOT / "data" / "cache"


# --------------------------------------------------------------------------
# Configuration. CONSTITUTION.md section 1.2: no magic numbers in logic.
# --------------------------------------------------------------------------

def test_config_loads_and_covers_the_country():
    config = load_config()
    assert config.census_year == 2020
    assert len(config.sections) == 6
    covered = [name for section in config.sections for name in section.state_names]
    assert len(covered) == 51, "PHASES.md Phase 0 requires 50 states plus D.C."
    assert len(set(covered)) == 51, "FACTIONS.md section 1: exactly one section per state"


def test_config_names_match_the_census_bureau_list():
    """Every state name in the config must be a real Census name.

    This is the test that would have caught the hand-typed FIPS bug: a name the
    Census does not publish cannot be resolved to a state at join time, so the
    pipeline fails here rather than shipping a state on the wrong side.
    """
    config = load_config()
    archive = RAW / "cb_2023_us_state_500k.zip"
    if not archive.is_file():
        pytest.skip("state boundaries not downloaded; run `python -m worlddata fetch` first")
    from worlddata.transforms.boundaries import load_state_boundaries

    boundaries, _notes = load_state_boundaries(config)
    real_names = {boundary.name for boundary in boundaries}
    for section in config.sections:
        for name in section.state_names:
            assert name in real_names, f"{name!r} is not a Census Bureau state name"


def test_config_rejects_a_duplicated_state():
    config_path = SERVICE_ROOT / "config" / "world_data.toml"
    original = config_path.read_text(encoding="utf-8")
    broken = original.replace(
        'mountain_alliance = ["Montana"', 'mountain_alliance = ["California", "Montana"'
    )
    assert broken != original
    tmp = SERVICE_ROOT / "config" / "_test_broken.toml"
    tmp.write_text(broken, encoding="utf-8")
    try:
        with pytest.raises(ConfigError, match="claimed by both"):
            load_config(tmp)
    finally:
        tmp.unlink()


def test_config_rejects_a_missing_state():
    config_path = SERVICE_ROOT / "config" / "world_data.toml"
    original = config_path.read_text(encoding="utf-8")
    broken = original.replace('"Nevada", ', "")
    assert broken != original
    tmp = SERVICE_ROOT / "config" / "_test_missing.toml"
    tmp.write_text(broken, encoding="utf-8")
    try:
        with pytest.raises(ConfigError):
            load_config(tmp)
    finally:
        tmp.unlink()


# --------------------------------------------------------------------------
# Geometry, against hand-checkable answers.
# --------------------------------------------------------------------------

def test_haversine_against_a_known_great_circle():
    """Columbus to New York is about 740 km."""
    distance = haversine_km((-82.9988, 39.9883), (-74.0060, 40.7128))
    assert 700 < distance < 780, f"got {distance} km"


def test_haversine_is_zero_for_identical_points():
    assert haversine_km((-75.0, 40.0), (-75.0, 40.0)) == 0.0


def test_haversine_rejects_impossible_coordinates():
    with pytest.raises(GeoError):
        haversine_km((-200.0, 0.0), (0.0, 0.0))
    with pytest.raises(GeoError):
        haversine_km((0.0, 91.0), (0.0, 0.0))


def test_centroid_of_a_square_is_its_centre():
    square = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0), (-1.0, -1.0)]
    longitude, latitude = centroid(square)
    assert abs(longitude) < 1e-9
    assert abs(latitude) < 1e-9


def test_centroid_of_a_dense_ring_is_not_pulled_by_a_far_island():
    """The bug that put Alabama's centre in Mobile Bay.

    A ring list holding a mainland polygon and an offshore island is a
    multipolygon. Averaging over both would land in the sea; the interior point
    must be on land.
    """
    mainland = [(-88.5, 30.0), (-85.0, 30.0), (-85.0, 35.0), (-88.5, 35.0), (-88.5, 30.0)]
    island = [(-88.0, 30.2), (-87.9, 30.2), (-87.9, 30.3), (-88.0, 30.3), (-88.0, 30.2)]
    polygons, slivers = to_multipolygon([mainland, island], minimum_hole_area_deg2=1e-6)
    assert slivers == 0
    assert len(polygons) == 2, "two disjoint pieces, not one polygon with a hole"
    longitude, latitude = interior_point(polygons)
    assert contains(polygons, (longitude, latitude)), "the interior point must be inside the geometry"


def test_ring_winding_decides_exterior_from_hole():
    clockwise_square = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0)]
    counter_clockwise_square = list(reversed(clockwise_square))
    assert signed_area_deg2(clockwise_square) < 0
    assert signed_area_deg2(clockwise_square) < 0, "clockwise is exterior per the shapefile spec"
    assert signed_area_deg2(counter_clockwise_square) > 0
    polygons, slivers = to_multipolygon(
        [clockwise_square, counter_clockwise_square], minimum_hole_area_deg2=1e-6
    )
    assert len(polygons) == 1 and len(polygons[0]) == 2, "the second ring is a hole, not an island"
    assert slivers == 0
    assert area_km2(polygons) < ring_area_km2(clockwise_square), "the hole subtracts"


def test_a_tiny_orphan_ring_is_counted_as_a_sliver_not_a_hole():
    clockwise = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0)]
    # Counter-clockwise (a hole by convention) but far outside the square, and far
    # too small to be a real hole. This is the 500k generalisation sliver case.
    sliver = list(reversed([(5.0, 5.0), (5.0, 5.0001), (5.0001, 5.0001), (5.0, 5.0)]))
    assert signed_area_deg2(sliver) > 0
    polygons, slivers = to_multipolygon([clockwise, sliver], minimum_hole_area_deg2=1e-6)
    assert slivers == 1
    assert len(polygons) == 2


def test_an_orphan_ring_above_the_threshold_is_an_error():
    clockwise = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0)]
    big_orphan = list(reversed([(5.0, 5.0), (5.0, 5.5), (5.5, 5.5), (5.5, 5.0), (5.0, 5.0)]))
    with pytest.raises(GeoError, match="not inside any clockwise ring"):
        to_multipolygon([clockwise, big_orphan], minimum_hole_area_deg2=1e-9)


def test_polygon_area_matches_the_analytic_value():
    """A 1 degree by 1 degree box at the equator, to within the flattening model."""
    box = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)]
    computed = ring_area_km2(box)
    analytic = (111.32 ** 2) * math.cos(math.radians(0.5))
    assert abs(computed - analytic) / analytic < 0.01


def test_polygon_area_subtracts_holes():
    outer = [(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0), (0.0, 0.0)]
    hole = [(0.4, 0.4), (0.4, 0.6), (0.6, 0.6), (0.6, 0.4), (0.4, 0.4)]
    assert polygon_area_km2([outer, hole]) < ring_area_km2(outer)


def test_polyline_length_sums_its_vertices():
    line = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)]
    assert abs(polyline_length_km(line) - 2 * 111.19) < 1.0


def test_polyline_length_needs_two_vertices():
    with pytest.raises(GeoError):
        polyline_length_km([(0.0, 0.0)])


def test_point_in_bbox():
    assert point_in_bbox((-83.0, 40.0), (-85.0, 37.0, -81.0, 42.0))
    assert not point_in_bbox((-90.0, 40.0), (-85.0, 37.0, -81.0, 42.0))
    assert not point_in_bbox((-83.0, 50.0), (-85.0, 37.0, -81.0, 42.0))
    with pytest.raises(GeoError):
        point_in_bbox(-83.0, (-85.0, 37.0, -81.0, 42.0))


def test_polygon_index_agrees_with_the_slow_path():
    polygons = [
        [[(-10.0, -10.0), (-10.0, 10.0), (10.0, 10.0), (10.0, -10.0), (-10.0, -10.0)]],
        [[(20.0, 20.0), (20.0, 21.0), (21.0, 21.0), (21.0, 20.0), (20.0, 20.0)]],
    ]
    index = PolygonIndex(polygons)
    for point in [(-5.0, 0.0), (5.0, 5.0), (20.5, 20.5), (15.0, 15.0), (-20.0, -20.0), (10.0, 0.0)]:
        assert index.contains(point) == contains(polygons, point), f"disagreement at {point}"


# --------------------------------------------------------------------------
# Nearest-settlement index, against brute force.
# --------------------------------------------------------------------------

def test_settlement_index_matches_brute_force():
    points = {
        "a": (-83.0, 39.9),
        "b": (-83.02, 39.91),
        "c": (-75.0, 40.0),
        "d": (-118.2, 34.05),
        "e": (-83.005, 39.9),
        "f": (-83.4, 40.3),
    }
    radius_km = 30.0
    index = SettlementIndex(points, radius_km)
    probes = [
        (-83.01, 39.905), (-118.2, 34.05), (-70.0, 42.0), (-83.0, 39.9),
        (-83.35, 40.25), (-83.001, 39.9), (-83.43, 40.31), (-118.3, 34.06),
    ]
    for probe in probes:
        found, distance = index.nearest(probe)
        brute_distance, brute_id = min(
            (haversine_km(probe, point), key) for key, point in points.items()
        )
        if brute_distance <= radius_km:
            assert found == brute_id, f"index said {found}, brute force said {brute_id} at {probe}"
            assert abs(distance - brute_distance) < 1e-6
        else:
            assert found is None, f"index found {found} at {probe} but nothing is within {radius_km} km"


# --------------------------------------------------------------------------
# Classification: the thresholds must come from the data.
# --------------------------------------------------------------------------

def test_percentile_of_a_known_list():
    assert percentile([1.0, 2.0, 3.0, 4.0], 0.0) == 1.0
    assert percentile([1.0, 2.0, 3.0, 4.0], 100.0) == 4.0
    assert abs(percentile([1.0, 2.0, 3.0, 4.0], 50.0) - 2.5) < 1e-9


def test_largest_gaps_finds_the_obvious_break():
    """Two tight clusters, so the gap between them is the widest."""
    values = sorted([math.log10(value) for value in [10, 11, 12, 10000, 11000, 12000]])
    gaps = _largest_gaps(values)
    gap, below, above = gaps[0]
    assert gap > 2.0, f"the widest gap must sit between the clusters, got {gap}"
    assert below < 2.0 < above, "one side of the cut is the small cluster, the other the large"


def test_jenks_finds_a_real_break_in_bimodal_data():
    values = sorted(
        [math.log10(value) for value in list(range(10, 20)) + list(range(1000, 1010))]
    )
    cuts = _jenks_cuts(values, 2)
    assert len(cuts) == 1
    # The cut is reported as the first value of the upper class, so it should be
    # the start of the second cluster: log10(1000) = 3.0, not a point inside it.
    assert cuts[0] == pytest.approx(3.0, abs=0.01), f"cut should start the upper cluster, got {cuts[0]}"
    assert cuts[0] > 1.279, "the cut must sit between the clusters, not inside the lower one"


def test_classification_thresholds_are_not_round_numbers():
    """The whole point of the exit criterion.

    If a derived threshold ever comes out as a tidy 10,000 or 100,000, someone
    typed it rather than measuring it.
    """
    config = load_config()
    populations = [
        int(value)
        for value in [
            *(500 + index * 7 for index in range(2000)),
            *(30000 + index * 137 for index in range(500)),
            *(200000 + index * 4211 for index in range(60)),
        ]
    ]
    result = classify(populations, config)
    for cut in result.cuts_log10:
        upper = int(round(10**cut))
        for tidy in (1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000):
            assert abs(upper - tidy) / tidy > 1e-4, f"cut {upper} is suspiciously close to round {tidy}"


def test_classification_partitions_every_settlement():
    config = load_config()
    # Shaped like the real distribution: about 90 percent small, 9 percent medium,
    # 1 percent large. The quantile fallback in the default classifier method cuts
    # at percentiles, so a set with no mass in the middle correctly produces an
    # empty band and is refused - there is a separate test for that.
    populations = [
        *(500 + index * 3 for index in range(900)),
        *(30_000 + index * 41 for index in range(90)),
        *(200_000 + index * 977 for index in range(10)),
        8_000_000,
    ]
    result = classify(populations, config)
    assigned = [result.class_for(value) for value in populations]
    assert set(assigned) == {item.name for item in result.classes}, "every class must be reachable"
    assert result.classes[-1].name == "city", "the coarsest name belongs to the largest band"
    assert result.classes[0].name == "village"
    # Every settlement falls in exactly one band, and the bands are contiguous.
    assert sum(item.count for item in result.classes) == len(populations)
    lower = config.classification.min_population
    for item in result.classes[:-1]:
        assert item.population_upper_inclusive is not None
        assert item.population_lower_inclusive == lower
        lower = item.population_upper_inclusive + 1


def test_classification_refuses_an_empty_class():
    """A cut that lands where no settlement lives is not a usable threshold."""
    config = load_config()
    with pytest.raises(ConfigError, match="contains no settlements"):
        classify([500, 999, 1000, 30_000, 30_500, 200_000, 900_000, 8_000_000], config)


def test_classification_refuses_an_empty_distribution():
    config = load_config()
    with pytest.raises(ConfigError):
        classify([1, 2, 3], config)


# --------------------------------------------------------------------------
# Spot-check extractor, against the bug it was written to prevent.
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "text,expected",
    [
        (
            "Columbus, city in Ohio. With a population of 905,748 at the 2020 census, it is the "
            "14th-most populous city in the United States.",
            905748,
        ),
        ("Louisville, with a population of 633,045 at the 2020 census.", 633045),
        ("Bowling Green. Its population was 72,294 as of the 2020 census.", 72294),
        ("Nowhere. As of the census of 2010, there were 1,200 people.", 1200),
        ("A place that covers 2,020 square miles and ranked 2,020th.", None),
        ("No figures here at all.", None),
    ],
)
def test_spot_check_extractor(text, expected):
    found = _extract_census_population(text)
    assert (found[0] if found else None) == expected


def test_spot_check_extractor_never_returns_a_year():
    """The specific failure: '2020' read as a population of 2,020."""
    found = _extract_census_population(
        "Springfield. Its population was 2020 at the 2020 census according to one account."
    )
    if found is not None:
        assert found[0] != 2020


# --------------------------------------------------------------------------
# Readers, against the real downloaded files.
# --------------------------------------------------------------------------

def _require(name: str) -> Path:
    path = RAW / name
    if not path.is_file():
        pytest.skip(f"{name} not downloaded; run `python -m worlddata fetch` first")
    return path


def test_reads_the_census_state_boundaries():
    config = load_config()
    archive = _require("cb_2023_us_state_500k.zip")
    source = load_shapefile(archive, CACHE)
    assert source.shapefile.shape_type == 5, "state boundaries are polygons"
    assert len(source.shapefile) == 56, "50 states, D.C. and the outlying areas"
    fields = set(source.shapefile.fields)
    for required in ("STATEFP", "NAME", "STUSPS", "ALAND", "AWATER"):
        assert required in fields
    assert "GCS_North_American_1983" in source.projection_wkt


def test_census_aland_matches_a_published_figure():
    """Ohio's Census ALAND, in square metres, from the boundary file itself."""
    config = load_config()
    _require("cb_2023_us_state_500k.zip")
    from worlddata.transforms.boundaries import load_state_boundaries

    boundaries, _notes = load_state_boundaries(config)
    ohio = next(item for item in boundaries if item.state_fips == "39")
    assert ohio.name == "Ohio"
    assert abs(ohio.land_area_km2 - 105_823.0) < 30.0, f"got {ohio.land_area_km2} km2"


def test_reads_the_ers_workbook_with_its_declared_unit():
    _require("ers_major_uses_of_land_by_state_2022.xlsx")
    sheet = read_first_sheet(RAW / "ers_major_uses_of_land_by_state_2022.xlsx")
    title = str(sheet.rows[0][0])
    assert "1,000 acres" in title, "the pipeline refuses to guess the unit, so it is asserted here"
    assert len(sheet.rows) > 60


def test_xlsx_number_parsing_handles_the_us_placeholders():
    assert as_number("1,234") == 1234.0
    assert as_number("45%") == 45.0
    assert as_number("(D)") is None, "suppressed values are not zero"
    assert as_number("..") is None
    assert as_number("-") is None
    assert as_number("") is None
    assert as_number(None) is None


def test_reads_the_census_roads_and_reports_its_classes():
    _require("tl_2023_us_primaryroads.zip")
    config = load_config()
    source = load_shapefile(RAW / "tl_2023_us_primaryroads.zip", CACHE)
    assert source.shapefile.shape_type == 3, "roads are polylines"
    mtfcc = {str(record["MTFCC"]) for record in source.shapefile.records}
    assert mtfcc == {"S1100"}, "the PRIMARYROADS layer holds primary roads only; this is documented"
    classes = {str(record["RTTYP"]) for record in source.shapefile.records}
    assert classes <= set(config.travel.road_class_mtfcc), "every RTTYP present must be mapped"


def test_reads_the_srtm_tiles_and_samples_real_elevation():
    _require("N39W084.hgt.gz")
    config = load_config()
    tile = read_hgt(
        RAW / "N39W084.hgt.gz",
        "N39W084",
        max_void_fraction=float(config.get("terrain.max_void_fraction")),
    )
    assert (tile.rows, tile.columns) == (3601, 3601), "SRTM 1 arc-second is 3601 by 3601"
    assert tile.pixel_degrees == pytest.approx(1.0 / 3600.0)
    import numpy as np

    assert int(np.count_nonzero(tile.elevation_m == VOID_VALUE)) == 0
    # A point inside the tile must give a finite elevation inside the global range.
    # Tile N39W084 spans 38 to 39 degrees north and 84 to 83 west.
    elevation = tile.elevation_at(-84.0, 38.5)
    near_west = tile.elevation_at(-83.999, 38.5)
    assert elevation != near_west, "adjacent samples should not be identical everywhere"
    assert -500.0 < elevation < 9000.0


def test_srtm_tile_name_parsing():
    # An SRTM tile named N37 covers 36 to 37 degrees north, so its south edge is 36.
    assert parse_tile_name("N37W085") == (36.0, -85.0)
    assert parse_tile_name("n37w085") == (36.0, -85.0)
    assert parse_tile_name("S37W085") == (-37.0, -85.0)
    with pytest.raises(ParseError):
        parse_tile_name("X37W085")


def test_reads_the_bea_industry_table():
    _require("SAGDP.zip")
    with zipfile.ZipFile(RAW / "SAGDP.zip") as bundle:
        names = bundle.namelist()
        assert "SAGDP1__ALL_AREAS_1997_2025.csv" in names
        assert "SAGDP2__ALL_AREAS_1997_2025.csv" in names


def test_reads_the_mrds_mine_features():
    _require("usgs_mrds_mine_features.zip")
    from worlddata.transforms.state_profiles import _mrds_csv_path

    config = load_config()
    path = _mrds_csv_path(config)
    with path.open(newline="", encoding="utf-8", errors="replace") as handle:
        import csv as csv_module

        reader = csv_module.DictReader(handle)
        required = {"state", "commod1", "commod2", "commod3", "dev_stat"}
        assert required <= set(reader.fieldnames or [])
        first = next(reader)
        assert first["state"]


def test_reads_the_natural_earth_ports_and_the_admin1_cross_check():
    _require("ne_10m_ports.geojson")
    _require("ne_10m_admin_1_states_provinces.geojson")
    from worlddata.geo.geojson import read_features

    ports = 0
    for _geometry, properties in read_features(RAW / "ne_10m_ports.geojson"):
        if properties.get("featurecla") == "Port":
            ports += 1
    assert ports > 500, f"expected the full world port file, found {ports}"

    usa = 0
    for _geometry, properties in read_features(RAW / "ne_10m_admin_1_states_provinces.geojson"):
        if str(properties.get("adm0_a3", "")).upper() == "USA":
            usa += 1
    assert usa == 51, f"expected 50 states plus D.C., found {usa}"


# --------------------------------------------------------------------------
# The premise: no fabricated data, no forced ratings.
# --------------------------------------------------------------------------

def test_every_rating_dimension_maps_to_a_real_field():
    config = load_config()
    for dimension in DIMENSIONS:
        assert dimension in config.ratings.weights, f"{dimension} has no weights"
        for name in config.ratings.weights[dimension]:
            assert name in SUB_SCORE_FIELDS, f"{name} does not name a state profile field"


def test_rating_percentiles_are_consistent():
    assert _percentile([1.0, 2.0, 3.0], 0.0) == 1.0
    assert _percentile([1.0, 2.0, 3.0], 100.0) == 3.0
    assert 1.0 < _percentile([1.0, 2.0, 3.0, 4.0], 50.0) < 3.0


def test_seed_fields_all_declare_their_provenance():
    """Every seeded field says whether it was measured, apportioned or a constant.

    This is the mechanism that stops an invented number being indistinguishable
    from a real one downstream.
    """
    from worlddata.seed import FIELD_PROVENANCE as provenance

    for name, description in provenance.items():
        assert description, f"{name} has no provenance statement"
        assert description.split(":")[0] in {
            "measured",
            "apportioned",
            "constant",
        }, f"{name} provenance does not start with a measurement type"


def test_declared_gaps_are_written_honestly():
    """Each declared gap must say what is missing, what was used, and what that means."""
    for gap in dataset_registry.DECLARED_GAPS:
        assert gap["gap"] and gap["wanted_for"] and gap["why_missing"] and gap["substitution"] and gap["honesty"]


def test_every_dataset_declares_its_source_and_licence():
    for dataset in dataset_registry.all_datasets(elevation_tiles=("N39W084",)):
        assert dataset.url.startswith("https://"), dataset.key
        assert dataset.source
        assert dataset.licence
        assert dataset.used_for
        assert dataset.version
