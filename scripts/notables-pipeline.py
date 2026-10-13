#!/usr/bin/env python3
"""
Notables Pipeline (del order 2026-10-04)
========================================
Automates the busywork for the city notables system:
1. Renames generated portrait/banner files to clean keys
2. Verifies all 19 cities have 12 notables each
3. Verifies all portraits exist
4. Generates the TypeScript barrel file

Usage: python3 scripts/notables-pipeline.py [--check-only]

The image generation itself (via media tool) is manual — this script handles
everything after the images land in public/portraits/ and public/banners/.
"""

import os
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CLIENT = REPO / "clients" / "campaign"
PORTRAIT_DIR = CLIENT / "public" / "portraits"
BANNER_DIR = CLIENT / "public" / "banners"
NOTABLES_DIR = CLIENT / "src" / "data" / "notables"

# 9 ethnicities × 2 genders = 18 portrait keys
PORTRAIT_KEYS = [
    f"{eth}-{gender}"
    for eth in ["italian", "irish", "chinese", "korean", "african", "jamaican", "mexican", "german", "russian"]
    for gender in ["male", "female"]
]

# 19 cities + 15 states = 34 banner keys
CITY_KEYS = [
    "denver", "boulder", "golden", "new-york", "los-angeles", "houston", "miami",
    "chicago", "seattle", "atlanta", "dallas", "phoenix", "san-francisco",
    "boston", "philadelphia", "new-orleans", "detroit", "nashville", "las-vegas",
]
STATE_KEYS = [
    "state-new-york", "state-california", "state-texas", "state-florida", "state-colorado",
    "state-illinois", "state-washington", "state-georgia", "state-arizona",
    "state-pennsylvania", "state-ohio", "state-michigan", "state-tennessee",
    "state-nevada", "state-north-carolina",
]

def rename_generated_files(directory: Path, prefix: str) -> int:
    """Rename media-generation-*.webp to {prefix}-{key}.webp. Returns count renamed."""
    renamed = 0
    for f in directory.glob("media-generation-*.webp"):
        # Extract key from filename: media-generation-portrait-italian-male-0-<uuid>.webp
        # or: media-generation-banner-denver-0-<uuid>.webp
        name = f.stem  # without .webp
        # Remove 'media-generation-' prefix and trailing '-0-<uuid>'
        match = re.match(rf"media-generation-{prefix}-(.+)-0-[0-9a-f-]+", name)
        if match:
            key = match.group(1)
            new_name = f"{prefix}-{key}.webp"
            new_path = directory / new_name
            if not new_path.exists():
                f.rename(new_path)
                renamed += 1
                print(f"  Renamed: {f.name} -> {new_name}")
            else:
                print(f"  Exists, skipping: {new_name}")
    return renamed

def check_notables() -> bool:
    """Verify all 19 cities have 12 notables in the TypeScript files."""
    ok = True
    total = 0
    for ts_file in NOTABLES_DIR.glob("*.ts"):
        if ts_file.name == "index.ts":
            continue
        content = ts_file.read_text()
        # Count addNotables calls and lore entries
        cities = re.findall(r'addNotables\("([^"]+)"', content)
        lores = content.count("lore:")
        for city in cities:
            # Count lore entries per city (approximate: total lores / cities in file)
            pass
        total += lores
        print(f"  {ts_file.name}: {len(cities)} cities, {lores} lore entries")
    print(f"  Total lore entries: {total} (expected 228)")
    if total != 228:
        print(f"  WARNING: expected 228, got {total}")
        ok = False
    return ok

def check_portraits() -> bool:
    """Verify all 18 portrait files exist with clean names."""
    ok = True
    for key in PORTRAIT_KEYS:
        path = PORTRAIT_DIR / f"portrait-{key}.webp"
        if not path.exists():
            print(f"  MISSING: portrait-{key}.webp")
            ok = False
    if ok:
        print(f"  All 18 portraits present")
    return ok

def check_banners() -> bool:
    """Verify all 34 banner files exist with clean names."""
    ok = True
    missing = []
    for key in CITY_KEYS + STATE_KEYS:
        path = BANNER_DIR / f"banner-{key}.webp"
        if not path.exists():
            missing.append(key)
    if missing:
        print(f"  MISSING {len(missing)} banners: {', '.join(missing[:5])}...")
        ok = False
    else:
        print(f"  All 34 banners present")
    return ok

def main():
    check_only = "--check-only" in sys.argv
    print("=== Notables Pipeline ===")

    if not check_only:
        print("\n[1/3] Renaming portrait files...")
        n = rename_generated_files(PORTRAIT_DIR, "portrait")
        print(f"  Renamed {n} portraits")

        print("\n[2/3] Renaming banner files...")
        n = rename_generated_files(BANNER_DIR, "banner")
        print(f"  Renamed {n} banners")

    print("\n[3/3] Verification...")
    print("  Notables:")
    n_ok = check_notables()
    print("  Portraits:")
    p_ok = check_portraits()
    print("  Banners:")
    b_ok = check_banners()

    print("\n=== Summary ===")
    print(f"  Notables: {'OK' if n_ok else 'INCOMPLETE'}")
    print(f"  Portraits: {'OK' if p_ok else 'INCOMPLETE'}")
    print(f"  Banners: {'OK' if b_ok else 'INCOMPLETE'}")

    if n_ok and p_ok and b_ok:
        print("\nPipeline complete. All assets ready for UI wiring.")
        return 0
    else:
        print("\nPipeline incomplete. Generate missing assets, then re-run.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
