"""Procedural SFX batch 55 for the Bannerlord-clone (round 54).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx55.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx55")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx55-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(555555)


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
def jib_sail(dur=1.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # jib sail: forward triangle
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 2600), 750) * _env_decay(m, 36) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.59


def pine_marten(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pine marten: chitter
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.065, 0.07):
        m = int(0.042 * SR)
        mt = np.arange(m) / SR
        f = 3400 + 860 * np.sin(2 * np.pi * 19 * mt)
        chit = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13 * np.sin(np.pi * mt / 0.042)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.52


# ---------------------------------------------------------------- weather / horror
def scirocco(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # scirocco: hot desert wind
    x = highpass(lowpass(noise(n), 2800), 480) * 0.45
    x *= 0.51 + 0.49 * np.sin(2 * np.pi * 0.2 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def fachan(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fachan: one-legged horror
    out = np.zeros(n)
    # thump
    for b in np.arange(0.1, dur - 0.3, 0.5):
        m = int(0.16 * SR)
        thump = lowpass(noise(m), 650) * _env_decay(m, 42) * 0.32
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += thump
    # screech
    f = 900 - 350 * np.sin(2 * np.pi * 0.45 * t)
    screech = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09
    screech *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += screech
    return out * 0.62


# ---------------------------------------------------------------- tavern / farm
def skittles_round(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # skittles: full round
    out = np.zeros(n)
    # throw
    tm = int(0.3 * SR)
    throw = lowpass(noise(tm), 800) * 0.29 * np.sin(np.pi * np.arange(tm) / tm)
    out[:tm] += throw
    # pins
    for b in _rng.uniform(0.4, 1.25, 6):
        m = int(0.1 * SR)
        pin = np.sin(2 * np.pi * 980 * np.arange(m) / SR) * _env_decay(m, 59) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pin
    return out * 0.62


def poult_peeps6(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.045, 0.03):
        m = int(0.024 * SR)
        mt = np.arange(m) / SR
        f = 4400 + 700 * np.sin(2 * np.pi * 22 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.1 * np.sin(np.pi * mt / 0.024)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.5


# ---------------------------------------------------------------- mine / forge
def deep_shaft(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # deep shaft: deep digging
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.5, 0.55):
        m = int(0.42 * SR)
        dig = lowpass(noise(m), 720) * 0.36 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dig
    return out * 0.62


def puddle_furnace(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # puddle furnace: iron stirred
    x = lowpass(noise(n), 580) * 0.43
    x *= 0.62 + 0.38 * np.sin(2 * np.pi * 0.38 * t)
    return _seamless(x, fade_s=0.6) * 0.64


# ---------------------------------------------------------------- kitchen / stable
def caudle_mug():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # caudle: warm drink mug
    pour = lowpass(noise(m), 1350) * 0.24 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    clink = np.sin(2 * np.pi * 1750 * t) * _env_decay(m, 60) * 0.09
    return (pour + clink) * 0.58


def oat_sieve():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # oat sieve: grain sifted
    sift = highpass(lowpass(noise(m), 3800), 1500) * 0.22 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    sift *= 0.7 + 0.3 * np.sin(2 * np.pi * 6 * t)
    return sift * 0.59


# ---------------------------------------------------------------- ritual / combat
def prime_office(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # prime: morning office
    out = np.zeros(n)
    for f in (120, 180, 240):
        out += np.sin(2 * np.pi * f * t) * 0.06
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.6


def bombard_blast(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bombard: huge cannon blast
    out = np.zeros(n)
    # blast
    bm = int(0.28 * SR)
    blast = lowpass(noise(bm), 1100) * _env_decay(bm, 42) * 0.58
    out[:bm] += blast
    # rumble
    rm = int(0.6 * SR)
    rumble = lowpass(noise(rm), 480) * _env_decay(rm, 24) * 0.32
    s = int(0.24 * SR)
    out[s:s + rm] += rumble
    return out * 0.72


# ---------------------------------------------------------------- foley / misc
def clog_step5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.14, 0.36):
        m = int(0.1 * SR)
        step = lowpass(highpass(noise(m), 700), 3600) * _env_decay(m, 71) * 0.26
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.58


def chip_log2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # chip log: second variant
    splash = highpass(lowpass(noise(m), 2900), 1100) * 0.2 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return splash * 0.57


def nav_lock(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # nav lock: position acquired
    out = np.zeros(n)
    # beeps
    for b in [0.2, 0.5, 0.8, 1.2]:
        m = int(0.12 * SR)
        beep = np.sin(2 * np.pi * 1350 * np.arange(m) / SR) * _env_decay(m, 48) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += beep
    # lock tone
    lock = np.sin(2 * np.pi * 880 * t) * 0.08 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += lock
    return out * 0.58


SFX55 = [
    ("naval/jib-sail", jib_sail, "jib sail"),
    ("animal/pine-marten", pine_marten, "pine marten"),
    ("weather/scirocco", scirocco, "scirocco wind"),
    ("horror/fachan", fachan, "fachan horror"),
    ("tavern/skittles-round", skittles_round, "skittles round"),
    ("farm/poult-peeps6", poult_peeps6, "poult peeps"),
    ("mine/deep-shaft", deep_shaft, "deep shaft"),
    ("forge/puddle-furnace", puddle_furnace, "puddle furnace"),
    ("kitchen/caudle-mug", caudle_mug, "caudle mug"),
    ("stable/oat-sieve", oat_sieve, "oat sieve"),
    ("ritual/prime-office", prime_office, "prime office"),
    ("combat/bombard-blast", bombard_blast, "bombard blast"),
    ("foley/clog-step5", clog_step5, "clogs stepping"),
    ("misc/chip-log2", chip_log2, "chip log"),
    ("modern/nav-lock", nav_lock, "nav lock"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX55:
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
    with open(os.path.join(OUT, "sfx55-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX55:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
