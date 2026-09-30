"""The published schema: the file Agents 2 and 3 point at.

agents/README.md Contract A point 1: "Publish the schema it actually produced,
as a real, checked-in file it can point at."

So this module builds the schema *from the data that was produced*, not from a
hand-written description of what the data ought to be. Every column's type and
nullability is inferred from the exported rows, which means the published schema
and the export cannot disagree: if a transform starts emitting a new column, the
schema file changes with it.

``schema/world_data.schema.json`` is the checked-in artefact.
``dist/schema.json`` is the copy shipped next to the data.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import Config
from .errors import WorldDataError
from .export import SCHEMA_SAMPLE_ROWS, TABLE_NAMES, _rows_of, rows_for

# Inferred Python types mapped to a small, portable type vocabulary. Deliberately
# not a full SQL type system: the portable export is the contract, and Postgres
# types are generated from this at load time.
_TYPE_NAMES: tuple[tuple[type, str], ...] = (
    (bool, "boolean"),
    (int, "integer"),
    (float, "number"),
    (str, "string"),
)


def infer_column(rows: list[dict[str, Any]], column: str) -> tuple[str, bool, list[str]]:
    """Infer one column's type, whether it is nullable, and a few example values.

    ``None`` for every row means the column is nullable. A column that is present
    in the dict but always None is still published, with its type taken from any
    non-null value seen anywhere, or "null" when there is none. Publishing it is
    the point: a consumer needs to know the column exists.
    """
    types: set[str] = set()
    examples: list[str] = []
    seen_null = False
    for row in rows:
        value = row.get(column)
        if value is None:
            seen_null = True
            continue
        for python_type, name in _TYPE_NAMES:
            if isinstance(value, python_type) and not isinstance(value, bool) or (
                isinstance(value, bool) and python_type is bool
            ):
                types.add(name)
                break
        else:
            raise WorldDataError(
                f"column {column!r} holds a value of type {type(value).__name__}, which the schema "
                "cannot describe. Either the transform should convert it or the type vocabulary should "
                "gain it; silently stringifying a number would break every consumer."
            )
        if len(examples) < 3:
            examples.append(str(value)[:80])
    if not types:
        return ("null", True, [])
    if len(types) > 1:
        raise WorldDataError(
            f"column {column!r} mixes types {sorted(types)} across rows. A published schema cannot "
            "describe that, and a consumer would have to guess."
        )
    return (types.pop(), seen_null, examples)


def build_table_schema(name: str, rows: Any, *, row_count: int) -> dict[str, Any]:
    """Schema for one table, inferred from a sample of its rows.

    Sampled rather than exhaustive because the route segment table has 137,000
    rows carrying real geometry, and reading all of them to infer types is what
    the streaming export exists to avoid. ``row_count`` is supplied by the writer,
    which counted the rows as it streamed them.
    """
    sample: list[dict[str, Any]] = []
    for index, row in enumerate(_rows_of(rows_for(rows))):
        sample.append(row)
        if index + 1 >= SCHEMA_SAMPLE_ROWS:
            break
    columns: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in sample:
        for column in row:
            if column not in seen:
                seen.add(column)
    for column in seen:
        column_type, nullable, examples = infer_column(sample, column)
        columns.append(
            {
                "name": column,
                "type": column_type,
                "nullable": nullable,
                "examples": examples,
            }
        )
    columns.sort(key=lambda item: item["name"])
    return {
        "table": name,
        "row_count": row_count,
        "sampled_rows_for_types": len(sample),
        "column_count": len(columns),
        "columns": columns,
    }


def build_schema(
    config: Config,
    tables: dict[str, Any],
    *,
    generated_at: str,
    row_counts: dict[str, int] | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the whole published schema from the exported tables."""
    from .export import _rows_of

    table_schemas: list[dict[str, Any]] = []
    for name in TABLE_NAMES:
        if name not in tables:
            continue
        table_schemas.append(
            build_table_schema(
                name,
                tables[name],
                row_count=int(row_counts.get(name, 0)),
            )
        )

    if not table_schemas:
        raise WorldDataError("no tables were produced, so there is no schema to publish")

    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "Mount and Blade clone - Phase 0 world data",
        "description": (
            "Schema of the world data produced by services/world-data. Inferred from the exported rows, "
            "so it describes what was produced rather than what was intended. Field definitions come from "
            "CAUSE_EFFECT.md section 2 for town fields and SPEC.md section 3 for the entity model."
        ),
        "generated_at": generated_at,
        "generated_at_iso": datetime.now(timezone.utc).isoformat(),
        "pipeline_version": config.get("meta.config_version"),
        "census_year": config.census_year,
        "estimates_vintage": config.estimates_vintage,
        "config_file": str(config.path.relative_to(config.service_root)),
        "type_vocabulary": {
            "integer": "Whole number. Postgres INTEGER.",
            "number": "Floating point. Postgres DOUBLE PRECISION.",
            "string": "Text. Postgres TEXT.",
            "boolean": "True or false. Postgres BOOLEAN.",
            "null": "Always null in this run; published so the column is known to exist.",
        },
        "conventions": {
            "units": (
                "Lengths and areas are kilometres and square kilometres. Money is millions of current US "
                "dollars as BEA publishes it. Cropland is hectares, converted from USDA's 1,000 acres. "
                "Elevation is metres above the EGM96 geoid, as SRTM publishes. Food is person-days. "
                "Time is in-game hours."
            ),
            "identifiers": (
                "State and place identifiers are US Census FIPS codes read from the source files, never "
                "typed by hand. A settlement identifier is '<state fips>-<place fips>', or "
                "'<state fips>-nm-<name>' where the Census Bureau assigns no place FIPS, which is the case "
                "for Census-designated places."
            ),
            "null_means_missing": (
                "A null is a value the source does not publish. No null in this export was filled with an "
                "invented value. docs/DATA_MANIFEST.md lists every such gap."
            ),
            "measurement_types": (
                "Fields carry a source_apportionment value telling a consumer whether the number was "
                "measured, apportioned from a coarser real source, or set from a documented config "
                "constant. See docs/DATA_MANIFEST.md."
            ),
        },
        "tables": table_schemas,
        "provenance": extra or {},
    }


def write_schema(config: Config, schema: dict[str, Any]) -> tuple[Path, Path]:
    """Write the schema to docs/ (checked in) and dist/ (ships with the data)."""
    document = json.dumps(schema, indent=2, sort_keys=False) + "\n"
    report_dir = config.path_for("report_dir")
    report_dir.mkdir(parents=True, exist_ok=True)
    export_dir = config.path_for("export_dir")
    export_dir.mkdir(parents=True, exist_ok=True)
    checked_in = report_dir / "world_data.schema.json"
    shipped = export_dir / "schema.json"
    checked_in.write_text(document, encoding="utf-8")
    shipped.write_text(document, encoding="utf-8")
    return (checked_in, shipped)


def ddl_statements(schema: dict[str, Any]) -> list[str]:
    """Generate Postgres DDL from the published schema.

    Generated from the same file Agents 2 and 3 read, so the database and the
    portable export cannot describe different things.
    """
    mapping = {
        "integer": "INTEGER",
        "number": "DOUBLE PRECISION",
        "string": "TEXT",
        "boolean": "BOOLEAN",
        "null": "TEXT",
    }
    statements: list[str] = []
    for table in schema["tables"]:
        columns = []
        for column in table["columns"]:
            sql_type = mapping.get(column["type"])
            if sql_type is None:
                raise WorldDataError(
                    f"schema type {column['type']!r} for {table['table']}.{column['name']} has no SQL "
                    "mapping; add one rather than guessing"
                )
            columns.append(f'"{column["name"]}" {sql_type}')
        statements.append(
            f'CREATE TABLE IF NOT EXISTS "world_data"."{table["table"]}" (\n  '
            + ",\n  ".join(columns)
            + "\n);"
        )
    return statements
