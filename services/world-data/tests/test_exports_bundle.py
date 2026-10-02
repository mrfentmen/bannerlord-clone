"""The committed export bundle, checked by the test suite.

`services/world-data/exports/` is a deliverable: 15 MB of committed data that
somebody else reads. Nothing about it is produced by `python -m worlddata run` at
review time, so a disagreement inside it - between the JSONL, the Parquet, the
published schema, the manifest, or the README that describes them - is invisible
until a consumer trips over it.

That has happened. `place_boundaries.jsonl.gz` shipped 0 rows while
`exports/README.md` said the table was omitted and `MANIFEST.json` still
recorded the 0-row run, after the table had been regenerated with 32,037 rows.
`verify.py` and the `verify-exports` command exist to catch that, but a command
nobody runs is not a check, so these tests run it.

They are fast on purpose: the whole bundle is verified in about a second, which
is the difference between a gate that runs on every change and one that does not.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

import pytest

from worlddata import parquet_meta, verify
from worlddata.export import TABLE_NAMES

SERVICE = Path(__file__).resolve().parents[1]
BUNDLE = SERVICE / "exports"
REPO = SERVICE.parents[1]
CLIENT_WORLD = REPO / "clients" / "campaign" / "public" / "world"


@pytest.fixture(scope="module")
def report() -> verify.BundleReport:
    return verify.verify_bundle(BUNDLE)


def test_the_committed_bundle_is_internally_consistent(report):
    """JSONL vs Parquet vs schema.json vs MANIFEST.json, for every published table."""
    if not report.ok:
        pytest.fail("the committed export bundle disagrees with itself:\n" + "\n".join(report.lines()))


def test_every_published_table_is_present(report):
    """A table quietly vanishing from the bundle is not caught by a cross-check.

    The cross-checks above only compare tables that are there. `export.TABLE_NAMES`
    is the publication order, so a table in it that shipped no file is a missing
    deliverable rather than a decision, unless it is on the documented exclusion
    list.
    """
    checked = {table.name for table in report.tables}
    expected = set(TABLE_NAMES) - set(verify.DELIBERATELY_UNSHIPPED)
    assert checked == expected, (
        f"published tables and bundled tables differ: only in TABLE_NAMES {sorted(expected - checked)}, "
        f"only in the bundle {sorted(checked - expected)}"
    )


def test_place_boundaries_is_shipped_with_rows(report):
    """The specific regression this module was written for.

    Not "the file parses" - it parsed at 0 rows too. Both formats, a real row
    count, and agreement with the two records that quote it.
    """
    table = next(t for t in report.tables if t.name == "place_boundaries")
    assert table.jsonl_error is None, table.jsonl_error
    assert table.jsonl_rows is not None and table.jsonl_rows > 30_000, (
        f"place_boundaries exported {table.jsonl_rows} rows; the Census place file holds about 32,000 "
        "and a near-empty table is the failure mode this checks for"
    )
    assert table.parquet_rows == table.jsonl_rows
    assert table.schema_rows == table.jsonl_rows
    assert table.manifest_rows == table.jsonl_rows
    assert not table.problems, table.problems


def test_the_readme_table_agrees_with_the_files(report):
    """`exports/README.md` is prose about the bundle, and prose drifts.

    It still said `place_boundaries` "exported 0 rows; it is omitted" a day after
    the table was regenerated, and it did not list `notables` at all. Neither is
    visible to a data cross-check, so the row counts in the table are read back
    out of the README and compared to what the files hold.
    """
    readme = (BUNDLE / "README.md").read_text(encoding="utf-8")
    row_cell = re.compile(r"^\|\s*`(?P<table>[a-z_]+)`\s*\|\s*(?P<rows>[\d,]+|—)\s*\|", re.MULTILINE)
    claimed = {m.group("table"): m.group("rows") for m in row_cell.finditer(readme)}

    measured = {table.name: table.jsonl_rows for table in report.tables if table.jsonl_rows is not None}
    missing_from_readme = sorted(set(measured) - set(claimed))
    assert not missing_from_readme, (
        f"exports/README.md does not list {missing_from_readme}, which are in the bundle; "
        "a reader of the README is being told the bundle is smaller than it is"
    )
    for table, rows in sorted(measured.items()):
        if table not in claimed:
            continue
        if claimed[table] == "—":
            continue
        assert claimed[table] == f"{rows:,}", (
            f"exports/README.md says {table} has {claimed[table]} rows; the file has {rows:,}"
        )

    # And the README must not still be describing a table as omitted or empty.
    assert "exported 0 rows" not in readme, (
        "exports/README.md still claims a table exported 0 rows; place_boundaries holds "
        f"{measured['place_boundaries']:,}"
    )


def test_parquet_footer_fallback_agrees_with_pyarrow(report):
    """`parquet_meta` is the answer on a machine that cannot install pyarrow.

    pyarrow is an optional extra, and the sources that make a full re-run possible
    are the ones most likely to be unreachable, so the check that guards a stale
    Parquet file has to work without it. Comparing the two readers on the real
    committed files is the only way to know the fallback is not quietly returning
    zeroes.
    """
    pytest.importorskip("pyarrow.parquet")
    checked = 0
    for table in report.tables:
        path = BUNDLE / f"{table.name}.parquet"
        summary = parquet_meta.read_parquet_summary(path)
        assert "error" not in summary, f"{table.name}: {summary['error']}"
        assert summary["num_rows"] == table.parquet_rows, (
            f"{table.name}: the footer parser found {summary['num_rows']} rows, pyarrow found "
            f"{table.parquet_rows}"
        )
        if table.jsonl_rows is not None:
            assert set(summary["columns"]) >= set(
                verify.jsonl_columns(BUNDLE / f"{table.name}.jsonl.gz")
            ) & set(summary["columns"]), table.name
        checked += 1
    assert checked >= 10, f"only {checked} parquet files were cross-read; expected every published table"


def test_the_fallback_is_what_runs_without_pyarrow(monkeypatch, report):
    """Force the pyarrow import to fail and check the report is unchanged.

    `verify.read_parquet` picks a reader with a bare `try: import pyarrow`. On a
    machine without it, only this path ever runs, so it has to produce the same
    verdict rather than silently skipping the Parquet half of every comparison.
    """
    import builtins

    real_import = builtins.__import__

    def refuse_pyarrow(name, *args, **kwargs):
        if name.startswith("pyarrow"):
            raise ImportError("pyarrow is not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", refuse_pyarrow)
    fallback = verify.verify_bundle(BUNDLE, require_parquet=True)
    assert fallback.ok, "\n".join(fallback.lines())
    for before, after in zip(report.tables, fallback.tables):
        assert after.parquet_rows == before.parquet_rows, after.name
        assert after.problems == before.problems, after.name


def test_stamping_the_manifest_touches_no_data(tmp_path):
    """`stamp-exports` re-derives the manifest's export lines and nothing else.

    It is the only thing allowed to rewrite a record, so the test pins the two
    halves of that claim: the export lines become what the files say, and not one
    byte of a table or of any other manifest key moves.
    """
    staging = tmp_path / "exports"
    shutil.copytree(BUNDLE, staging)
    before_tables = {
        path.name: path.read_bytes() for path in sorted(staging.iterdir()) if path.suffix in (".gz", ".parquet")
    }
    manifest_path = staging / "MANIFEST.json"
    before = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert verify.stamp_exports(staging) == []
    assert verify.verify_bundle(staging).ok

    after = json.loads(manifest_path.read_text(encoding="utf-8"))
    for key in before:
        if key in ("run_diagnostics", verify.BUNDLE_STAMP_KEY):
            continue
        assert after[key] == before[key], f"stamping changed {key}"
    assert after[verify.BUNDLE_STAMP_KEY]["tables"]["place_boundaries"] == 32_037

    after_tables = {
        path.name: path.read_bytes() for path in sorted(staging.iterdir()) if path.suffix in (".gz", ".parquet")
    }
    assert after_tables == before_tables, "stamping rewrote a data file"

    # Idempotent, so re-running the command does not churn the manifest.
    second = json.loads(manifest_path.read_text(encoding="utf-8"))
    verify.stamp_exports(staging)
    assert json.loads(manifest_path.read_text(encoding="utf-8"))["run_diagnostics"] == second["run_diagnostics"]


def test_a_deliberately_unshipped_table_keeps_its_run_line(tmp_path):
    """`route_segments` is excluded on purpose, and its run line is still true.

    Rewriting it would replace a real record of a real export with a claim about a
    file that is not in the bundle, which is the kind of quiet correction
    CONSTITUTION.md section 1.1 is written against.
    """
    staging = tmp_path / "exports"
    shutil.copytree(BUNDLE, staging)
    manifest_path = staging / "MANIFEST.json"
    before = json.loads(manifest_path.read_text(encoding="utf-8"))
    original = [n for n in before["run_diagnostics"] if n.startswith("export: route_segments ")]

    verify.stamp_exports(staging)
    after = json.loads(manifest_path.read_text(encoding="utf-8"))
    kept = [n for n in after["run_diagnostics"] if n.startswith("export: route_segments ")]
    assert original and kept == original
    assert "route_segments" not in after[verify.BUNDLE_STAMP_KEY]["tables"]


def test_the_client_ships_the_region_this_pipeline_built():
    """The deployed wire files are the ones `python -m worlddata wire` produces.

    The client loads `public/world/` directly, and those files were once fetched
    by the client's own script against a different region. Nothing in the client
    checks that they still come from here, so a drift between the export and what
    the client actually boots is invisible until the map is wrong.
    """
    if not CLIENT_WORLD.is_dir():
        pytest.skip(f"{CLIENT_WORLD} is not present; the service is testable on its own")

    region = json.loads((CLIENT_WORLD / "region.json").read_text(encoding="utf-8"))
    settlements = json.loads((CLIENT_WORLD / "settlements.json").read_text(encoding="utf-8"))
    network = json.loads((CLIENT_WORLD / "network.json").read_text(encoding="utf-8"))
    wire_region = json.loads((BUNDLE / "wire" / "region.json").read_text(encoding="utf-8"))

    assert region["name"] == wire_region["name"]
    assert region["bbox"] == wire_region["bbox"]
    for key in ("encoding", "formula", "zoom", "tileSize"):
        assert region["elevation"][key] == wire_region["elevation"][key]
    assert [t["path"] for t in region["elevation"]["tiles"]] == [
        t["path"] for t in wire_region["elevation"]["tiles"]
    ]

    assert settlements["source"] == "agent-1-export", (
        "the client's settlements are not from this pipeline; re-run `worlddata wire` and redeploy"
    )
    assert len(settlements["settlements"]) == 487, (
        f"the client has {len(settlements['settlements'])} settlements; the V1 region has 487"
    )
    assert len(network["roads"]) == 439
    assert len(network["rail"]) == 4_653
    assert network["source"] == "agent-1-export"


def test_the_boot_tile_list_is_small_enough_to_fetch_at_startup():
    """The elevation tier decision, pinned.

    The client fetches every tile in `region.json`'s `elevation` list before it
    draws anything. The Ohio bbox at zoom 12 is 2,236 tiles and about 250 MB,
    which is not a boot payload; the boot list is the zoom-10 tier. If someone
    raises the boot zoom without thinking about the byte count, this fails.
    """
    if not CLIENT_WORLD.is_dir():
        pytest.skip(f"{CLIENT_WORLD} is not present; the service is testable on its own")

    region = json.loads((CLIENT_WORLD / "region.json").read_text(encoding="utf-8"))
    boot = region["elevation"]
    assert boot["zoom"] == 10, f"the boot list is zoom {boot['zoom']}"
    assert len(boot["tiles"]) <= 200, f"the boot list has {len(boot['tiles'])} tiles"
    assert "elevationDetail" in region, "the detail tile list is missing from region.json"
    assert region["elevationDetail"]["zoom"] == 12
    assert len(region["elevationDetail"]["tiles"]) > len(boot["tiles"])


def test_every_boot_tile_is_actually_on_disk():
    """The list and the files are separate artefacts and have drifted apart.

    `region.json` listed 2,236 zoom-12 tiles against 668 files on disk, so the
    client threw a retryable network error on the first missing tile and the map
    never drew. Nothing checked the two, because nothing was supposed to have to.
    """
    if not CLIENT_WORLD.is_dir():
        pytest.skip(f"{CLIENT_WORLD} is not present; the service is testable on its own")

    region = json.loads((CLIENT_WORLD / "region.json").read_text(encoding="utf-8"))
    for tier in ("elevation", "elevationDetail"):
        if tier not in region:
            continue
        missing = [t["path"] for t in region[tier]["tiles"] if not (CLIENT_WORLD / t["path"]).is_file()]
        if tier == "elevationDetail":
            # The detail tier is a fetchable artifact, not a committed one. See
            # `worlddata fetch-elevation` and the DATA-MANIFEST.
            assert len(missing) == len(region[tier]["tiles"]), (
                f"{tier} is a fetchable tier, so either all of it is present or none of it is; "
                f"{len(missing)} of {len(region[tier]['tiles'])} are on disk"
            )
            continue
        assert not missing, (
            f"region.json's boot list names {len(missing)} tiles that are not on disk, "
            f"starting with {missing[0]}; the client fails to draw the map on a missing tile"
        )
