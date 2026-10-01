"""Tests for tools/manifest-check.py, fetch-assets.py, and build-inventory.py."""
import json
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
TOOLS = REPO / "tools"


def run_tool(name, *args):
    return subprocess.run(
        [sys.executable, str(TOOLS / name), *args],
        capture_output=True, text=True, cwd=REPO,
    )


def test_manifest_check_passes_on_real_manifest():
    r = run_tool("manifest-check.py")
    assert r.returncode == 0, r.stderr
    # count-agnostic: processed assets append entries to the same manifest
    assert "assets verified" in r.stdout


def test_manifest_check_fails_on_hash_mismatch(tmp_path):
    manifest = {
        "assets": [{
            "id": "fake",
            "path": "assets/originals/fake.zip",
            "sha256": "0" * 64,
            "licence": "CC0-1.0",
            "licence_copy": "assets/licenses/CC0-1.0-legalcode.txt",
        }]
    }
    mp = tmp_path / "manifest.json"
    mp.write_text(json.dumps(manifest))
    od = tmp_path / "originals"
    od.mkdir()
    (od / "fake.zip").write_bytes(b"not a real zip")
    r = run_tool("manifest-check.py", "--manifest", str(mp), "--originals", str(od))
    assert r.returncode == 1
    assert "hash mismatch" in r.stderr


def test_manifest_check_fails_on_missing_licence_copy(tmp_path):
    manifest = {
        "assets": [{
            "id": "fake",
            "path": "assets/originals/fake.zip",
            "sha256": "0" * 64,
            "licence": "CC0-1.0",
            "licence_copy": "assets/licenses/DOES-NOT-EXIST.txt",
        }]
    }
    mp = tmp_path / "manifest.json"
    mp.write_text(json.dumps(manifest))
    r = run_tool("manifest-check.py", "--manifest", str(mp), "--originals", str(tmp_path))
    assert r.returncode == 1
    assert "licence copy missing" in r.stderr


def test_build_inventory_counts_match_manifest():
    out = REPO / "assets" / "extraction-inventory.json"
    assert out.exists(), "run tools/build-inventory.py first"
    inv = json.loads(out.read_text())
    counts = {p["id"]: p["glb_count"] for p in inv["packs"]}
    assert counts["kenney_city_kit_suburban"] == 40
    assert counts["kenney_city_kit_commercial"] == 41
    assert counts["kenney_city_kit_industrial"] == 37
    assert counts["kenney_city_kit_roads"] == 95
    assert sum(counts.values()) == 213


def test_build_inventory_models_sorted_and_have_crc():
    inv = json.loads((REPO / "assets" / "extraction-inventory.json").read_text())
    for pack in inv["packs"]:
        paths = [m["path"] for m in pack["models"]]
        assert paths == sorted(paths)
        for m in pack["models"]:
            assert m["path"].endswith(".glb")
            assert m["bytes"] > 0
            assert len(m["crc32"]) == 8
