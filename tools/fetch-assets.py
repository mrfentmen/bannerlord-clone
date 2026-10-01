#!/usr/bin/env python3
"""
Fetch asset originals listed in assets/manifest.json.

Downloads each asset's `download_url` into assets/originals/ and verifies
the SHA-256 against the manifest. Skips files that already exist with a
matching hash. Fails loudly on any mismatch so a corrupt or substituted
archive never enters the build.

Usage:
    python tools/fetch-assets.py [--manifest PATH] [--originals DIR] [--force]
"""
import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "bannerlord-clone-asset-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=300) as resp, tmp.open("wb") as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    tmp.replace(dest)


def main() -> int:
    ap = argparse.ArgumentParser(description="Fetch asset originals from the manifest.")
    ap.add_argument("--manifest", default="assets/manifest.json")
    ap.add_argument("--originals", default="assets/originals")
    ap.add_argument("--force", action="store_true", help="Re-download even if the hash matches.")
    args = ap.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    originals_dir = Path(args.originals)

    failures = 0
    for entry in manifest.get("assets", []):
        asset_id = entry.get("id", "<unknown>")
        url = entry.get("download_url", "")
        expected = entry.get("sha256", "")
        rel_path = entry.get("path", "")
        if not url or not expected or not rel_path:
            print(f"FAIL: {asset_id}: manifest entry missing download_url/sha256/path", file=sys.stderr)
            failures += 1
            continue

        dest = originals_dir / Path(rel_path).name
        if dest.exists() and not args.force:
            if sha256_file(dest).lower() == expected.lower():
                print(f"SKIP: {asset_id} (already present, hash matches)")
                continue
            print(f"RETRY: {asset_id} (existing file hash mismatch, re-downloading)")

        print(f"GET: {asset_id} -> {dest}")
        try:
            download(url, dest)
        except Exception as e:
            print(f"FAIL: {asset_id}: download failed: {e}", file=sys.stderr)
            failures += 1
            continue

        actual = sha256_file(dest)
        if actual.lower() != expected.lower():
            print(
                f"FAIL: {asset_id}: hash mismatch after download\n"
                f"  expected: {expected}\n"
                f"  actual:   {actual}",
                file=sys.stderr,
            )
            failures += 1
            continue
        print(f"OK: {asset_id} ({dest.stat().st_size} bytes)")

    if failures:
        print(f"\n{failures} fetch(es) FAILED", file=sys.stderr)
        return 1
    print("\nAll assets fetched and verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
