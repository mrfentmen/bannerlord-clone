"""Procedural SFX batch 73 for the Bannerlord-clone (round 72).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx73.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx73")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx73-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(737373)


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
def top_sail4(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # top sail: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.23, 0.23):
        m = int(0.16 * SR)
        flap = highpass(lowpass(noise(m), 1980), 680) * _env_decay(m, 43) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.53


def ferret3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ferret: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.035, 0.037):
        m = int(0.022 * SR)
        mt = np.arange(m) / SR
        f = 3000 + 930 * np.sin(2 * np.pi * 26 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.022)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.46


# ---------------------------------------------------------------- weather / horror
def gregale3(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gregale: third variant
    x = highpass(lowpass(noise(n), 2050), 390) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.11 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def bean_nighe5(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: fifth variant
    out = np.zeros(n)
    # washing
    wm = int(1.05 * SR)
    wash = highpass(lowpass(noise(wm), 2550), 800) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 2.6 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(1.15, dur - 0.46, 0.64):
        m = int(0.36 * SR)
        mt = np.arange(m) / SR
        f = 820 - 340 * np.sin(2 * np.pi * 0.96 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.36)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.54


# ---------------------------------------------------------------- tavern / farm
def tick_tack2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # tick-tack: second variant
    out = np.zeros(n)
    # deal
    dm = int(0.32 * SR)
    deal = highpass(lowpass(noise(dm), 3700), 1350) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.42, 1.1, 3):
        m = int(0.056 * SR)
        card = highpass(noise(m), 2150) * _env_decay(m, 77) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.48


def gosling_peeps14(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: fourteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.015, 0.01):
        m = int(0.006 * SR)
        mt = np.arange(m) / SR
        f = 3400 + 900 * np.sin(2 * np.pi * 38 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.006)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.39


# ---------------------------------------------------------------- mine / forge
def stint_work5(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stint: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.36, 0.41):
        m = int(0.29 * SR)
        work = lowpass(noise(m), 670) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.57


def slitting6(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slitting: sixth variant
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.24, 0.29)):
        m = int(0.18 * SR)
        mt = np.arange(m) / SR
        cut = np.sin(2 * np.pi * 1160 * mt) * _env_decay(m, 66) * 0.22
        cut += lowpass(noise(m), 1260) * _env_decay(m, 73) * 0.14
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut * (1.0 - i * 0.04)
    return out * 0.6


# ---------------------------------------------------------------- kitchen / stable
def jelly_mould5():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # jelly: fifth variant
    wobble = np.sin(2 * np.pi * 190 * t) * _env_decay(m, 55) * 0.11
    wobble += np.sin(2 * np.pi * 285 * t) * _env_decay(m, 62) * 0.07
    return wobble * 0.52


def hay_tines4():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # hay tines: fourth variant
    toss = highpass(lowpass(noise(m), 2950), 1150) * 0.21 * np.sin(np.pi * np.minimum(t / 0.55, 1.0))
    return toss * 0.59


# ---------------------------------------------------------------- ritual / combat
def lauds4(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lauds: fourth variant
    out = np.zeros(n)
    for f in (110, 165, 220):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.53


def falconet4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # falconet: fourth variant
    out = np.zeros(n)
    # crack
    cm = int(0.13 * SR)
    crack = lowpass(noise(cm), 1850) * _env_decay(cm, 64) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.39 * SR)
    tail = lowpass(noise(tm), 640) * _env_decay(tm, 35) * 0.22
    s = int(0.1 * SR)
    out[s:s + tm] += tail
    return out * 0.61


# ---------------------------------------------------------------- foley / misc
def pattens9(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: ninth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.19):
        m = int(0.051 * SR)
        step = lowpass(highpass(noise(m), 290), 1250) * _env_decay(m, 88) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.45


def backstaff6():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # backstaff: sixth variant
    bs = np.sin(2 * np.pi * 2080 * t) * _env_decay(m, 70) * 0.11
    bs += np.sin(2 * np.pi * 3120 * t) * _env_decay(m, 83) * 0.05
    return bs * 0.51


def geoint_task3(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # GEOINT: third task variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.25, 0.47):
        m = int(0.17 * SR)
        mt = np.arange(m) / SR
        task = np.sin(2 * np.pi * 1550 * mt) * _env_decay(m, 34) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += task
    return out * 0.57


SFX73 = [
    ("naval/top-sail4", top_sail4, "top sail"),
    ("animal/ferret3", ferret3, "ferret chatter"),
    ("weather/gregale3", gregale3, "gregale wind"),
    ("horror/bean-nighe5", bean_nighe5, "bean nighe"),
    ("tavern/tick-tack2", tick_tack2, "tick-tack game"),
    ("farm/gosling-peeps14", gosling_peeps14, "gosling peeps"),
    ("mine/stint-work5", stint_work5, "stint work"),
    ("forge/slitting6", slitting6, "slitting mill"),
    ("kitchen/jelly-mould5", jelly_mould5, "jelly mould"),
    ("stable/hay-tines4", hay_tines4, "hay tines"),
    ("ritual/lauds4", lauds4, "lauds prayer"),
    ("combat/falconet4", falconet4, "falconet fired"),
    ("foley/pattens9", pattens9, "pattens stepping"),
    ("misc/backstaff6", backstaff6, "backstaff sight"),
    ("modern/geoint-task3", geoint_task3, "GEOINT task"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX73:
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
    with open(os.path.join(OUT, "sfx73-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX73:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
