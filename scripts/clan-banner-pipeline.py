#!/usr/bin/env python3
"""
Clan banner pipeline (del order 2026-10-04).

1. Renames generated shape/symbol files to clean canonical names.
2. Moves city skyline banners to concept-art/ (kept for loading screens).
3. Verifies all expected assets exist.

Usage: python3 scripts/clan-banner-pipeline.py
"""

import re
import shutil
import sys
from pathlib import Path

REPO = Path("/home/hatch/workspace/bannerlord-clone")
BANNERS = REPO / "clients/campaign/public/banners"
SHAPES = BANNERS / "shapes"
SYMBOLS = BANNERS / "symbols"
CONCEPT = BANNERS / "concept-art"

SHAPE_NAMES = ["rectangle", "swallowtail", "pennant", "heater", "triple-point", "war-flag"]

SYMBOL_NAMES = [
    "wolf", "bear", "eagle", "lion", "dragon", "crossed-swords", "shield", "star",
    "sun", "crescent", "lightning", "skull", "crown", "horse", "arrow", "axe",
    "spear", "mountain", "wave", "oak", "flame", "raven", "serpent", "fist",
    # Batch 2 (del order 2026-10-04): more symbols
    "bull", "stag", "boar", "falcon", "owl", "scorpion", "castle", "key",
    "hammer", "anchor", "compass", "dagger", "bow", "diamond", "eye", "wings",
]

def clean_generated(directory: Path, prefix: str, names: list[str], out_prefix: str) -> int:
    """Rename media-generation-<prefix>-<name>-*.webp to <out_prefix>-<name>.webp."""
    count = 0
    # Also check parent banners dir for misplaced shapes/symbols
    search_dirs = [directory]
    if directory != BANNERS:
        search_dirs.append(BANNERS)
    for search in search_dirs:
        for f in list(search.glob(f"media-generation-banner-{prefix}-*.webp")):
            # Extract the name: media-generation-banner-shape-<name>-<uuid>.webp
            # or media-generation-banner-symbol-<name>-<uuid>.webp
            stem = f.stem  # without .webp
            # Remove media-generation- prefix and trailing -<uuid>
            rest = stem[len("media-generation-"):]
            # rest = banner-shape-rectangle-0-<uuid> or banner-symbol-wolf-0-<uuid>
            m = re.match(rf"banner-{prefix}-(.+?)-\d+-[0-9a-f-]+$", rest)
            if not m:
                # Try without the -0- part
                m = re.match(rf"banner-{prefix}-(.+?)-[0-9a-f-]{{8}}-[0-9a-f-]{{4}}-[0-9a-f-]{{4}}-[0-9a-f-]{{4}}-[0-9a-f-]+$", rest)
            if not m:
                print(f"  WARN: could not parse {f.name}")
                continue
            raw_name = m.group(1)
            # Normalize: find matching canonical name
            canonical = None
            for n in names:
                if raw_name == n or raw_name.replace("-", "") == n.replace("-", ""):
                    canonical = n
                    break
            if not canonical:
                print(f"  WARN: no canonical match for '{raw_name}' in {f.name}")
                continue
            dest = directory / f"{out_prefix}-{canonical}.webp"
            if dest.exists():
                dest.unlink()
            shutil.move(str(f), str(dest))
            # Remove the .json sidecar if present
            sidecar = f.with_suffix(".json")
            # sidecar is media-generation-....json (stem + .json)
            sidecar_path = search / (f.stem + ".json")
            if sidecar_path.exists():
                sidecar_path.unlink()
            count += 1
    return count

def move_concept_art() -> int:
    """Move city skyline banners to concept-art/."""
    CONCEPT.mkdir(parents=True, exist_ok=True)
    count = 0
    for f in list(BANNERS.glob("banner-*.webp")):
        # Skip shape/symbol files (they're in subdirs or have those prefixes)
        if f.name.startswith("banner-shape-") or f.name.startswith("banner-symbol-"):
            continue
        dest = CONCEPT / f.name
        if dest.exists():
            dest.unlink()
        shutil.move(str(f), str(dest))
        count += 1
    # Also move any remaining media-generation city files
    for f in list(BANNERS.glob("media-generation-banner-*.webp")):
        stem = f.stem[len("media-generation-"):]
        # Skip shapes/symbols (handled above)
        if stem.startswith("banner-shape-") or stem.startswith("banner-symbol-"):
            continue
        # Derive clean name
        m = re.match(r"banner-(.+?)-\d+-[0-9a-f-]+$", stem)
        if m:
            dest = CONCEPT / f"banner-{m.group(1)}.webp"
            if dest.exists():
                dest.unlink()
            shutil.move(str(f), str(dest))
            sidecar = BANNERS / (f.stem + ".json")
            if sidecar.exists():
                sidecar.unlink()
            count += 1
    return count

def verify() -> bool:
    ok = True
    for n in SHAPE_NAMES:
        p = SHAPES / f"shape-{n}.webp"
        if not p.exists():
            # Also check BANNERS dir
            p2 = BANNERS / f"shape-{n}.webp"
            if p2.exists():
                SHAPES.mkdir(parents=True, exist_ok=True)
                shutil.move(str(p2), str(p))
            else:
                print(f"  MISSING shape: {n}")
                ok = False
    for n in SYMBOL_NAMES:
        p = SYMBOLS / f"symbol-{n}.webp"
        if not p.exists():
            p2 = BANNERS / f"symbol-{n}.webp"
            if p2.exists():
                SYMBOLS.mkdir(parents=True, exist_ok=True)
                shutil.move(str(p2), str(p))
            else:
                print(f"  MISSING symbol: {n}")
                ok = False
    return ok

def main() -> int:
    print("== Clan banner pipeline ==")
    print("Renaming shapes...")
    n_shapes = clean_generated(SHAPES, "shape", SHAPE_NAMES, "shape")
    print(f"  {n_shapes} shapes renamed")
    print("Renaming symbols...")
    n_symbols = clean_generated(SYMBOLS, "symbol", SYMBOL_NAMES, "symbol")
    print(f"  {n_symbols} symbols renamed")
    print("Moving city banners to concept-art/...")
    n_concept = move_concept_art()
    print(f"  {n_concept} concept art files moved")
    print("Verifying...")
    if verify():
        print("  All 6 shapes + 24 symbols present.")
        print("PIPELINE OK")
        return 0
    print("PIPELINE FAILED: missing assets")
    return 1

if __name__ == "__main__":
    sys.exit(main())
