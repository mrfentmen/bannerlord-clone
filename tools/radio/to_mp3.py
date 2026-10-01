#!/usr/bin/env python3
"""Encode WAV station masters to MP3 delivery files.

Reads content/audio/radio/<id>.wav, encodes with ffmpeg/libmp3lame at
128 kbps mono, and writes clients/campaign/public/audio/radio/<id>.mp3,
the exact paths clients/campaign/src/audio/radio.ts expects.

MP3 encoding is deterministic enough for our purposes (same input bytes
-> same output bytes with the same ffmpeg build and flags), but the
pipeline does not rely on byte identity: the CI gate validates the
decoded audio, not hashes.
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from synth import STATION_SPECS, CONTENT_OUT, PUBLIC_OUT

BITRATE = "128k"


def encode_one(station_id):
    src = os.path.join(CONTENT_OUT, station_id + ".wav")
    dst = os.path.join(PUBLIC_OUT, station_id + ".mp3")
    if not os.path.exists(src):
        print(f"missing master: {src} (run synth.py first)")
        raise SystemExit(1)
    os.makedirs(PUBLIC_OUT, exist_ok=True)
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-i", src, "-codec:a", "libmp3lame", "-b:a", BITRATE,
           "-ac", "1", "-ar", "44100", dst]
    r = subprocess.run(cmd)
    if r.returncode != 0:
        print(f"ffmpeg failed for {station_id}")
        raise SystemExit(r.returncode)
    size = os.path.getsize(dst)
    print(f"encoded {station_id}.mp3 ({size // 1024} KB)")


def main():
    for spec in STATION_SPECS:
        encode_one(spec["id"])
    print(f"delivery files in {PUBLIC_OUT}: OK")


if __name__ == "__main__":
    main()
