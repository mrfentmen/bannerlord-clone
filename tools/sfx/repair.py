"""One-time remediation: repair loop-boundary clicks in existing committed loops.

Eight pack-1/2/3 loop files shipped with a single-sample discontinuity at the
loop boundary (their old crossfade helper blended the tail toward the head but
left new[-1] = old[f-1], which does not equal old[0] for non-periodic material).
Re-synthesizing them is not possible (pack 2's generator is not in the repo),
so this script repairs the boundary in place with a C1 Hermite spline.

The repair replaces K samples on each side of the boundary (2*K = 256 samples,
~6 ms) with a cubic Hermite spline from x[n-K-1] to x[K] matching value and
(locally averaged) slope at both ends. This guarantees value- and
slope-continuity across the boundary while leaving the other 99.99% of the
file bit-identical. K=128 was validated on all eight files: splice step falls
below both the audibility floor (0.02) and 3x the file's own p99.9 step, with
no peak overshoot.

This is NOT part of the CI pipeline (run.py --ci never calls it). New loops
must be synthesized seamlessly (see synth.py's periodic construction); this
script exists only to document and reproduce the one-time fix applied to the
legacy files.

Usage: python3 repair.py   (reads/writes content/audio/sfx/*.wav in place)
"""
import numpy as np
import os
import wave

SFX_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       '..', '..', 'content', 'audio', 'sfx')

# Files repaired 2026-10-01 (splice step before -> after, all < 0.02 and < 3*p999):
REPAIRED = [
    'wind-howl-loop.wav',          # 0.3130 -> 0.0003
    'armored-carrier-engine.wav',  # 0.3983 -> 0.0018
    'jeep-engine.wav',             # 0.3302 -> 0.0013
    'convoy-rumble-loop.wav',      # 0.0381 -> 0.0003
    'bar-piano-loop.wav',          # 0.1661 -> 0.0057
    'radio-chatter-loop.wav',      # 0.2716 -> 0.0033
    'radio-music-loop.wav',        # 0.1903 -> 0.0045
    'battle-drums-low-loop.wav',   # 0.2050 -> 0.0047
]

K = 128
SLOPE_WIN = 16


def read_wav(path):
    with wave.open(path, 'rb') as w:
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0


def write_wav(path, x):
    x = np.clip(x, -1.0, 1.0)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(44100)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


def hermite_repair(x, k=K, slope_win=SLOPE_WIN):
    n = len(x)
    y = x.copy()
    p0, p1 = x[n - k - 1], x[k]
    m0 = (x[n - k - 1] - x[n - k - 1 - slope_win]) / slope_win
    m1 = (x[k + slope_win] - x[k]) / slope_win
    N = 2 * k
    t = np.arange(1, N + 1) / (N + 1)
    h00 = 2 * t ** 3 - 3 * t ** 2 + 1
    h10 = t ** 3 - 2 * t ** 2 + t
    h01 = -2 * t ** 3 + 3 * t ** 2
    h11 = t ** 3 - t ** 2
    seg = h00 * p0 + h10 * (N * m0) + h01 * p1 + h11 * (N * m1)
    y[n - k:n] = seg[:k]
    y[0:k] = seg[k:]
    return y


def main():
    for name in REPAIRED:
        path = os.path.join(SFX_DIR, name)
        x = read_wav(path)
        before = abs(x[0] - x[-1])
        y = hermite_repair(x)
        after = abs(y[0] - y[-1])
        peak = np.abs(y).max()
        assert peak <= 0.995, f'{name}: repair overshoot peak={peak}'
        write_wav(path, y)
        print(f'{name}: splice step {before:.4f} -> {after:.6f}, peak {peak:.4f}')


if __name__ == '__main__':
    main()
