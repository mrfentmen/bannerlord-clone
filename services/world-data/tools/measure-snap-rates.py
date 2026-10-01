"""MASTER_PLAN Hana Tier 1A-1: measure per-metro primary-road snap rates.

Loads the real pipeline machinery (Config, SettlementIndex, _load_lines),
snaps every TIGER/Line primary-road polyline to the exported settlements with
the current 20 km rule, and bins each line by metro (by vertex midpoint).

Reports per metro: % of lines snapping at both ends / one end / neither.

Run:  PYTHONPATH=<repo>/services/world-data/src python3 measure-snap-rates.py
"""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "services/world-data/src"))

from worlddata.config import load_config
from worlddata.transforms.roads import GeometryStore, _load_lines

# Metro bounding boxes (lat_min, lat_max, lon_min, lon_max), approximating the
# Census Combined Statistical Area cores. Documented here so the measurement is
# reproducible; widening them changes the denominator, not the method.
METROS = {
    "nyc": (40.3, 41.2, -74.7, -73.4),
    "la": (33.5, 34.5, -118.9, -117.4),
    "houston": (29.2, 30.4, -96.1, -94.7),
    "miami": (25.4, 26.5, -80.7, -79.7),
}


def load_settlement_points() -> dict[str, tuple[float, float]]:
    points: dict[str, tuple[float, float]] = {}
    with gzip.open(
        REPO_ROOT / "services/world-data/exports/settlements.jsonl.gz", "rt", encoding="utf-8"
    ) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if "_header" in row:
                continue
            lat, lon = row["latitude"], row["longitude"]
            if lat is None or lon is None:
                continue
            # Coord convention is (lon, lat); SettlementIndex grids on lon first.
            points[row["settlement_id"]] = (lon, lat)
    return points


def metro_of(lon: float, lat: float) -> str | None:
    for name, (la0, la1, lo0, lo1) in METROS.items():
        if la0 <= lat <= la1 and lo0 <= lon <= lo1:
            return name
    return None


def main() -> None:
    archive = sys.argv[1] if len(sys.argv) > 1 else "tl_2023_us_primaryroads.zip"
    kind = "rail" if "rails" in archive else "road"
    config = load_config(REPO_ROOT / "services/world-data/config/world_data.toml")
    print(f"archive = {archive}")
    print(f"snap_radius_km_by_class = {config.travel.snap_radius_km_by_class}")
    points = load_settlement_points()
    print(f"settlements = {len(points)}")

    import os

    store_path = Path(f"/tmp/snap-analysis-geometry-{os.getpid()}.jsonl")
    store = GeometryStore(store_path).open_for_write()
    segments, notes = _load_lines(config, archive, kind, points, store)
    store.close()
    for note in notes:
        print("note:", note)

    store2 = GeometryStore(store_path)
    stats: dict[str, dict[str, int]] = {
        name: {"both": 0, "one": 0, "neither": 0, "total": 0} for name in METROS
    }
    global_stats = {"both": 0, "one": 0, "neither": 0, "total": 0}

    for seg in segments:
        verts = store2.read(seg.segment_id)
        if not verts:
            continue
        mid_lon = sum(v[0] for v in verts) / len(verts)
        mid_lat = sum(v[1] for v in verts) / len(verts)
        metro = metro_of(mid_lon, mid_lat)
        snapped_ends = (1 if seg.from_settlement_id else 0) + (
            1 if seg.to_settlement_id else 0
        )
        bucket = "both" if snapped_ends == 2 else "one" if snapped_ends == 1 else "neither"
        global_stats[bucket] += 1
        global_stats["total"] += 1
        if metro:
            stats[metro][bucket] += 1
            stats[metro]["total"] += 1

    def row(label: str, s: dict[str, int]) -> None:
        t = s["total"]
        if not t:
            print(f"{label:>10}: no lines in box")
            return
        print(
            f"{label:>10}: n={t:6d}  both={s['both']/t:6.1%}  "
            f"one={s['one']/t:6.1%}  neither={s['neither']/t:6.1%}"
        )

    print("\nPer-metro primary-road snap rates (current 20 km rule):")
    for name in METROS:
        row(name, stats[name])
    row("national", global_stats)

    # Snap-distance distribution: every endpoint that snapped, per metro.
    # Used to justify the per-class radii in Tier 1A-2 (a radius that keeps
    # ~99% of real snaps while cutting the long tail of phantoms).
    import statistics

    dists: dict[str, list[float]] = {name: [] for name in METROS}
    dists["national"] = []
    for seg in segments:
        verts = store2.read(seg.segment_id)
        if not verts:
            continue
        mid_lon = sum(v[0] for v in verts) / len(verts)
        mid_lat = sum(v[1] for v in verts) / len(verts)
        metro = metro_of(mid_lon, mid_lat)
        for d in (seg.snap_from_km, seg.snap_to_km):
            if d is None:
                continue
            dists["national"].append(d)
            if metro:
                dists[metro].append(d)

    print("\nSnap-distance percentiles (km) for endpoints that snapped:")
    for name in ("nyc", "la", "houston", "miami", "national"):
        ds = sorted(dists[name])
        if not ds:
            print(f"{name:>10}: no snaps")
            continue
        qs = statistics.quantiles(ds, n=100, method="inclusive")
        print(
            f"{name:>10}: n={len(ds):6d}  p50={qs[49]:5.2f}  p90={qs[89]:5.2f}  "
            f"p95={qs[94]:5.2f}  p99={qs[98]:5.2f}  max={ds[-1]:6.2f}"
        )

    # Per-road-class breakdown (primary vs secondary from the MTFCC mapping),
    # national only — the evidence base for the Tier 1A-2 per-class radii.
    by_class: dict[str, list[float]] = {}
    for seg in segments:
        for d in (seg.snap_from_km, seg.snap_to_km):
            if d is None:
                continue
            by_class.setdefault(seg.road_class, []).append(d)
    print("\nSnap-distance percentiles (km) by road class, national:")
    for cls in sorted(by_class):
        ds = sorted(by_class[cls])
        qs = statistics.quantiles(ds, n=100, method="inclusive")
        print(
            f"{cls:>10}: n={len(ds):6d}  p50={qs[49]:5.2f}  p90={qs[89]:5.2f}  "
            f"p95={qs[94]:5.2f}  p99={qs[98]:5.2f}  max={ds[-1]:6.2f}"
        )


if __name__ == "__main__":
    main()
