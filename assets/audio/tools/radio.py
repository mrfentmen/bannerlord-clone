"""In-game radio pipeline (ART_AND_AUDIO.md 8.2).
A tunable station: original era-styled music beds + news bulletins
generated from REAL world state (settlements.jsonl.gz simulation data).
Never names real living people or parties - all content is procedural
from place names + generic civic events. Run: python3 radio.py"""
import gzip
import json
import os
import subprocess
import sys
import wave as wv

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from synth import SR, Track, crash, highpass, limiter, noise, write_wav
from compose import n
from sfx import _seamless

GM = os.path.dirname(__file__)
OUT = os.path.join(GM, "out", "radio")
os.makedirs(OUT, exist_ok=True)
EXPORTS = os.path.expanduser(
    "~/workspace/bannerlord-clone-main/services/world-data/exports")
_rng = np.random.default_rng(20261001)
STATION = "KHRD"


# ---------------- bulletin writer (from real world state) ----------------

def load_towns(limit=4000):
    towns = []
    with gzip.open(f"{EXPORTS}/settlements.jsonl.gz", "rt") as f:
        for line in f:
            r = json.loads(line)
            if "name" in r:
                towns.append(r)
                if len(towns) >= limit:
                    break
    return towns


def clean_name(name):
    return (name.replace(" city", "").replace(" town", "")
            .replace(" village", "").replace(" borough", "").strip())


def write_bulletins(towns, k=4):
    """Pick newsworthy towns by simulation state; render bulletin scripts."""
    scored = []
    for t in towns:
        name = clean_name(t["name"])
        state = t.get("state_name", "")
        unrest = t.get("unrest", 0) or 0
        pros = t.get("prosperity", 0.5) or 0.5
        food = t.get("food_stock_person_days", 0) or 0
        demand = t.get("food_demand_person_days", 1) or 1
        infected = t.get("infected", 0) or 0
        pop = t.get("population", 0) or 0
        if unrest > 0.55:
            scored.append((unrest,
                f"And in {name}, {state}: local councils report growing unrest, "
                f"with crowds gathering near the town hall. Officials are urging "
                f"calm and say extra supplies are on the way."))
        elif food < demand * 8:
            scored.append((0.7,
                f"To {name}, {state}, where food stocks are running thinner than "
                f"usual. Markets open early tomorrow, and traders are advised to "
                f"bring grain while prices hold."))
        elif infected > 0.02:
            scored.append((0.65,
                f"Health watch in {name}, {state}: clinics report a rise in fever "
                f"cases. Residents are asked to check on neighbors and keep to "
                f"clean water."))
        elif pros > 0.75 and pop > 20000:
            scored.append((0.6,
                f"Good news from {name}, {state}, where markets are thriving and "
                f"the evening trade drew record crowds. Merchants credit the "
                f"steady harvest."))
    scored.sort(key=lambda s: -s[0])
    items = [s[1] for s in scored[:k]]
    while len(items) < k:  # filler: weather / roads, always safe
        t = towns[_rng.integers(len(towns))]
        name = clean_name(t["name"])
        state = t.get("state_name", "")
        items.append(_rng.choice([
            f"Weather desk: storms moving through {state} tonight. Travelers near "
            f"{name} should expect wet roads and plan extra time.",
            f"Road report: convoy traffic is heavy on the {name} corridor. "
            f"Drivers should keep to daylight hours and watch fuel.",
            f"From {name}, {state}: the town market opens at dawn with fresh "
            f"produce. Early arrival advised; stalls fill fast.",
        ]))
    intro = (f"You're listening to {STATION}, Heartland Radio. "
             f"Here's the latest from across the region.")
    outro = (f"That's the news for now. Stay tuned for more music, "
             f"right here on {STATION}, Heartland Radio.")
    return [intro] + items[:k] + [outro]


# ---------------- station music beds (seamless loops) ----------------

def bed(name, bpm, root_name, prog, style):
    """root_name like 'E2'; prog = semitone offsets per bar."""
    root = n(root_name)
    bars = 8
    tr = Track(bpm, bars * 4)
    for b in range(bars):
        r = root + prog[b % len(prog)]
        s = b * 4
        if style == "rock":
            for q in range(4):
                tr.kick(s + q)
                if q % 2 == 1:
                    tr.snare(s + q)
                tr.hat(s + q + 0.5)
            tr.bass(s, r - 12, 4, cutoff=900)
            tr.pad(s, [r, r + 7, r + 12], 4, cutoff=2500)
            if b % 2 == 0:
                tr.lead(s, r + 12, 2)
                tr.lead(s + 2, r + 10, 2)
        elif style == "country":
            for q in range(4):
                tr.kick(s + q, vel=0.6)
                tr.hat(s + q + 0.5, vel=0.4)
                if q == 1:
                    tr.snare(s + q, vel=0.5)
            for q in range(8):
                tr.bass(s + q * 0.5, r - 12 + (7 if q % 4 == 3 else 0),
                        0.45, cutoff=700)
            for i, iv in enumerate([0, 4, 7, 12, 7, 4]):
                tr.pluck(s + i * (4 / 6), r + 12 + iv, 0.9)
        else:  # synth
            for q in range(4):
                tr.kick(s + q, vel=0.7)
                tr.hat(s + q + 0.5, vel=0.4)
            tr.pad(s, [r, r + 3, r + 7, r + 12], 4)
            for i in range(16):
                iv = [0, 3, 7, 12, 7, 3][i % 6]
                tr.pluck(s + i * 0.25, r + 24 + iv, 0.22, vel=0.5)
    tr.trim()
    x = _seamless(limiter(tr.buf))
    write_wav(os.path.join(OUT, f"bed-{name}.wav"), x)
    print(f"bed-{name}: {len(x)/SR:.0f}s")
    return x


# ---------------- station ident jingle ----------------

def ident():
    tr = Track(120, 4)
    for i, iv in enumerate([0, 4, 7, 12]):
        tr.brass( i * 0.55 / (60 / 120), n("A3") + iv, 0.5)
    tr.crash(0)
    tr.trim()
    x = limiter(tr.buf)
    write_wav(os.path.join(OUT, "ident.wav"), x)
    return x


# ---------------- tts ----------------

def speak(text, out_path):
    subprocess.run(
        ["/opt/hatch/bin/tts", "speak", "--output", out_path,
         "--text-stdin"],
        input=text.encode(), check=True,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ---------------- assembly ----------------

def read_wav(p):
    w = wv.open(p)
    return (np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
            .astype(float) / 32768)


def wav_of_mp3(mp3, wav):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-i", mp3, wav], check=True)


def assemble(beds_wav, bulletins_wav):
    """Stitch a broadcast segment: bed -> static -> ident -> bulletin ..."""
    static = highpass(noise(int(0.6 * SR)), 2000) * 0.15
    ident_w = read_wav(os.path.join(OUT, "ident.wav"))
    segs = []
    for i, bed_w in enumerate(beds_wav):
        segs.append(bed_w[:int(8 * SR)])
        segs.append(static)
        if i == 0:
            segs.append(ident_w)
            segs.append(static)
        segs.append(read_wav(bulletins_wav[i % len(bulletins_wav)]))
        segs.append(static)
    segs.append(beds_wav[0][:int(8 * SR)])
    M = int(0.3 * SR)  # raised-cosine-ish crossfades between segments
    out = segs[0]
    for s in segs[1:]:
        m = min(M, len(out), len(s))
        fade = np.linspace(0, 1, m)
        tail = out[-m:] * (1 - fade) + s[:m] * fade
        out = np.concatenate([out[:-m], tail, s[m:]])
    out = limiter(out)
    write_wav(os.path.join(OUT, "broadcast-hour.wav"), out)
    print(f"broadcast-hour: {len(out)/SR:.0f}s")


def main():
    towns = load_towns()
    print(f"{len(towns)} towns loaded")
    scripts = write_bulletins(towns)
    with open(os.path.join(OUT, "bulletins.json"), "w") as f:
        json.dump(scripts, f, indent=2)
    bulletin_wavs = []
    for i, text in enumerate(scripts):
        mp3 = os.path.join(OUT, f"bulletin-{i}.mp3")
        wav = os.path.join(OUT, f"bulletin-{i}.wav")
        speak(text, mp3)
        wav_of_mp3(mp3, wav)
        bulletin_wavs.append(wav)
        print(f"bulletin-{i}: {len(text)} chars")
    beds = [
        bed("heartland-rock", 126, "E2", [0, 0, 8, 7], "rock"),
        bed("country-lope", 96, "G2", [0, 5, 0, 7], "country"),
        bed("night-synth", 100, "A1", [0, 8, 5, 7], "synth"),
    ]
    ident()
    assemble(beds, bulletin_wavs[1:-1])
    for i, fn in enumerate(["bed-heartland-rock.wav", "bed-country-lope.wav",
                            "bed-night-synth.wav", "ident.wav",
                            "broadcast-hour.wav"] +
                           [f"bulletin-{j}.wav" for j in range(len(scripts))]):
        src = os.path.join(OUT, fn)
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-i", src, "-c:a", "libmp3lame", "-q:a", "4",
                        src[:-4] + ".mp3"], check=True)
    print("radio done ->", OUT)


if __name__ == "__main__":
    main()
