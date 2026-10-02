"""Command line entry point.

    python -m worlddata run              fetch, transform, verify, publish
    python -m worlddata fetch            download and verify sources only
    python -m worlddata report           print the run record of the last export
    python -m worlddata schema           print the published schema summary
    python -m worlddata wire             build the campaign client's wire files
    python -m worlddata verify-exports   check the committed export bundle agrees with itself
    python -m worlddata stamp-exports    re-record the manifest's export lines from the files
    python -m worlddata fetch-elevation  download the elevation tiles a region.json names
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .config import load_config
from .errors import WorldDataError
from .pipeline import run


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="worlddata",
        description="Phase 0 world data pipeline. Real data in, usable data out.",
    )
    parser.add_argument("--config", type=Path, default=None, help="path to world_data.toml")
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="run every stage and publish the export")
    run_parser.add_argument(
        "--skip-fetch",
        action="store_true",
        help="reuse files already in data/raw instead of re-downloading; verifies their digests",
    )
    run_parser.add_argument(
        "--skip-postgres", action="store_true", help="do not attempt the database load"
    )
    run_parser.add_argument(
        "--reuse-stages",
        action="store_true",
        help="reuse cached results for the expensive boundaries and routes stages when the config and "
        "every downloaded source are unchanged. This is what makes a re-run cheap; without it every "
        "stage recomputes from the downloaded files.",
    )

    subparsers.add_parser("fetch", help="download and verify every source file")
    subparsers.add_parser("schema", help="print a summary of the published schema")

    bundle_parser = subparsers.add_parser(
        "verify-exports",
        help="check that the committed export bundle agrees with itself, file by file",
    )
    bundle_parser.add_argument(
        "--dir",
        type=Path,
        default=None,
        help="bundle to check (default: the config's export_dir)",
    )
    bundle_parser.add_argument(
        "--no-parquet",
        action="store_true",
        help="do not require pyarrow; a missing Parquet reader is reported as a skip",
    )

    stamp_parser = subparsers.add_parser(
        "stamp-exports",
        help="re-record MANIFEST.json's export lines from the files actually committed",
    )
    stamp_parser.add_argument(
        "--dir",
        type=Path,
        default=None,
        help="bundle to stamp (default: the config's export_dir)",
    )

    elevation_parser = subparsers.add_parser(
        "fetch-elevation",
        help="download the terrarium elevation tiles a region.json names",
    )
    elevation_parser.add_argument(
        "--region",
        type=Path,
        required=True,
        help="region.json whose tile list to follow",
    )
    elevation_parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="directory the tile paths are written under",
    )
    elevation_parser.add_argument(
        "--tier",
        action="append",
        choices=("boot", "detail"),
        default=None,
        help="which tier to fetch; repeatable. Default: boot only",
    )
    elevation_parser.add_argument(
        "--force",
        action="store_true",
        help="re-download tiles that are already on disk",
    )

    wire_parser = subparsers.add_parser(
        "wire",
        help="build the campaign client's wire-format files (region/settlements/network.json)",
    )
    wire_parser.add_argument(
        "--dist",
        type=Path,
        default=None,
        help="pipeline dist/ dir (default: from config)",
    )
    wire_parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="output dir (default: <dist>/wire)",
    )

    arguments = parser.parse_args(argv)

    try:
        config = load_config(arguments.config)
        if arguments.command == "run":
            result = run(
                config,
                skip_fetch=arguments.skip_fetch,
                skip_postgres=arguments.skip_postgres,
                reuse_stages=arguments.reuse_stages,
            )
            print(json.dumps({
                "generated_at": result.generated_at,
                "settlements": len(result.settlements),
                "state_profiles": len(result.profiles),
                "routes": len(result.export_summary.get("routes", {}).get("rows", []) and [1] or []) or None,
                "tables": {name: summary["rows"] for name, summary in result.export_summary.items()},
                "postgres": result.postgres_result.summary() if result.postgres_result else None,
                "timings_seconds": {key: round(value, 2) for key, value in result.timings.items()},
            }, indent=2))
            return 0
        if arguments.command == "fetch":
            return _fetch(config)
        if arguments.command == "schema":
            return _schema(config)
        if arguments.command == "wire":
            return _wire(config, arguments.dist, arguments.out)
        if arguments.command == "verify-exports":
            return _verify_exports(config, arguments.dir, require_parquet=not arguments.no_parquet)
        if arguments.command == "stamp-exports":
            return _stamp_exports(config, arguments.dir)
        if arguments.command == "fetch-elevation":
            return _fetch_elevation(arguments.region, arguments.out, arguments.tier, arguments.force)
    except WorldDataError as exc:
        print(f"worlddata: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    return 2


def _fetch(config) -> int:
    from . import datasets as registry
    from .fetch import fetch

    for dataset in registry.all_datasets(
        census_year=config.census_year,
        popest_vintage=config.estimates_vintage,
        elevation_tiles=config.elevation_tiles,
    ):
        result = fetch(config, dataset.url, dataset.filename, expected_sha256=dataset.expected_sha256)
        state = "reused" if result.from_cache else f"downloaded ({result.attempts} attempt(s))"
        print(f"{dataset.filename:52} {result.bytes_written:>12,} B  {state}")
    return 0


def _wire(config, dist: Path | None, out: Path | None) -> int:
    from .client_wire import build_wire_files

    dist_dir = dist or config.path_for("export_dir")
    out_dir = out or (dist_dir / "wire")
    result = build_wire_files(
        dist_dir,
        out_dir,
        census_year=config.census_year,
        estimates_vintage=config.estimates_vintage,
    )
    for line in result.log_lines():
        print(line)
    return 0


def _bundle_dir(config, directory: Path | None) -> Path:
    """The committed export bundle: `exports/`, not the config's working `dist/`.

    The config's `export_dir` is where a run writes, and it is a working directory -
    it is not committed and it does not carry the bundle's README. The thing that
    gets read by another team is `exports/`, so that is what these two commands
    check by default.
    """
    if directory is not None:
        return directory
    # config.path is config/world_data.toml, so the service root is two levels up.
    return config.path.parent.parent / "exports"


def _verify_exports(config, directory: Path | None, *, require_parquet: bool) -> int:
    """Report every disagreement inside the committed bundle. Writes nothing.
    Exits non-zero when the bundle disagrees with itself, so it can be a gate. It
    never repairs anything: CONSTITUTION.md section 1.1 says a wrong value is fixed
    at import, and the disagreement is fixed by regenerating the table, or - for the
    manifest's own record of what a run wrote - by `stamp-exports`.
    """
    from .verify import verify_bundle

    bundle = _bundle_dir(config, directory)
    if not bundle.is_dir():
        print(f"worlddata: no export bundle at {bundle}", file=sys.stderr)
        return 1
    report = verify_bundle(bundle, require_parquet=require_parquet)
    for line in report.lines():
        print(line)
    return 0 if report.ok else 1


def _stamp_exports(config, directory: Path | None) -> int:
    """Re-derive MANIFEST.json's export lines from the files on disk.

    The only thing in the bundle this will rewrite, and only because the export lines
    are a statement *about* the files rather than part of the data - see
    `verify.stamp_exports`.
    """
    from .verify import stamp_exports, verify_bundle

    bundle = _bundle_dir(config, directory)
    if not bundle.is_dir():
        print(f"worlddata: no export bundle at {bundle}", file=sys.stderr)
        return 1
    changed = stamp_exports(bundle)
    for line in changed:
        print(f"worlddata: {line}")
    report = verify_bundle(bundle)
    for line in report.lines():
        print(line)
    if not report.ok:
        print(
            "worlddata: the bundle still disagrees with itself after stamping; the difference is in the "
            "data, not the manifest, so regenerate the table rather than editing the record",
            file=sys.stderr,
        )
        return 1
    return 0


def _fetch_elevation(region: Path, out: Path, tiers: list[str] | None, force: bool) -> int:
    """Download the tiles a region.json names, one tier at a time.

    The tier is named rather than the zoom on purpose: this region's detail tier is
    2,236 tiles and about 250 MB, and passing a zoom would let that happen by
    accident.
    """
    from .elevation import fetch_tiles

    results = fetch_tiles(region, out, tuple(tiers or ("boot",)), force=force)
    warnings = 0
    for result in results:
        for line in result.log_lines():
            print(line)
        warnings += len(result.warnings)
    if warnings:
        # fetch_tiles records a bad tile and keeps going so one broken coordinate
        # does not cost the other 2,235. Exiting zero here would hide that.
        print(f"worlddata: {warnings} tile(s) failed; see the warnings above", file=sys.stderr)
        return 1
    return 0


def _schema(config) -> int:
    path = config.path_for("report_dir") / "world_data.schema.json"
    if not path.is_file():
        print(f"worlddata: no schema at {path}; run the pipeline first", file=sys.stderr)
        return 1
    document = json.loads(path.read_text(encoding="utf-8"))
    print(f"schema: {len(document['tables'])} tables, generated {document['generated_at']}")
    for table in document["tables"]:
        print(f"  {table['table']:20} {table['row_count']:>9,} rows  {table['column_count']:>3} columns")
    return 0
