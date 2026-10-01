"""Unit voice-bark pipeline (ART_AND_AUDIO.md 8.4, V1: text + short barks).

Renders short single-line unit barks via the TTS CLI, in 3 distinct voices
x 11 categories x 3 line variants = 99 mp3s.

Usage:
    python3 barks.py                  # render everything -> out/barks/
    python3 barks.py --list           # print the script table, render nothing
    python3 barks.py --voices vincent # render one voice only
    python3 barks.py --categories attack,retreat
    python3 barks.py --force           # re-render even if mp3 exists

QC (runs automatically after rendering):
    - every mp3 non-empty
    - ffprobe-decodable, duration in [0.5, 6.0]s
Writes out/barks/qc-report.json with per-file results.
"""
import argparse
import json
import os
import subprocess
import sys

TTS = "/opt/hatch/bin/tts"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "barks")
os.makedirs(OUT, exist_ok=True)

# (slug, tts voice id, description) - ids copied verbatim from
# /opt/hatch/skills/voice-selector/voice_source.json
VOICES = [
    ("vincent", "avocado_v2:vincent", "Gruff Brick - gruff male squad leader"),
    ("briggs", "avocado_v2:briggs", "Husky Campfire - calm male rifleman"),
    ("paloma", "avocado_v2:paloma", "Lilting Swing - female scout"),
]

# Every line <= 8 words. Game-appropriate, no real people or parties.
BARK_TABLE = {
    "select": [
        "Reporting.",
        "Ready and waiting.",
        "On your orders.",
    ],
    "move": [
        "Moving out.",
        "On the way.",
        "Heading there now.",
    ],
    "attack": [
        "Weapons free!",
        "Engaging the enemy!",
        "Light them up!",
    ],
    "advance": [
        "Push forward!",
        "Advancing, cover me.",
        "Taking ground!",
    ],
    "hold": [
        "Holding position.",
        "Digging in here.",
        "Not one step back.",
    ],
    "retreat": [
        "Falling back!",
        "Pull back, now!",
        "Retreat! Regroup west.",
    ],
    "victory": [
        "Area secured.",
        "We took it!",
        "Enemy routed. We hold.",
    ],
    "defeat": [
        "We're overrun!",
        "Position lost!",
        "Man down, falling back!",
    ],
    "enemy_spotted": [
        "Contact! Hostiles ahead.",
        "Enemy movement, north side.",
        "Spotted hostiles. Weapons ready.",
    ],
    "reloading": [
        "Reloading!",
        "Changing mags!",
        "Cover me, reloading.",
    ],
    "medic": [
        "Medic! Man down!",
        "Need a medic here!",
        "Corpsman up!",
    ],
}

MIN_DUR, MAX_DUR = 0.5, 6.0


def render(text, voice_id, out_path):
    subprocess.run(
        [TTS, "speak", "--voice", voice_id, "--output", out_path,
         "--text-stdin"],
        input=text.encode(), check=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def probe(path):
    """Return (ok, duration, error)."""
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return False, 0.0, "missing or empty"
    try:
        r = subprocess.run(
            ["ffprobe", "-hide_banner", "-loglevel", "error",
             "-show_entries", "format=duration", "-of",
             "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=30)
    except Exception as e:
        return False, 0.0, f"ffprobe failed: {e}"
    if r.returncode != 0:
        return False, 0.0, f"ffprobe rc={r.returncode}"
    try:
        dur = float(r.stdout.strip())
    except ValueError:
        return False, 0.0, "unparseable duration"
    if not (MIN_DUR <= dur <= MAX_DUR):
        return False, dur, f"duration {dur:.2f}s out of range"
    return True, dur, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--voices", default="",
                    help="comma-separated voice slugs (default: all)")
    ap.add_argument("--categories", default="",
                    help="comma-separated categories (default: all)")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    if args.list:
        for cat, lines in BARK_TABLE.items():
            print(f"[{cat}]")
            for line in lines:
                print(f"  {line} ({len(line.split())} words)")
        return

    want_voices = [v for v in VOICES
                   if not args.voices or v[0] in args.voices.split(",")]
    want_cats = [c for c in BARK_TABLE
                 if not args.categories or c in args.categories.split(",")]

    total = len(want_voices) * sum(len(BARK_TABLE[c]) for c in want_cats)
    done = 0
    for slug, vid, _desc in want_voices:
        vdir = os.path.join(OUT, slug)
        os.makedirs(vdir, exist_ok=True)
        for cat in want_cats:
            for i, line in enumerate(BARK_TABLE[cat], 1):
                out = os.path.join(vdir, f"{cat}-{i}.mp3")
                if not args.force and os.path.exists(out):
                    done += 1
                    continue
                render(line, vid, out)
                done += 1
                if done % 10 == 0 or done == total:
                    print(f"rendered {done}/{total}", flush=True)

    # QC everything we were asked to render
    report = []
    failed = 0
    for slug, _vid, _desc in want_voices:
        for cat in want_cats:
            for i, line in enumerate(BARK_TABLE[cat], 1):
                path = os.path.join(OUT, slug, f"{cat}-{i}.mp3")
                ok, dur, err = probe(path)
                report.append({"file": os.path.relpath(path, OUT),
                               "voice": slug, "category": cat,
                               "variant": i, "line": line,
                               "duration_s": round(dur, 2),
                               "ok": ok, "error": err})
                if not ok:
                    failed += 1
                    print(f"QC FAIL: {path}: {err}")
    with open(os.path.join(OUT, "qc-report.json"), "w") as f:
        json.dump(report, f, indent=2)
    print(f"QC: {len(report) - failed}/{len(report)} passed -> "
          f"{os.path.join(OUT, 'qc-report.json')}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
