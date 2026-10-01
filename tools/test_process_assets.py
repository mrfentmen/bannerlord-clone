"""Tests for tools/process-assets.py (ASSETS.md steps 4-6).

All tests run against a real Kenney GLB extracted from
assets/originals/kenney_city-kit-suburban.zip. No mocks: every number
asserted is measured from actual file bytes.
"""
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest
from PIL import Image
from pygltflib import GLTF2

REPO = Path(__file__).resolve().parents[1]
TOOLS = REPO / "tools"
ZIP = REPO / "assets" / "originals" / "kenney_city-kit-suburban.zip"
GLB_IN_ZIP = "Models/GLB format/building-type-a.glb"
TEX_IN_ZIP = "Models/GLB format/Textures/colormap.png"

REQUIRED_MANIFEST_FIELDS = {
    "id", "path", "source_url", "source_site", "author", "licence",
    "licence_copy", "date_retrieved", "attribution_text", "class",
    "lod_tiers", "modifications", "sha256",
}


def run_tool(*args):
    return subprocess.run(
        [sys.executable, str(TOOLS / "process-assets.py"), *args],
        capture_output=True, text=True, cwd=REPO,
    )


@pytest.fixture()
def staged_glb(tmp_path):
    """Extract building-type-a.glb + its texture to a temp dir."""
    with zipfile.ZipFile(ZIP) as z:
        z.extract(GLB_IN_ZIP, tmp_path)
        z.extract(TEX_IN_ZIP, tmp_path)
    glb = tmp_path / GLB_IN_ZIP
    assert glb.exists()
    return glb


def stats_of(glb):
    r = run_tool("audit", str(glb), "--class", "building")
    return r


# ---------------------------------------------------------------- audit
def test_audit_flags_scale_violation(staged_glb):
    r = stats_of(staged_glb)
    assert r.returncode == 2, r.stdout + r.stderr
    assert "SCALE" in r.stdout
    assert "height 0.834 m" in r.stdout
    assert "suggested scale factor" in r.stdout


def test_audit_passes_tri_and_texture_budgets(staged_glb):
    r = stats_of(staged_glb)
    # only the scale violation fires: tris 1174/5000, texture 512/1024 pass
    assert "TRIS:" not in r.stdout
    assert "TEXTURE:" not in r.stdout
    assert "tri budget (close): 1174 / 5000" in r.stdout
    assert "texture 'base': 512x512 (budget 1024)" in r.stdout


def test_audit_rejects_unknown_class(staged_glb):
    r = run_tool("audit", str(staged_glb), "--class", "spaceship")
    assert r.returncode != 0


# -------------------------------------------------------------- process
def test_process_normalises_scale(staged_glb, tmp_path):
    out = tmp_path / "out"
    r = run_tool("process", str(staged_glb), "--class", "building",
                 "--out", str(out))
    assert r.returncode == 0, r.stderr
    processed = out / "building-type-a.glb"
    assert processed.exists()
    # height is now the class reference height (5.0 m)
    r2 = run_tool("audit", str(processed), "--class", "building")
    assert r2.returncode == 0, r2.stdout
    assert "PASS: within all budgets" in r2.stdout
    assert "height: 5.000 m" in r2.stdout


def test_process_bakes_scale_into_node_transform(staged_glb, tmp_path):
    out = tmp_path / "out"
    run_tool("process", str(staged_glb), "--class", "building",
             "--out", str(out))
    g = GLTF2().load(str(out / "building-type-a.glb"))
    scales = [n.scale for n in g.nodes if n.scale]
    assert scales, "expected a baked node scale"
    for s in scales:
        assert s[0] == pytest.approx(5.0 / 0.834, rel=0.01)
        assert s[0] == s[1] == s[2]  # uniform


def test_process_keeps_triangle_count(staged_glb, tmp_path):
    out = tmp_path / "out"
    r = run_tool("process", str(staged_glb), "--class", "building",
                 "--out", str(out))
    assert "tris unchanged: 1174 -> 1174" in r.stdout


# ------------------------------------------------------------------ lod
def test_lod_mid_tri_count_near_target(staged_glb, tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    r = run_tool("lod", str(staged_glb), "--out", str(out))
    assert r.returncode == 0, r.stderr
    mid = out / "building-type-a_mid.glb"
    assert mid.exists()
    # reload the written MID file and count for real
    r2 = run_tool("audit", str(mid), "--class", "building")
    assert "tris: 427 in" in r2.stdout  # ~35% of 1174
    assert "36.4% of source" in r.stdout


def test_lod_far_billboard(staged_glb, tmp_path):
    out = tmp_path / "out"
    out.mkdir()
    r = run_tool("lod", str(staged_glb), "--out", str(out))
    assert r.returncode == 0, r.stderr
    png = out / "building-type-a_far.png"
    assert png.exists()
    with Image.open(png) as im:
        assert im.size == (256, 256)
        assert im.mode == "RGBA"
        import numpy as np
        alpha = np.asarray(im)[:, :, 3]
        assert (alpha > 0).mean() > 0.01  # actually rendered something
    quad = out / "building-type-a_far.glb"
    r2 = run_tool("audit", str(quad), "--class", "building")
    assert "tris: 2 in" in r2.stdout  # a real 2-triangle quad
    desc = json.loads((out / "building-type-a_far.json").read_text())
    assert desc["tier"] == "far"
    assert desc["texture"] == "building-type-a_far.png"
    assert len(desc["size_m"]) == 2 and all(v > 0 for v in desc["size_m"])


# ------------------------------------------------------------ manifest
def test_update_manifest_appends_valid_entries(tmp_path):
    # scratch processed dir INSIDE the repo so manifest paths stay repo-relative
    scratch = REPO / "assets" / "processed" / "_test_tmp"
    scratch.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(ZIP) as z:
            z.extract(GLB_IN_ZIP, scratch)
            z.extract(TEX_IN_ZIP, scratch)
        glb = scratch / GLB_IN_ZIP
        run_tool("process", str(glb), "--class", "building",
                 "--out", str(scratch))
        (scratch / "Textures").mkdir(exist_ok=True)
        shutil.copy(scratch / TEX_IN_ZIP, scratch / "Textures" / "colormap.png")
        run_tool("lod", str(scratch / "building-type-a.glb"),
                 "--out", str(scratch))
        mp = tmp_path / "manifest.json"
        shutil.copy(REPO / "assets" / "manifest.json", mp)
        r = run_tool("--update-manifest", "--processed-dir", str(scratch),
                     "--class", "building",
                     "--source-id", "kenney_city_kit_suburban",
                     "--manifest", str(mp))
        assert r.returncode == 0, r.stderr
        manifest = json.loads(mp.read_text())
        new = [a for a in manifest["assets"]
               if a["id"].startswith("kenney_city_kit_suburban_building-type-a_")
               or a["id"].startswith("kenney_city_kit_suburban_colormap_")]
        assert len(new) >= 4  # close + mid + far glb/png (+ texture)
        for e in new:
            assert REQUIRED_MANIFEST_FIELDS <= set(e), e["id"]
            assert e["licence"] == "CC0-1.0"
            assert Path(REPO / e["licence_copy"]).exists()
            # hash matches the actual file bytes
            import hashlib
            h = hashlib.sha256((REPO / e["path"]).read_bytes()).hexdigest()
            assert h == e["sha256"], e["id"]
        # and the extended manifest-check verifies them
        r2 = subprocess.run(
            [sys.executable, str(TOOLS / "manifest-check.py"),
             "--manifest", str(mp)],
            capture_output=True, text=True, cwd=REPO)
        assert r2.returncode == 0, r2.stderr
        assert "assets verified" in r2.stdout
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def test_update_manifest_is_idempotent(tmp_path):
    mp = tmp_path / "manifest.json"
    shutil.copy(REPO / "assets" / "manifest.json", mp)
    args = ["--update-manifest", "--processed-dir",
            str(REPO / "assets" / "processed" / "demo"),
            "--class", "building", "--source-id", "kenney_city_kit_suburban",
            "--manifest", str(mp)]
    r1 = run_tool(*args)
    assert r1.returncode == 0, r1.stderr
    n1 = len(json.loads(mp.read_text())["assets"])
    r2 = run_tool(*args)
    assert r2.returncode == 0, r2.stderr
    n2 = len(json.loads(mp.read_text())["assets"])
    assert n1 == n2  # second run adds nothing
