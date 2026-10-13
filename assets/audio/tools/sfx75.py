"""Procedural SFX batch 75 for the Bannerlord-clone (round 74).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx75.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx75")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx75-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(757575)


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
def jib_sail4(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # jib: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.22, 0.22):
        m = int(0.15 * SR)
        flap = highpass(lowpass(noise(m), 1940), 670) * _env_decay(m, 44) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.53


def sable4(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sable: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.035, 0.037):
        m = int(0.022 * SR)
        mt = np.arange(m) / SR
        f = 3150 + 920 * np.sin(2 * np.pi * 28 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.022)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.46


# ---------------------------------------------------------------- weather / horror
def simoom4(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # simoom: fourth variant
    x = highpass(lowpass(noise(n), 2100), 400) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.12 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def bean_sidhe3(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean sidhe: third variant
    out = np.zeros(n)
    # keening
    for b in np.arange(0.1, dur - 0.49, 0.69):
        m = int(0.39 * SR)
        mt = np.arange(m) / SR
        f = 880 - 370 * np.sin(2 * np.pi * 0.9 * mt)
        keen = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.39)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += keen
    return out * 0.57


# ---------------------------------------------------------------- tavern / farm
def noddy3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # noddy: third variant
    out = np.zeros(n)
    # deal
    dm = int(0.34 * SR)
    deal = highpass(lowpass(noise(dm), 3850), 1420) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.44, 1.1, 3):
        m = int(0.059 * SR)
        card = highpass(noise(m), 2300) * _env_decay(m, 74) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.5


def poult_peeps12(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: twelfth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.017, 0.011):
        m = int(0.007 * SR)
        mt = np.arange(m) / SR
        f = 3500 + 870 * np.sin(2 * np.pi * 36 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.007)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.4


# ---------------------------------------------------------------- mine / forge
def bord_work6(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bord: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.38, 0.43):
        m = int(0.31 * SR)
        work = lowpass(noise(m), 700) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.59


def chafery5(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chafery: fifth variant
    x = lowpass(noise(n), 510) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.27 * t)
    return _seamless(x, fade_s=0.6) * 0.63


# ---------------------------------------------------------------- kitchen / stable
def syllabub8():
    m = int(0.64 * SR)
    t = np.arange(m) / SR
    # syllabub: eighth variant
    whip = lowpass(noise(m), 1650) * 0.2 * np.sin(np.pi * np.minimum(t / 0.64, 1.0))
    whip *= 0.65 + 0.35 * np.sin(2 * np.pi * 4.5 * t)
    return whip * 0.56


def hay_tines5():
    m = int(0.56 * SR)
    t = np.arange(m) / SR
    # hay tines: fifth variant
    toss = highpass(lowpass(noise(m), 3000), 1180) * 0.21 * np.sin(np.pi * np.minimum(t / 0.56, 1.0))
    return toss * 0.6


# ---------------------------------------------------------------- ritual / combat
def prime4(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # prime: fourth variant
    out = np.zeros(n)
    for f in (111, 166, 222):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.54


def falconet5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # falconet: fifth variant
    out = np.zeros(n)
    # crack
    cm = int(0.15 * SR)
    crack = lowpass(noise(cm), 1950) * _env_decay(cm, 62) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.41 * SR)
    tail = lowpass(noise(tm), 680) * _env_decay(tm, 33) * 0.22
    s = int(0.12 * SR)
    out[s:s + tm] += tail
    return out * 0.63


# ---------------------------------------------------------------- foley / misc
def pattens10(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: tenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.2):
        m = int(0.055 * SR)
        step = lowpass(highpass(noise(m), 320), 1400) * _env_decay(m, 85) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.48


def backstaff7():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # backstaff: seventh variant
    bs = np.sin(2 * np.pi * 2100 * t) * _env_decay(m, 72) * 0.11
    bs += np.sin(2 * np.pi * 3150 * t) * _env_decay(m, 85) * 0.05
    return bs * 0.53


def geoint_task4(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # GEOINT: fourth task variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.25, 0.47):
        m = int(0.17 * SR)
        mt = np.arange(m) / SR
        task = np.sin(2 * np.pi * 1560 * mt) * _env_decay(m, 32) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += task
    return out * 0.59


SFX75 = [
    ("naval/jib-sail4", jib_sail4, "jib sail"),
    ("animal/sable4", sable4, "sable chatter"),
    ("weather/simoom4", simoom4, "simoom wind"),
    ("horror/bean-sidhe3", bean_sidhe3, "bean sidhe keen"),
    ("tavern/noddy3", noddy3, "noddy game"),
    ("farm/poult-peeps12", poult_peeps12, "poult peeps"),
    ("mine/bord-work6", bord_work6, "bord work"),
    ("forge/chafery5", chafery5, "chafery fire"),
    ("kitchen/syllabub8", syllabub8, "syllabub whipped"),
    ("stable/hay-tines5", hay_tines5, "hay tines"),
    ("ritual/prime4", prime4, "prime prayer"),
    ("combat/falconet5", falconet5, "falconet fired"),
    ("foley/pattens10", pattens10, "pattens stepping"),
    ("misc/backstaff7", backstaff7, "backstaff sight"),
    ("modern/geoint-task4", geoint_task4, "GEOINT task"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX75:
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
    with open(os.path.join(OUT, "sfx75-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX75:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
