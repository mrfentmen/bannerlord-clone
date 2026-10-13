"""Procedural SFX batch 80 for the Bannerlord-clone (round 79).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx80.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx80")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx80-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(808080)


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
def jib_sail5(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # jib: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.23, 0.23):
        m = int(0.16 * SR)
        flap = highpass(lowpass(noise(m), 1980), 680) * _env_decay(m, 43) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.54


def sable5(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sable: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.036, 0.038):
        m = int(0.023 * SR)
        mt = np.arange(m) / SR
        f = 3100 + 930 * np.sin(2 * np.pi * 29 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.023)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.47


# ---------------------------------------------------------------- weather / horror
def simoom5(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # simoom: fifth variant
    x = highpass(lowpass(noise(n), 2120), 405) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.125 * t)
    return _seamless(x, fade_s=0.6) * 0.65


def bean_sidhe4(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean sidhe: fourth variant
    out = np.zeros(n)
    # keening
    for b in np.arange(0.1, dur - 0.48, 0.67):
        m = int(0.38 * SR)
        mt = np.arange(m) / SR
        f = 860 - 360 * np.sin(2 * np.pi * 0.92 * mt)
        keen = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.38)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += keen
    return out * 0.56


# ---------------------------------------------------------------- tavern / farm
def noddy4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # noddy: fourth variant
    out = np.zeros(n)
    # deal
    dm = int(0.35 * SR)
    deal = highpass(lowpass(noise(dm), 3900), 1450) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.45, 1.1, 3):
        m = int(0.06 * SR)
        card = highpass(noise(m), 2350) * _env_decay(m, 73) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.51


def poult_peeps13(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: thirteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.016, 0.01):
        m = int(0.006 * SR)
        mt = np.arange(m) / SR
        f = 3450 + 880 * np.sin(2 * np.pi * 35 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.006)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.39


# ---------------------------------------------------------------- mine / forge
def bord_work8(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bord: eighth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.42, 0.47):
        m = int(0.35 * SR)
        work = lowpass(noise(m), 750) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.63


def chafery6(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chafery: sixth variant
    x = lowpass(noise(n), 530) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.29 * t)
    return _seamless(x, fade_s=0.6) * 0.65


# ---------------------------------------------------------------- kitchen / stable
def syllabub10():
    m = int(0.68 * SR)
    t = np.arange(m) / SR
    # syllabub: tenth variant
    whip = lowpass(noise(m), 1750) * 0.2 * np.sin(np.pi * np.minimum(t / 0.68, 1.0))
    whip *= 0.65 + 0.35 * np.sin(2 * np.pi * 4.7 * t)
    return whip * 0.58


def hay_tines7():
    m = int(0.58 * SR)
    t = np.arange(m) / SR
    # hay tines: seventh variant
    toss = highpass(lowpass(noise(m), 3100), 1220) * 0.21 * np.sin(np.pi * np.minimum(t / 0.58, 1.0))
    return toss * 0.62


# ---------------------------------------------------------------- ritual / combat
def prime5(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # prime: fifth variant
    out = np.zeros(n)
    for f in (113, 169, 226):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.56


def falconet7(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # falconet: seventh variant
    out = np.zeros(n)
    # crack
    cm = int(0.17 * SR)
    crack = lowpass(noise(cm), 2050) * _env_decay(cm, 60) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.44 * SR)
    tail = lowpass(noise(tm), 710) * _env_decay(tm, 31) * 0.22
    s = int(0.14 * SR)
    out[s:s + tm] += tail
    return out * 0.65


# ---------------------------------------------------------------- foley / misc
def pattens12(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: twelfth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.22):
        m = int(0.058 * SR)
        step = lowpass(highpass(noise(m), 340), 1480) * _env_decay(m, 82) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.5


def backstaff9():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # backstaff: ninth variant
    bs = np.sin(2 * np.pi * 2140 * t) * _env_decay(m, 77) * 0.11
    bs += np.sin(2 * np.pi * 3210 * t) * _env_decay(m, 90) * 0.05
    return bs * 0.58


def geoint_task6(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # GEOINT: sixth task variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.28, 0.5):
        m = int(0.2 * SR)
        mt = np.arange(m) / SR
        task = np.sin(2 * np.pi * 1620 * mt) * _env_decay(m, 29) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += task
    return out * 0.62


SFX80 = [
    ("naval/jib-sail5", jib_sail5, "jib sail"),
    ("animal/sable5", sable5, "sable chatter"),
    ("weather/simoom5", simoom5, "simoom wind"),
    ("horror/bean-sidhe4", bean_sidhe4, "bean sidhe keen"),
    ("tavern/noddy4", noddy4, "noddy game"),
    ("farm/poult-peeps13", poult_peeps13, "poult peeps"),
    ("mine/bord-work8", bord_work8, "bord work"),
    ("forge/chafery6", chafery6, "chafery fire"),
    ("kitchen/syllabub10", syllabub10, "syllabub whipped"),
    ("stable/hay-tines7", hay_tines7, "hay tines"),
    ("ritual/prime5", prime5, "prime prayer"),
    ("combat/falconet7", falconet7, "falconet fired"),
    ("foley/pattens12", pattens12, "pattens stepping"),
    ("misc/backstaff9", backstaff9, "backstaff sight"),
    ("modern/geoint-task6", geoint_task6, "GEOINT task"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX80:
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
    with open(os.path.join(OUT, "sfx80-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX80:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
