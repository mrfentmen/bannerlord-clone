#!/usr/bin/env python3
"""Asset pipeline runner. `python3 tools/pipelines/run.py --ci` runs the
full validation pass: self-test of process-3d.py, then the unit test
suite.

Individual stages:
  --self-test  run process-3d.py --self-test
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
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--tests", action="store_true")
    a = ap.parse_args()
    if not (a.ci or a.self_test or a.tests):
        ap.print_help()
        return
    if a.ci or a.self_test:
        print("=== process-3d.py --self-test ===")
        sh(os.path.join(HERE, "process-3d.py"), "--self-test")
    if a.ci or a.tests:
        print("=== tests ===")
        sh("-m", "unittest", "discover", "-s", os.path.join(HERE, "tests"),
           "-p", "test_*.py", "-t", HERE)
    print("pipeline: OK")


if __name__ == "__main__":
    main()
