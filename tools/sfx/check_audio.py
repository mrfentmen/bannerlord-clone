#!/usr/bin/env python3
"""Task 119: CI gate for the SFX pipeline (manifest-check equivalent).

Fails the build (non-zero exit) when:
  1. any content/audio/sfx/*.wav lacks an audio-manifest.json entry
  2. any manifest entry points at a missing file
  3. any manifest entry is missing required fields
  4. any loop cue fails the seamless check
  5. any cue measures hotter than -14 LUFS
  6. any cue is not 44.1 kHz / mono / 16-bit

Intended CI wiring (documented in README.md; a workflow file needs a
boss's `workflow`-scoped token to push):
  - run: python3 tools/sfx/check_audio.py
"""
import glob
import json
import os
import sys
import wave

SFX_DIR = os.path.expanduser("~/workspace/bannerlord/content/audio/sfx")
MANIFEST_PATH = os.path.join(SFX_DIR, "audio-manifest.json")
CEILING_LUFS = -14.0

REQUIRED_FIELDS = ["name", "file", "duration_s", "sample_rate", "channels",
                   "bits", "loop", "category", "trigger", "license",
                   "source", "generator", "synthesis", "lufs", "sha256"]

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def fail(msg, errors):
    errors.append(msg)
    print(f"FAIL: {msg}")


def main():
    errors = []
    if not os.path.exists(MANIFEST_PATH):
        print(f"FAIL: manifest missing: {MANIFEST_PATH}")
        raise SystemExit(1)
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)
    entries = {c["file"].split("/")[-1]: c for c in manifest["cues"]}

    wavs = sorted(os.path.basename(p)
                  for p in glob.glob(os.path.join(SFX_DIR, "*.wav")))

    # 1. every wav has an entry
    for w in wavs:
        if w not in entries:
            fail(f"wav without manifest entry: {w}", errors)
    # 2. every entry has a file
    for name in entries:
        if not os.path.exists(os.path.join(SFX_DIR, name)):
            fail(f"manifest entry without file: {name}", errors)
    # 3. required fields
    for name, c in entries.items():
        for field in REQUIRED_FIELDS:
            if field not in c:
                fail(f"{name}: missing field '{field}'", errors)

    # format + loudness, measured fresh
    import numpy as np
    from loudness import integrated_lufs
    from check_loops import check_loop
    for w in wavs:
        path = os.path.join(SFX_DIR, w)
        with wave.open(path, "rb") as wf:
            sr, ch, sw = wf.getframerate(), wf.getnchannels(), wf.getsampwidth()
        if not (sr == 44100 and ch == 1 and sw == 2):
            fail(f"{w}: not 44.1kHz/mono/16-bit ({sr}/{ch}/{sw * 8})", errors)
        with wave.open(path, "rb") as wf:
            raw = wf.readframes(wf.getnframes())
        x = np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0
        l = integrated_lufs(x)
        if l != float("-inf") and l > CEILING_LUFS:
            fail(f"{w}: {l:.2f} LUFS hotter than {CEILING_LUFS}", errors)

    # 4. seamless loops
    for name, c in entries.items():
        if c.get("loop"):
            r = check_loop(os.path.join(SFX_DIR, name))
            if not r["ok"]:
                fail(f"{name}: not seamless "
                     f"(step={r['step']:.4f}, p999={r['p999']:.4f})", errors)

    if errors:
        print(f"\naudio CI gate: {len(errors)} failure(s)")
        raise SystemExit(1)
    print(f"audio CI gate: OK ({len(wavs)} cues, "
          f"{sum(1 for c in entries.values() if c.get('loop'))} loops)")


if __name__ == "__main__":
    main()
