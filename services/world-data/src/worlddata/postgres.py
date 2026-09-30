"""Optional Postgres load.

CONSTITUTION.md section 4 locks Postgres into the stack, but agents/README.md
records that the hosting decision is unresolved: Go does not run on Cloudflare
and Cloudflare does not host Postgres. That is why this module is optional and
why the JSON and Parquet exports exist alongside it.

Three rules here:

* Postgres is never required. With no driver installed, or no connection
  configured, the pipeline completes and says so in one clear line.
* When it is configured and the connection fails, that is a loud failure. A load
  that quietly half-succeeded would leave Agents 2 and 3 reading a database that
  does not match the export.
* The schema is created from the same published schema file the portable export
  carries, so the two cannot drift.

Install the driver with ``pip install 'psycopg[binary]'`` if you want the
database load. That is a new dependency and is not installed by this pipeline.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from .errors import WorldDataError

# DSN environment variable. Declared in .env.example.
DSN_ENV_VAR = "WORLD_DATA_POSTGRES_DSN"
# Schema the tables are created in.
SCHEMA_NAME = "world_data"


@dataclass(frozen=True)
class LoadResult:
    """What the load actually did."""

    available: bool
    reason: str
    schema_created: bool
    tables_loaded: tuple[str, ...]
    rows_loaded: dict[str, int]

    def summary(self) -> str:
        if not self.available:
            return f"Postgres load skipped: {self.reason}"
        return (
            f"Postgres load: created schema {SCHEMA_NAME}, loaded "
            f"{sum(self.rows_loaded.values()):,} rows across {len(self.tables_loaded)} table(s)"
        )


def connection_dsn() -> str | None:
    """The configured DSN, or None. Reads only the environment."""
    value = os.environ.get(DSN_ENV_VAR)
    return value.strip() if value and value.strip() else None


def _import_driver() -> tuple[Any, str | None]:
    try:
        import psycopg  # type: ignore[import-not-found]
    except ImportError as exc:
        return (None, f"the psycopg driver is not installed ({exc}). Install it with "
                      "`pip install 'psycopg[binary]'` if you want a database load; the portable JSON "
                      "and Parquet exports are complete without it.")
    return (psycopg, None)


def load(config, tables: dict[str, Any], *, ddl_statements: list[str]) -> LoadResult:
    """Create the schema and load every published table.

    Returns a LoadResult saying what happened. Raises WorldDataError when a load
    that started could not finish, because a partial load is worse than none.
    """
    dsn = connection_dsn()
    driver, import_error = _import_driver()
    if driver is None:
        return LoadResult(False, import_error or "psycopg unavailable", False, (), {})

    if dsn is None:
        return LoadResult(
            False,
            f"no {DSN_ENV_VAR} is set, so there is no database to load into. "
            f"Set it, or copy .env.example to .env and fill it in. The portable exports are complete "
            "either way, which is the point of producing them.",
            False,
            (),
            {},
        )

    from ..export import TABLE_NAMES, _rows_of

    loaded: dict[str, int] = {}
    loaded_tables: list[str] = []
    try:
        with driver.connect(dsn) as connection:
            with connection.cursor() as cursor:
                cursor.execute(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA_NAME}"')
                for statement in ddl_statements:
                    cursor.execute(statement)
                for name in TABLE_NAMES:
                    if name not in tables:
                        continue
                    rows = list(_rows_of(rows_for(tables[name])))
                    if not rows:
                        continue
                    _truncate_and_insert(cursor, name, rows)
                    loaded[name] = len(rows)
                    loaded_tables.append(name)
            connection.commit()
    except Exception as exc:  # noqa: BLE001 - re-raised with context below
        raise WorldDataError(
            f"the Postgres load failed partway and was rolled back. Nothing was committed. "
            f"Tables already written in this transaction: {loaded_tables}. Cause: {type(exc).__name__}: {exc}"
        ) from exc

    return LoadResult(True, "loaded", True, tuple(loaded_tables), loaded)


def _truncate_and_insert(cursor: Any, table: str, rows: list[dict[str, Any]]) -> None:
    """Make a table match the export exactly: same columns, same rows.

    Drop and recreate rather than upsert, so a removed column really is removed
    and a re-run is idempotent.
    """
    columns = list(rows[0].keys())
    column_list = ", ".join(f'"{column}"' for column in columns)
    cursor.execute(f'DROP TABLE IF EXISTS "{SCHEMA_NAME}"."{table}" CASCADE')
    cursor.execute(
        f'CREATE TABLE "{SCHEMA_NAME}"."{table}" ({column_list})'
    )
    placeholders = ", ".join(["%s"] * len(columns))
    cursor.executemany(
        f'INSERT INTO "{SCHEMA_NAME}"."{table}" ({column_list}) VALUES ({placeholders})',
        [tuple(row[column] for column in columns) for row in rows],
    )
