#!/usr/bin/env python3
"""Generate clients/campaign/public/audio/radio/radio-manifest.json.

One entry per station with: file, duration, format, loop flag, category,
description, license, source, generator, synthesis parameters, LUFS
(measured on the WAV master), and sha256 of both the master WAV and the
delivery MP3.

STATION_SPECS in synth.py is the single source of truth.
"""
import hashlib
import json
import os
import sys
import wave

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from synth import STATION_SPECS, CONTENT_OUT, PUBLIC_OUT

MANIFEST_PATH = os.path.join(PUBLIC_OUT, "radio-manifest.json")

LICENSE = "CC0"
SOURCE = "original, procedurally generated on project VM (numpy synthesis)"
AUTHOR = "Milo audio synth"


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _wav_info(path):
    with wave.open(path, "rb") as w:
        n = w.getnframes()
        return {"duration_s": round(n / w.getframerate(), 3),
                "sample_rate": w.getframerate(),
                "channels": w.getnchannels(),
                "bits": w.getsampwidth() * 8,
                "sha256": _sha256(path)}


def _lufs_of(path):
    import numpy as np
    from loudness import integrated_lufs
    with wave.open(path, "rb") as w:
        raw = w.readframes(w.getnframes())
    x = np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0
    l = integrated_lufs(x)
    return None if l == float("-inf") else round(l, 2)


def build_manifest():
    entries = []
    for spec in STATION_SPECS:
        wav_path = os.path.join(CONTENT_OUT, spec["id"] + ".wav")
        mp3_path = os.path.join(PUBLIC_OUT, spec["id"] + ".mp3")
        if not os.path.exists(wav_path):
            print(f"missing master: {wav_path} (run synth.py first)")
            raise SystemExit(1)
        info = _wav_info(wav_path)
        entries.append({
            "id": spec["id"],
            "name": spec["name"],
            "file": f"audio/radio/{spec['id']}.mp3",
            "master": f"content/audio/radio/{spec['id']}.wav",
            **info,
            "mp3_sha256": _sha256(mp3_path) if os.path.exists(mp3_path) else None,
            "loop": bool(spec.get("loop", True)),
            "category": spec.get("category", "music"),
            "description": spec.get("description", ""),
            "license": LICENSE,
            "source": SOURCE,
            "author": AUTHOR,
            "generator": "tools/radio/synth.py",
            "synthesis": {"function": spec["fn"], **spec["params"]},
            "lufs": _lufs_of(wav_path),
        })
    return {"version": 1,
            "description": "Procedural radio stations for the Bannerlord-style game",
            "stations": entries}


def main():
    os.makedirs(PUBLIC_OUT, exist_ok=True)
    manifest = build_manifest()
    with open(MANIFEST_PATH, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"wrote {MANIFEST_PATH}: {len(manifest['stations'])} stations")


if __name__ == "__main__":
    main()
