"""Writing the portable export and loading Postgres.

agents/README.md Contract A requires two things from Agent 1:

  2. "Export a portable form (JSON or Parquet) alongside the database load, so
     consumers work whether or not Postgres ends up used."

Both are produced, and neither depends on the other. The hosting decision is
still open (SPEC.md section 9), so the export must stand alone.

What is written:

  dist/*.json.gz        every table as newline-delimited JSON, gzipped
  dist/*.parquet        every table as Parquet, for anything that reads columnar
  dist/schema.json      the published schema, the file Agents 2 and 3 point at
  dist/MANIFEST.json    dataset manifest with sources, dates, digests, gaps

Parquet is written through pyarrow, which is already installed. If pyarrow is
absent the JSON export still completes and the omission is reported, because a
missing optional reader must not cost the primary deliverable. Postgres is
likewise optional and its absence is never silent.
"""

from __future__ import annotations

import gzip
import json
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Iterator

from .config import Config
from .errors import WorldDataError

# How many rows the schema builder looks at per table. Types are consistent
# across a table by construction, so a sample describes it; reading every row of
# the 137,000-row route segment table to learn its column names would defeat the
# streaming the export exists for.
SCHEMA_SAMPLE_ROWS = 500

# Tables published, in the order an agent should read them.
TABLE_NAMES: tuple[str, ...] = (
    "state_profiles",
    "sections",
    "section_ratings",
    "settlements",
    "routes",
    "route_segments",
    "state_boundaries",
    "place_boundaries",
    "ports",
    "terrain_samples",
    "regions",
)


def _json_safe(value: Any) -> Any:
    """Convert a pipeline value into something json can serialise, losslessly."""
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            # NaN and infinity are not valid JSON. Null them rather than writing
            # a token no strict parser accepts.
            return None
        return value
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    raise WorldDataError(
        f"cannot serialise a value of type {type(value).__name__} into the export; "
        "a transform is returning something the schema does not describe"
    )


def materialise(item: object) -> list[dict[str, Any]]:
    """Rows as a list, from a dataclass, a dict, a sequence, or a generator.

    Some tables are produced as generators because materialising them would
    exhaust memory - the route segment table is one, since its geometry alone is
    the national road and rail network. Anything that needs to look at a table
    twice goes through here, which spends the memory once and reuses the rows.
    """
    return list(_rows_of(item))


def _rows_of(item: object) -> Iterator[dict[str, Any]]:
    """Yield plain dict rows from a dataclass, a dict, or a sequence of either."""
    if item is None:
        return
    if is_dataclass(item) and not isinstance(item, type):
        if hasattr(item, "__dataclass_fields__") and not isinstance(item, (list, tuple)):
            yield _json_safe(asdict(item))
            return
    if isinstance(item, dict):
        yield _json_safe(item)
        return
    if isinstance(item, (list, tuple, set, frozenset)) or (
        hasattr(item, "__iter__") and not isinstance(item, (str, bytes))
    ):
        for element in item:
            yield from _rows_of(element)
        return
    raise WorldDataError(
        f"cannot turn a value of type {type(item).__name__} into export rows; "
        "every published table must be a dataclass, a dict, or a sequence of them"
    )


def write_jsonl_gz(
    path: Path,
    rows: Iterable[dict[str, Any]],
    metadata: dict[str, Any],
    *,
    compresslevel: int = 6,
) -> int:
    """Write newline-delimited JSON, gzipped, with a header line.

    The header carries the row count and the generation timestamp so a consumer
    can tell a truncated file from a complete one without parsing it all.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".part")
    count = 0
    with gzip.open(partial, "wt", encoding="utf-8", compresslevel=compresslevel) as handle:
        handle.write(json.dumps({"_header": True, "rows": "following", **metadata}, sort_keys=True))
        handle.write("\n")
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True, separators=(",", ":")))
            handle.write("\n")
            count += 1
    partial.replace(path)
    return count


def rows_for(table: Any) -> Any:
    """Return an iterable of rows for a published table.

    A table may be a list, or a zero-argument factory when the rows are expensive
    to hold in memory. A factory is called once per consumer, so the schema, the
    JSON export and the Parquet export each see every row exactly once. Returning
    a list here instead would exhaust a generator on the first reader.
    """
    return table() if callable(table) and not is_dataclass(table) else table


# Ceiling on the approximate size of one Parquet batch, in bytes. A row-count
# limit is the wrong control here: 20,000 route segments is about 2.7 GB of
# geometry, while 20,000 state-profile rows is under two megabytes. Batching by
# approximate bytes keeps both inside a predictable budget.
PARQUET_BATCH_BYTES = 4 * 1024 * 1024


def write_parquet(path: Path, rows: Any, *, batch_size: int = 20_000) -> tuple[int, str | None]:
    """Write rows to Parquet in batches. Returns (row count, error if unavailable).

    Batched by approximate bytes rather than by row count, because the tables
    here differ in row width by five orders of magnitude.
    """
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as exc:
        return (0, f"pyarrow is not installed ({exc}); the Parquet export was skipped and the JSON export is complete")

    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".part")
    total = 0
    writer = None
    columns: list[str] = []
    try:
        batch: list[dict[str, Any]] = []
        batch_bytes = 0
        for row in rows:
            for key in row:
                if key not in columns:
                    columns.append(key)
            batch.append(row)
            batch_bytes += _row_size_estimate(row)
            if len(batch) >= batch_size or batch_bytes >= PARQUET_BATCH_BYTES:
                table = pa.Table.from_pylist([{column: item.get(column) for column in columns} for item in batch])
                if writer is None:
                    writer = pq.ParquetWriter(partial, table.schema, compression="zstd")
                writer.write_table(table)
                total += table.num_rows
                batch = []
                batch_bytes = 0
        if batch:
            table = pa.Table.from_pylist([{column: item.get(column) for column in columns} for item in batch])
            if writer is None:
                writer = pq.ParquetWriter(partial, table.schema, compression="zstd")
            writer.write_table(table)
            total += table.num_rows
        if writer is None:
            # An empty table still needs a schema, and Arrow cannot infer one from
            # nothing. Write a zero-row file with a single null-typed column so
            # the table exists and is readable.
            pq.write_table(pa.table({"_empty": pa.array([], type=pa.null())}), partial, compression="zstd")
    finally:
        if writer is not None:
            writer.close()
    partial.replace(path)
    return (total, None)


def write_export(
    config: Config,
    tables: dict[str, Any],
    *,
    generated_at: str,
    extra_metadata: dict[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    """Write every published table as JSON and Parquet.

    Returns a per-table summary the CLI prints and the changelog records.
    """
    export_dir = config.path_for("export_dir")
    export_dir.mkdir(parents=True, exist_ok=True)
    summary: dict[str, dict[str, Any]] = {}
    base_metadata = {
        "generated_at": generated_at,
        "pipeline_version": config.get("meta.config_version"),
        "census_year": config.census_year,
        "estimates_vintage": config.estimates_vintage,
        "config_file": str(config.path.relative_to(config.service_root)),
        **(extra_metadata or {}),
    }

    for name in TABLE_NAMES:
        if name not in tables:
            continue
        # Streamed, never materialised. The route segment table is 137,000 rows
        # carrying about 6.5 million real vertices; holding it as a list of dicts
        # of JSON strings costs gigabytes, and that is what killed several earlier
        # runs at this stage. Each consumer takes a fresh iterator instead.
        json_path = export_dir / f"{name}.jsonl.gz"
        parquet_path = export_dir / f"{name}.parquet"
        json_count = write_jsonl_gz(
            json_path,
            _rows_of(rows_for(tables[name])),
            {"table": name, **base_metadata},
            # The route segment table is a quarter of a gigabyte of geometry text;
            # level 6 spends minutes on it for a few percent of size.
            compresslevel=1 if name == "route_segments" else 6,
        )
        parquet_count, parquet_error = write_parquet(parquet_path, rows_for(tables[name]))
        columns = _columns_of(tables[name], limit=SCHEMA_SAMPLE_ROWS)
        summary[name] = {
            "rows": json_count,
            "sampled_for_schema": min(SCHEMA_SAMPLE_ROWS, json_count),
            "jsonl_gz": json_path.name,
            "jsonl_gz_bytes": json_path.stat().st_size,
            "parquet": parquet_path.name,
            "parquet_rows": parquet_count,
            "parquet_bytes": parquet_path.stat().st_size if parquet_path.is_file() else 0,
            "parquet_error": parquet_error,
            "columns": sorted(columns),
        }
    return summary


def _row_size_estimate(row: dict[str, Any]) -> int:
    """Rough in-memory size of one row, used only to size a Parquet batch."""
    total = 200  # dict and string overhead
    for value in row.values():
        if isinstance(value, str):
            total += len(value)
        elif isinstance(value, (int, float, bool)) or value is None:
            total += 32
        else:
            total += 200
    return total


def _columns_of(table: Any, *, limit: int) -> list[str]:
    """Column names found in the first ``limit`` rows, without reading the rest."""
    columns: list[str] = []
    for index, row in enumerate(_rows_of(rows_for(table))):
        for key in row:
            if key not in columns:
                columns.append(key)
        if index + 1 >= limit:
            break
    return columns
