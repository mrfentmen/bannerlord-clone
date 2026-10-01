"""Command line entry point.

    python -m worlddata run          fetch, transform, verify, publish
    python -m worlddata fetch        download and verify sources only
    python -m worlddata report       print the run record of the last export
    python -m worlddata schema       print the published schema summary
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

    simfeed_parser = subparsers.add_parser(
        "sim-feed",
        help="build the simulation's settlement feed (worldgen.Settlement JSON)",
    )
    simfeed_parser.add_argument(
        "--dist",
        type=Path,
        default=None,
        help="pipeline dist/ dir (default: from config)",
    )
    simfeed_parser.add_argument(
        "--out",
        type=Path,
        default=None,
        help="output dir (default: <dist>/sim-feed)",
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
        if arguments.command == "sim-feed":
            return _sim_feed(config, arguments.dist, arguments.out)
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


def _sim_feed(config, dist: Path | None, out: Path | None) -> int:
    from .sim_feed import build_sim_feed

    dist_dir = dist or config.path_for("export_dir")
    out_dir = out or (dist_dir / "sim-feed")
    result = build_sim_feed(dist_dir, out_dir)
    for line in result.log_lines():
        print(line)
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
