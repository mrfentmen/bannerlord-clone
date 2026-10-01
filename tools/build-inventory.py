#!/usr/bin/env python3
"""
Build a reproducible extraction inventory for asset originals.

Reads each zip in assets/originals/, lists the GLB models it contains with
their sizes and CRC32s, and writes assets/extraction-inventory.json. The
inventory lets the build extract exactly the models it needs and detect
when an upstream pack changes.

Usage:
    python tools/build-inventory.py [--manifest PATH] [--originals DIR] [--out PATH]
"""
import argparse
import json
import zipfile
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the asset extraction inventory.")
    ap.add_argument("--manifest", default="assets/manifest.json")
    ap.add_argument("--originals", default="assets/originals")
    ap.add_argument("--out", default="assets/extraction-inventory.json")
    args = ap.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    originals_dir = Path(args.originals)

    inventory = {"packs": []}
    total_glb = 0
    for entry in manifest.get("assets", []):
        asset_id = entry["id"]
        zip_name = Path(entry["path"]).name
        zip_path = originals_dir / zip_name
        if not zip_path.exists():
            print(f"SKIP: {asset_id}: {zip_path} not present (run fetch-assets.py)")
            continue

        models = []
        with zipfile.ZipFile(zip_path) as zf:
            for info in zf.infolist():
                if info.filename.endswith(".glb"):
                    models.append({
                        "path": info.filename,
                        "bytes": info.file_size,
                        "crc32": f"{info.CRC:08x}",
                    })
        models.sort(key=lambda m: m["path"])
        total_glb += len(models)
        inventory["packs"].append({
            "id": asset_id,
            "zip": zip_name,
            "zip_sha256": entry["sha256"],
            "glb_count": len(models),
            "models": models,
        })
        print(f"{asset_id}: {len(models)} GLB models")

    Path(args.out).write_text(json.dumps(inventory, indent=2) + "\n")
    print(f"\nWrote {args.out}: {total_glb} GLB models across {len(inventory['packs'])} packs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
