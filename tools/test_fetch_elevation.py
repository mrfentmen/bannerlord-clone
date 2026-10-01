"""Tests for tools/fetch-elevation-tiles.py."""
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TOOLS = REPO / "tools"


def test_fetch_single_tile(tmp_path):
    """Fetch one real tile from the AWS Open Data bucket."""
    region = {
        "elevation": {
            "tiles": [{"z": 12, "x": 1077, "y": 1541, "path": "elevation/12/1077/1541.png"}]
        }
    }
    rp = tmp_path / "region.json"
    rp.write_text(json.dumps(region))
    out = tmp_path / "elevation"
    r = subprocess.run(
        [sys.executable, str(TOOLS / "fetch-elevation-tiles.py"),
         "--region", str(rp), "--out", str(out), "--workers", "1"],
        capture_output=True, text=True, cwd=REPO,
    )
    assert r.returncode == 0, r.stderr
    tile = out / "12" / "1077" / "1541.png"
    assert tile.exists()
    assert tile.stat().st_size > 0


def test_fetch_skips_existing(tmp_path):
    """Existing tiles are not re-downloaded."""
    region = {
        "elevation": {
            "tiles": [{"z": 12, "x": 1077, "y": 1541, "path": "elevation/12/1077/1541.png"}]
        }
    }
    rp = tmp_path / "region.json"
    rp.write_text(json.dumps(region))
    out = tmp_path / "elevation"
    tile = out / "12" / "1077" / "1541.png"
    tile.parent.mkdir(parents=True)
    tile.write_bytes(b"fake")
    r = subprocess.run(
        [sys.executable, str(TOOLS / "fetch-elevation-tiles.py"),
         "--region", str(rp), "--out", str(out), "--workers", "1"],
        capture_output=True, text=True, cwd=REPO,
    )
    assert r.returncode == 0
    # File should be untouched (still the fake bytes)
    assert tile.read_bytes() == b"fake"
