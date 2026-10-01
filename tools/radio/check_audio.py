#!/usr/bin/env python3
"""CI gate for the radio pipeline.

Fails the build (non-zero exit) when:
  1. any station in STATION_SPECS lacks a WAV master
  2. any station lacks its MP3 delivery file in the client public dir
  3. radio-manifest.json is missing or an entry lacks required fields
  4. any manifest entry points at a missing file
  5. any WAV master is not 44.1 kHz / mono / 16-bit
  6. any station measures hotter than -14 LUFS (master or decoded MP3)
  7. any station fails the seamless-loop check
  8. any MP3 decodes to a duration more than 1.0 s off the master
"""
import json
import os
import subprocess
import sys
import tempfile
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from synth import STATION_SPECS, CONTENT_OUT, PUBLIC_OUT
from loudness import integrated_lufs
from check_loops import check_loop

MANIFEST_PATH = os.path.join(PUBLIC_OUT, "radio-manifest.json")
CEILING_LUFS = -14.0
DURATION_TOL_S = 1.0

REQUIRED_FIELDS = ["id", "name", "file", "master", "duration_s",
                   "sample_rate", "channels", "bits", "loop", "category",
                   "description", "license", "source", "generator",
                   "synthesis", "lufs", "sha256", "mp3_sha256"]


def fail(msg, errors):
    errors.append(msg)
    print(f"FAIL: {msg}")


def read_wav_float(path):
    with wave.open(path, "rb") as w:
        sr, ch, sw = w.getframerate(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0
    return x, sr, ch, sw


def decode_mp3(path):
    """Decode MP3 to float mono via ffmpeg. Returns (samples, sr)."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        r = subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
             "-i", path, "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le",
             tmp_path])
        if r.returncode != 0:
            return None, None
        with wave.open(tmp_path, "rb") as w:
            raw = w.readframes(w.getnframes())
            sr = w.getframerate()
        x = np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0
        return x, sr
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def main():
    errors = []

    # 1-2. masters + delivery files exist
    for spec in STATION_SPECS:
        wav_path = os.path.join(CONTENT_OUT, spec["id"] + ".wav")
        mp3_path = os.path.join(PUBLIC_OUT, spec["id"] + ".mp3")
        if not os.path.exists(wav_path):
            fail(f"missing WAV master: {wav_path}", errors)
        if not os.path.exists(mp3_path):
            fail(f"missing MP3 delivery: {mp3_path}", errors)

    # 3-4. manifest exists, fields present, files exist
    if not os.path.exists(MANIFEST_PATH):
        print(f"FAIL: manifest missing: {MANIFEST_PATH}")
        raise SystemExit(1)
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)
    entries = {s["id"]: s for s in manifest.get("stations", [])}
    for spec in STATION_SPECS:
        sid = spec["id"]
        if sid not in entries:
            fail(f"manifest missing station: {sid}", errors)
            continue
        e = entries[sid]
        for field in REQUIRED_FIELDS:
            if field not in e:
                fail(f"{sid}: manifest missing field '{field}'", errors)
        for key in ("file", "master"):
            rel = e.get(key, "")
            # file is relative to public/, master relative to repo root
            full = (os.path.join(PUBLIC_OUT, os.path.basename(rel))
                    if key == "file"
                    else os.path.join(CONTENT_OUT, os.path.basename(rel)))
            if not os.path.exists(full):
                fail(f"{sid}: manifest {key} points at missing file: {rel}",
                     errors)

    # 5-7. format, loudness, seamlessness on masters; 8. MP3 duration
    for spec in STATION_SPECS:
        sid = spec["id"]
        wav_path = os.path.join(CONTENT_OUT, sid + ".wav")
        mp3_path = os.path.join(PUBLIC_OUT, sid + ".mp3")
        if not os.path.exists(wav_path):
            continue
        x, sr, ch, sw = read_wav_float(wav_path)
        if not (sr == 44100 and ch == 1 and sw == 2):
            fail(f"{sid}.wav: not 44.1kHz/mono/16-bit "
                 f"({sr}/{ch}/{sw * 8})", errors)
        l = integrated_lufs(x)
        if l != float("-inf") and l > CEILING_LUFS:
            fail(f"{sid}.wav: {l:.2f} LUFS hotter than {CEILING_LUFS}",
                 errors)
        r = check_loop(wav_path)
        if not r["ok"]:
            fail(f"{sid}.wav: not seamless "
                 f"(step={r['step']:.4f}, p999={r['p999']:.4f})", errors)
        if os.path.exists(mp3_path):
            mx, msr = decode_mp3(mp3_path)
            if mx is None:
                fail(f"{sid}.mp3: ffmpeg could not decode", errors)
            else:
                mp3_dur = len(mx) / msr
                wav_dur = len(x) / sr
                if abs(mp3_dur - wav_dur) > DURATION_TOL_S:
                    fail(f"{sid}.mp3: duration {mp3_dur:.2f}s vs master "
                         f"{wav_dur:.2f}s", errors)
                ml = integrated_lufs(mx)
                if ml != float("-inf") and ml > CEILING_LUFS:
                    fail(f"{sid}.mp3: {ml:.2f} LUFS hotter than "
                         f"{CEILING_LUFS}", errors)

    if errors:
        print(f"\nradio CI gate: {len(errors)} failure(s)")
        raise SystemExit(1)
    print(f"radio CI gate: OK ({len(STATION_SPECS)} stations)")


if __name__ == "__main__":
    main()
