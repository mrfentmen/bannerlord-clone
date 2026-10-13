"""Procedural SFX batch 35 for the Bannerlord-clone (round 34).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx35.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx35")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx35-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(353535)


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
def heaving_line(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # heaving line: weighted rope throw
    out = np.zeros(n)
    # throw whoosh
    wm = int(0.3 * SR)
    whoosh = highpass(lowpass(noise(wm), 4000), 900) * 0.28 * np.sin(np.pi * np.arange(wm) / wm)
    out[:wm] += whoosh
    # line uncoiling
    line = lowpass(noise(n), 900) * 0.18 * np.exp(-t * 3)
    out += line
    return out * 0.65


def prairie_dog(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # prairie dog: rapid yips
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.07, 0.09):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 3400 + 600 * np.sin(2 * np.pi * 12 * mt)
        yip = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.17 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += yip
    return out * 0.55


# ---------------------------------------------------------------- weather / horror
def bora_wind(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bora: cold adriatic wind
    x = highpass(lowpass(noise(n), 5500), 750) * 0.38
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.4 * t)
    return _seamless(x, fade_s=0.6) * 0.68


def wraith_moan(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wraith: spectral moan
    f = 320 - 140 * np.sin(2 * np.pi * 0.5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.24
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 2 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.68


# ---------------------------------------------------------------- tavern / farm
def skittle_alley(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # skittles: ball roll + pins
    out = np.zeros(n)
    # ball roll
    rm = int(0.5 * SR)
    roll = lowpass(noise(rm), 600) * 0.3 * np.sin(np.pi * np.arange(rm) / rm)
    out[:rm] += roll
    # pins
    for b in _rng.uniform(0.55, 1.3, 7):
        m = int(0.12 * SR)
        pin = np.sin(2 * np.pi * 900 * np.arange(m) / SR) * _env_decay(m, 55) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pin
    return out * 0.68


def gosling_peep(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: peeping
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.11):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2700 + 700 * np.sin(2 * np.pi * 8 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.17 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def adit_timber():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # adit timber: wood creaking under load
    out = np.zeros(m)
    for b in np.arange(0.05, 0.6, 0.2):
        sm = int(0.18 * SR)
        creak = np.sin(2 * np.pi * 160 * np.arange(sm) / SR) * _env_decay(sm, 30) * 0.25
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += creak
    return out * 0.65


def drawing_out(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # drawing out: stretching metal
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.3, 0.34)):
        m = int(0.24 * SR)
        mt = np.arange(m) / SR
        blow = np.sin(2 * np.pi * 1050 * mt) * _env_decay(m, 58) * 0.29
        blow += lowpass(noise(m), 1350) * _env_decay(m, 68) * 0.21
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += blow * (1.0 - i * 0.04)
    return out * 0.7


# ---------------------------------------------------------------- kitchen / stable
def posset_cup():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # posset: hot milk curd drink
    pour = lowpass(noise(m), 1400) * 0.3 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    curdle = highpass(noise(m), 6000) * 0.05
    return (pour + curdle) * 0.6


def hay_rack():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # hay rack: forkfuls tossed
    out = np.zeros(m)
    for b in np.arange(0.05, 0.6, 0.22):
        sm = int(0.18 * SR)
        toss = highpass(lowpass(noise(sm), 3500), 900) * 0.28 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += toss
    return out * 0.6


# ---------------------------------------------------------------- ritual / combat
def anointing(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # anointing: oil poured + chant
    out = np.zeros(n)
    for f in (98, 146.8, 196):
        out += np.sin(2 * np.pi * f * t) * 0.07
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # oil pour
    pour = lowpass(noise(n), 1800) * 0.2 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += pour
    return out * 0.68


def mangonel_loose(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mangonel: frame shudder + stone
    out = np.zeros(n)
    # release
    rm = int(0.2 * SR)
    release = lowpass(noise(rm), 1700) * _env_decay(rm, 55) * 0.5
    out[:rm] += release
    # frame shudder
    shudder = np.sin(2 * np.pi * 90 * t) * 0.14 * np.exp(-t * 6)
    out += shudder
    # stone flight
    fm = int(0.6 * SR)
    flight = highpass(lowpass(noise(fm), 5000), 1800) * 0.24 * np.exp(-np.arange(fm) / SR * 3)
    s = int(0.18 * SR)
    out[s:s + fm] += flight
    return out * 0.72


# ---------------------------------------------------------------- foley / misc
def pattens_clack(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: wooden overshoes
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.28):
        m = int(0.1 * SR)
        clack = lowpass(highpass(noise(m), 900), 3500) * _env_decay(m, 72) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clack
    return out * 0.62


def pelorus():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # pelorus: brass bearing ring
    ring = np.sin(2 * np.pi * 1600 * t) * _env_decay(m, 45) * 0.22
    ring += np.sin(2 * np.pi * 2400 * t) * _env_decay(m, 60) * 0.12
    return ring * 0.6


def radar_ping(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # radar: sweeping ping
    out = np.zeros(n)
    for b in np.arange(0.2, dur - 0.3, 0.7):
        m = int(0.2 * SR)
        ping = np.sin(2 * np.pi * 1800 * np.arange(m) / SR) * _env_decay(m, 40) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += ping
    return out * 0.65


SFX35 = [
    ("naval/heaving-line", heaving_line, "heaving line thrown"),
    ("animal/prairie-dog", prairie_dog, "prairie dog yips"),
    ("weather/bora-wind", bora_wind, "bora wind"),
    ("horror/wraith-moan", wraith_moan, "wraith moaning"),
    ("tavern/skittle-alley", skittle_alley, "skittle alley"),
    ("farm/gosling-peep", gosling_peep, "goslings"),
    ("mine/adit-timber", adit_timber, "adit timber creak"),
    ("forge/drawing-out", drawing_out, "drawing out metal"),
    ("kitchen/posset-cup", posset_cup, "posset served"),
    ("stable/hay-rack", hay_rack, "hay rack filled"),
    ("ritual/anointing", anointing, "anointing rite"),
    ("combat/mangonel-loose", mangonel_loose, "mangonel fired"),
    ("foley/pattens-clack", pattens_clack, "pattens clacking"),
    ("misc/pelorus", pelorus, "pelorus bearing"),
    ("modern/radar-ping", radar_ping, "radar sweeping"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX35:
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
    with open(os.path.join(OUT, "sfx35-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX35:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
