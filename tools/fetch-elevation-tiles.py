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
import struct
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ELEVATION_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def validate_png(path: Path) -> tuple:
    """Walk the PNG chunk structure so truncated downloads are caught.

    Magic bytes alone do not prove a file is complete: this sandbox's egress
    proxy used to cut streams mid-body, which still leaves a valid-looking
    header. Require a parseable chunk chain that terminates in IEND.
    """
    data = path.read_bytes()
    if not data.startswith(PNG_MAGIC):
        return False, f"bad magic ({data[:8]!r})"
    pos = len(PNG_MAGIC)
    saw_ihdr = False
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos:pos + 4])[0]
        ctype = data[pos + 4:pos + 8]
        end = pos + 12 + length
        if end > len(data):
            return False, f"truncated in {ctype.decode('ascii', 'replace')} chunk"
        if ctype == b"IHDR":
            saw_ihdr = True
        pos = end
        if ctype == b"IEND":
            return (True, f"valid ({len(data)} bytes)") if saw_ihdr else (False, "no IHDR")
    return False, "missing IEND (truncated)"


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
        # curl, not urllib: the egress proxy truncates urllib streams.
        subprocess.run(
            ["curl", "-sS", "--fail", "--retry", "3", "--retry-all-errors",
             "--max-time", "120", "-H", "User-Agent: bannerlord-clone-elevation-fetch/1.0",
             "-o", str(tmp), url],
            check=True, capture_output=True, text=True,
        )
        ok, detail = validate_png(tmp)
        if not ok:
            raise ValueError(f"invalid PNG: {detail}")
        tmp.replace(dest)
        return f"OK: {z}/{x}/{y} ({detail})"
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
