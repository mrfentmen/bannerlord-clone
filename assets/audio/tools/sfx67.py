"""Procedural SFX batch 67 for the Bannerlord-clone (round 66).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx67.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx67")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx67-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(676767)


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
def course_sail2(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # course sail: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.25):
        m = int(0.18 * SR)
        belly = lowpass(noise(m), 640) * 0.27 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += belly
    return out * 0.59


def water_vole2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # water vole: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.042, 0.044):
        m = int(0.025 * SR)
        mt = np.arange(m) / SR
        f = 3500 + 830 * np.sin(2 * np.pi * 23 * mt)
        squeak = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.025)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += squeak
    return out * 0.49


# ---------------------------------------------------------------- weather / horror
def bise3(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bise: third variant
    x = highpass(lowpass(noise(n), 2380), 430) * 0.49
    x *= 0.47 + 0.53 * np.sin(2 * np.pi * 0.15 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def black_shuck2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # black shuck: second variant
    out = np.zeros(n)
    # howling
    for b in np.arange(0.1, dur - 0.52, 0.72):
        m = int(0.45 * SR)
        mt = np.arange(m) / SR
        f = 370 - 190 * np.sin(2 * np.pi * 0.72 * mt)
        howl = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.165 * np.sin(np.pi * mt / 0.45)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += howl
    return out * 0.6


# ---------------------------------------------------------------- tavern / farm
def all_fours2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # all fours: second variant
    out = np.zeros(n)
    # deal
    dm = int(0.39 * SR)
    deal = highpass(lowpass(noise(dm), 4080), 1540) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.49, 1.1, 3):
        m = int(0.06 * SR)
        card = highpass(noise(m), 2480) * _env_decay(m, 69) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.53


def poult_peeps10(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: tenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.024, 0.015):
        m = int(0.01 * SR)
        mt = np.arange(m) / SR
        f = 3900 + 800 * np.sin(2 * np.pi * 33 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.01)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.43


# ---------------------------------------------------------------- mine / forge
def pillar_work2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pillar: second variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.45):
        m = int(0.33 * SR)
        work = lowpass(noise(m), 700) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.59


def puddling3(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # puddling: third variant
    x = lowpass(noise(n), 520) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.28 * t)
    return _seamless(x, fade_s=0.6) * 0.62


# ---------------------------------------------------------------- kitchen / stable
def caudle_mug3():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # caudle: third mug variant
    swirl = lowpass(noise(m), 1100) * 0.21 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    swirl *= 0.68 + 0.32 * np.sin(2 * np.pi * 4.0 * t)
    return swirl * 0.55


def straw_bed3():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # straw bed: third variant
    rustle = highpass(lowpass(noise(m), 3100), 1150) * 0.22 * np.sin(np.pi * np.minimum(t / 0.55, 1.0))
    return rustle * 0.58


# ---------------------------------------------------------------- ritual / combat
def tenebrae3(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # tenebrae: third variant
    out = np.zeros(n)
    for f in (96, 144, 192):
        out += np.sin(2 * np.pi * f * t) * 0.06
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.56


def serpentine3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # serpentine: third variant
    out = np.zeros(n)
    # crack
    cm = int(0.16 * SR)
    crack = lowpass(noise(cm), 1900) * _env_decay(cm, 59) * 0.43
    out[:cm] += crack
    # tail
    tm = int(0.43 * SR)
    tail = lowpass(noise(tm), 660) * _env_decay(tm, 32) * 0.22
    s = int(0.13 * SR)
    out[s:s + tm] += tail
    return out * 0.64


# ---------------------------------------------------------------- foley / misc
def sabot_step7(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: seventh variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.23):
        m = int(0.065 * SR)
        step = lowpass(highpass(noise(m), 380), 1700) * _env_decay(m, 83) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.5


def sextant3():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # sextant: third variant
    sx = np.sin(2 * np.pi * 1920 * t) * _env_decay(m, 66) * 0.11
    sx += np.sin(2 * np.pi * 2880 * t) * _env_decay(m, 79) * 0.05
    return sx * 0.5


def imint_frame2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # IMINT: second frame variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.28, 0.53):
        m = int(0.2 * SR)
        mt = np.arange(m) / SR
        frame = np.sin(2 * np.pi * 1720 * mt) * _env_decay(m, 31) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += frame
    return out * 0.57


SFX67 = [
    ("naval/course-sail2", course_sail2, "course sail"),
    ("animal/water-vole2", water_vole2, "water vole"),
    ("weather/bise3", bise3, "bise wind"),
    ("horror/black-shuck2", black_shuck2, "black shuck howl"),
    ("tavern/all-fours2", all_fours2, "all fours game"),
    ("farm/poult-peeps10", poult_peeps10, "poult peeps"),
    ("mine/pillar-work2", pillar_work2, "pillar work"),
    ("forge/puddling3", puddling3, "puddling furnace"),
    ("kitchen/caudle-mug3", caudle_mug3, "caudle mug"),
    ("stable/straw-bed3", straw_bed3, "straw bed"),
    ("ritual/tenebrae3", tenebrae3, "tenebrae service"),
    ("combat/serpentine3", serpentine3, "serpentine fired"),
    ("foley/sabot-step7", sabot_step7, "sabots stepping"),
    ("misc/sextant3", sextant3, "sextant sight"),
    ("modern/imint-frame2", imint_frame2, "IMINT frame"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX67:
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
    with open(os.path.join(OUT, "sfx67-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX67:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
