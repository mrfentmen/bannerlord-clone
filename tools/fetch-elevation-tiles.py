#!/usr/bin/env python3
"""
Fetch terrarium elevation tiles listed in the wire region.json.

Downloads each tile from the AWS Open Data elevation-tiles-prod bucket
and writes it to the client's public/world/elevation/ tree. Skips tiles
that already exist. Fails loudly on any download error.

Usage:
    python tools/fetch-elevation-tiles.py [--region PATH] [--out DIR] [--workers N]
"""
import argparse
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ELEVATION_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"


def download_tile(tile, out_dir: Path) -> str:
    z, x, y = tile["z"], tile["x"], tile["y"]
    rel = tile.get("path", f"elevation/{z}/{x}/{y}.png")
    # Strip the leading elevation/ if present; out_dir is the elevation root.
    if rel.startswith("elevation/"):
        rel = rel[len("elevation/"):]
    dest = out_dir / rel
    if dest.exists() and dest.stat().st_size > 0:
        return f"SKIP: {z}/{x}/{y}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = f"{ELEVATION_URL}/{z}/{x}/{y}.png"
    tmp = dest.with_suffix(".part")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "bannerlord-clone-elevation-fetch/1.0"})
        with urllib.request.urlopen(req, timeout=60) as resp, tmp.open("wb") as f:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
        tmp.replace(dest)
        return f"OK: {z}/{x}/{y} ({dest.stat().st_size} bytes)"
    except Exception as e:
        if tmp.exists():
            tmp.unlink()
        return f"FAIL: {z}/{x}/{y}: {e}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch terrarium elevation tiles.")
    ap.add_argument("--region", default="services/world-data/exports/wire/region.json")
    ap.add_argument("--out", default="clients/campaign/public/world/elevation")
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    region = json.loads(Path(args.region).read_text())
    tiles = region["elevation"]["tiles"]
    out_dir = Path(args.out)

    print(f"Fetching {len(tiles)} tiles with {args.workers} workers...")
    failures = 0
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(download_tile, t, out_dir): t for t in tiles}
        for fut in as_completed(futures):
            result = fut.result()
            done += 1
            if result.startswith("FAIL"):
                failures += 1
                print(result, file=sys.stderr)
            elif done % 200 == 0:
                print(f"  {done}/{len(tiles)}...")
    
    print(f"\nDone: {done - failures} fetched/skipped, {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
