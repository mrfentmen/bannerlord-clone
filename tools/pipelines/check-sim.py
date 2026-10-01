#!/usr/bin/env python3
"""check-sim.py — battle-sim + client verification pipeline.

Runs the checks Milo otherwise runs by hand before claiming anything is
green, and prints one compact report:
  1. go vet on services/simulation
  2. go test on services/simulation (short mode, bounded time)
  3. tsc --noEmit on the repo root (TypeScript gate)

Usage:
  python3 tools/pipelines/check-sim.py [--skip-tsc] [--go-timeout 300]
  python3 tools/pipelines/check-sim.py --self-test

Exit code 0 = all green, 1 = something failed.
"""

import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
SIM_DIR = os.path.join(REPO, "services", "simulation")
# The TypeScript client lives in clients/campaign (Rowan's lane); the gate
# runs there, and skips cleanly if node_modules was never installed.
TS_DIR = os.path.join(REPO, "clients", "campaign")
TSC = os.path.join(TS_DIR, "node_modules", ".bin", "tsc")


def run(cmd, cwd, timeout):
    """Run a command, return (ok, tail_of_output)."""
    try:
        p = subprocess.run(cmd, cwd=cwd, timeout=timeout,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                           text=True)
        out = p.stdout[-3000:]
        return p.returncode == 0, out
    except subprocess.TimeoutExpired:
        return False, f"TIMED OUT after {timeout}s"
    except FileNotFoundError as e:
        return False, f"not installed: {e.filename}"
    except OSError as e:
        return False, f"os error: {e}"


def summarize_go_test(output):
    """Pull the ok/FAIL package lines out of `go test` output."""
    lines = []
    for line in output.splitlines():
        if re.match(r"^(ok|FAIL|---)", line):
            lines.append(line.strip()[:160])
    return lines[-15:]  # keep the report short


def main(argv):
    if "--self-test" in argv:
        return 0 if self_test() else 1
    skip_tsc = "--skip-tsc" in argv
    go_timeout = 300
    if "--go-timeout" in argv:
        try:
            go_timeout = int(argv[argv.index("--go-timeout") + 1])
        except (IndexError, ValueError):
            pass

    report = []
    failed = 0

    ok, out = run(["go", "vet", "./..."], SIM_DIR, 180)
    report.append(("go vet", ok, out.splitlines()[-3:] if not ok else []))
    failed += not ok

    ok, out = run(["go", "test", "-short", "-count=1",
                   f"-timeout={go_timeout - 10}s", "./..."],
                  SIM_DIR, go_timeout)
    report.append(("go test -short", ok, summarize_go_test(out)))
    failed += not ok

    if not skip_tsc:
        if os.path.isfile(TSC):
            ok, out = run([TSC, "--noEmit"], TS_DIR, 240)
            report.append(("tsc --noEmit", ok,
                           out.splitlines()[-5:] if not ok else []))
            failed += not ok
        else:
            report.append(("tsc --noEmit", None,
                           ["skipped: node_modules not installed in clients/campaign"]))
    else:
        report.append(("tsc --noEmit", None, ["skipped"]))

    print("check-sim report:")
    for name, ok, detail in report:
        status = "PASS" if ok else ("SKIP" if ok is None else "FAIL")
        print(f"  [{status}] {name}")
        for d in detail:
            print(f"         {d}")
    print("check-sim: " + ("ALL GREEN" if not failed else f"{failed} check(s) FAILED"))
    return 1 if failed else 0


def self_test():
    failed = 0
    # summarize_go_test picks ok/FAIL lines and caps length
    out = ("ok  \tbattle\t1.2s\n"
           "some noise\n"
           "FAIL\tother\t0.3s\n"
           "--- FAIL: TestX\n")
    lines = summarize_go_test(out)
    if len(lines) != 3 or not lines[0].startswith("ok") or not lines[1].startswith("FAIL"):
        print(f"SELF-TEST FAIL: summarize gave {lines}")
        failed += 1
    # run() handles missing binaries without raising
    ok, msg = run(["definitely-not-a-real-binary-xyz"], "/tmp", 5)
    if ok or "not installed" not in msg:
        print(f"SELF-TEST FAIL: missing binary gave ok={ok} msg={msg!r}")
        failed += 1
    if failed:
        print(f"self-test: {failed} case(s) failed")
        return False
    print("self-test: all cases passed")
    return True


if __name__ == "__main__":
    sys.exit(main(sys.argv))
