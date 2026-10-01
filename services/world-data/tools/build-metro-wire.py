#!/usr/bin/env python3
"""Tier 2B-66: Per-metro wire deploy.

Generates versioned wire files for each of the 4 priority metros:
  dist/wire/<metro>/region.json
  dist/wire/<metro>/settlements.json
  dist/wire/<metro>/network.json
  dist/wire/<metro>/travel.json

Metro bboxes come from config/world_data.toml [metros.*].
"""

from __future__ import annotations

import argparse
import gzip
import json
import sys
import tomllib
from pathlib import Path


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
    """Load all settlements from dist."""
    settlements = []
    path = dist_dir / "settlements.jsonl.gz"
    with gzip.open(path, "rt") as h:
        for line in h:
            row = json.loads(line)
            if row.get("_header"):
                continue
            if row.get("longitude") is None or row.get("latitude") is None:
                continue
            settlements.append(row)
    return settlements


def build_metro_wire(
    metro_name: str,
    metro_config: dict,
    settlements: list[dict],
    out_dir: Path,
    version: int = 1,
) -> dict:
    """Build wire files for a single metro."""
    bbox = metro_config["bbox"]
    name = metro_config["name"]

    # Filter settlements in bbox.
    metro_settlements = [
        s for s in settlements
        if in_bbox(float(s["longitude"]), float(s["latitude"]), bbox)
    ]

    metro_dir = out_dir / metro_name
    metro_dir.mkdir(parents=True, exist_ok=True)

    # region.json: metadata
    region = {
        "version": version,
        "name": name,
        "bbox": bbox,
        "settlement_count": len(metro_settlements),
    }
    (metro_dir / "region.json").write_text(json.dumps(region, indent=2))

    # settlements.json: the settlements
    (metro_dir / "settlements.json").write_text(
        json.dumps(metro_settlements, indent=2)
    )

    # network.json: placeholder (would contain road/rail geometry)
    # For now, empty — the full network is in the main wire.
    network = {
        "version": version,
        "metro": metro_name,
        "note": "Full network in main wire; metro subset TBD",
        "edges": [],
    }
    (metro_dir / "network.json").write_text(json.dumps(network, indent=2))

    # travel.json: placeholder for travel graph subset
    travel = {
        "version": version,
        "metro": metro_name,
        "note": "Travel graph subset TBD",
        "edges": [],
    }
    (metro_dir / "travel.json").write_text(json.dumps(travel, indent=2))

    return {
        "metro": metro_name,
        "settlements": len(metro_settlements),
        "files": ["region.json", "settlements.json", "network.json", "travel.json"],
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

    results = []
    for metro_name, metro_config in metros.items():
        result = build_metro_wire(
            metro_name, metro_config, settlements, args.out, args.version
        )
        results.append(result)
        print(f"{metro_name}: {result['settlements']} settlements")

    # Summary manifest
    manifest = {
        "version": args.version,
        "metros": results,
    }
    (args.out / "MANIFEST.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nWrote {len(results)} metro wire dirs to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
