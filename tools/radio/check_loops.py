#!/usr/bin/env python3
"""Verify every radio station master is sample-seamless.

Same calibrated dual criteria as tools/sfx/check_loops.py:
a file FAILS only if its boundary step |x[0]-x[-1]| is BOTH
  1. above 0.02 absolute (-34 dBFS), AND
  2. above 3x the file's own p99.9 sample step (anomalous texture).

Exit code 0 when every station passes, 1 otherwise.
"""
import os
import sys
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from synth import STATION_SPECS, CONTENT_OUT

ABS_FLOOR = 0.02
REL_FACTOR = 3.0


def read_mono_float(path):
    with wave.open(path, "rb") as w:
        assert w.getnchannels() == 1, path
        assert w.getsampwidth() == 2, path
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0


def check_loop(path):
    x = read_mono_float(path)
    step = abs(x[0] - x[-1])
    p999 = float(np.percentile(np.abs(np.diff(x)), 99.9))
    ok = not (step > ABS_FLOOR and step > REL_FACTOR * p999)
    return {"file": os.path.basename(path), "step": step, "p999": p999,
            "ok": ok}


def main():
    results = []
    for spec in STATION_SPECS:
        path = os.path.join(CONTENT_OUT, spec["id"] + ".wav")
        if not os.path.exists(path):
            print(f"FAIL: missing master {path} (run synth.py first)")
            raise SystemExit(1)
        results.append(check_loop(path))
    bad = [r for r in results if not r["ok"]]
    print(f'{"file":28s} {"step":>10s} {"p99.9":>10s}  verdict')
    for r in results:
        print(f'{r["file"]:28s} {r["step"]:10.6f} {r["p999"]:10.6f}  '
              f'{"PASS" if r["ok"] else "FAIL"}')
    print(f"\n{len(results) - len(bad)}/{len(results)} stations seamless")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
