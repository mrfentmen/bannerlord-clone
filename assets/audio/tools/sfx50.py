"""Procedural SFX batch 50 for the Bannerlord-clone (round 49).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx50.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx50")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx50-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(505050)


def _env_decay(n, rate):
    t = np.arange(n) / SR
    return np.exp(-t * rate)


def _seamless(x, fade_s=0.5):
    M = int(fade_s * SR)
    fade = np.linspace(0, 1, M)
    y = x.copy()
    head = np.empty(M)
    head[:-1] = x[1:M]
    head[-1] = x[0]
    y[-M:] = y[-M:] * (1 - fade) + head * fade
    return y


# ---------------------------------------------------------------- naval / animals
def mizzen_top(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mizzen top: aft rigging
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.28, 0.27):
        m = int(0.2 * SR)
        creak = np.sin(2 * np.pi * 184 * np.arange(m) / SR) * _env_decay(m, 34) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.62


def polecat(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # polecat: musk and chitter
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.1):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2600 + 900 * np.sin(2 * np.pi * 11 * mt)
        chit = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.56


# ---------------------------------------------------------------- weather / horror
def leveche(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # levêche: hot southern wind
    x = highpass(lowpass(noise(n), 3300), 530) * 0.4
    x *= 0.56 + 0.44 * np.sin(2 * np.pi * 0.25 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def fuath(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fuath: water spirit
    out = np.zeros(n)
    for f in (150, 225, 300):
        fmod = f + 60 * np.sin(2 * np.pi * 0.45 * t)
        voice = np.sin(np.cumsum(2 * np.pi * fmod / SR)) * 0.12
        voice *= np.sin(np.pi * np.minimum(t / dur, 1.0))
        out += voice
    return out * 0.63


# ---------------------------------------------------------------- tavern / farm
def dutch_pins(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # dutch pins: skittles variant
    out = np.zeros(n)
    # roll
    rm = int(0.4 * SR)
    roll = lowpass(noise(rm), 750) * 0.3 * np.sin(np.pi * np.arange(rm) / rm)
    out[:rm] += roll
    # pins
    for b in _rng.uniform(0.5, 1.3, 6):
        m = int(0.11 * SR)
        pin = np.sin(2 * np.pi * 930 * np.arange(m) / SR) * _env_decay(m, 56) * 0.17
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pin
    return out * 0.64


def poult_peeps4(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.06, 0.045):
        m = int(0.035 * SR)
        mt = np.arange(m) / SR
        f = 3900 + 800 * np.sin(2 * np.pi * 17 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13 * np.sin(np.pi * mt / 0.035)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def dead_work(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # dead work: unproductive digging
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.5, 0.55):
        m = int(0.42 * SR)
        dig = lowpass(noise(m), 900) * 0.32 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dig
    return out * 0.63


def blast_furnace2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # blast furnace: second variant
    x = lowpass(noise(n), 650) * 0.41
    x *= 0.65 + 0.35 * np.sin(2 * np.pi * 0.42 * t)
    return _seamless(x, fade_s=0.6) * 0.65


# ---------------------------------------------------------------- kitchen / stable
def sack_posset2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # sack posset: second variant
    pour = lowpass(noise(m), 1450) * 0.26 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return pour * 0.6


def straw_tick():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # straw tick: bedding rustle
    rustle = highpass(lowpass(noise(m), 3400), 1300) * 0.26 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return rustle * 0.62


# ---------------------------------------------------------------- ritual / combat
def penitence(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # penitence: low chant
    out = np.zeros(n)
    for f in (90, 135, 180):
        out += np.sin(2 * np.pi * f * t) * 0.07
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.63


def culverin_blast(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # culverin: long gun blast
    out = np.zeros(n)
    # blast
    bm = int(0.24 * SR)
    blast = lowpass(noise(bm), 1500) * _env_decay(bm, 48) * 0.54
    out[:bm] += blast
    # echo
    em = int(0.5 * SR)
    echo = lowpass(noise(em), 600) * _env_decay(em, 28) * 0.28
    s = int(0.2 * SR)
    out[s:s + em] += echo
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def pattens_step3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.17, 0.31):
        m = int(0.11 * SR)
        step = lowpass(highpass(noise(m), 480), 2100) * _env_decay(m, 67) * 0.26
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.6


def octant():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # octant: brass instrument
    oct_ = np.sin(2 * np.pi * 1750 * t) * _env_decay(m, 55) * 0.15
    oct_ += np.sin(2 * np.pi * 2625 * t) * _env_decay(m, 68) * 0.08
    return oct_ * 0.59


def drone_link(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # drone: uplink link
    f = 1300 + 600 * np.sin(2 * np.pi * 0.7 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12
    x *= 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 2.2 * t))
    return _seamless(x, fade_s=0.4) * 0.58


SFX50 = [
    ("naval/mizzen-top", mizzen_top, "mizzen top"),
    ("animal/polecat", polecat, "polecat chitter"),
    ("weather/leveche", leveche, "levêche wind"),
    ("horror/fuath", fuath, "fuath spirit"),
    ("tavern/dutch-pins", dutch_pins, "dutch pins"),
    ("farm/poult-peeps4", poult_peeps4, "poult peeps"),
    ("mine/dead-work", dead_work, "dead work"),
    ("forge/blast-furnace2", blast_furnace2, "blast furnace"),
    ("kitchen/sack-posset2", sack_posset2, "sack posset"),
    ("stable/straw-tick", straw_tick, "straw tick"),
    ("ritual/penitence", penitence, "penitence chant"),
    ("combat/culverin-blast", culverin_blast, "culverin blast"),
    ("foley/pattens-step3", pattens_step3, "pattens stepping"),
    ("misc/octant", octant, "octant sight"),
    ("modern/drone-link", drone_link, "drone link"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX50:
        x = fn()
        assert np.all(np.isfinite(x)) and len(x) > 0, name
        x = limiter(x, ceiling=0.89)
        path = os.path.join(OUT, name + ".wav")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        write_wav(path, x)
        peak = float(np.max(np.abs(x)))
        rms = float(np.sqrt(np.mean(x ** 2)))
        assert rms > 1e-4, f"{name}: silent"
        print(f"{name:32s} {len(x)/SR:5.1f}s peak={peak:.2f} rms={rms:.3f}")
        manifest.append({"name": name, "description": desc,
                         "duration_s": round(len(x) / SR, 2),
                         "peak": round(peak, 3), "rms": round(rms, 4)})
    with open(os.path.join(OUT, "sfx50-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX50:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
