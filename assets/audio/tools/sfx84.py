"""Procedural SFX batch 84 for the Bannerlord-clone (round 83).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx84.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx84")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx84-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(848484)


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
def jib_sail6(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # jib: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.25):
        m = int(0.18 * SR)
        flap = highpass(lowpass(noise(m), 2050), 700) * _env_decay(m, 41) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.56


def sable6(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sable: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.038, 0.04):
        m = int(0.025 * SR)
        mt = np.arange(m) / SR
        f = 3050 + 940 * np.sin(2 * np.pi * 27 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.025)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.49


# ---------------------------------------------------------------- weather / horror
def simoom6(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # simoom: sixth variant
    x = highpass(lowpass(noise(n), 2150), 410) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.13 * t)
    return _seamless(x, fade_s=0.6) * 0.66


def bean_sidhe5(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean sidhe: fifth variant
    out = np.zeros(n)
    # keening
    for b in np.arange(0.1, dur - 0.47, 0.65):
        m = int(0.37 * SR)
        mt = np.arange(m) / SR
        f = 840 - 350 * np.sin(2 * np.pi * 0.94 * mt)
        keen = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.37)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += keen
    return out * 0.55


# ---------------------------------------------------------------- tavern / farm
def noddy5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # noddy: fifth variant
    out = np.zeros(n)
    # deal
    dm = int(0.37 * SR)
    deal = highpass(lowpass(noise(dm), 4000), 1500) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.47, 1.1, 3):
        m = int(0.062 * SR)
        card = highpass(noise(m), 2450) * _env_decay(m, 71) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.52


def poult_peeps14(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: fourteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.015, 0.009):
        m = int(0.005 * SR)
        mt = np.arange(m) / SR
        f = 3400 + 890 * np.sin(2 * np.pi * 34 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.005)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.38


# ---------------------------------------------------------------- mine / forge
def bord_work10(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bord: tenth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.45, 0.5):
        m = int(0.38 * SR)
        work = lowpass(noise(m), 780) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.66


def chafery7(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chafery: seventh variant
    x = lowpass(noise(n), 550) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.31 * t)
    return _seamless(x, fade_s=0.6) * 0.67


# ---------------------------------------------------------------- kitchen / stable
def syllabub11():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # syllabub: eleventh variant
    whip = lowpass(noise(m), 1800) * 0.2 * np.sin(np.pi * np.minimum(t / 0.7, 1.0))
    whip *= 0.65 + 0.35 * np.sin(2 * np.pi * 4.8 * t)
    return whip * 0.59


def hay_tines9():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # hay tines: ninth variant
    toss = highpass(lowpass(noise(m), 3200), 1260) * 0.21 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return toss * 0.64


# ---------------------------------------------------------------- ritual / combat
def prime6(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # prime: sixth variant
    out = np.zeros(n)
    for f in (115, 172, 230):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.58


def falconet9(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # falconet: ninth variant
    out = np.zeros(n)
    # crack
    cm = int(0.19 * SR)
    crack = lowpass(noise(cm), 2150) * _env_decay(cm, 58) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.46 * SR)
    tail = lowpass(noise(tm), 730) * _env_decay(tm, 29) * 0.22
    s = int(0.16 * SR)
    out[s:s + tm] += tail
    return out * 0.67


# ---------------------------------------------------------------- foley / misc
def pattens14(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: fourteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.26):
        m = int(0.066 * SR)
        step = lowpass(highpass(noise(m), 370), 1650) * _env_decay(m, 78) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.54


def backstaff11():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # backstaff: eleventh variant
    bs = np.sin(2 * np.pi * 2200 * t) * _env_decay(m, 81) * 0.11
    bs += np.sin(2 * np.pi * 3300 * t) * _env_decay(m, 94) * 0.05
    return bs * 0.62


def geoint_task8(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # GEOINT: eighth task variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.32, 0.54):
        m = int(0.24 * SR)
        mt = np.arange(m) / SR
        task = np.sin(2 * np.pi * 1680 * mt) * _env_decay(m, 26) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += task
    return out * 0.65


SFX84 = [
    ("naval/jib-sail6", jib_sail6, "jib sail"),
    ("animal/sable6", sable6, "sable chatter"),
    ("weather/simoom6", simoom6, "simoom wind"),
    ("horror/bean-sidhe5", bean_sidhe5, "bean sidhe keen"),
    ("tavern/noddy5", noddy5, "noddy game"),
    ("farm/poult-peeps14", poult_peeps14, "poult peeps"),
    ("mine/bord-work10", bord_work10, "bord work"),
    ("forge/chafery7", chafery7, "chafery fire"),
    ("kitchen/syllabub11", syllabub11, "syllabub whipped"),
    ("stable/hay-tines9", hay_tines9, "hay tines"),
    ("ritual/prime6", prime6, "prime prayer"),
    ("combat/falconet9", falconet9, "falconet fired"),
    ("foley/pattens14", pattens14, "pattens stepping"),
    ("misc/backstaff11", backstaff11, "backstaff sight"),
    ("modern/geoint-task8", geoint_task8, "GEOINT task"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX84:
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
    with open(os.path.join(OUT, "sfx84-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX84:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
