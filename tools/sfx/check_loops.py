"""Task 118: verify every loop file is sample-seamless.

A loop is seamless when its boundary step x[0]-x[-1] is inaudible. Two
complementary tests, calibrated on the 34 shipped loops (2026-10-01):

1. ABSOLUTE: |x[0]-x[-1]| <= 0.02 (-34 dBFS). A single-sample step below
   this is inaudible even in a quiet bed.
2. RELATIVE: |x[0]-x[-1]| <= 3 * p99.9(|diff(x)|). The boundary step must
   not stand out against the file's own texture. Dense bright beds
   (crowd, rain) have large natural sample steps; a boundary step inside
   that range is masked.

A file FAILS only if it violates BOTH (audible in absolute terms AND
anomalous for its own texture). The old crossfade-then-correlate idea was
abandoned during calibration: cross-correlation of tail-vs-head misfires on
periodic content (phase misalignment reads as failure), and the shipped
loops it was meant to bless actually had real single-sample clicks, which
were repaired (see repair.py).

Exit code 0 when every loop passes, 1 otherwise. Prints a per-file table.
"""
import numpy as np
import json
import os
import sys
import wave

SFX_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       '..', '..', 'content', 'audio', 'sfx')
MANIFEST = os.path.join(SFX_DIR, 'audio-manifest.json')

ABS_FLOOR = 0.02
REL_FACTOR = 3.0


def read_mono_float(path):
    with wave.open(path, 'rb') as w:
        assert w.getnchannels() == 1, path
        assert w.getsampwidth() == 2, path
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0


def check_loop(path):
    x = read_mono_float(path)
    step = abs(x[0] - x[-1])
    p999 = float(np.percentile(np.abs(np.diff(x)), 99.9))
    ok = not (step > ABS_FLOOR and step > REL_FACTOR * p999)
    return {'file': os.path.basename(path), 'step': step, 'p999': p999,
            'ok': ok}


def loop_files():
    """Loop files from the manifest's loop flags (not filename matching:
    many loops like rain-battle.wav have no 'loop' in the name)."""
    if os.path.exists(MANIFEST):
        with open(MANIFEST) as f:
            man = json.load(f)
        return [os.path.join(SFX_DIR, c['file'].split('/')[-1])
                for c in man['cues'] if c.get('loop')]
    files = sorted(f for f in os.listdir(SFX_DIR) if f.endswith('.wav'))
    return [os.path.join(SFX_DIR, f) for f in files if 'loop' in f.lower()]


def main():
    results = [check_loop(p) for p in loop_files()]
    bad = [r for r in results if not r['ok']]
    print(f'{"file":36s} {"step":>10s} {"p99.9":>10s}  verdict')
    for r in results:
        print(f'{r["file"]:36s} {r["step"]:10.6f} {r["p999"]:10.6f}  '
              f'{"PASS" if r["ok"] else "FAIL"}')
    print(f'\n{len(results) - len(bad)}/{len(results)} loops seamless')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
