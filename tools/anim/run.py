#!/usr/bin/env python3
"""Animation pipeline driver: extract -> retarget -> procedural -> bake -> verify -> manifest.

Run: python3 tools/anim/run.py [--ci]

--ci runs the whole chain and then the test suite, failing non-zero on any
problem. That is the animation CI gate: extract, bake, and decode-verify run
on every change under tools/anim/ (see .github/workflows/anim-ci.yml).
"""

import argparse
import subprocess
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import bake as bake_mod  # noqa: E402
import extract as extract_mod  # noqa: E402
import manifest as manifest_mod  # noqa: E402
import procedural  # noqa: E402
import validate as validate_mod  # noqa: E402

SRC = HERE / "sources"
SKEL = HERE / "skeleton.json"
DIST = HERE / "dist"

SWAT = SRC / "Quaternius_SWAT.glb"
SOLDIER = SRC / "Soldier.glb"

CC0_SWAT = "CC0 (Quaternius; see sources/SOURCE_NOTES.md)"
MIT_SOLDIER = "MIT (three.js examples; see sources/SOURCE_NOTES.md)"

# (clip name, rig, source file, source animation, loop, license, root policy)
EXTRACT_SPECS = [
    ("attack", "quaternius", SWAT, "CharacterArmature|Sword_Slash", False, CC0_SWAT, "as-authored"),
    ("shoot", "quaternius", SWAT, "CharacterArmature|Gun_Shoot", False, CC0_SWAT, "as-authored"),
    ("hit-react", "quaternius", SWAT, "CharacterArmature|HitRecieve", False, CC0_SWAT, "as-authored"),
    ("death", "quaternius", SWAT, "CharacterArmature|Death", False, CC0_SWAT, "as-authored"),
]

RETARGET_SPECS = [
    ("idle", "mixamo", SOLDIER, "Idle", True, MIT_SOLDIER, "in-place"),
    ("walk", "mixamo", SOLDIER, "Walk", True, MIT_SOLDIER, "in-place"),
    ("run", "mixamo", SOLDIER, "Run", True, MIT_SOLDIER, "in-place"),
]


def step(name):
    print(f"\n=== {name} ===", flush=True)


def run_pipeline():
    step("validate sources")
    for path, rig in ((SWAT, "quaternius"), (SOLDIER, "mixamo")):
        code, errors, warnings = validate_mod.validate(str(path), rig=rig)
        for w in warnings:
            print(f"  WARN {path.name}: {w}")
        if code != 0:
            for e in errors:
                print(f"  FAIL {path.name}: {e}")
            raise SystemExit(f"source validation failed for {path.name}")
        print(f"  {path.name}: VALID")

    step("extract combat clips")
    clips = []
    cache = {}
    for name, rig, path, anim, loop, lic, policy in EXTRACT_SPECS + RETARGET_SPECS:
        key = str(path)
        if key not in cache:
            cache[key] = extract_mod.load_source(path)
        clip = extract_mod.extract_clip(cache[key], anim, rig, name, loop, lic, policy)
        clips.append(clip)
        print(f"  {name:10s} {len(clip.frames):3d} frames  {clip.duration:.2f}s  "
              f"loop={'yes' if loop else 'no':3s}  from {anim}")

    step("procedural fallbacks")
    for clip in procedural.all_procedural():
        clips.append(clip)
        print(f"  {clip.name:10s} {len(clip.frames):3d} frames  {clip.duration:.2f}s  "
              f"loop={'yes' if clip.loop else 'no':3s}  procedural")

    step("bake to RGBA16F bone texture + decode-verify")
    sidecar = bake_mod.bake(str(SKEL), clips, DIST)
    print(f"  wrote {DIST / 'anim_bones.bin'} "
          f"({sidecar['width']}x{sidecar['height']}, "
          f"{(DIST / 'anim_bones.bin').stat().st_size} bytes)")
    print(f"  max decode rel err {sidecar['max_decode_rel_err']:.3e} "
          f"(bar {sidecar['decode_bar']:.3e})")
    print(f"  sha256 {sidecar['sha256'][:16]}...")

    step("regenerate CLIPS.md")
    out = manifest_mod.regenerate(HERE)
    print(f"  wrote {out}")

    print(f"\nPIPELINE OK: {len(clips)} clips, {sidecar['height']} frames")
    return sidecar


def run_tests():
    step("test suite")
    loader = unittest.TestLoader()
    suite = loader.discover(str(HERE / "tests"), pattern="test_*.py")
    runner = unittest.TextTestRunner(verbosity=1)
    result = runner.run(suite)
    if not result.wasSuccessful():
        raise SystemExit("anim tests failed")
    print(f"anim tests: {result.testsRun} passed")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Animation pipeline driver")
    ap.add_argument("--ci", action="store_true",
                    help="full pipeline plus the test suite; the CI gate")
    ap.add_argument("--tests-only", action="store_true")
    args = ap.parse_args(argv)
    if args.tests_only:
        run_tests()
        return
    run_pipeline()
    if args.ci:
        run_tests()


if __name__ == "__main__":
    main()
