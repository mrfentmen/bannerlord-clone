"""Procedural SFX batch 34 for the Bannerlord-clone (round 33).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx34.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx34")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx34-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(343434)


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
def sounding_lead(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sounding lead: splash + line run
    out = np.zeros(n)
    sm = int(0.25 * SR)
    splash = highpass(lowpass(noise(sm), 3500), 900) * _env_decay(sm, 45) * 0.4
    out[:sm] += splash
    line = lowpass(noise(n), 800) * 0.2 * np.exp(-t * 2)
    out += line
    return out * 0.65


def groundhog_whistle(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # groundhog: shrill alarm
    f = 3200 - 1200 * (t / dur)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.25
    x *= np.minimum(t / 0.05, 1.0) * np.exp(-np.maximum(t - dur + 0.2, 0) * 7)
    return x * 0.6


# ---------------------------------------------------------------- weather / horror
def pampero(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pampero: cold south american wind
    x = highpass(lowpass(noise(n), 5000), 700) * 0.38
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.45 * t)
    return _seamless(x, fade_s=0.6) * 0.68


def revenant_groan(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # revenant: deep undead groan
    f = 90 + 40 * np.sin(2 * np.pi * 0.7 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.32
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 3 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.7


# ---------------------------------------------------------------- tavern / farm
def wassail_bowl():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # wassail: spiced bowl passed
    out = np.zeros(m)
    # liquid slosh
    sm = int(0.4 * SR)
    slosh = lowpass(noise(sm), 1500) * 0.35 * np.sin(np.pi * np.arange(sm) / sm)
    out[:sm] += slosh
    # bowl thud
    tm = int(0.15 * SR)
    thud = lowpass(noise(tm), 900) * _env_decay(tm, 60) * 0.3
    s = int(0.5 * SR)
    out[s:s + tm] += thud
    return out * 0.65


def keet_peep(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # guinea keets: harsh peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.1):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2900 + 800 * np.sin(2 * np.pi * 11 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.17 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def bell_pit(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bell pit: widening chamber echoes
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.6, 0.8):
        m = int(0.7 * SR)
        work = lowpass(noise(m), 700) * 0.35 * np.sin(np.pi * np.arange(m) / m)
        echo = np.roll(work, int(0.2 * SR)) * 0.35
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work + echo[:m]
    return out * 0.68


def fullering(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fullering: grooving hammer blows
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.3, 0.32)):
        m = int(0.22 * SR)
        mt = np.arange(m) / SR
        blow = np.sin(2 * np.pi * 1100 * mt) * _env_decay(m, 60) * 0.3
        blow += lowpass(noise(m), 1400) * _env_decay(m, 70) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += blow * (1.0 - i * 0.04)
    return out * 0.7


# ---------------------------------------------------------------- kitchen / stable
def caudle_cup():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # caudle: warm spiced drink
    pour = lowpass(noise(m), 1600) * 0.3 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    spice = highpass(noise(m), 5000) * 0.06
    return (pour + spice) * 0.6


def paddock_gate():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # paddock gate: wood + latch
    out = np.zeros(m)
    # gate swing
    sm = int(0.4 * SR)
    swing = lowpass(noise(sm), 900) * 0.35 * np.sin(np.pi * np.arange(sm) / sm)
    out[:sm] += swing
    # latch
    lm = int(0.1 * SR)
    latch = np.sin(2 * np.pi * 1200 * np.arange(lm) / SR) * _env_decay(lm, 80) * 0.25
    s = int(0.5 * SR)
    out[s:s + lm] += latch
    return out * 0.65


# ---------------------------------------------------------------- ritual / combat
def tonsure():
    m = int(1.0 * SR)
    t = np.arange(m) / SR
    # tonsure: ceremonial shearing
    out = np.zeros(m)
    for b in np.arange(0.05, 0.9, 0.18):
        sm = int(0.14 * SR)
        shear = highpass(lowpass(noise(sm), 4500), 1800) * 0.22 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += shear
    return out * 0.6


def ballista_loose(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ballista: massive torsion release
    out = np.zeros(n)
    # release
    rm = int(0.18 * SR)
    release = lowpass(noise(rm), 2000) * _env_decay(rm, 60) * 0.55
    out[:rm] += release
    # bolt flight
    fm = int(0.6 * SR)
    flight = highpass(lowpass(noise(fm), 5500), 2000) * 0.25 * np.exp(-np.arange(fm) / SR * 3)
    s = int(0.15 * SR)
    out[s:s + fm] += flight
    return out * 0.72


# ---------------------------------------------------------------- foley / misc
def buskin_step(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # buskins: soft leather steps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.18, 0.3):
        m = int(0.12 * SR)
        step = lowpass(highpass(noise(m), 400), 1800) * _env_decay(m, 68) * 0.28
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.6


def chip_log():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # chip log: wooden line paid out
    out = np.zeros(m)
    # splash
    sm = int(0.2 * SR)
    splash = highpass(lowpass(noise(sm), 3500), 900) * _env_decay(sm, 55) * 0.3
    out[:sm] += splash
    # line run
    line = lowpass(noise(m), 700) * 0.18 * np.exp(-t * 2.5)
    out += line
    return out * 0.6


def sigint_sweep(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # SIGINT: sweeping intercept
    f = 1200 + 1600 * np.sin(2 * np.pi * 0.7 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.14
    return _seamless(x, fade_s=0.5) * 0.6


SFX34 = [
    ("naval/sounding-lead", sounding_lead, "sounding the depth"),
    ("animal/groundhog-whistle", groundhog_whistle, "groundhog alarm"),
    ("weather/pampero", pampero, "pampero wind"),
    ("horror/revenant-groan", revenant_groan, "revenant groaning"),
    ("tavern/wassail-bowl", wassail_bowl, "wassail bowl"),
    ("farm/keet-peep", keet_peep, "guinea keets"),
    ("mine/bell-pit", bell_pit, "bell pit echo"),
    ("forge/fullering", fullering, "fullering grooves"),
    ("kitchen/caudle-cup", caudle_cup, "caudle served"),
    ("stable/paddock-gate", paddock_gate, "paddock gate"),
    ("ritual/tonsure", tonsure, "ceremonial tonsure"),
    ("combat/ballista-loose", ballista_loose, "ballista fired"),
    ("foley/buskin-step", buskin_step, "buskins stepping"),
    ("misc/chip-log", chip_log, "chip log cast"),
    ("modern/sigint-sweep", sigint_sweep, "SIGINT sweep"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX34:
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
    with open(os.path.join(OUT, "sfx34-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX34:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
