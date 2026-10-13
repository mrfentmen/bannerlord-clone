"""Voice-bark pipeline Batch 25: NPC dialogue lines + siege tactical barks.

Group A - NPC dialogue lines (single voice each, 3 variants each, <=12 words):
    ostler (vincent), peddler (briggs),
    laundress-master (paloma), turnkey (vincent)
    4 categories x 1 voice x 3 variants = 12 mp3s
Group B - siege tactical barks (3 voices x 3 variants, <=8 words):
    bring-up-ladders, man-the-rams, loose-the-boulders,
    pour-boiling-oil, scale-at-dawn, breach-the-inner-gate
    6 categories x 3 voices x 3 variants = 54 mp3s

All category names are NEW (verified against the repo barks tree
clients/campaign/public/audio/barks/ before rendering; no overwrites).

Total: 66 mp3s -> out/barks/<voice>/<category>-<n>.mp3

Usage:
    python3 barks25.py                  # render everything -> out/barks/
    python3 barks25.py --list           # print the script table, render nothing
    python3 barks25.py --voices paloma  # render one voice only
    python3 barks25.py --categories no-mercy,finish-them
    python3 barks25.py --force          # re-render even if mp3 exists

QC (runs automatically after rendering):
    - every mp3 non-empty
    - ffprobe-decodable, duration in [0.5, 8.0]s
Writes out/barks/qc-report.json with per-file results.
"""
import argparse
import json
import os
import subprocess
import sys
import time

TTS = "/opt/hatch/bin/tts"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "barks")
os.makedirs(OUT, exist_ok=True)

# (slug, tts voice id, description) - ids copied verbatim from
# /opt/hatch/skills/voice-selector/voice_source.json
VOICES = [
    ("vincent", "avocado_v2:vincent", "Gruff Brick - gruff male drill master"),
    ("briggs", "avocado_v2:briggs", "Husky Campfire - calm male rifleman"),
    ("paloma", "avocado_v2:paloma", "Lilting Swing - female scout"),
]
VOICE_IDS = {slug: vid for slug, vid, _ in VOICES}

# Group B: siege tactical barks, every line <= 8 words.
# Game-appropriate, no real people/parties/places.
# All category names are new as of this batch (verified against the repo tree).
TACTICAL_TABLE = {
    "bring-up-ladders": [
        "Bring up the ladders!",
        "Ladders! Bring them up!",
        "Bring the ladders up!",
    ],
    "man-the-rams": [
        "Man the rams!",
        "To the rams! Now!",
        "Rams manned! Push!",
    ],
    "loose-the-boulders": [
        "Loose the boulders!",
        "Boulders loose! Away!",
        "Release the boulders!",
    ],
    "pour-boiling-oil": [
        "Pour the boiling oil!",
        "Boiling oil! Pour!",
        "Oil! Pour it now!",
    ],
    "scale-at-dawn": [
        "We scale at dawn!",
        "Scale the walls at dawn!",
        "At dawn, we scale!",
    ],
    "breach-the-inner-gate": [
        "Breach the inner gate!",
        "To the inner gate!",
        "The inner gate falls!",
    ],
}

# Group A: NPC dialogue lines, every line <= 12 words.
# category -> (voice slug, [lines])
NPC_TABLE = {
    "ostler": ("vincent", [
        "Your horse is ready.",
        "Fresh oats, friend.",
        "Mind the mare's temper.",
    ]),
    "peddler": ("briggs", [
        "Finest wares, cheap!",
        "See what I have.",
        "A bargain for you.",
    ]),
    "laundress-master": ("paloma", [
        "The linens are clean.",
        "No stains remain.",
        "Wash day is done.",
    ]),
    "turnkey": ("vincent", [
        "Cells locked tight.",
        "No visitors today.",
        "Mind the irons.",
    ]),
}

# Per-voice line overrides: (voice_slug, category, variant) -> replacement line.
# Mechanism kept from batches 20-24 (paloma over-length / TTS backend fixes).
LINE_OVERRIDES = {
}

MIN_DUR, MAX_DUR = 0.5, 8.0


def render(text, voice_id, out_path, retries=4):
    """Render with retries on transient TTS CLI failures."""
    last_err = None
    for attempt in range(retries):
        try:
            subprocess.run(
                [TTS, "speak", "--voice", voice_id, "--output", out_path,
                 "--text-stdin"],
                input=text.encode(), check=True,
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return
        except subprocess.CalledProcessError as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(2 + attempt * 2)
    raise last_err


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


def plan(want_voices, want_cats):
    """Return list of (voice_slug, category, variant, line)."""
    jobs = []
    for cat in want_cats:
        if cat in TACTICAL_TABLE:
            voices = want_voices
            lines = TACTICAL_TABLE[cat]
        elif cat in NPC_TABLE:
            vslug, lines = NPC_TABLE[cat]
            if vslug not in want_voices:
                continue
            voices = [vslug]
        else:
            continue
        for slug in voices:
            for i, line in enumerate(lines, 1):
                line = LINE_OVERRIDES.get((slug, cat, i), line)
                jobs.append((slug, cat, i, line))
    return jobs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--voices", default="",
                    help="comma-separated voice slugs (default: all)")
    ap.add_argument("--categories", default="",
                    help="comma-separated categories (default: all)")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    all_cats = list(TACTICAL_TABLE) + list(NPC_TABLE)
    if args.list:
        for cat in all_cats:
            if cat in TACTICAL_TABLE:
                print(f"[{cat}] (all voices)")
                lines = TACTICAL_TABLE[cat]
            else:
                vslug, lines = NPC_TABLE[cat]
                print(f"[{cat}] (voice: {vslug})")
            for line in lines:
                print(f"  {line} ({len(line.split())} words)")
        return

    want_voices = [v[0] for v in VOICES
                   if not args.voices or v[0] in args.voices.split(",")]
    want_cats = [c for c in all_cats
                 if not args.categories or c in args.categories.split(",")]

    jobs = plan(want_voices, want_cats)
    total = len(jobs)
    done = 0
    for slug, cat, i, line in jobs:
        vdir = os.path.join(OUT, slug)
        os.makedirs(vdir, exist_ok=True)
        out = os.path.join(vdir, f"{cat}-{i}.mp3")
        if not args.force and os.path.exists(out) and os.path.getsize(out) > 0:
            done += 1
            continue
        try:
            render(line, VOICE_IDS[slug], out)
        except subprocess.CalledProcessError:
            print(f"RENDER FAIL (will retry on next pass): {out}", flush=True)
            try:
                if os.path.exists(out):
                    os.remove(out)
            except OSError:
                pass
        done += 1
        if done % 10 == 0 or done == total:
            print(f"rendered {done}/{total}", flush=True)

    # QC everything we were asked to render
    report = []
    failed = 0
    for slug, cat, i, line in jobs:
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
