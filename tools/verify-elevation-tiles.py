#!/usr/bin/env python3
"""
Verify every elevation tile a region manifest references really is on disk,
is a complete PNG, and decodes to real terrarium elevation.

The failure this exists to catch is a tile that is present but useless: an
empty file, a stream the egress proxy truncated mid-body, or an all-zero
placeholder. Any of those decode to "sea level everywhere" (or, for a
zeroed terrarium byte triple, to -32768 m void) and quietly flatten the
campaign terrain, so a size check alone is not enough -- every tile is
decoded and its elevation range is inspected.

Two tiers are treated differently, because the repository documents them
differently (see clients/campaign/public/world/DATA-MANIFEST.md section 2.1):

  boot   (`elevation`)         must be on disk. The client fetches all of these
                               before the map draws and throws on the first
                               missing one, so an incomplete boot tier is a
                               broken game start.
  detail (`elevationDetail`)   fetched on demand at roughly 250 MB. Absence is
                               reported, not failed -- but any tile that IS
                               present is held to the same standard as boot.

Usage:
    python tools/verify-elevation-tiles.py [--region PATH ...] [--strict-detail]

Exit status is 0 when every required tile verifies, 1 otherwise.
"""
import argparse
import json
import struct
import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[1]
DEFAULT_REGIONS = [
    REPO / "services/world-data/exports/wire/region.json",
    REPO / "clients/campaign/public/world/region.json",
]
WORLD_ROOTS = [
    REPO / "clients/campaign/public/world",
    REPO / "services/world-data/exports/wire",
]
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
VOID_METRES = -32768.0

# A tile carrying no relief at all is a fill, not terrain, however cleanly it
# decodes. The measure is on decoded metres, not on any single channel:
# terrarium spends 256 m of range per step of R, so genuinely flat but real
# ground (a river plain, a lake surface) legitimately holds R constant and
# varies only G. Counting distinct R called those tiles corrupt when they are
# not. Distinct elevation values is what separates relief from fill.
MIN_DISTINCT_ELEVATIONS = 2


def png_chunk_problem(data: bytes) -> str | None:
    """Return a reason the PNG is unusable, or None if the chunk chain is sound.

    Mirrors the check in fetch-elevation-tiles.py: magic bytes alone do not
    prove completeness, because a stream cut mid-body still leaves a valid
    header. Require a parseable chain terminating in IEND.
    """
    if not data.startswith(PNG_MAGIC):
        return f"bad magic ({data[:8]!r})"
    pos = len(PNG_MAGIC)
    saw_ihdr = False
    while pos + 8 <= len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        ctype = data[pos + 4 : pos + 8]
        end = pos + 12 + length
        if end > len(data):
            return f"truncated in {ctype.decode('ascii', 'replace')} chunk"
        if ctype == b"IHDR":
            saw_ihdr = True
        pos = end
        if ctype == b"IEND":
            if not saw_ihdr:
                return "no IHDR chunk"
            return None
    return "missing IEND (truncated)"


def decode_terrarium(path: Path) -> tuple[float, float, int]:
    """Return (min metres, max metres, distinct elevation values) for a tile."""
    with Image.open(path) as im:
        pixels = list(im.convert("RGB").getdata())
    values = {r * 256 + g + b / 256 - 32768 for r, g, b in pixels}
    if not values:
        return float("nan"), float("nan"), 0
    return min(values), max(values), len(values)


def locate(rel_path: str) -> Path | None:
    """Resolve a manifest tile path against every world root that holds one."""
    for root in WORLD_ROOTS:
        candidate = root / rel_path
        if candidate.exists():
            return candidate
    return None


def check_tile(rel_path: str) -> tuple[str, str]:
    """Return (status, detail). status is OK, FAIL, or ABSENT."""
    found = locate(rel_path)
    if found is None:
        return "ABSENT", rel_path
    size = found.stat().st_size
    if size == 0:
        return "FAIL", f"{rel_path}: zero bytes"
    problem = png_chunk_problem(found.read_bytes())
    if problem is not None:
        return "FAIL", f"{rel_path}: {problem} ({size} bytes)"
    try:
        lo, hi, distinct = decode_terrarium(found)
    except Exception as exc:  # a PNG that passes the chunk walk can still not decode
        return "FAIL", f"{rel_path}: does not decode ({exc})"
    if hi <= VOID_METRES:
        return "FAIL", f"{rel_path}: entirely void ({hi:.0f} m)"
    if distinct < MIN_DISTINCT_ELEVATIONS:
        return "FAIL", f"{rel_path}: zero-filled, {distinct} distinct elevation(s)"
    return "OK", f"{rel_path}: {lo:.0f}..{hi:.0f} m, {distinct} levels, {size} B"


def referenced_paths(region: dict) -> list[tuple[str, str, bool]]:
    """Every tile a manifest names as (tier_key, rel_path, required)."""
    out = []
    for key, required in (("elevation", True), ("elevationDetail", False)):
        tier = region.get(key)
        if not isinstance(tier, dict):
            continue
        for tile in tier.get("tiles", []):
            z, x, y = tile["z"], tile["x"], tile["y"]
            rel = tile.get("path", f"elevation/{z}/{x}/{y}.png")
            out.append((key, rel, required))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify referenced elevation tiles decode.")
    ap.add_argument("--region", action="append", type=Path, default=None)
    ap.add_argument(
        "--strict-detail",
        action="store_true",
        help="treat the on-demand detail tier as required too",
    )
    args = ap.parse_args()

    regions = args.region or DEFAULT_REGIONS
    failures: list[str] = []
    deferred = 0
    checked = 0

    for region_path in regions:
        if not region_path.exists():
            failures.append(f"{region_path}: region manifest not found")
            continue
        region = json.loads(region_path.read_text())
        refs = referenced_paths(region)
        print(f"\n{region_path.relative_to(REPO)}")
        print(f"  region: {region.get('name', '<unnamed>')}")
        print(f"  referenced tiles: {len(refs)}")
        for key, required in (("elevation", True), ("elevationDetail", False)):
            n = sum(1 for k, _, _ in refs if k == key)
            print(f"    {key}: {n}")

        for key, rel, required in refs:
            is_required = required or (key == "elevationDetail" and args.strict_detail)
            status, detail = check_tile(rel)
            if status == "OK":
                checked += 1
            elif status == "ABSENT" and not is_required:
                deferred += 1
            else:
                failures.append(f"{region_path.name} [{key}] {detail}")

    print(f"\ntiles present and verified decoding: {checked}")
    print(f"detail-tier tiles deferred (fetched on demand): {deferred}")
    if failures:
        print(f"\nFAIL: {len(failures)} problem(s)")
        for line in failures:
            print(f"  {line}")
        return 1
    print("\nPASS: every required tile exists, is a complete PNG, and decodes "
          "to real elevation")
    return 0


if __name__ == "__main__":
    sys.exit(main())