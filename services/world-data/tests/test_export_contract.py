"""The committed export bundle against the code that produces it.

`tests/test_exports_bundle.py` checks the bundle against *itself*: the JSONL, the Parquet,
`schema.json` and `MANIFEST.json` all have to agree about how many rows each table has.
That is the right check for a table that was written twice, and it is blind to the failure
this file is about.

**A bundle can be uniformly stale and perfectly self-consistent.** All four artifacts are
written by one run, so a bundle published before a column was added agrees with itself
about everything it contains and says nothing at all about the column it is missing. That
is not hypothetical: the committed `routes` table shipped eight columns for months while
`pipeline.route_export_row` wrote ten. `road_class` and `travel_hours` were simply absent,
and every reader of them used a default -

    tools/build-travel-graph.py:  row.get("travel_hours", 0.0)   -> 0.0
    tools/build-travel-graph.py:  row.get("road_class", ...)     -> "secondary"

so the published travel graph gave all 13,274 edges a travel time of zero and every road
the same class. `verify-exports` reported a consistent bundle throughout, because it was
one. A cost-free graph still pathfinds, so nothing failed loudly either: the map just
reached whichever town was nearest and called the trip free.

So these tests compare the committed bundle against `pipeline.py` and the transforms, not
against itself. `pipeline.route_export_row` is a named function precisely so that this
comparison is possible without running the pipeline, which needs the downloaded TIGER
sources that `data/raw/` no longer holds.

The place-boundary checks here are the second half of the brief for this table: the bundle
test proves the JSONL and the Parquet have the same *number* of rows, and not that they
are the same rows. Two formats of one table that disagree on content while agreeing on
count is the same quiet failure as above, in a different place.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

import pytest

from worlddata.pipeline import route_export_row
from worlddata.transforms.roads import Route

SERVICE = Path(__file__).resolve().parents[1]
BUNDLE = SERVICE / "exports"

# `settlement_key` is state FIPS + place code, e.g. "39-18000" for Columbus city.
SETTLEMENT_KEY = re.compile(r"^\d{2}-\d{4,6}$")


def read_jsonl_gz(name: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    import gzip

    with gzip.open(BUNDLE / f"{name}.jsonl.gz", "rt", encoding="utf-8") as handle:
        header = json.loads(next(handle))
        return header, [json.loads(line) for line in handle if line.strip()]


def published_schema() -> dict[str, dict[str, Any]]:
    document = json.loads((BUNDLE / "schema.json").read_text(encoding="utf-8"))
    return {entry["table"]: entry for entry in document["tables"]}


def a_route(**overrides: Any) -> Route:
    """A `Route` with every field set, so the row builder can be called for real."""
    fields: dict[str, Any] = {
        "route_id": "rail:39-00000->39-00001",
        "from_settlement_id": "39-00000",
        "to_settlement_id": "39-00001",
        "distance_km": 32.010378401572076,
        "road_safety": 0.5339948107992138,
        "segment_ids": ("rail-1",),
        "kind": "rail",
        "road_class": "rail",
        "travel_hours": 0.8002594600393019,
    }
    fields.update(overrides)
    return Route(**fields)


def parquet_rows(name: str) -> list[dict[str, Any]]:
    """Rows from the Parquet half of a published table.

    Skipped, not failed, when pyarrow is absent: the service declares Parquet an optional
    extra (`[project.optional-dependencies] parquet`), and a missing optional reader must
    not turn into a red suite on a service that ships the JSONL perfectly well.
    """
    pq = pytest.importorskip("pyarrow.parquet", reason="pyarrow is the optional Parquet extra")
    return pq.read_table(BUNDLE / f"{name}.parquet").to_pylist()


# ---------------------------------------------------------------------------
# The routes table: the columns the pipeline writes
# ---------------------------------------------------------------------------

def test_the_published_routes_schema_is_the_schema_the_pipeline_writes():
    """The staleness gate. One function, compared with the committed schema.

    Named rather than inline in `pipeline.py` so this is possible at all; if a column is
    added to the row builder, this fails until the bundle is re-published, which is the
    moment to notice.
    """
    published = {column["name"] for column in published_schema()["routes"]["columns"]}
    written = set(route_export_row(a_route()))
    assert published == written, (
        f"the committed routes export publishes {sorted(published)} but pipeline.route_export_row "
        f"writes {sorted(written)}. "
        f"missing from the bundle: {sorted(written - published)}; "
        f"only in the bundle: {sorted(published - written)}. "
        "Re-publish the bundle (`python -m worlddata run`, or "
        "`python tools/repair-routes-export.py` for these two columns), then "
        "`python -m worlddata stamp-exports`. A column that is missing is a column every "
        "reader silently defaults, which is how a travel graph ends up with zero minutes "
        "on every edge."
    )


def test_the_published_routes_schema_column_count_is_the_column_count():
    entry = published_schema()["routes"]
    assert entry["column_count"] == len(entry["columns"]), (
        "routes declares a column_count that does not match the columns listed beside it, "
        "so a consumer counting columns gets a different answer from one reading the list"
    )


def test_the_published_routes_rows_carry_real_travel_times():
    """Not a guard on one row. Every edge's travel time has to be positive.

    `travel_hours` is a sum of member segment travel hours, and every segment has a
    positive speed, so a zero here is not a slow road - it is a column that is missing or
    defaulted. This is the assertion that turns the failure this file describes into a
    red suite instead of a subtly wrong map.
    """
    _, rows = read_jsonl_gz("routes")
    zero = [row["route_id"] for row in rows if not float(row.get("travel_hours") or 0) > 0]
    assert not zero, (
        f"{len(zero)} of {len(rows)} routes have zero travel hours, starting with {zero[0]}. "
        "Every route is a sum of segment travel hours and every segment moves, so this means "
        "the column is absent rather than slow - the reader defaulted it to zero."
    )


def test_the_published_routes_rows_carry_more_than_one_road_class():
    """A single class across 13,274 routes is a default, not a measurement.

    The pipeline takes an edge's class from its longest member segment. Rail is its own
    class here, so a table where everything is `secondary` is a table where the class was
    never read.
    """
    _, rows = read_jsonl_gz("routes")
    classes = {row["road_class"] for row in rows}
    assert len(classes) > 1, (
        f"every route has road_class {classes!r}. A single class over the whole national "
        "graph is not a real measurement; it is `row.get('road_class', 'secondary')` "
        "having been called on rows with no road_class column."
    )
    assert None not in classes, "some routes have no road_class at all"


def test_the_committed_routes_export_agrees_with_the_schema_about_its_own_columns():
    """The schema describes the rows actually published, not the rows remembered."""
    _, rows = read_jsonl_gz("routes")
    published = {column["name"] for column in published_schema()["routes"]["columns"]}
    assert published == set(rows[0]), (
        f"schema.json lists {sorted(published)} but the first published row has "
        f"{sorted(rows[0])}"
    )


# ---------------------------------------------------------------------------
# place_boundaries: same rows in both formats, not just the same count
# ---------------------------------------------------------------------------

def test_place_boundaries_jsonl_and_parquet_hold_the_same_rows():
    """The count check is not enough. These are two copies of one table.

    `verify_bundle` compares row counts across the JSONL, the Parquet, the schema and the
    manifest, and this table has always passed it. That says nothing about whether the two
    formats carry the same *values* - a Parquet written from an older run, or from a
    differently ordered one, agrees on the count and disagrees on everything else. So the
    full row set is compared here, keyed by the field the table is joined on.
    """
    _, jsonl = read_jsonl_gz("place_boundaries")
    parquet = parquet_rows("place_boundaries")
    assert len(jsonl) == len(parquet), "row counts differ, which verify-exports also catches"

    by_key: dict[str, dict[str, Any]] = {}
    for row in parquet:
        key = row["settlement_key"]
        assert key not in by_key, f"the Parquet half repeats settlement_key {key!r}"
        by_key[key] = row

    mismatched: list[str] = []
    for row in jsonl:
        other = by_key.pop(row["settlement_key"], None)
        if other is None:
            mismatched.append(f"{row['settlement_key']}: in JSONL only")
            continue
        for column, value in row.items():
            theirs = other.get(column)
            if isinstance(value, float):
                same = theirs is not None and abs(float(theirs) - value) <= 1e-9
            else:
                same = theirs == value
            if not same:
                mismatched.append(f"{row['settlement_key']}.{column}: JSONL {value!r} vs Parquet {theirs!r}")
                break
    if by_key:
        mismatched.append(f"{len(by_key)} rows are in the Parquet half only, starting with {sorted(by_key)[0]}")
    assert not mismatched, (
        f"place_boundaries JSONL and Parquet disagree on {len(mismatched)} rows: "
        + "; ".join(mismatched[:5])
    )


def test_place_boundaries_keys_are_unique_well_formed_and_useful():
    """The key everything else joins on has to be a real key.

    `settlement_key` is how a settlement row finds its polygon, so a null or a duplicate
    in this table means either a settlement cannot be matched or two of them match the same
    polygon. Neither shows up as a row count.
    """
    _, rows = read_jsonl_gz("place_boundaries")
    keys = [row["settlement_key"] for row in rows]
    assert all(keys), "some rows have an empty settlement_key"
    bad = [key for key in keys if not SETTLEMENT_KEY.match(key)]
    assert not bad, f"{len(bad)} settlement keys are not state-FIPS-place, starting with {bad[0]}"
    counts = Counter(keys)
    duplicates = sorted(key for key, seen in counts.items() if seen > 1)
    assert not duplicates, (
        f"{len(duplicates)} settlement keys appear more than once, starting with "
        f"{duplicates[0]}. Two settlements matching one polygon is as broken as none matching."
    )


def test_place_boundaries_report_the_geometry_they_are_matched_on():
    """A boundary with no vertices cannot be told apart from a degenerate one.

    The table carries no coordinate geometry - that is deliberate, 32,000 polygons is not a
    portable export - so `vertex_count` and `ring_count` are the only evidence a polygon is
    real. A row with no vertices is a match that will fail silently later.
    """
    _, rows = read_jsonl_gz("place_boundaries")
    empty = [row["settlement_key"] for row in rows if not row.get("vertex_count")]
    assert not empty, (
        f"{len(empty)} place boundaries report no vertices, starting with {empty[0]}. "
        "These cannot be matched to a settlement polygon and will fail silently."
    )
    too_few = [row["settlement_key"] for row in rows if row["vertex_count"] < 4]
    assert not too_few, (
        f"{len(too_few)} place boundaries report fewer than four vertices, starting with "
        f"{too_few[0]}. A closed ring needs four."
    )
    # Most Census places are a single ring, so ring_count == 1 is the normal case and says
    # nothing on its own. What it would hide is a reader that never took the inner rings at
    # all, which would make every row exactly 1. Both directions are checked, so neither
    # "inner rings were dropped" nor "the field is meaningless" can pass.
    rings = {row["ring_count"] for row in rows}
    assert min(rings) >= 1, f"some boundaries report {min(rings)} rings"
    assert len(rings) > 1, (
        "every place boundary has exactly one ring. A Census place with no holes is common, "
        "but 32,037 of 32,037 is the signature of a reader that never took the inner rings, "
        "which would put a hole in a real place's area."
    )