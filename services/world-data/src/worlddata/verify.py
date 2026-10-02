"""Verifying the committed export bundle without re-running the pipeline.

`python -m worlddata run` writes each table twice - JSONL and Parquet - and then
writes `schema.json` and `MANIFEST.json` describing what it wrote. Four files
then describe the same rows, and nothing checks that they still agree. A table
regenerated on its own, a hand-copied bundle, or a Parquet write that failed
half way all leave four files that each look fine and disagree with each other.

That has already happened here. `exports/place_boundaries.jsonl.gz` shipped 0
rows while `exports/README.md` said it was omitted, and `MANIFEST.json` still
recorded the 0-row run after the table was regenerated with 32,037 rows. Nothing
in the test suite looked, so the record stayed wrong for a full day.

This module reads the committed bundle and reports every disagreement:

  * the JSONL file is readable gzip, its first line is a header, and every
    remaining line is a JSON object (a truncated file fails here)
  * the Parquet file holds the same number of rows and the same column names
  * `schema.json` records the same row count
  * `MANIFEST.json`, when present, records the same row count

It never repairs the data. CONSTITUTION.md section 1.1 says a wrong value is
fixed at import, and a hand-edit that makes a disagreement disappear is exactly
the kind of quiet fix that section is written against. The command reports and
exits non-zero; regenerating the table is what fixes it.

The one thing this module will re-derive is the manifest's own export record
(`stamp_exports`, and `python -m worlddata stamp-exports`). The export lines are
a *statement about* the files rather than part of the data, they are measured
from the files rather than typed in, and a table regenerated after its run
leaves them permanently wrong with no re-run available. Everything that describes
a value - a population, a boundary, a rating - is left alone.
"""

from __future__ import annotations

import gzip
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from . import parquet_meta
from .export import TABLE_NAMES

# Matches one "export: <table> <n> rows" line of a run's diagnostics, which is
# how MANIFEST.json records what a run wrote. Commas are the thousands separator.
_EXPORT_DIAGNOSTIC = re.compile(r"^export: (?P<table>[a-z_]+) (?P<rows>[\d,]+) rows\b")

# Cap on how many rows are fully parsed during a check. A truncated file is
# detected from the row count, which is cheap; parsing every row of the 137,000
# row route segment table to prove it is valid JSON costs more than the check is
# worth. This is only a floor on how much gets checked, never a claim that the
# rest is fine.
JSONL_PARSE_SAMPLE_ROWS = 2_000

# Tables a run writes to dist/ that the committed bundle deliberately does not
# ship. `route_segments` is 137,000 real polylines: about 55 MB of Parquet and
# 63 MB of JSONL for render geometry that `python -m worlddata run` rebuilds in a
# few minutes, and that the `routes` table already summarises for the simulation.
# A bundle without it is the documented design, so both the check and the stamp
# skip it rather than calling it a missing table.
#
# The rule is deliberately a list rather than a size threshold: the reason a table
# is excluded is a decision, and a decision is written down rather than inferred.
DELIBERATELY_UNSHIPPED: frozenset[str] = frozenset({"route_segments"})


@dataclass
class TableReport:
    """What was found for one table in the bundle."""

    name: str
    jsonl_rows: int | None = None
    jsonl_error: str | None = None
    parquet_rows: int | None = None
    parquet_error: str | None = None
    schema_rows: int | None = None
    manifest_rows: int | None = None
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems


@dataclass
class BundleReport:
    """Every table checked, plus the problems that are not table-specific."""

    bundle_dir: Path
    tables: list[TableReport] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.problems and all(table.ok for table in self.tables)

    def lines(self) -> list[str]:
        out: list[str] = []
        for table in self.tables:
            counts = (
                f"jsonl {table.jsonl_rows if table.jsonl_rows is not None else 'n/a'}"
                f" / parquet {table.parquet_rows if table.parquet_rows is not None else 'n/a'}"
                f" / schema {table.schema_rows if table.schema_rows is not None else 'n/a'}"
                f" / manifest {table.manifest_rows if table.manifest_rows is not None else 'n/a'}"
            )
            out.append(f"{'ok  ' if table.ok else 'FAIL'} {table.name:20} {counts}")
            if table.jsonl_error:
                out.append(f"       jsonl: {table.jsonl_error}")
            if table.parquet_error:
                out.append(f"       parquet: {table.parquet_error}")
            for problem in table.problems:
                out.append(f"       {problem}")
        for problem in self.problems:
            out.append(f"FAIL {problem}")
        out.append(
            f"{len(self.tables)} tables checked, "
            f"{sum(1 for table in self.tables if not table.ok)} with problems, "
            f"{'bundle is consistent' if self.ok else 'BUNDLE IS INCONSISTENT'}"
        )
        return out


def read_jsonl_gz(path: Path) -> tuple[dict[str, Any] | None, int, str | None, list[str]]:
    """Read a table's JSONL export.

    Returns (header, data row count, error, per-table problems). The count is of
    lines after the header, which is what every other count in the bundle means:
    a Parquet row count and a schema row count are both data rows.
    """
    problems: list[str] = []
    try:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            first = handle.readline()
            if not first.strip():
                return (None, 0, "the file is empty", ["the JSONL file has no header line"])
            try:
                header = json.loads(first)
            except json.JSONDecodeError as exc:
                return (None, 0, f"the header line is not JSON ({exc})", ["the header line is not JSON"])
            if header.get("_header") is not True:
                problems.append("the first line is not a header: no \"_header\": true on line 1")
            count = 0
            for number, line in enumerate(handle, start=2):
                if not line.strip():
                    problems.append(f"line {number} is blank; every line after the header must be a row")
                    continue
                if number <= JSONL_PARSE_SAMPLE_ROWS + 1:
                    try:
                        json.loads(line)
                    except json.JSONDecodeError as exc:
                        # A truncated gzip stream or a half-written line lands here.
                        return (header, count, f"line {number} is not JSON ({exc})", problems)
                count += 1
    except (OSError, EOFError) as exc:
        return (None, 0, f"the file could not be read as gzip ({type(exc).__name__}: {exc})", problems)
    return (header, count, None, problems)


def read_parquet(path: Path) -> tuple[int | None, list[str], str | None]:
    """Read a Parquet table's row count and column names. (rows, columns, error).

    pyarrow is used when it is installed because it is the pipeline's own reader.
    When it is not, the footer is parsed directly (`parquet_meta`), which answers
    the same two questions from the file's own metadata with no third-party code.

    That fallback is not a convenience. This check is the only thing standing
    between a stale Parquet half of the bundle and a green report, and pyarrow is
    an optional extra that a network-restricted machine cannot install - so
    without the fallback the machines least able to install pyarrow are the ones
    that never verify it.
    """
    try:
        import pyarrow.parquet as pq
    except ImportError:
        summary = parquet_meta.read_parquet_summary(path)
        if "error" in summary:
            return (None, [], f"the Parquet footer could not be read ({summary['error']})")
        return (summary["num_rows"], list(summary["columns"]), None)
    try:
        table = pq.read_table(path)
    except Exception as exc:  # pyarrow raises its own family of errors
        return (None, [], f"the file could not be read as Parquet ({type(exc).__name__}: {exc})")
    return (table.num_rows, list(table.schema.names), None)


def jsonl_columns(path: Path) -> set[str]:
    """Column names seen in the JSONL rows, from a bounded sample."""
    columns: set[str] = set()
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        handle.readline()
        for index, line in enumerate(handle):
            if index >= JSONL_PARSE_SAMPLE_ROWS:
                break
            if line.strip():
                columns.update(json.loads(line))
    return columns


def manifest_export_rows(manifest_path: Path) -> dict[str, int]:
    """Row counts a manifest's run diagnostics claim it exported.

    Only the tables present are returned. A manifest from a run that predates a
    table says nothing about that table, so its absence is not a disagreement.
    """
    if not manifest_path.is_file():
        return {}
    document = json.loads(manifest_path.read_text(encoding="utf-8"))
    counts: dict[str, int] = {}
    for note in document.get("run_diagnostics", []):
        match = _EXPORT_DIAGNOSTIC.match(note)
        if match:
            counts[match.group("table")] = int(match.group("rows").replace(",", ""))
    return counts


def schema_rows(schema_path: Path) -> dict[str, int]:
    """Row counts the published schema records, keyed by table name."""
    if not schema_path.is_file():
        return {}
    document = json.loads(schema_path.read_text(encoding="utf-8"))
    return {table["table"]: int(table["row_count"]) for table in document.get("tables", [])}


def verify_bundle(bundle_dir: Path, *, require_parquet: bool = True) -> BundleReport:
    """Check every published table in ``bundle_dir`` for internal agreement.

    ``require_parquet`` off still reports a missing Parquet file as a problem for
    a table that has a JSONL file beside it, because the export contract
    (export.py) publishes both. It only turns the "pyarrow is not installed"
    case from an error into a skip.
    """
    bundle_dir = Path(bundle_dir)
    report = BundleReport(bundle_dir=bundle_dir)
    if not bundle_dir.is_dir():
        report.problems.append(f"{bundle_dir} is not a directory")
        return report

    schema_path = bundle_dir / "schema.json"
    manifest_path = bundle_dir / "MANIFEST.json"
    if not schema_path.is_file():
        report.problems.append(f"no schema.json in {bundle_dir}; the bundle cannot be checked")
        return report
    schema_counts = schema_rows(schema_path)
    manifest_counts = manifest_export_rows(manifest_path)

    for name in TABLE_NAMES:
        jsonl_path = bundle_dir / f"{name}.jsonl.gz"
        parquet_path = bundle_dir / f"{name}.parquet"
        if not jsonl_path.is_file():
            # route_segments is deliberately not shipped; see exports/README.md.
            if parquet_path.is_file():
                report.problems.append(f"{name}: {parquet_path.name} is present but {jsonl_path.name} is not")
            continue

        table = TableReport(name=name)
        header, rows, error, problems = read_jsonl_gz(jsonl_path)
        table.jsonl_rows = rows
        table.jsonl_error = error
        table.problems.extend(problems)
        if error:
            table.problems.append(f"the JSONL export is unreadable: {error}")
        if header is not None and header.get("table") not in (None, name):
            table.problems.append(
                f"the header says this is the {header.get('table')!r} table, not {name!r}"
            )

        if parquet_path.is_file():
            parquet_rows, parquet_columns, parquet_error = read_parquet(parquet_path)
            table.parquet_rows = parquet_rows
            if parquet_error and require_parquet:
                table.parquet_error = parquet_error
                table.problems.append(f"the Parquet export could not be read: {parquet_error}")
            if parquet_rows is not None:
                if rows is not None and parquet_rows != rows:
                    table.problems.append(
                        f"Parquet holds {parquet_rows:,} rows but the JSONL holds {rows:,}; "
                        "one of the two is stale"
                    )
                if header is None:
                    continue
                try:
                    missing = jsonl_columns(jsonl_path) - set(parquet_columns)
                except (OSError, EOFError, json.JSONDecodeError):
                    missing = set()
                if missing:
                    table.problems.append(
                        f"the Parquet file is missing columns present in the JSONL: {sorted(missing)}"
                    )
        else:
            table.parquet_error = "no Parquet file beside the JSONL export"
            table.problems.append(
                f"{parquet_path.name} is missing; export.py publishes every table as JSONL and Parquet"
            )

        table.schema_rows = schema_counts.get(name)
        if table.schema_rows is None:
            table.problems.append(f"schema.json has no row count for {name}")
        elif rows is not None and table.schema_rows != rows:
            table.problems.append(
                f"schema.json says {table.schema_rows:,} rows and the JSONL holds {rows:,}"
            )

        table.manifest_rows = manifest_counts.get(name)
        if table.manifest_rows is not None and rows is not None and table.manifest_rows != rows:
            table.problems.append(
                f"MANIFEST.json records {table.manifest_rows:,} rows for {name} and the JSONL holds "
                f"{rows:,}; the manifest describes an earlier run than the data beside it"
            )

        report.tables.append(table)

    if not report.tables:
        report.problems.append(f"no published table was found in {bundle_dir}")
    return report


def iter_jsonl_rows(path: Path) -> Iterator[dict[str, Any]]:
    """Yield the data rows of a JSONL export, skipping the header line."""
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        handle.readline()
        for line in handle:
            if line.strip():
                yield json.loads(line)


# ---------------------------------------------------------------------------
# Re-recording the manifest's export section from the committed bundle.
# ---------------------------------------------------------------------------

# Row counts and file sizes are written the way a run writes them, with commas as
# thousands separators, so a stamped line is indistinguishable in shape from a
# generated one and the verifier's regex reads both.
_THOUSANDS = "{:,}"


def bundle_export_rows(bundle_dir: Path) -> dict[str, int]:
    """Data-row count of every published table, measured from the files in the bundle.

    Read from the JSONL export when it is there, because that is the format the
    schema row count and the manifest both refer to. A table with only a Parquet
    file is counted from there instead, so a bundle that kept one format still
    reports rather than silently losing a row.
    """
    counts: dict[str, int] = {}
    for name in TABLE_NAMES:
        if name in DELIBERATELY_UNSHIPPED:
            continue
        jsonl_path = bundle_dir / f"{name}.jsonl.gz"
        if jsonl_path.is_file():
            _header, rows, error, _problems = read_jsonl_gz(jsonl_path)
            if error is None:
                counts[name] = rows
                continue
        parquet_path = bundle_dir / f"{name}.parquet"
        if parquet_path.is_file():
            parquet_rows, _columns, error = read_parquet(parquet_path)
            if error is None and parquet_rows is not None:
                counts[name] = parquet_rows
    return counts


def export_diagnostic_line(name: str, rows: int, bundle_dir: Path) -> str:
    """The single `export: ...` diagnostic line for one table, in a run's format.

    Byte-for-byte the shape a real run emits, because `verify-exports` parses both
    kinds with the same regex and a reader comparing a stamped bundle against a
    freshly generated one should not be able to tell which is which:

        export: settlements 13,189 rows, settlements.jsonl.gz (1,113,488 B) + settlements.parquet (959,338 B)
    """
    parts = [f"export: {name} {_THOUSANDS.format(rows)} rows"]
    for suffix in ("jsonl.gz", "parquet"):
        path = bundle_dir / f"{name}.{suffix}"
        if path.is_file():
            parts.append(f"{path.name} ({_THOUSANDS.format(path.stat().st_size)} B)")
    return ", ".join(parts[:1]) + (", " + " + ".join(parts[1:]) if len(parts) > 1 else "")


# Key under which a stamped manifest records that its export lines were derived
# from the bundle rather than written by the run described above them.
BUNDLE_STAMP_KEY = "bundle_stamp"


def stamp_exports(bundle_dir: Path, *, stamped_at: str | None = None) -> list[str]:
    """Re-record MANIFEST.json's export lines from the files actually committed.

    Why this exists. A manifest carries two kinds of statement: what the run
    *read* (`datasets`, with sources and digests) and what the run *wrote* (the
    `export:` lines in `run_diagnostics`). Tables get regenerated after their run
    - `place_boundaries` and `notables` both have been - and when they do, only
    the export lines go stale. The manifest then describes a run whose output is
    not the output sitting beside it, and `verify-exports` reports the
    disagreement forever, with no way to clear it short of a full re-run.

    A full re-run is not always available. The state-profile sources are the ones
    most likely to be unreachable from a given network - USGS MRDS refuses
    automated requests from some hosts outright, and `declared_gaps` in the same
    manifest records a different host refusing them for this one - so the honest
    choices were "leave a record known to be wrong" or "re-derive the record from
    the files". This is the second, and it is deliberately much narrower than
    editing by hand:

      * every number written is measured from a file in this bundle, so it cannot
        drift from the data the way a typed-in number can;
      * no row, column, value, gap or dataset record is touched. Only the
        `export:` lines are rebuilt, from row counts and file sizes;
      * a table with no readable file is reported and skipped, never counted as
        zero - the original defect being fixed here is a 0 that was not zero;
      * a deliberately-unshipped table keeps the line its run wrote. Its absence
        from this bundle is a documented design decision (`exports/README.md`),
        not a disagreement, and `verify-exports` skips those tables for the same
        reason. Rewriting the line would replace a true record of the run with a
        claim about a file that is not here;
      * the result is recorded under `bundle_stamp`, so a reader can tell which
        lines came from a run and which were re-measured, and the run record
        above them keeps its original date.

    Returns the problems it hit; an empty list means the bundle is now consistent.
    """
    bundle_dir = Path(bundle_dir)
    manifest_path = bundle_dir / "MANIFEST.json"
    problems: list[str] = []
    if not manifest_path.is_file():
        return [f"{manifest_path} does not exist, so there is nothing to stamp"]
    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"{manifest_path} is not valid JSON ({exc}); it has to be regenerated, not stamped"]

    diagnostics = list(document.get("run_diagnostics", []))
    # Drop the previous stamp's lines, and the run's own lines for shipped tables.
    # A deliberately-unshipped table's line is the run's record of a real export
    # and is left exactly where it was.
    def _is_droppable(note: str) -> bool:
        match = _EXPORT_DIAGNOSTIC.match(note)
        return bool(match) and match.group("table") not in DELIBERATELY_UNSHIPPED

    kept = [note for note in diagnostics if not _is_droppable(note)]
    counts = bundle_export_rows(bundle_dir)
    if not counts:
        return [f"no table in {bundle_dir} could be read, so nothing was stamped"]

    stamped: list[str] = []
    for name in TABLE_NAMES:
        if name in DELIBERATELY_UNSHIPPED:
            continue
        if name not in counts:
            problems.append(
                f"{name}: no readable export in the bundle, so no export line was written for it"
            )
            continue
        stamped.append(export_diagnostic_line(name, counts[name], bundle_dir))

    document["run_diagnostics"] = kept + stamped
    document[BUNDLE_STAMP_KEY] = {
        "stamped_at": stamped_at or datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "bundle": bundle_dir.name,
        "tables": {name: counts[name] for name in TABLE_NAMES if name in counts},
        "note": (
            "The `export:` lines in run_diagnostics were re-measured from the files in this "
            "bundle, not written by the run recorded above them. Row counts and file sizes "
            "come from the files; no data was changed. The run record is earlier than the "
            "tables because the tables were regenerated after it, and a full re-run was not "
            "possible from this network - see datasets[].declared_gaps and the sources that "
            "refuse automated requests. CONSTITUTION.md section 1.1: a wrong value is fixed "
            "at import, which is why this re-derives the record instead of editing it."
        ),
    }
    manifest_path.write_text(
        json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return problems
