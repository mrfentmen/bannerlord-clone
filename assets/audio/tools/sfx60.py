"""Procedural SFX batch 60 for the Bannerlord-clone (round 59).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx60.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx60")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx60-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(606060)


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
def sky_sail(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sky sail: highest square
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.26, 0.25):
        m = int(0.18 * SR)
        flap = highpass(lowpass(noise(m), 2100), 780) * _env_decay(m, 38) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.56


def ferret2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ferret: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.05, 0.055):
        m = int(0.032 * SR)
        mt = np.arange(m) / SR
        f = 3400 + 860 * np.sin(2 * np.pi * 23 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.032)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.51


# ---------------------------------------------------------------- weather / horror
def harmattan2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # harmattan: second variant
    x = highpass(lowpass(noise(n), 2350), 430) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.15 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def cait_sith(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cait sith: fairy cat
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.5, 0.7):
        m = int(0.42 * SR)
        mt = np.arange(m) / SR
        f = 680 - 320 * np.sin(2 * np.pi * 0.9 * mt)
        yowl = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16 * np.sin(np.pi * mt / 0.42)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += yowl
    return out * 0.6


# ---------------------------------------------------------------- tavern / farm
def cribbage3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cribbage: third variant
    out = np.zeros(n)
    # deal
    dm = int(0.4 * SR)
    deal = highpass(lowpass(noise(dm), 4300), 1650) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # pegging
    for b in _rng.uniform(0.5, 1.1, 3):
        m = int(0.05 * SR)
        peg = np.sin(2 * np.pi * 2400 * np.arange(m) / SR) * _env_decay(m, 75) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peg
    return out * 0.54


def gosling_calls2(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.032, 0.022):
        m = int(0.016 * SR)
        mt = np.arange(m) / SR
        f = 4400 + 700 * np.sin(2 * np.pi * 26 * mt)
        call = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.016)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += call
    return out * 0.47


# ---------------------------------------------------------------- mine / forge
def coaling(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # coaling: loading coal
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.42, 0.48):
        m = int(0.35 * SR)
        shovel = lowpass(noise(m), 780) * 0.33 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += shovel
    return out * 0.6


def blast2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # blast: second variant
    x = lowpass(noise(n), 540) * 0.44
    x *= 0.57 + 0.43 * np.sin(2 * np.pi * 0.33 * t)
    return _seamless(x, fade_s=0.6) * 0.64


# ---------------------------------------------------------------- kitchen / stable
def posset_bowl2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # posset: second bowl variant
    swirl = lowpass(noise(m), 1150) * 0.22 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    swirl *= 0.68 + 0.32 * np.sin(2 * np.pi * 3.8 * t)
    return swirl * 0.57


def manger4():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # manger: fourth variant
    chew = lowpass(noise(m), 900) * 0.24 * np.sin(np.pi * np.minimum(t / 0.55, 1.0))
    chew *= 0.72 + 0.28 * np.sin(2 * np.pi * 3.5 * t)
    return chew * 0.59


# ---------------------------------------------------------------- ritual / combat
def compline3(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # compline: third variant
    out = np.zeros(n)
    for f in (120, 180, 240):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.56


def culverin2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # culverin: second variant
    out = np.zeros(n)
    # boom
    bm = int(0.2 * SR)
    boom = lowpass(noise(bm), 1800) * _env_decay(bm, 48) * 0.45
    out[:bm] += boom
    # rumble
    rm = int(0.5 * SR)
    rumble = lowpass(noise(rm), 650) * _env_decay(rm, 30) * 0.24
    s = int(0.16 * SR)
    out[s:s + rm] += rumble
    return out * 0.66


# ---------------------------------------------------------------- foley / misc
def pattens6(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.3):
        m = int(0.075 * SR)
        step = lowpass(highpass(noise(m), 520), 2400) * _env_decay(m, 76) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.54


def traverse2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # traverse: second variant
    tr = np.sin(2 * np.pi * 2050 * t) * _env_decay(m, 64) * 0.11
    tr += np.sin(2 * np.pi * 3075 * t) * _env_decay(m, 77) * 0.05
    return tr * 0.52


def elint_blip(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ELINT: signal blip
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.25, 0.5):
        m = int(0.18 * SR)
        mt = np.arange(m) / SR
        blip = np.sin(2 * np.pi * 1900 * mt) * _env_decay(m, 28) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += blip
    return out * 0.59


SFX60 = [
    ("naval/sky-sail", sky_sail, "sky sail"),
    ("animal/ferret2", ferret2, "ferret chatter"),
    ("weather/harmattan2", harmattan2, "harmattan wind"),
    ("horror/cait-sith", cait_sith, "cait sith yowl"),
    ("tavern/cribbage3", cribbage3, "cribbage game"),
    ("farm/gosling-calls2", gosling_calls2, "gosling calls"),
    ("mine/coaling", coaling, "coaling shovel"),
    ("forge/blast2", blast2, "blast furnace"),
    ("kitchen/posset-bowl2", posset_bowl2, "posset bowl"),
    ("stable/manger4", manger4, "manger chewing"),
    ("ritual/compline3", compline3, "compline prayer"),
    ("combat/culverin2", culverin2, "culverin fired"),
    ("foley/pattens6", pattens6, "pattens stepping"),
    ("misc/traverse2", traverse2, "traverse board"),
    ("modern/elint-blip", elint_blip, "ELINT blip"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX60:
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
    with open(os.path.join(OUT, "sfx60-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX60:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
