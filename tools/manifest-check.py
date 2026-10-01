#!/usr/bin/env python3
"""
Verify asset originals against assets/manifest.json.

Fails the build if any manifest-listed asset is missing from
assets/originals/ or its SHA-256 does not match, so an unlicensed or
uncredited asset cannot ship.

Usage:
    python tools/manifest-check.py [--manifest PATH] [--originals DIR]
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify asset originals against the manifest.")
    ap.add_argument("--manifest", default="assets/manifest.json")
    ap.add_argument("--originals", default="assets/originals")
    args = ap.parse_args()

    manifest_path = Path(args.manifest)
    originals_dir = Path(args.originals)

    try:
        manifest = json.loads(manifest_path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        print(f"FAIL: cannot read manifest {manifest_path}: {e}", file=sys.stderr)
        return 1

    assets = manifest.get("assets", [])
    if not assets:
        print("FAIL: manifest has no assets", file=sys.stderr)
        return 1

    failures = 0
    for entry in assets:
        asset_id = entry.get("id", "<unknown>")
        rel_path = entry.get("path", "")
        expected = entry.get("sha256", "")
        licence = entry.get("licence", "")
        licence_copy = entry.get("licence_copy", "")

        if not rel_path or not expected:
            print(f"FAIL: {asset_id}: manifest entry missing path or sha256", file=sys.stderr)
            failures += 1
            continue

        # Licence provenance is required for every asset.
        if not licence or not licence_copy:
            print(f"FAIL: {asset_id}: missing licence or licence_copy", file=sys.stderr)
            failures += 1
            continue
        if not (Path(licence_copy)).exists():
            print(f"FAIL: {asset_id}: licence copy missing: {licence_copy}", file=sys.stderr)
            failures += 1
            continue

        # The originals live under the originals dir; manifest path is repo-relative.
        local = originals_dir / Path(rel_path).name
        if not local.exists():
            print(f"FAIL: {asset_id}: missing original: {local}", file=sys.stderr)
            failures += 1
            continue

        actual = sha256_file(local)
        if actual.lower() != expected.lower():
            print(
                f"FAIL: {asset_id}: hash mismatch\n"
                f"  expected: {expected}\n"
                f"  actual:   {actual}",
                file=sys.stderr,
            )
            failures += 1
            continue

        print(f"OK: {asset_id} ({local.stat().st_size} bytes)")

    if failures:
        print(f"\n{failures} asset check(s) FAILED", file=sys.stderr)
        return 1
    print(f"\nAll {len(assets)} assets verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
