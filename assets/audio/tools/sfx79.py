"""Procedural SFX batch 79 for the Bannerlord-clone (round 78).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx79.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx79")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx79-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(797979)


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
def top_sail5(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # top sail: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 2020), 690) * _env_decay(m, 42) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.55


def ferret4(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ferret: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.037, 0.039):
        m = int(0.024 * SR)
        mt = np.arange(m) / SR
        f = 2950 + 940 * np.sin(2 * np.pi * 27 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.024)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.48


# ---------------------------------------------------------------- weather / horror
def gregale4(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gregale: fourth variant
    x = highpass(lowpass(noise(n), 2080), 400) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.12 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def bean_nighe10(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: tenth variant
    out = np.zeros(n)
    # washing
    wm = int(0.8 * SR)
    wash = highpass(lowpass(noise(wm), 2050), 600) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 3.6 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(0.9, dur - 0.41, 0.54):
        m = int(0.31 * SR)
        mt = np.arange(m) / SR
        f = 720 - 290 * np.sin(2 * np.pi * 1.06 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.31)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.49


# ---------------------------------------------------------------- tavern / farm
def tick_tack3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # tick-tack: third variant
    out = np.zeros(n)
    # deal
    dm = int(0.34 * SR)
    deal = highpass(lowpass(noise(dm), 3800), 1400) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.44, 1.1, 3):
        m = int(0.059 * SR)
        card = highpass(noise(m), 2300) * _env_decay(m, 74) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.5


def gosling_peeps15(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: fifteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.014, 0.009):
        m = int(0.005 * SR)
        mt = np.arange(m) / SR
        f = 3350 + 910 * np.sin(2 * np.pi * 37 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.005)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.38


# ---------------------------------------------------------------- mine / forge
def stint_work6(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stint: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.37, 0.42):
        m = int(0.3 * SR)
        work = lowpass(noise(m), 680) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.58


def slitting8(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slitting: eighth variant
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.22, 0.27)):
        m = int(0.16 * SR)
        mt = np.arange(m) / SR
        cut = np.sin(2 * np.pi * 1120 * mt) * _env_decay(m, 68) * 0.22
        cut += lowpass(noise(m), 1220) * _env_decay(m, 75) * 0.14
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut * (1.0 - i * 0.04)
    return out * 0.58


# ---------------------------------------------------------------- kitchen / stable
def jelly_mould6():
    m = int(0.62 * SR)
    t = np.arange(m) / SR
    # jelly: sixth variant
    wobble = np.sin(2 * np.pi * 195 * t) * _env_decay(m, 56) * 0.11
    wobble += np.sin(2 * np.pi * 292 * t) * _env_decay(m, 63) * 0.07
    return wobble * 0.53


def hay_tines6():
    m = int(0.57 * SR)
    t = np.arange(m) / SR
    # hay tines: sixth variant
    toss = highpass(lowpass(noise(m), 3050), 1200) * 0.21 * np.sin(np.pi * np.minimum(t / 0.57, 1.0))
    return toss * 0.61


# ---------------------------------------------------------------- ritual / combat
def lauds5(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lauds: fifth variant
    out = np.zeros(n)
    for f in (112, 168, 224):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.55


def falconet6(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # falconet: sixth variant
    out = np.zeros(n)
    # crack
    cm = int(0.16 * SR)
    crack = lowpass(noise(cm), 2000) * _env_decay(cm, 61) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.43 * SR)
    tail = lowpass(noise(tm), 700) * _env_decay(tm, 32) * 0.22
    s = int(0.13 * SR)
    out[s:s + tm] += tail
    return out * 0.64


# ---------------------------------------------------------------- foley / misc
def pattens11(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: eleventh variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.21):
        m = int(0.057 * SR)
        step = lowpass(highpass(noise(m), 330), 1450) * _env_decay(m, 83) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.49


def backstaff8():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # backstaff: eighth variant
    bs = np.sin(2 * np.pi * 2120 * t) * _env_decay(m, 76) * 0.11
    bs += np.sin(2 * np.pi * 3180 * t) * _env_decay(m, 89) * 0.05
    return bs * 0.57


def geoint_task5(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # GEOINT: fifth task variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.27, 0.49):
        m = int(0.19 * SR)
        mt = np.arange(m) / SR
        task = np.sin(2 * np.pi * 1600 * mt) * _env_decay(m, 30) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += task
    return out * 0.61


SFX79 = [
    ("naval/top-sail5", top_sail5, "top sail"),
    ("animal/ferret4", ferret4, "ferret chatter"),
    ("weather/gregale4", gregale4, "gregale wind"),
    ("horror/bean-nighe10", bean_nighe10, "bean nighe"),
    ("tavern/tick-tack3", tick_tack3, "tick-tack game"),
    ("farm/gosling-peeps15", gosling_peeps15, "gosling peeps"),
    ("mine/stint-work6", stint_work6, "stint work"),
    ("forge/slitting8", slitting8, "slitting mill"),
    ("kitchen/jelly-mould6", jelly_mould6, "jelly mould"),
    ("stable/hay-tines6", hay_tines6, "hay tines"),
    ("ritual/lauds5", lauds5, "lauds prayer"),
    ("combat/falconet6", falconet6, "falconet fired"),
    ("foley/pattens11", pattens11, "pattens stepping"),
    ("misc/backstaff8", backstaff8, "backstaff sight"),
    ("modern/geoint-task5", geoint_task5, "GEOINT task"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX79:
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
    with open(os.path.join(OUT, "sfx79-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX79:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
