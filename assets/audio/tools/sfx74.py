"""Procedural SFX batch 74 for the Bannerlord-clone (round 73).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx74.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx74")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx74-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(747474)


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
def stay_sail4(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stay sail: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.22, 0.22):
        m = int(0.15 * SR)
        flap = highpass(lowpass(noise(m), 1920), 660) * _env_decay(m, 44) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.52


def weasel3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # weasel: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.034, 0.036):
        m = int(0.021 * SR)
        mt = np.arange(m) / SR
        f = 2950 + 940 * np.sin(2 * np.pi * 27 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.021)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.45


# ---------------------------------------------------------------- weather / horror
def levanter4(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # levanter: fourth variant
    x = highpass(lowpass(noise(n), 2080), 395) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.115 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def bean_nighe6(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: sixth variant
    out = np.zeros(n)
    # washing
    wm = int(1.0 * SR)
    wash = highpass(lowpass(noise(wm), 2450), 760) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 2.8 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(1.1, dur - 0.45, 0.62):
        m = int(0.35 * SR)
        mt = np.arange(m) / SR
        f = 800 - 330 * np.sin(2 * np.pi * 0.98 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.35)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.53


# ---------------------------------------------------------------- tavern / farm
def hazard3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # hazard: third variant
    out = np.zeros(n)
    # dice
    for b in _rng.uniform(0.05, 0.4, 4):
        m = int(0.05 * SR)
        dice = highpass(lowpass(noise(m), 4200), 1500) * _env_decay(m, 78) * 0.12
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dice
    # cheers
    cm = int(0.45 * SR)
    cheers = lowpass(noise(cm), 1100) * 0.16 * np.sin(np.pi * np.arange(cm) / cm)
    s = int(0.6 * SR)
    out[s:s + cm] += cheers
    return out * 0.49


def chick_peeps15(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: fifteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.014, 0.009):
        m = int(0.005 * SR)
        mt = np.arange(m) / SR
        f = 3450 + 910 * np.sin(2 * np.pi * 39 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.005)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.38


# ---------------------------------------------------------------- mine / forge
def bord_work5(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bord: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.37, 0.42):
        m = int(0.3 * SR)
        work = lowpass(noise(m), 690) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.58


def finery5(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # finery: fifth variant
    x = lowpass(noise(n), 500) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.26 * t)
    return _seamless(x, fade_s=0.6) * 0.62


# ---------------------------------------------------------------- kitchen / stable
def posset_stir6():
    m = int(0.68 * SR)
    t = np.arange(m) / SR
    # posset: sixth stir variant
    stir = lowpass(noise(m), 1160) * 0.2 * np.sin(np.pi * np.minimum(t / 0.68, 1.0))
    stir *= 0.68 + 0.32 * np.sin(2 * np.pi * 3.9 * t)
    return stir * 0.55


def manger8():
    m = int(0.56 * SR)
    t = np.arange(m) / SR
    # manger: eighth variant
    chew = lowpass(noise(m), 850) * 0.22 * np.sin(np.pi * np.minimum(t / 0.56, 1.0))
    chew *= 0.72 + 0.28 * np.sin(2 * np.pi * 4.2 * t)
    return chew * 0.57


# ---------------------------------------------------------------- ritual / combat
def compline7(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # compline: seventh variant
    out = np.zeros(n)
    for f in (107, 160, 214):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.52


def demi_cannon4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # demi-cannon: fourth variant
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
def clog_step11(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: eleventh variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.2):
        m = int(0.054 * SR)
        step = lowpass(highpass(noise(m), 310), 1350) * _env_decay(m, 86) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.47


def cross_staff6():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # cross-staff: sixth variant
    cs = np.sin(2 * np.pi * 2120 * t) * _env_decay(m, 71) * 0.11
    cs += np.sin(2 * np.pi * 3180 * t) * _env_decay(m, 84) * 0.05
    return cs * 0.52


def osint_scrape3(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # OSINT: third scrape variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.24, 0.46):
        m = int(0.16 * SR)
        mt = np.arange(m) / SR
        scrape = np.sin(2 * np.pi * 1540 * mt) * _env_decay(m, 33) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += scrape
    return out * 0.58


SFX74 = [
    ("naval/stay-sail4", stay_sail4, "stay sail"),
    ("animal/weasel3", weasel3, "weasel chatter"),
    ("weather/levanter4", levanter4, "levanter wind"),
    ("horror/bean-nighe6", bean_nighe6, "bean nighe"),
    ("tavern/hazard3", hazard3, "hazard dice"),
    ("farm/chick-peeps15", chick_peeps15, "chick peeps"),
    ("mine/bord-work5", bord_work5, "bord work"),
    ("forge/finery5", finery5, "finery fire"),
    ("kitchen/posset-stir6", posset_stir6, "posset stirred"),
    ("stable/manger8", manger8, "manger chewing"),
    ("ritual/compline7", compline7, "compline prayer"),
    ("combat/demi-cannon4", demi_cannon4, "demi-cannon fired"),
    ("foley/clog-step11", clog_step11, "clogs stepping"),
    ("misc/cross-staff6", cross_staff6, "cross-staff sight"),
    ("modern/osint-scrape3", osint_scrape3, "OSINT scrape"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX74:
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
    with open(os.path.join(OUT, "sfx74-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX74:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
