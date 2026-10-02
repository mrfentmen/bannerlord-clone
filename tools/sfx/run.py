#!/usr/bin/env python3
"""SFX pipeline runner. `python3 tools/sfx/run.py --ci` runs the full
pipeline: synthesize pack-4 cues -> loudness-normalize -> regenerate
audio-manifest.json -> seamless-loop check -> CI gate -> unit tests.

Individual stages:
  --synth      generate the new pack-4 cues only
  --normalize  loudness-normalize all cues to -16 LUFS (writes LOUDNESS.md)
  --manifest   regenerate audio-manifest.json
  --loops      verify every loop is sample-seamless (reads the manifest)
  --gate       run the CI gate (check_audio.py)
  --tests      run the unit test suite
"""
import argparse
import subprocess
import sys
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def sh(*args):
    r = subprocess.run([sys.executable, *args], cwd=HERE)
    if r.returncode != 0:
        raise SystemExit(r.returncode)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ci", action="store_true")
    ap.add_argument("--synth", action="store_true")
    ap.add_argument("--normalize", action="store_true")
    ap.add_argument("--loops", action="store_true")
    ap.add_argument("--manifest", action="store_true")
    ap.add_argument("--gate", action="store_true")
    ap.add_argument("--tests", action="store_true")
    a = ap.parse_args()
    stages = []
    if a.ci or a.synth:
        stages.append("synth.py")
    if a.ci or a.normalize:
        stages.append("normalize.py")
    if a.ci or a.manifest:
        stages.append("manifest.py")
    if a.ci or a.loops:
        stages.append("check_loops.py")
    if a.ci or a.gate:
        stages.append("check_audio.py")
    if not stages and not (a.ci or a.tests):
        ap.print_help()
        return
    for s in stages:
        print(f"=== {s} ===")
        sh(os.path.join(HERE, s))
    if a.ci or a.tests:
        print("=== tests ===")
        sh("-m", "unittest", "discover", "-s", os.path.join(HERE, "tests"),
           "-p", "test_*.py", "-t", HERE)
    print("pipeline: OK")


if __name__ == "__main__":
    main()
