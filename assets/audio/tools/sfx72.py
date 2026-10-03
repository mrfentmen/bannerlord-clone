"""Procedural SFX batch 72 for the Bannerlord-clone (round 71).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx72.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx72")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx72-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(727272)


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
def main_sail3(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # main sail: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 2050), 700) * _env_decay(m, 42) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.54


def polecat3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # polecat: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.037, 0.039):
        m = int(0.023 * SR)
        mt = np.arange(m) / SR
        f = 2900 + 950 * np.sin(2 * np.pi * 25 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.023)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.47


# ---------------------------------------------------------------- weather / horror
def scirocco3(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # scirocco: third variant
    x = highpass(lowpass(noise(n), 2120), 400) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.12 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def bean_nighe4(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: fourth variant
    out = np.zeros(n)
    # washing
    wm = int(1.1 * SR)
    wash = highpass(lowpass(noise(wm), 2650), 840) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 2.4 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(1.2, dur - 0.47, 0.66):
        m = int(0.37 * SR)
        mt = np.arange(m) / SR
        f = 840 - 350 * np.sin(2 * np.pi * 0.94 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.37)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.55


# ---------------------------------------------------------------- tavern / farm
def gleek2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gleek: second variant
    out = np.zeros(n)
    # deal
    dm = int(0.33 * SR)
    deal = highpass(lowpass(noise(dm), 3800), 1400) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.43, 1.1, 3):
        m = int(0.058 * SR)
        card = highpass(noise(m), 2250) * _env_decay(m, 75) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.49


def duckling_cheeps9(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ducklings: ninth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.018, 0.012):
        m = int(0.007 * SR)
        mt = np.arange(m) / SR
        f = 3300 + 890 * np.sin(2 * np.pi * 35 * mt)
        cheep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.007)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cheep
    return out * 0.4


# ---------------------------------------------------------------- mine / forge
def longwall5(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # longwall: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.37, 0.42):
        m = int(0.3 * SR)
        cut = lowpass(noise(m), 680) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut
    return out * 0.58


def rolling3(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rolling: third variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.34, 0.39):
        m = int(0.28 * SR)
        roll = lowpass(noise(m), 590) * 0.36 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += roll
    return out * 0.59


# ---------------------------------------------------------------- kitchen / stable
def syllabub7():
    m = int(0.62 * SR)
    t = np.arange(m) / SR
    # syllabub: seventh variant
    whip = lowpass(noise(m), 1600) * 0.2 * np.sin(np.pi * np.minimum(t / 0.62, 1.0))
    whip *= 0.65 + 0.35 * np.sin(2 * np.pi * 4.4 * t)
    return whip * 0.55


def feed_bucket7():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # feed bucket: seventh variant
    pour = highpass(lowpass(noise(m), 2900), 1100) * 0.21 * np.sin(np.pi * np.minimum(t / 0.55, 1.0))
    return pour * 0.58


# ---------------------------------------------------------------- ritual / combat
def matins4(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # matins: fourth variant
    out = np.zeros(n)
    for f in (109, 163, 218):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.52


def demi_culverin5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # demi-culverin: fifth variant
    out = np.zeros(n)
    # crack
    cm = int(0.14 * SR)
    crack = lowpass(noise(cm), 1900) * _env_decay(cm, 63) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.4 * SR)
    tail = lowpass(noise(tm), 660) * _env_decay(tm, 34) * 0.22
    s = int(0.11 * SR)
    out[s:s + tm] += tail
    return out * 0.62


# ---------------------------------------------------------------- foley / misc
def sabot_step10(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: tenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.2):
        m = int(0.056 * SR)
        step = lowpass(highpass(noise(m), 330), 1450) * _env_decay(m, 85) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.47


def astrolabe6():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # astrolabe: sixth variant
    ab = np.sin(2 * np.pi * 2050 * t) * _env_decay(m, 69) * 0.11
    ab += np.sin(2 * np.pi * 3075 * t) * _env_decay(m, 82) * 0.05
    return ab * 0.5


def sigint_sweep5(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # SIGINT: fifth sweep variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.27, 0.57):
        m = int(0.21 * SR)
        sweep = highpass(lowpass(noise(m), 3100), 780) * _env_decay(m, 29) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += sweep
    return out * 0.59


SFX72 = [
    ("naval/main-sail3", main_sail3, "main sail"),
    ("animal/polecat3", polecat3, "polecat chatter"),
    ("weather/scirocco3", scirocco3, "scirocco wind"),
    ("horror/bean-nighe4", bean_nighe4, "bean nighe"),
    ("tavern/gleek2", gleek2, "gleek game"),
    ("farm/duckling-cheeps9", duckling_cheeps9, "duckling cheeps"),
    ("mine/longwall5", longwall5, "longwall cut"),
    ("forge/rolling3", rolling3, "rolling mill"),
    ("kitchen/syllabub7", syllabub7, "syllabub whipped"),
    ("stable/feed-bucket7", feed_bucket7, "feed bucket"),
    ("ritual/matins4", matins4, "matins prayer"),
    ("combat/demi-culverin5", demi_culverin5, "demi-culverin fired"),
    ("foley/sabot-step10", sabot_step10, "sabots stepping"),
    ("misc/astrolabe6", astrolabe6, "astrolabe sight"),
    ("modern/sigint-sweep5", sigint_sweep5, "SIGINT sweep"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX72:
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
    with open(os.path.join(OUT, "sfx72-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX72:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
