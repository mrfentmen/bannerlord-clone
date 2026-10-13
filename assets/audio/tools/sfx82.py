"""Procedural SFX batch 82 for the Bannerlord-clone (round 81).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx82.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx82")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx82-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(828282)


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
def stay_sail6(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stay sail: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 2020), 690) * _env_decay(m, 42) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.56


def weasel5(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # weasel: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.037, 0.039):
        m = int(0.024 * SR)
        mt = np.arange(m) / SR
        f = 2950 + 940 * np.sin(2 * np.pi * 28 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.024)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.48


# ---------------------------------------------------------------- weather / horror
def levanter6(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # levanter: sixth variant
    x = highpass(lowpass(noise(n), 2150), 410) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.13 * t)
    return _seamless(x, fade_s=0.6) * 0.66


def bean_nighe12(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: twelfth variant
    out = np.zeros(n)
    # washing
    wm = int(0.7 * SR)
    wash = highpass(lowpass(noise(wm), 1850), 520) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 4.0 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(0.8, dur - 0.39, 0.5):
        m = int(0.29 * SR)
        mt = np.arange(m) / SR
        f = 680 - 270 * np.sin(2 * np.pi * 1.1 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.29)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.47


# ---------------------------------------------------------------- tavern / farm
def hazard5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # hazard: fifth variant
    out = np.zeros(n)
    # dice
    for b in _rng.uniform(0.05, 0.44, 4):
        m = int(0.054 * SR)
        dice = highpass(lowpass(noise(m), 4400), 1600) * _env_decay(m, 76) * 0.12
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dice
    # cheers
    cm = int(0.49 * SR)
    cheers = lowpass(noise(cm), 1200) * 0.16 * np.sin(np.pi * np.arange(cm) / cm)
    s = int(0.64 * SR)
    out[s:s + cm] += cheers
    return out * 0.51


def chick_peeps19(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: nineteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.01, 0.005):
        m = int(0.003 * SR)
        mt = np.arange(m) / SR
        f = 3650 + 950 * np.sin(2 * np.pi * 43 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.003)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.34


# ---------------------------------------------------------------- mine / forge
def bord_work9(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bord: ninth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.44, 0.49):
        m = int(0.37 * SR)
        work = lowpass(noise(m), 770) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.65


def finery7(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # finery: seventh variant
    x = lowpass(noise(n), 540) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.3 * t)
    return _seamless(x, fade_s=0.6) * 0.66


# ---------------------------------------------------------------- kitchen / stable
def posset_stir8():
    m = int(0.72 * SR)
    t = np.arange(m) / SR
    # posset: eighth stir variant
    stir = lowpass(noise(m), 1200) * 0.2 * np.sin(np.pi * np.minimum(t / 0.72, 1.0))
    stir *= 0.68 + 0.32 * np.sin(2 * np.pi * 4.1 * t)
    return stir * 0.57


def manger12():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # manger: twelfth variant
    chew = lowpass(noise(m), 890) * 0.22 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    chew *= 0.72 + 0.28 * np.sin(2 * np.pi * 4.6 * t)
    return chew * 0.61


# ---------------------------------------------------------------- ritual / combat
def compline11(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # compline: eleventh variant
    out = np.zeros(n)
    for f in (111, 166, 222):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.56


def demi_cannon6(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # demi-cannon: sixth variant
    out = np.zeros(n)
    # crack
    cm = int(0.18 * SR)
    crack = lowpass(noise(cm), 2100) * _env_decay(cm, 58) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.45 * SR)
    tail = lowpass(noise(tm), 720) * _env_decay(tm, 29) * 0.22
    s = int(0.15 * SR)
    out[s:s + tm] += tail
    return out * 0.66


# ---------------------------------------------------------------- foley / misc
def clog_step15(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: fifteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.24):
        m = int(0.062 * SR)
        step = lowpass(highpass(noise(m), 350), 1550) * _env_decay(m, 80) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.52


def cross_staff8():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # cross-staff: eighth variant
    cs = np.sin(2 * np.pi * 2160 * t) * _env_decay(m, 79) * 0.11
    cs += np.sin(2 * np.pi * 3240 * t) * _env_decay(m, 92) * 0.05
    return cs * 0.6


def osint_scrape5(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # OSINT: fifth scrape variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.52):
        m = int(0.22 * SR)
        mt = np.arange(m) / SR
        scrape = np.sin(2 * np.pi * 1640 * mt) * _env_decay(m, 28) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += scrape
    return out * 0.63


SFX82 = [
    ("naval/stay-sail6", stay_sail6, "stay sail"),
    ("animal/weasel5", weasel5, "weasel chatter"),
    ("weather/levanter6", levanter6, "levanter wind"),
    ("horror/bean-nighe12", bean_nighe12, "bean nighe"),
    ("tavern/hazard5", hazard5, "hazard dice"),
    ("farm/chick-peeps19", chick_peeps19, "chick peeps"),
    ("mine/bord-work9", bord_work9, "bord work"),
    ("forge/finery7", finery7, "finery fire"),
    ("kitchen/posset-stir8", posset_stir8, "posset stirred"),
    ("stable/manger12", manger12, "manger chewing"),
    ("ritual/compline11", compline11, "compline prayer"),
    ("combat/demi-cannon6", demi_cannon6, "demi-cannon fired"),
    ("foley/clog-step15", clog_step15, "clogs stepping"),
    ("misc/cross-staff8", cross_staff8, "cross-staff sight"),
    ("modern/osint-scrape5", osint_scrape5, "OSINT scrape"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX82:
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
    with open(os.path.join(OUT, "sfx82-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX82:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
