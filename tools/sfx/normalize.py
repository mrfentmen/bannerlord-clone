#!/usr/bin/env python3
"""Task 117: loudness-normalize every SFX cue to -16 LUFS.

Reads each WAV in content/audio/sfx/, measures integrated BS.1770 loudness,
applies the gain needed to hit -16 LUFS, and writes the file back in place.

Peak safety: if the gain would push the peak above 0.99, the file is
peak-limited to 0.99 first and the final (lower) loudness is reported.
No file may ship hotter than -14 LUFS; the script exits non-zero if any
file ends up above that ceiling.

Writes a per-file report to content/audio/sfx/LOUDNESS.md.
Deterministic: re-running after a successful run applies ~0 dB everywhere.
"""
import glob
import math
import os
import wave

import numpy as np

from loudness import integrated_lufs

SR = 44100
SFX_DIR = os.path.expanduser("~/workspace/bannerlord/content/audio/sfx")
TARGET_LUFS = -16.0
CEILING_LUFS = -14.0
PEAK_LIMIT = 0.99


def read_wav(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == SR, path
        assert w.getnchannels() == 1, path
        assert w.getsampwidth() == 2, path
        raw = w.readframes(w.getnframes())
    return (np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0)


def write_wav(path, x):
    x = np.nan_to_num(x)
    x = np.clip(x, -1.0, 1.0)
    data = (x * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def normalize_file(path):
    """Normalize one file in place. Returns a report dict."""
    x = read_wav(path)
    before = integrated_lufs(x)
    if before == float("-inf"):
        return {"file": os.path.basename(path), "before": "-inf",
                "gain_db": 0.0, "after": "-inf", "peak": 0.0,
                "flags": ["silent"]}
    gain_db = TARGET_LUFS - before
    y = x * (10.0 ** (gain_db / 20.0))
    flags = []
    peak = float(np.abs(y).max())
    if peak > PEAK_LIMIT:
        y = y / peak * PEAK_LIMIT
        peak = PEAK_LIMIT
        flags.append("peak-limited")
    after = integrated_lufs(y)
    if abs(gain_db) > 12.0:
        flags.append("large-gain-review")
    write_wav(path, y)
    return {"file": os.path.basename(path),
            "before": round(before, 2), "gain_db": round(gain_db, 2),
            "after": round(after, 2), "peak": round(peak, 3),
            "flags": flags}


def main():
    paths = sorted(glob.glob(os.path.join(SFX_DIR, "*.wav")))
    rows = [normalize_file(p) for p in paths]
    too_hot = [r for r in rows
               if isinstance(r["after"], float) and r["after"] > CEILING_LUFS]
    lines = [
        "# SFX loudness normalization report",
        "",
        f"Target: {TARGET_LUFS} LUFS integrated (BS.1770). "
        f"Ceiling: no file hotter than {CEILING_LUFS} LUFS.",
        f"Files processed: {len(rows)}. Too hot: {len(too_hot)}.",
        "",
        "| file | before (LUFS) | gain (dB) | after (LUFS) | peak | flags |",
        "|---|---|---|---|---|---|",
    ]
    for r in rows:
        flags = ", ".join(r["flags"]) if r["flags"] else "-"
        lines.append(f"| {r['file']} | {r['before']} | {r['gain_db']} "
                     f"| {r['after']} | {r['peak']} | {flags} |")
    report_path = os.path.join(SFX_DIR, "LOUDNESS.md")
    with open(report_path, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"normalized {len(rows)} files -> {report_path}")
    if too_hot:
        print("TOO HOT (> -14 LUFS):")
        for r in too_hot:
            print(f"  {r['file']}: {r['after']} LUFS")
        raise SystemExit(1)
    print("all files at or below -14 LUFS: OK")


if __name__ == "__main__":
    main()
