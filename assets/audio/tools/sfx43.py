"""Procedural SFX batch 43 for the Bannerlord-clone (round 42).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx43.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx43")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx43-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(434343)


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
def shipwright_hammer(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # shipwright: caulking mallet
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.05, dur - 0.2, 0.28)):
        m = int(0.16 * SR)
        mt = np.arange(m) / SR
        hit = np.sin(2 * np.pi * 950 * mt) * _env_decay(m, 62) * 0.28
        hit += lowpass(noise(m), 1600) * _env_decay(m, 70) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += hit * (1.0 - i * 0.05)
    return out * 0.65


def skunk_hiss(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # skunk: defensive hiss
    x = highpass(noise(n), 3000) * 0.25
    x *= np.minimum(t / 0.08, 1.0) * np.exp(-np.maximum(t - dur + 0.25, 0) * 6.5)
    return x * 0.6


# ---------------------------------------------------------------- weather / horror
def ghibli(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ghibli: hot libyan wind
    x = highpass(lowpass(noise(n), 4100), 610) * 0.36
    x *= 0.63 + 0.37 * np.sin(2 * np.pi * 0.33 * t)
    grit = highpass(noise(n), 5300) * 0.05
    x += grit
    return _seamless(x, fade_s=0.6) * 0.64


def spectre_wail(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # spectre: ethereal wail
    f = 520 - 220 * np.sin(2 * np.pi * 0.5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.21
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 1.4 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.64


# ---------------------------------------------------------------- tavern / farm
def wassail_cup():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # wassail: cup raised
    out = np.zeros(m)
    # liquid
    lm = int(0.3 * SR)
    liquid = lowpass(noise(lm), 1700) * 0.28 * np.sin(np.pi * np.arange(lm) / lm)
    out[:lm] += liquid
    # cup thud
    tm = int(0.12 * SR)
    thud = lowpass(noise(tm), 850) * _env_decay(tm, 62) * 0.26
    s = int(0.35 * SR)
    out[s:s + tm] += thud
    return out * 0.62


def chick_peeps3(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: tiny peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.07, 0.08):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 3400 + 720 * np.sin(2 * np.pi * 11 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.14 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def crosscut(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # crosscut: horizontal tunnel
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.6, 0.75):
        m = int(0.65 * SR)
        dig = lowpass(noise(m), 700) * 0.36 * np.sin(np.pi * np.arange(m) / m)
        echo = np.roll(dig, int(0.2 * SR)) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dig + echo[:m]
    return out * 0.66


def bloomery(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bloomery: ancient iron furnace
    x = lowpass(noise(n), 650) * 0.4
    x *= 0.68 + 0.32 * np.sin(2 * np.pi * 0.45 * t)
    return _seamless(x, fade_s=0.7) * 0.66


# ---------------------------------------------------------------- kitchen / stable
def caudle_bowl():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # caudle: bowl served
    pour = lowpass(noise(m), 1450) * 0.27 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    clink = np.sin(2 * np.pi * 2100 * t) * _env_decay(m, 65) * 0.08
    return (pour + clink) * 0.6


def pitchfork():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # pitchfork: hay tossed
    out = np.zeros(m)
    for b in np.arange(0.05, 0.6, 0.21):
        sm = int(0.17 * SR)
        toss = highpass(lowpass(noise(sm), 3800), 950) * 0.27 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += toss
    return out * 0.6


# ---------------------------------------------------------------- ritual / combat
def confirmation(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # confirmation: blessing chant
    out = np.zeros(n)
    for f in (110, 138.6, 174.6):
        out += np.sin(2 * np.pi * f * t) * 0.07
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.65


def demi_culverin(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # demi-culverin: smaller cannon
    out = np.zeros(n)
    # crack
    cm = int(0.2 * SR)
    crack = lowpass(noise(cm), 1700) * _env_decay(cm, 55) * 0.51
    out[:cm] += crack
    # tail
    tm = int(0.48 * SR)
    tail = lowpass(noise(tm), 850) * _env_decay(tm, 30) * 0.28
    s = int(0.18 * SR)
    out[s:s + tm] += tail
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def pattens_clack2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: alternate clack
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.16, 0.3):
        m = int(0.12 * SR)
        clack = lowpass(highpass(noise(m), 780), 3650) * _env_decay(m, 71) * 0.28
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clack
    return out * 0.62


def nocturnal_ring():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nocturnal: brass ring
    ring = np.sin(2 * np.pi * 1650 * t) * _env_decay(m, 52) * 0.19
    ring += np.sin(2 * np.pi * 2475 * t) * _env_decay(m, 65) * 0.1
    return ring * 0.6


def uav_swarm(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # UAV swarm: multiple drones
    out = np.zeros(n)
    for f in (220, 260, 300):
        out += np.sin(np.cumsum(2 * np.pi * (f + 30 * np.sin(2 * np.pi * 0.7 * t)) / SR)) * 0.08
    return _seamless(out, fade_s=0.5) * 0.62


SFX43 = [
    ("naval/shipwright-hammer", shipwright_hammer, "shipwright hammering"),
    ("animal/skunk-hiss", skunk_hiss, "skunk hissing"),
    ("weather/ghibli", ghibli, "ghibli wind"),
    ("horror/spectre-wail", spectre_wail, "spectre wailing"),
    ("tavern/wassail-cup", wassail_cup, "wassail cup"),
    ("farm/chick-peeps3", chick_peeps3, "chick peeps"),
    ("mine/crosscut", crosscut, "crosscut tunnel"),
    ("forge/bloomery", bloomery, "bloomery furnace"),
    ("kitchen/caudle-bowl", caudle_bowl, "caudle bowl"),
    ("stable/pitchfork", pitchfork, "pitchfork hay"),
    ("ritual/confirmation", confirmation, "confirmation rite"),
    ("combat/demi-culverin", demi_culverin, "demi-culverin fired"),
    ("foley/pattens-clack2", pattens_clack2, "pattens clacking"),
    ("misc/nocturnal-ring", nocturnal_ring, "nocturnal ring"),
    ("modern/uav-swarm", uav_swarm, "UAV swarm"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX43:
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
    with open(os.path.join(OUT, "sfx43-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX43:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
