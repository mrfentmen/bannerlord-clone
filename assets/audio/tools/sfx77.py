"""Procedural SFX batch 77 for the Bannerlord-clone (round 76).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx77.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx77")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx77-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(777777)


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
def main_sail4(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # main sail: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 2050), 700) * _env_decay(m, 42) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.55


def polecat4(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # polecat: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.037, 0.039):
        m = int(0.024 * SR)
        mt = np.arange(m) / SR
        f = 2850 + 960 * np.sin(2 * np.pi * 24 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.024)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.48


# ---------------------------------------------------------------- weather / horror
def scirocco4(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # scirocco: fourth variant
    x = highpass(lowpass(noise(n), 2150), 410) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.13 * t)
    return _seamless(x, fade_s=0.6) * 0.65


def bean_nighe8(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: eighth variant
    out = np.zeros(n)
    # washing
    wm = int(0.9 * SR)
    wash = highpass(lowpass(noise(wm), 2250), 680) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 3.2 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(1.0, dur - 0.43, 0.58):
        m = int(0.33 * SR)
        mt = np.arange(m) / SR
        f = 760 - 310 * np.sin(2 * np.pi * 1.02 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.33)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.51


# ---------------------------------------------------------------- tavern / farm
def gleek3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gleek: third variant
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


def duckling_cheeps10(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ducklings: tenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.017, 0.011):
        m = int(0.006 * SR)
        mt = np.arange(m) / SR
        f = 3250 + 900 * np.sin(2 * np.pi * 34 * mt)
        cheep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.006)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cheep
    return out * 0.41


# ---------------------------------------------------------------- mine / forge
def longwall7(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # longwall: seventh variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.45):
        m = int(0.33 * SR)
        cut = lowpass(noise(m), 730) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut
    return out * 0.61


def rolling4(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rolling: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.35, 0.4):
        m = int(0.29 * SR)
        roll = lowpass(noise(m), 600) * 0.36 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += roll
    return out * 0.6


# ---------------------------------------------------------------- kitchen / stable
def syllabub9():
    m = int(0.66 * SR)
    t = np.arange(m) / SR
    # syllabub: ninth variant
    whip = lowpass(noise(m), 1700) * 0.2 * np.sin(np.pi * np.minimum(t / 0.66, 1.0))
    whip *= 0.65 + 0.35 * np.sin(2 * np.pi * 4.6 * t)
    return whip * 0.57


def feed_bucket8():
    m = int(0.56 * SR)
    t = np.arange(m) / SR
    # feed bucket: eighth variant
    pour = highpass(lowpass(noise(m), 2950), 1120) * 0.21 * np.sin(np.pi * np.minimum(t / 0.56, 1.0))
    return pour * 0.59


# ---------------------------------------------------------------- ritual / combat
def matins5(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # matins: fifth variant
    out = np.zeros(n)
    for f in (110, 164, 220):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.54


def demi_culverin6(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # demi-culverin: sixth variant
    out = np.zeros(n)
    # crack
    cm = int(0.16 * SR)
    crack = lowpass(noise(cm), 1950) * _env_decay(cm, 60) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.42 * SR)
    tail = lowpass(noise(tm), 690) * _env_decay(tm, 31) * 0.22
    s = int(0.13 * SR)
    out[s:s + tm] += tail
    return out * 0.64


# ---------------------------------------------------------------- foley / misc
def sabot_step11(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: eleventh variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.21):
        m = int(0.057 * SR)
        step = lowpass(highpass(noise(m), 340), 1480) * _env_decay(m, 83) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.49


def astrolabe7():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # astrolabe: seventh variant
    ab = np.sin(2 * np.pi * 2060 * t) * _env_decay(m, 74) * 0.11
    ab += np.sin(2 * np.pi * 3090 * t) * _env_decay(m, 87) * 0.05
    return ab * 0.55


def sigint_sweep6(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # SIGINT: sixth sweep variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.29, 0.59):
        m = int(0.23 * SR)
        sweep = highpass(lowpass(noise(m), 3300), 820) * _env_decay(m, 27) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += sweep
    return out * 0.61


SFX77 = [
    ("naval/main-sail4", main_sail4, "main sail"),
    ("animal/polecat4", polecat4, "polecat chatter"),
    ("weather/scirocco4", scirocco4, "scirocco wind"),
    ("horror/bean-nighe8", bean_nighe8, "bean nighe"),
    ("tavern/gleek3", gleek3, "gleek game"),
    ("farm/duckling-cheeps10", duckling_cheeps10, "duckling cheeps"),
    ("mine/longwall7", longwall7, "longwall cut"),
    ("forge/rolling4", rolling4, "rolling mill"),
    ("kitchen/syllabub9", syllabub9, "syllabub whipped"),
    ("stable/feed-bucket8", feed_bucket8, "feed bucket"),
    ("ritual/matins5", matins5, "matins prayer"),
    ("combat/demi-culverin6", demi_culverin6, "demi-culverin fired"),
    ("foley/sabot-step11", sabot_step11, "sabots stepping"),
    ("misc/astrolabe7", astrolabe7, "astrolabe sight"),
    ("modern/sigint-sweep6", sigint_sweep6, "SIGINT sweep"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX77:
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
    with open(os.path.join(OUT, "sfx77-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX77:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
