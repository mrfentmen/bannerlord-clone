"""Tests for the city/settlement data-quality audit (branch worker/oc/city-data-audit).

Each test names the defect it holds shut rather than restating the
implementation. The audit that found them is `tools/audit-city-data.py`, which
measures the state of the published bundle; the tests here cover the *code*, so
that a fix cannot be undone silently.

* **Place boundary resolution.** The eight consolidated city-county governments
  the Census Bureau publishes with ``PLACE`` 00000 were exported with null
  coordinates, null land area and null crowding, because the name fallback was
  keyed on state FIPS and looked up with the state *name*, and the two Census
  files disagree about the ``(balance)`` fragment marker.
* **Route edges.** ``travel.min_segment_gc_fraction`` was declared in config
  with a full rationale and read by nothing, so 6,154 of the 9,648 committed
  rail routes are shorter than the great-circle distance between their own two
  endpoints.
* **The dist tools.** Notable slots used ``hash()``, which is salted per
  process, so the tool could not reproduce its own output, and hardcoded its own
  population bands in place of the pipeline's ``size_class``; the garrison tool's
  faction keys matched one of the six real section keys and silently defaulted
  the other five; the metro wire tool wrote two files per metro that were always
  empty and said "TBD"; the territory tool stamped a hardcoded date and dropped
  positionless settlements without saying so.
"""

from __future__ import annotations

import gzip
import importlib.util
import inspect
import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
SERVICE = REPO / "services" / "world-data"
sys.path.insert(0, str(SERVICE / "src"))

from worlddata.transforms.boundaries import (
    PlaceBoundary,
    PlaceBoundaryIndex,
    base_place_name,
    is_place_fragment,
)
from worlddata.transforms.roads import RouteSegment, _build_route_edges, load_routes

TOOLS = SERVICE / "tools"
EXPORTS = SERVICE / "exports"
CACHE = SERVICE / "data" / "cache"


def _load_tool(name: str, filename: str):
    """Import a tool by path. Their names have hyphens, so they are not importable."""
    spec = importlib.util.spec_from_file_location(name, TOOLS / filename)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def _read_table(name: str) -> list[dict]:
    """The data rows of a committed jsonl.gz export, header record removed."""
    path = EXPORTS / f"{name}.jsonl.gz"
    if not path.is_file():
        pytest.skip(f"{path.name} is not present")
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


notable_slots = _load_tool("build_notable_slots", "build-notable-slots.py")
garrison = _load_tool("build_garrison_baselines", "build-garrison-baselines.py")
metro = _load_tool("build_metro_wire", "build-metro-wire.py")


# ---------------------------------------------------------------------------
# Defect 1: the consolidated governments resolved to no place polygon
# ---------------------------------------------------------------------------

# The eight SUMLEV 170 consolidated city-county governments, with the Census
# Bureau's own published populations. PLACE is 00000 for every one of them, so
# their settlement_id is built from their name and the place-FIPS lookup cannot
# hold them.
CONSOLIDATED = (
    ("09", "Milford city", "09-47515", 52_793),
    ("13", "Athens-Clarke County unified government", "13-03440", 129_933),
    ("13", "Augusta-Richmond County consolidated government", "13-04204", 205_414),
    ("18", "Indianapolis city", "18-36003", 888_578),
    ("20", "Greeley County unified government", "20-28412", 1_089),
    ("21", "Louisville/Jefferson County metro government", "21-48006", 772_144),
    ("30", "Butte-Silver Bow", "30-11397", 36_360),
    ("47", "Nashville-Davidson metropolitan government", "47-52006", 712_334),
)


def _boundary(state_fips: str, place_fips: str, name: str, lon: float = -86.0, lat: float = 39.9) -> PlaceBoundary:
    return PlaceBoundary(
        state_fips=state_fips,
        place_fips=place_fips,
        name=name,
        name_with_type=name,
        lsad_code="25",
        land_area_km2=1.0,
        longitude=lon,
        latitude=lat,
        vertex_count=4,
        ring_count=1,
    )


def test_the_census_fragment_marker_is_stripped_from_a_place_name():
    """The two Census files disagree, and both spellings have to resolve.

    The cartographic place file publishes "Indianapolis city (balance)"; the
    Vintage estimates file publishes the SUMLEV 170 row as "Indianapolis city".
    One rule, used by both readers.
    """
    assert is_place_fragment("Indianapolis city (balance)")
    assert is_place_fragment("West Peoria city (pt.)")
    assert is_place_fragment("Balance of Cook County")
    assert not is_place_fragment("Indianapolis city")

    assert base_place_name("Indianapolis city (balance)") == "Indianapolis city"
    assert base_place_name("West Peoria city (pt.)") == "West Peoria city"
    assert base_place_name("Indianapolis city") == "Indianapolis city"


def test_the_population_reader_uses_the_same_fragment_rule_as_the_place_reader():
    """One definition, two readers.

    `transforms.settlements` filters fragment rows and the cartographic reader
    joins on the name behind the marker; if they drifted, the join would go
    quiet rather than fail.
    """
    from worlddata.transforms import settlements as settlements_module

    assert settlements_module._is_fragment("Nashville-Davidson metropolitan government (balance)")
    assert settlements_module._base_name("Nashville-Davidson metropolitan government (balance)") == (
        "Nashville-Davidson metropolitan government"
    )


def test_a_place_fips_match_wins_and_never_consults_the_name():
    """The Census Bureau's own identifier is the strongest key and stays that way."""
    index = PlaceBoundaryIndex([_boundary("39", "18000", "Columbus")])
    found = index.resolve("39-18000", "39", "Columbus")
    assert found is not None and found.place_fips == "18000"


@pytest.mark.parametrize(("state_fips", "name", "place_fips", "population"), CONSOLIDATED)
def test_every_consolidated_government_resolves_by_state_fips_and_name(state_fips, name, place_fips, population):
    """The fallback the pipeline needs, on all eight of the rows that needed it.

    `settlement_id` for these is `{state FIPS}-nm-{name}` because the population
    file gives them PLACE 00000. What resolves them is the state FIPS together
    with the name - and the state *FIPS*, not the state name, on both sides of
    the lookup. Indianapolis, Louisville and Nashville-Davidson are the three
    largest settlements in the export that were shipping with no coordinates.
    """
    index = PlaceBoundaryIndex([_boundary(state_fips, place_fips.split("-")[1], f"{name} (balance)")])
    settlement_id = f"{state_fips}-nm-{name}"

    found = index.resolve(settlement_id, state_fips, name)
    assert found is not None, (
        f"{name} ({state_fips}, published population {population:,}) has PLACE 00000 and must "
        "still resolve to its place polygon, or it ships with null coordinates and no area"
    )
    assert found.state_fips == state_fips
    assert f"{found.state_fips}-{found.place_fips}" == place_fips

    # The cartographic file's own spelling resolves too, so the two sides of the
    # join do not have to agree on the fragment marker to find each other.
    assert index.resolve(settlement_id, state_fips, f"{name} (balance)") is found


def test_a_name_that_is_ambiguous_within_its_state_resolves_to_nothing():
    """Pennsylvania has two "Liberty borough" places.

    Picking either one would put a town at the other's coordinates, which is
    worse than shipping no outline: the first is invisible, the second is a lie.
    """
    index = PlaceBoundaryIndex(
        [
            _boundary("42", "43152", "Liberty borough", -80.0, 40.0),
            _boundary("42", "99999", "Liberty borough", -75.0, 41.0),
        ]
    )
    assert ("42", "Liberty borough") in index.ambiguous_names
    assert index.resolve("42-nm-Liberty borough", "42", "Liberty borough") is None


def test_the_same_name_in_two_states_is_not_ambiguous():
    """Tennessee and North Carolina both publish a "Nashville city".

    The fallback is keyed on (state FIPS, name) precisely so the two do not
    collide; keying on name alone would make both ambiguous and lose both
    polygons.
    """
    index = PlaceBoundaryIndex(
        [
            _boundary("37", "46000", "Nashville city", -77.0, 36.0),
            _boundary("48", "46000", "Nashville city", -98.0, 33.0),
        ]
    )
    assert index.ambiguous_names == []
    assert index.resolve("37-nm-Nashville city", "37", "Nashville city").place_fips == "46000"
    assert index.resolve("48-nm-Nashville city", "48", "Nashville city").place_fips == "46000"


def test_a_state_name_cannot_be_used_where_a_state_fips_is_required():
    """The regression, kept as a test.

    The defect was a fallback keyed on ``boundary.state_fips`` and looked up with
    ``row.state_name``, which is "Indiana" where the key holds "18". The two could
    never be equal, so the fallback was dead code and the eight settlements that
    needed it silently got nothing.
    """
    index = PlaceBoundaryIndex([_boundary("18", "36003", "Indianapolis city (balance)")])
    assert index.resolve("18-nm-Indianapolis city", "18", "Indianapolis city") is not None
    assert index.resolve("18-nm-Indianapolis city", "Indiana", "Indianapolis city") is None


def test_the_pipeline_resolves_boundaries_through_the_one_index():
    """The geometry stage and the seed stage used to build the index inline, twice.

    Both call sites are now the same object, so the two stages cannot disagree
    about which settlements have a position - which is how a settlement ended up
    with a coordinate in one table and none in the other.
    """
    from worlddata import pipeline

    source = inspect.getsource(pipeline)
    assert "PlaceBoundaryIndex(" in source, "the pipeline must build the shared index"
    assert "by_name_state" not in source, (
        "the old inline fallback keyed on state FIPS and looked up state name; it must not return"
    )
    assert source.count("place_index.resolve(") == 2, (
        "exactly the geometry stage and the seed stage resolve through the index, and nothing else does"
    )


@pytest.mark.skipif(
    not (CACHE / "cb_2023_us_place_500k").is_dir(),
    reason="the Census place shapefile is not unpacked in data/cache",
)
def test_the_eight_resolve_against_the_real_census_place_file():
    """The fix against the real data, not against synthetic boundaries.

    Reads the same attribute table the pipeline reads and asks the index the
    question the pipeline asks. If the eight ever stop resolving, the null
    coordinates come back.
    """
    from worlddata.geo.shapefile import read_dbf

    directory = CACHE / "cb_2023_us_place_500k"
    stem = next(directory.glob("*.dbf")).stem
    _fields, records = read_dbf(directory / f"{stem}.dbf")
    index = PlaceBoundaryIndex(
        [
            PlaceBoundary(
                state_fips=str(record["STATEFP"]),
                place_fips=str(record["PLACEFP"]),
                name=str(record["NAME"]),
                name_with_type=str(record["NAMELSAD"]),
                lsad_code=str(record["LSAD"]),
                land_area_km2=0.0,
                longitude=0.0,
                latitude=0.0,
                vertex_count=0,
                ring_count=0,
            )
            for record in records
        ]
    )

    for state_fips, name, place_fips, population in CONSOLIDATED:
        found = index.resolve(f"{state_fips}-nm-{name}", state_fips, name)
        assert found is not None, (
            f"{name} ({state_fips}, published population {population:,}) is in the real Census "
            "place file but does not resolve, so the pipeline would export it with null coordinates"
        )
        assert f"{found.state_fips}-{found.place_fips}" == place_fips


@pytest.mark.skipif(
    not (CACHE / "cb_2023_us_place_500k").is_dir(),
    reason="the Census place shapefile is not unpacked in data/cache",
)
def test_every_boundary_row_resolves_by_its_own_place_fips():
    """No regression: the FIPS branch is untouched by the name fallback."""
    from worlddata.geo.shapefile import read_dbf

    directory = CACHE / "cb_2023_us_place_500k"
    stem = next(directory.glob("*.dbf")).stem
    _fields, records = read_dbf(directory / f"{stem}.dbf")
    index = PlaceBoundaryIndex(
        [
            _boundary(str(record["STATEFP"]), str(record["PLACEFP"]), str(record["NAME"]))
            for record in records
        ]
    )
    for record in records:
        key = f"{record['STATEFP']}-{record['PLACEFP']}"
        assert index.resolve(key, str(record["STATEFP"]), str(record["NAME"])) is not None, key


# ---------------------------------------------------------------------------
# Defect 2: route edges shorter than the straight line between their own ends
# ---------------------------------------------------------------------------

def _segment(segment_id: str, length_km: float, left: str, right: str) -> RouteSegment:
    return RouteSegment(
        segment_id=segment_id,
        kind="rail",
        name=None,
        road_class="rail",
        length_km=length_km,
        speed_kmh=40.0,
        travel_hours=length_km / 40.0,
        road_safety=0.5,
        from_settlement_id=left,
        to_settlement_id=right,
        snap_from_km=9.0,
        snap_to_km=9.0,
        vertex_count=2,
    )


# The real pair from the published bundle: Corona city and Yorba Linda city,
# California, 19.32 km apart, joined by a committed rail "route" of 0.03 km.
CORONA_PAIR = ("06-16350", "06-86832", (-117.5649, 33.8616), (-117.7715, 33.8889))


def test_a_route_shorter_than_the_straight_line_is_not_a_route():
    """A rail fragment cannot be a town-to-town journey shorter than the crow flies.

    TIGER/Line splits rail into yard leads and sidings. A 30-metre fragment whose
    two ends each fall inside the snap radius of a different town became a "route"
    between towns 19 km apart, which no traveller can walk. The committed bundle
    has 2,263 of these, 23.5% of all rail edges, the worst a 0.01 km "route"
    between towns 3.9 km apart.
    """
    from worlddata.geo.wgs84 import haversine_km

    left_id, right_id, left, right = CORONA_PAIR
    straight_km = haversine_km(left, right)
    assert 15.0 < straight_km < 25.0

    edges = _build_route_edges(
        [_segment("rail-1", 0.03, left_id, right_id)],
        settlement_points={left_id: left, right_id: right},
        min_segment_gc_fraction=0.5,
    )
    assert edges == [], (
        f"a 0.03 km fragment between two towns {straight_km:.1f} km apart formed a route edge; "
        "the segment stays, the edge does not"
    )


def test_a_genuine_rail_line_between_two_towns_is_still_a_route():
    """The gate must not throw away real edges, or the map falls apart.

    A line comfortably longer than the straight-line distance between its snapped
    towns - a real track with a real dogleg in it - keeps its edge.
    """
    points = {"39-18000": (-82.99, 39.96), "39-20000": (-81.69, 41.10)}
    edges = _build_route_edges(
        [_segment("rail-1", 120.0, "39-18000", "39-20000")],
        settlement_points=points,
        min_segment_gc_fraction=0.5,
    )
    assert len(edges) == 1
    assert edges[0].kind == "rail"
    assert edges[0].distance_km == pytest.approx(120.0)
    assert edges[0].from_settlement_id == "39-18000"
    assert edges[0].to_settlement_id == "39-20000"


def test_parallel_fragments_of_one_journey_keep_the_route_if_any_of_them_survive():
    """The gate is per fragment, which is what the config specifies.

    "Fragments below this fraction stay as segments but form no route edge" is
    written about the fragment, so two tracks between the same pair of towns are
    judged one at a time and the route survives on the longer one. The trade is
    deliberate and is the config's: a corridor carried entirely by fragments that
    each cover under half the gap loses its edge, which costs a real connection
    rather than shipping a fabricated one.
    """
    points = {"39-18000": (-82.99, 39.96), "39-20000": (-81.69, 41.10)}
    edges = _build_route_edges(
        [
            _segment("rail-1", 0.4, "39-18000", "39-20000"),
            _segment("rail-2", 119.2, "39-18000", "39-20000"),
        ],
        settlement_points=points,
        min_segment_gc_fraction=0.5,
    )
    assert len(edges) == 1
    assert edges[0].segment_ids == ("rail-2",), edges[0].segment_ids
    assert edges[0].distance_km == pytest.approx(119.2)


def test_a_route_whose_every_fragment_is_below_the_gate_has_no_edge():
    """Three parallel stubs between two towns 150 km apart are not a route."""
    points = {"39-18000": (-82.99, 39.96), "39-20000": (-81.69, 41.10)}
    edges = _build_route_edges(
        [_segment(f"rail-{index}", 0.4, "39-18000", "39-20000") for index in range(3)],
        settlement_points=points,
        min_segment_gc_fraction=0.5,
    )
    assert edges == []


def test_a_settlement_the_gate_cannot_measure_is_not_dropped():
    """The gate removes manufactured edges, not settlements from the graph.

    A settlement absent from the point index leaves the comparison undecidable,
    and an undecidable edge is kept: losing a real town is worse than losing one
    phantom route.
    """
    edges = _build_route_edges(
        [_segment("rail-1", 0.03, *CORONA_PAIR[:2])],
        settlement_points={CORONA_PAIR[0]: CORONA_PAIR[2]},
        min_segment_gc_fraction=0.5,
    )
    assert len(edges) == 1


def test_the_config_gate_is_actually_read_by_the_route_builder():
    """The defect: a declared knob nothing read.

    `travel.min_segment_gc_fraction` carried a full rationale in config for a fix
    that was never applied, so 63.8% of the published rail edges were
    geometrically impossible. A knob nothing reads is a comment.
    """
    from worlddata.config import load_config

    config = load_config()
    assert "min_segment_gc_fraction" in inspect.getsource(load_routes), (
        "travel.min_segment_gc_fraction is declared in config but load_routes never reads it"
    )
    fraction = float(config.get("travel.min_segment_gc_fraction"))
    assert 0.0 < fraction < 1.0


def test_the_edge_builder_defaults_to_the_unfiltered_behaviour_it_used_to_have():
    """Omitting the gate reproduces the old behaviour, which is what makes this a gate.

    `tools/repair-routes-export.py` and any future caller that has no settlement
    positions still gets every snapped pair, so the signature change cannot
    quietly alter an unrelated caller.
    """
    edges = _build_route_edges([_segment("rail-1", 0.03, "18-09370", "18-61164")])
    assert len(edges) == 1
    assert edges[0].distance_km == pytest.approx(0.03)


# ---------------------------------------------------------------------------
# Defect 3: notable slots from a per-process salt, banded twice
# ---------------------------------------------------------------------------

def test_notable_slot_counts_are_a_pure_function_of_the_settlement_id():
    """`hash()` on a str is salted by PYTHONHASHSEED, so it is not reproducible.

    The count came from `hash(settlement_id) % 1000`. Two runs of the tool in two
    processes produced two different distributions and neither matched a third,
    so the tool could not regenerate or diff its own output. A fixed digest is
    the fix; this is the reason.
    """
    first = notable_slots.notable_slots(2_377, "village", "01-00124")
    second = notable_slots.notable_slots(2_377, "village", "01-00124")
    assert first == second
    assert first["slot_count"] == notable_slots.notable_slots(2_377, "village", "01-00124")["slot_count"]


def test_the_slot_count_follows_only_the_settlement_id_not_the_population():
    """Two settlements of the same class differ because their ids differ.

    If the count were a function of population the digest would not be needed,
    and two towns of identical size would be indistinguishable.
    """
    a = notable_slots.notable_slots(2_377, "village", "01-00124")
    b = notable_slots.notable_slots(2_377, "village", "01-00484")
    assert a["settlement_id"] != b["settlement_id"]
    counts = {a["slot_count"], b["slot_count"]}
    assert counts <= set(range(1, 3)), counts


def test_the_digest_is_stable_across_processes_because_it_is_not_hash():
    """A subprocess with a different PYTHONHASHSEED must produce the same number.

    This is the defect stated as a test that cannot be satisfied by `hash()`.
    """
    import os
    import subprocess

    script = (
        "import importlib.util, sys\n"
        f"spec = importlib.util.spec_from_file_location('t', {str(TOOLS / 'build-notable-slots.py')!r})\n"
        "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n"
        "print(m.stable_unit_interval('18-36003'))\n"
    )
    seen = set()
    for seed in ("0", "1", "424242"):
        environment = dict(os.environ, PYTHONHASHSEED=seed)
        result = subprocess.run(
            [sys.executable, "-c", script], capture_output=True, text=True, check=True, env=environment
        )
        seen.add(result.stdout.strip())
    assert len(seen) == 1, f"stable_unit_interval varied with PYTHONHASHSEED: {seen}"


def test_the_tool_never_calls_the_salted_builtin_hash():
    """Checked over the syntax tree, so the docstring naming the defect is not a hit."""
    import ast

    called = set()
    for node in ast.walk(ast.parse(inspect.getsource(notable_slots))):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            called.add(node.func.id)
    assert "hash" not in called, (
        "build-notable-slots.py must not call the builtin hash(); it is salted per process"
    )
    assert "blake2b" in inspect.getsource(notable_slots), "the stable digest is blake2b"


def test_notable_slot_bands_are_the_pipelines_own_size_class_not_a_second_classification():
    """The tool hardcoded 2,500 / 50,000 and disagreed with the export it read.

    The pipeline derives its size classes from the population distribution - cuts
    at 30,217 and 192,508 for the 2023 vintage - and writes the result into every
    settlement row. The tool's own bands put 5,536 villages and 669 towns in a
    different class from the pipeline, and notable-slots and poi-tags were built
    off the tool's answer.
    """
    rows = _read_table("settlements")
    assert rows, "the settlements export is the source of both classifications"
    cuts = sorted({row["population"] for row in rows if row["size_class"] == "town"})
    assert min(cuts) > 2_500, (
        "if a town can hold fewer than 2,500 people then this tool's 2,500 cut is not the "
        "pipeline's classification and the two cannot be reconciled by argument"
    )
    for row in rows:
        assert notable_slots.population_band(row["population"], row["size_class"]) == row["size_class"]


def test_an_unrecognised_size_class_is_refused():
    """A settlement from a future export must not be silently banded by guesswork."""
    with pytest.raises(ValueError):
        notable_slots.population_band(1_000, "megacity")


# ---------------------------------------------------------------------------
# Defect 4: garrison factors whose keys matched one section in six
# ---------------------------------------------------------------------------

def test_the_garrison_tool_knows_every_section_the_pipeline_assigns():
    """Five of the six declared faction keys matched no section at all.

    The table read `if prefix in key` over `northeast`, `southeast`, `midwest`,
    `southwest`, `west` and `pacific`. The pipeline's section keys are
    `great_lakes_union`, `southern_compact`, `atlantic_corridor`,
    `lone_star_frontier`, `pacific_compact` and `mountain_alliance`. Only
    `pacific_compact` contains one of those six substrings, so 12,227 of 13,189
    settlements fell through to the default without a word.
    """
    from worlddata.config import load_config

    config = load_config()
    real = {section.key for section in config.sections}
    assert real == set(garrison.KNOWN_SECTION_KEYS), (
        f"the garrison tool and config/world_data.toml [sections] disagree: "
        f"{sorted(real ^ set(garrison.KNOWN_SECTION_KEYS))}"
    )
    for key in sorted(real):
        assert garrison.faction_factor(key) == garrison.DEFAULT_GARRISON_FACTOR


def test_every_garrison_override_names_a_section_that_exists():
    """The override table is keyed the same way the old one was not.

    An override keyed on a name no settlement carries is the defect again, one
    layer down: a designer's deliberate change that silently never applies.
    """
    unknown = sorted(set(garrison.GARRISON_FACTOR_BY_SECTION) - set(garrison.KNOWN_SECTION_KEYS))
    assert not unknown, f"garrison overrides for sections that do not exist: {unknown}"


def test_an_unknown_or_missing_section_key_is_refused_rather_than_defaulted():
    """A renamed section must stop the tool, not quietly change every garrison."""
    with pytest.raises(ValueError):
        garrison.faction_factor("no_such_section")
    with pytest.raises(ValueError):
        garrison.faction_factor("")


def test_no_settlement_in_the_export_belongs_to_a_section_the_tool_rejects():
    """The end-to-end shape: every real row resolves."""
    rows = _read_table("settlements")
    sections = {row["section_key"] for row in rows}
    assert sections, "the settlements export carries a section_key per row"
    for key in sorted(sections):
        assert garrison.faction_factor(key) > 0.0


# ---------------------------------------------------------------------------
# Defect 5: the metro wire wrote two empty files per metro and called it a build
# ---------------------------------------------------------------------------

def test_the_metro_wire_writes_no_file_that_has_no_edges_in_it(tmp_path):
    """`network.json` and `travel.json` were `{"edges": [], "note": "... TBD"}`.

    A consumer could not tell an empty network from an unimplemented one, and the
    note string was the only signal. Eight such files were committed under dist/.
    The producer now refuses to write them and names them in the manifest as
    not built.
    """
    settlements = [
        {"settlement_id": "36-51000", "name": "New York city", "longitude": -74.0060,
         "latitude": 40.7128, "population": 8_804_190},
        {"settlement_id": "36-51001", "name": "Brooklyn", "longitude": -73.9442,
         "latitude": 40.6782, "population": 2_736_074},
    ]
    config = {"bbox": [-74.30, 40.40, -73.70, 40.90], "name": "New York City (5 boroughs)"}

    result = metro.build_metro_wire("nyc", config, settlements, tmp_path, version=1)

    assert result["files"] == ["region.json", "settlements.json"], (
        "the metro wire must not advertise files it cannot fill"
    )
    assert sorted(result["absent"]) == ["network.json", "travel.json"]
    for name in ("network.json", "travel.json"):
        assert not (tmp_path / "nyc" / name).exists(), (
            f"{name} was written with no edges in it and a note saying it is a placeholder"
        )


def test_a_rebuild_removes_a_placeholder_left_by_an_earlier_build(tmp_path):
    """A stale copy on disk is exactly the ambiguity this change exists to remove."""
    metro_dir = tmp_path / "nyc"
    metro_dir.mkdir(parents=True)
    (metro_dir / "network.json").write_text('{"edges": [], "note": "TBD"}', encoding="utf-8")
    (metro_dir / "travel.json").write_text('{"edges": [], "note": "TBD"}', encoding="utf-8")

    metro.build_metro_wire(
        "nyc",
        {"bbox": [-74.30, 40.40, -73.70, 40.90], "name": "New York City (5 boroughs)"},
        [{"settlement_id": "36-51000", "name": "New York city", "longitude": -74.0060,
          "latitude": 40.7128, "population": 8_804_190}],
        tmp_path,
        version=1,
    )
    for name in ("network.json", "travel.json"):
        assert not (metro_dir / name).exists()


def test_the_metro_manifest_says_what_was_not_built_rather_than_naming_nothing(tmp_path):
    """`tools/build-metro-wire.py --out` writes a manifest; it must be truthful."""
    import contextlib
    import io

    settlements = tmp_path / "settlements.jsonl.gz"
    with gzip.open(settlements, "wt", encoding="utf-8") as handle:
        handle.write(json.dumps({"_header": True, "table": "settlements"}) + "\n")
        handle.write(
            json.dumps(
                {"settlement_id": "36-51000", "name": "New York city", "longitude": -74.0060,
                 "latitude": 40.7128, "population": 8_804_190}
            )
            + "\n"
        )
    config = tmp_path / "world_data.toml"
    config.write_text(
        '[metros.nyc]\nname = "New York City (5 boroughs)"\nbbox = [-74.30, 40.40, -73.70, 40.90]\n',
        encoding="utf-8",
    )

    saved = sys.argv
    sys.argv = [
        "build-metro-wire.py",
        "--config", str(config),
        "--dist", str(tmp_path),
        "--out", str(tmp_path / "out"),
    ]
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            assert metro.main() == 0
    finally:
        sys.argv = saved

    manifest = json.loads((tmp_path / "out" / "MANIFEST.json").read_text(encoding="utf-8"))
    assert manifest["files"] == ["region.json", "settlements.json"]
    assert set(manifest["not_built"]) == {"network.json", "travel.json"}
    assert "generated" in manifest, "the manifest must record when it ran, not a typed-in date"
    written = {path.name for path in (tmp_path / "out").rglob("*.json")}
    assert written == {"MANIFEST.json", "region.json", "settlements.json"}, written


def test_a_settlement_with_no_position_is_reported_rather_than_dropped_in_silence(tmp_path, capsys):
    """The eight consolidated governments used to disappear from every metro build."""
    settlements = tmp_path / "settlements.jsonl.gz"
    with gzip.open(settlements, "wt", encoding="utf-8") as handle:
        handle.write(json.dumps({"_header": True, "table": "settlements"}) + "\n")
        handle.write(
            json.dumps(
                {"settlement_id": "18-nm-Indianapolis city", "name": "Indianapolis city",
                 "longitude": None, "latitude": None, "population": 888_578}
            )
            + "\n"
        )
    assert metro.load_settlements(tmp_path) == []
    assert "18-nm-Indianapolis city" in capsys.readouterr().err


# ---------------------------------------------------------------------------
# Defect 6: the territory tool's provenance stamp and its silent drops
# ---------------------------------------------------------------------------

territories = _load_tool("build_territories", "build-territories.py")


def test_the_territory_stamp_is_the_run_date_not_a_typed_in_string():
    """`territories.json` said `"generated": "2026-10-01"` on every run, forever.

    A provenance field that cannot change is not provenance; it is a decoration
    that looks like one, and it is the sort of field a reader trusts.
    """
    source = inspect.getsource(territories)
    assert "datetime.now(timezone.utc)" in source
    assert not any(
        line.strip().startswith('"generated": "2') for line in source.splitlines()
    ), "the generated stamp must be computed, not a literal date"


def test_the_territory_tool_names_the_settlements_it_cannot_place():
    """A settlement with no latitude was skipped with nothing said.

    The eight consolidated governments were therefore absent from every faction's
    territory and from its settlement count, with no number anywhere saying so.
    """
    source = inspect.getsource(territories)
    assert "no_position" in source
    assert "WARNING" in source, "the skip has to be reported, not just counted"


def test_a_faction_polygon_cannot_be_a_hull_of_settlement_points():
    """The shape of the convex-hull defect, stated so it cannot be reintroduced.

    A convex hull of member settlement points can only ever contain other
    settlements' hulls, so 783 settlements - 5.9% of the country - were drawn
    inside a territory that is not their faction's. Faction membership is a list
    of states, so the honest polygon is the union of those states' Census rings,
    and that needs a MultiPolygon, which is a wire-format change.
    """
    document = json.loads(
        (REPO / "clients" / "campaign" / "public" / "world" / "territories.json").read_text(encoding="utf-8")
    )
    assert all(len(item["polygon"]) > 2 for item in document["territories"])
    assert document["wire_version"] == 2, (
        "the wire still carries a single convex-hull ring per faction; the union of member "
        "state polygons is a MultiPolygon and needs a version bump plus a client change"
    )