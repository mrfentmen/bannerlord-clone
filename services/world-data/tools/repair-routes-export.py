#!/usr/bin/env python3
"""Restore the `road_class` and `travel_hours` columns on the committed routes export.

`pipeline.route_export_row` writes ten columns. The committed
`services/world-data/exports/routes.{jsonl.gz,parquet}` carry eight: `road_class` and
`travel_hours` were added to the row *after* that bundle was published, and the bundle
was never re-published. Nothing failed. Every published artifact was generated from one
stale run, so they all agreed with each other perfectly and `worlddata verify-exports`
reported a consistent bundle the whole time - the check compares the artifacts with one
another, and a bundle that is uniformly stale is consistent.

The cost was downstream and quiet. `tools/build-travel-graph.py` reads
`row.get("travel_hours", 0.0)` and `row.get("road_class", "secondary")`, so it emitted
`minutes: 0.0` on all 13,274 edges and `road_class: "secondary"` on all of them. A
travel graph whose edges are all free still pathfinds; it just reaches whichever
settlement happens to be nearest and reports the trip as taking no time at all.

Neither column is derivable from the routes table alone - both are aggregates over a
route's member segments - but the segment table carries both inputs, and the pipeline's
own rules for combining them are in `transforms/roads.py`:

    road_class    = the longest member segment's road_class
    travel_hours  = the sum of the member segments' travel hours

So the values are recoverable exactly, from data already in the repository, without
re-running the pipeline (which needs the downloaded TIGER sources that `data/raw/` no
longer holds). This tool does that, and refuses to write anything unless every
recomputed route reconciles against the committed row it is filling in.

Each row is rebuilt as a `Route` and put through `pipeline.route_export_row`, so the
repaired bundle's columns are the pipeline's columns by construction rather than by this
tool remembering them. `tests/test_export_contract.py` then holds the line.

Usage:

    python tools/repair-routes-export.py --check      # report, write nothing
    python tools/repair-routes-export.py              # rewrite routes.* and schema.json
    python -m worlddata stamp-exports                 # refresh MANIFEST.json digests
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[3]
SERVICE = REPO / "services" / "world-data"
sys.path.insert(0, str(SERVICE / "src"))

from worlddata.pipeline import route_export_row  # noqa: E402
from worlddata.transforms.roads import Route  # noqa: E402

EXPORTS = SERVICE / "exports"

# Distance tolerance when reconciling a recomputed route against the committed one. The
# committed `distance_km` sums the member `length_km` in the pipeline's member order and
# this tool sums in sorted-id order, so the two differ in the last bits.
KM_TOLERANCE = 1e-6


def read_jsonl_gz(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """The header record and the data rows of a published table."""
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        header = json.loads(next(handle))
        rows = [json.loads(line) for line in handle if line.strip()]
    return header, rows


def read_segment_table(path: Path) -> dict[str, tuple[str, float, float]]:
    """segment_id -> (road_class, length_km, travel_hours), from the segment parquet.

    `route_segments.parquet` is excluded from the committed bundle (55 MB of geometry
    text, regenerable), so this is a `dist/` artifact and its absence is a hard error.
    Without it the two missing columns cannot be derived at all, and a tool that guessed
    them would be inventing the travel times the whole game routes on.
    """
    import pyarrow.parquet as pq

    table = pq.read_table(path, columns=["segment_id", "road_class", "length_km", "travel_hours"])
    return dict(
        zip(
            table.column("segment_id").to_pylist(),
            zip(
                table.column("road_class").to_pylist(),
                table.column("length_km").to_pylist(),
                table.column("travel_hours").to_pylist(),
            ),
        )
    )


def repair_route(row: dict[str, Any], segments: dict[str, tuple[str, float, float]]) -> Route:
    """The committed row as a `Route`, with its two missing aggregates filled in.

    Raises KeyError naming the missing segment if the row references one the segment
    table does not carry. Such a route cannot be repaired honestly, and dropping it would
    silently shrink the published graph.
    """
    segment_ids = tuple(json.loads(row["segment_ids"]))
    members = [segments[segment_id] for segment_id in segment_ids]
    longest = max(members, key=lambda member: member[1])
    return Route(
        route_id=str(row["route_id"]),
        from_settlement_id=str(row["from_settlement_id"]),
        to_settlement_id=str(row["to_settlement_id"]),
        distance_km=float(row["distance_km"]),
        road_safety=float(row["road_safety"]),
        segment_ids=segment_ids,
        kind=str(row["kind"]),
        road_class=longest[0],
        travel_hours=float(sum(member[2] for member in members)),
    )


def check_reconciles(committed: dict[str, Any], route: Route, segment_table_km: float) -> str | None:
    """Why this route cannot be trusted, or None when it can.

    The recomputed `travel_hours` is a sum over the same segments the committed row
    names, so its total distance has to come back out of the segment table. When it does
    not, the segment table is not the one this export was built from, and every value
    derived from it would be wrong.
    """
    if len(route.segment_ids) != int(committed["segment_count"]):
        return f"segment_count disagrees: committed {committed['segment_count']}, row has {len(route.segment_ids)}"
    if abs(segment_table_km - route.distance_km) > KM_TOLERANCE:
        return (
            f"distance disagrees: segment table sums to {segment_table_km} km, "
            f"committed row says {route.distance_km} km"
        )
    if route.travel_hours <= 0.0:
        return f"travel hours recompute to {route.travel_hours}, so the segment table's own times are zero"
    return None


def write_jsonl_gz(path: Path, header: dict[str, Any], rows: list[dict[str, Any]]) -> None:
    """Rewrite a table through a `.part` file, the way the export writer does.

    The header record is carried through unchanged. It is the provenance of the run that
    produced the rest of the bundle, and this tool did not produce that run.
    """
    part = path.with_name(path.name + ".part")
    with gzip.open(part, "wt", encoding="utf-8", compresslevel=6) as handle:
        handle.write(json.dumps(header, separators=(",", ":"), sort_keys=True) + "\n")
        for row in rows:
            handle.write(json.dumps(row, separators=(",", ":"), sort_keys=True) + "\n")
    part.replace(path)


def write_parquet(path: Path, rows: list[dict[str, Any]]) -> None:
    """Rewrite the Parquet half so both formats stay the same table."""
    import pyarrow as pa
    import pyarrow.parquet as pq

    # Types come from the repaired rows, which is what the pipeline's writer does too -
    # it infers from the dataclasses, here from the dicts those dataclasses produced.
    table = pa.Table.from_pylist(rows)
    part = path.with_name(path.name + ".part")
    pq.write_table(table, part, compression="snappy")
    part.replace(path)


def patch_schema(path: Path, rows: list[dict[str, Any]], *, sample_rows: int) -> None:
    """Re-infer the routes entry in schema.json from the repaired rows.

    `schema_module.build_table_schema` is the pipeline's own inference, used here so the
    published types and examples describe the published rows rather than a hand-written
    second opinion. Only the routes entry is touched; the rest of the file is this run's
    provenance and must not move.
    """
    from worlddata import schema as schema_module

    document = json.loads(path.read_text(encoding="utf-8"))
    entry = next(t for t in document["tables"] if t["table"] == "routes")
    entry.update(schema_module.build_table_schema("routes", rows, row_count=len(rows)))
    part = path.with_name(path.name + ".part")
    part.write_text(json.dumps(document, indent=2) + "\n", encoding="utf-8")
    part.replace(path)
    _ = sample_rows  # the sample size is the one recorded in the entry itself


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--exports", type=Path, default=EXPORTS, help="the committed export bundle")
    parser.add_argument(
        "--segments",
        type=Path,
        default=SERVICE / "dist" / "route_segments.parquet",
        help="the segment table the two columns are derived from",
    )
    parser.add_argument("--check", action="store_true", help="report what would change and write nothing")
    arguments = parser.parse_args()

    routes_path = arguments.exports / "routes.jsonl.gz"
    schema_path = arguments.exports / "schema.json"
    for path in (routes_path, schema_path):
        if not path.is_file():
            print(f"repair: {path} does not exist", file=sys.stderr)
            return 1
    if not arguments.segments.is_file():
        print(
            f"repair: {arguments.segments} does not exist. Both missing columns are aggregates "
            "over a route's member segments, so the segment table is the only way to derive "
            "them; without it the values would have to be invented. Run the pipeline "
            "(python -m worlddata run) to regenerate it.",
            file=sys.stderr,
        )
        return 1

    header, committed_rows = read_jsonl_gz(routes_path)
    if committed_rows and "travel_hours" in committed_rows[0]:
        print("repair: the committed routes export already carries travel_hours; nothing to do")
        return 0

    segments = read_segment_table(arguments.segments)
    print(f"repair: {len(committed_rows)} routes, {len(segments)} segments", flush=True)

    repaired_rows: list[dict[str, Any]] = []
    for index, committed in enumerate(committed_rows):
        route = repair_route(committed, segments)
        segment_table_km = sum(segments[sid][1] for sid in route.segment_ids)
        problem = check_reconciles(committed, route, segment_table_km)
        if problem:
            print(
                f"repair: route {route.route_id!r}: {problem}. Stopping rather than writing "
                "values derived from inputs that do not match this export.",
                file=sys.stderr,
            )
            return 1
        repaired_rows.append(route_export_row(route))
        if index and index % 2500 == 0:
            print(f"repair: {index}/{len(committed_rows)}", flush=True)

    classes: dict[str, int] = {}
    for row in repaired_rows:
        classes[row["road_class"]] = classes.get(row["road_class"], 0) + 1
    total_hours = sum(row["travel_hours"] for row in repaired_rows)
    print(f"repair: {total_hours:,.1f} travel hours across the graph (was 0.0 on every edge)")
    print(f"repair: road classes: {dict(sorted(classes.items()))}")

    if arguments.check:
        print("repair: --check, nothing written")
        return 0

    write_jsonl_gz(routes_path, header, repaired_rows)
    write_parquet(arguments.exports / "routes.parquet", repaired_rows)
    sample_rows = 500
    for entry in json.loads(schema_path.read_text(encoding="utf-8"))["tables"]:
        if entry["table"] == "routes":
            sample_rows = int(entry.get("sampled_rows_for_types") or sample_rows)
    patch_schema(schema_path, repaired_rows, sample_rows=sample_rows)

    print(f"repair: rewrote {arguments.exports / 'routes.jsonl.gz'} ({len(repaired_rows)} rows + header)")
    print(f"repair: rewrote {arguments.exports / 'routes.parquet'}")
    print(f"repair: re-inferred the routes entry in {schema_path}")
    print("repair: now run `python -m worlddata stamp-exports` to refresh MANIFEST.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())