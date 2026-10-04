#!/usr/bin/env python3
"""Tier 2B-66: Per-metro wire deploy.

Generates versioned wire files for each of the 4 priority metros:
  <out>/MANIFEST.json
  <out>/<metro>/region.json
  <out>/<metro>/settlements.json

Metro bboxes come from config/world_data.toml [metros.*].

**This build does not produce `network.json` or `travel.json`, and does not write
them.** It used to write both, per metro, as `{"edges": [], "note": "... TBD"}` -
eight files across four metros, every one of them empty, with a note string as the
only thing distinguishing "this metro has no roads" from "nobody has built this
yet". A consumer could not tell those apart, and neither could the tool that
wrote them. They are named in `MANIFEST.json` under `not_built` with the reason,
and a stale copy of either from an earlier build is deleted rather than left on
disk to be read as current.

The source for those two files is real geometry: a metro-scale subset of the road
and rail network, weighted by travel time. Nothing in this repository produces
that subset yet, and an empty edge list is not a stand-in for it.

Usage:

    python tools/build-metro-wire.py --config config/world_data.toml \\
        --dist dist --out exports/wire
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
import tomllib
from datetime import datetime, timezone
from pathlib import Path

# The files this build writes for a metro that has settlements in its bbox.
REGION_FILE = "region.json"
SETTLEMENTS_FILE = "settlements.json"

# The files a metro wire needs and this build cannot fill, with the reason. They
# are reported rather than written, and a copy left by an earlier build is removed.
NOT_BUILT = {
    "network.json": (
        "needs metro-scale road and rail geometry; the only network in the bundle is the national wire, "
        "and an empty edge list is not a subset of it"
    ),
    "travel.json": (
        "needs the same geometry weighted by travel time, which is derived from the network subset above"
    ),
}


def load_metros(config_path: Path) -> dict:
    """Load metro bboxes from config."""
    with open(config_path, "rb") as f:
        config = tomllib.load(f)
    return config.get("metros", {})


def in_bbox(lon: float, lat: float, bbox: list[float]) -> bool:
    """Check if (lon, lat) is in [west, south, east, north] bbox."""
    west, south, east, north = bbox
    return west <= lon <= east and south <= lat <= north


def load_settlements(dist_dir: Path) -> list[dict]:
    """Load all settlements from dist, reporting the ones with no position.

    A settlement with a null latitude or longitude cannot be in any metro's bbox,
    so it cannot be placed - and it used to be dropped here without a word, which
    is how the eight consolidated city-county governments disappeared from every
    metro build while still being settlements in the export. They are named on
    stderr, with their population, so the gap is visible in the build that has it.
    """
    settlements = []
    unplaced = []
    path = dist_dir / "settlements.jsonl.gz"
    with gzip.open(path, "rt", encoding="utf-8") as h:
        for line in h:
            row = json.loads(line)
            if row.get("_header"):
                continue
            if row.get("longitude") is None or row.get("latitude") is None:
                unplaced.append(row)
                continue
            settlements.append(row)
    if unplaced:
        shown = ", ".join(
            f"{row.get('settlement_id')} ({row.get('name')}, pop {row.get('population', 0):,})"
            for row in unplaced[:10]
        )
        print(
            f"WARNING: {len(unplaced)} of the settlements in {path.name} have no latitude or longitude and "
            f"cannot be placed in any metro bbox: {shown}"
            + (f", and {len(unplaced) - 10} more" if len(unplaced) > 10 else "")
            + ". They are absent from every metro below and from every territory, and no file says so "
            "except this line.",
            file=sys.stderr,
        )
    return settlements


def _write_json(path: Path, payload: dict) -> None:
    """Write one wire file through a .part file and a rename.

    The same discipline as every other writer in this service: a killed build
    cannot leave a consumer reading half a file.
    """
    part = path.with_name(path.name + ".part")
    part.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    part.replace(path)


def _remove_stale(metro_dir: Path, names: list[str]) -> list[str]:
    """Delete files an earlier build wrote and this one will not. Returns what went."""
    removed = []
    for name in names:
        stale = metro_dir / name
        if stale.is_file():
            stale.unlink()
            removed.append(name)
    return removed


def build_metro_wire(
    metro_name: str,
    metro_config: dict,
    settlements: list[dict],
    out_dir: Path,
    version: int = 1,
) -> dict:
    """Build the wire files for a single metro.

    Returns what was written (``files``) and what was deliberately not
    (``absent``, with the reason in ``absent_reasons``). A metro with no
    settlements in its bbox writes nothing at all and is reported on stderr: an
    empty settlements file is the same ambiguity this build exists to remove.
    """
    bbox = metro_config["bbox"]
    name = metro_config["name"]

    # Filter settlements in bbox.
    metro_settlements = [
        s for s in settlements
        if in_bbox(float(s["longitude"]), float(s["latitude"]), bbox)
    ]

    metro_dir = out_dir / metro_name
    metro_dir.mkdir(parents=True, exist_ok=True)

    absent = dict(NOT_BUILT)
    files: list[str] = []
    if not metro_settlements:
        absent[SETTLEMENTS_FILE] = (
            f"no settlement in the published export falls inside this metro's bbox {bbox}, so there is "
            "nothing to write; check the bbox against the settlements the pipeline ships"
        )
        absent[REGION_FILE] = "written only for a metro that has settlements; see settlements.json above"
        print(
            f"WARNING: metro {metro_name} ({name}) has no settlements inside {bbox}; writing nothing for it",
            file=sys.stderr,
        )
        files = []
    else:
        # region.json: metadata
        region = {
            "version": version,
            "name": name,
            "bbox": bbox,
            "settlement_count": len(metro_settlements),
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "not_built": sorted(NOT_BUILT),
        }
        _write_json(metro_dir / REGION_FILE, region)

        # settlements.json: the settlements
        _write_json(metro_dir / SETTLEMENTS_FILE, metro_settlements)
        files = [REGION_FILE, SETTLEMENTS_FILE]

    removed = _remove_stale(metro_dir, sorted(absent))
    if removed:
        print(f"{metro_name}: removed {', '.join(removed)} left by an earlier build")

    return {
        "metro": metro_name,
        "name": name,
        "bbox": bbox,
        "settlements": len(metro_settlements),
        "files": files,
        "absent": sorted(absent),
        "absent_reasons": absent,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--config", type=Path, required=True)
    p.add_argument("--dist", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--version", type=int, default=1)
    args = p.parse_args()

    metros = load_metros(args.config)
    if not metros:
        print("No metros in config", file=sys.stderr)
        return 1

    settlements = load_settlements(args.dist)
    print(f"Loaded {len(settlements)} settlements")
    if not settlements:
        print(
            f"ERROR: not one settlement in {args.dist} has a position, so every metro would be empty; "
            "refusing to write a metro wire with nothing in it",
            file=sys.stderr,
        )
        return 1

    args.out.mkdir(parents=True, exist_ok=True)

    results = []
    for metro_name, metro_config in metros.items():
        result = build_metro_wire(
            metro_name, metro_config, settlements, args.out, args.version
        )
        results.append(result)
        print(
            f"{metro_name}: {result['settlements']} settlements, wrote {', '.join(result['files']) or 'nothing'}, "
            f"not built: {', '.join(result['absent']) or 'nothing'}"
        )

    # Summary manifest. `files` and `not_built` are the union over every metro,
    # so a consumer can see what this build as a whole produced without walking
    # the directories.
    manifest = {
        "version": args.version,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "metros": results,
        "files": sorted({name for result in results for name in result["files"]}),
        "not_built": sorted({name for result in results for name in result["absent"]}),
        "not_built_reasons": {
            name: reason
            for result in results
            for name, reason in result["absent_reasons"].items()
        },
    }
    _write_json(args.out / "MANIFEST.json", manifest)
    print(f"\nWrote {len(results)} metro wire dirs to {args.out}")
    print(f"Not built: {', '.join(manifest['not_built'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())