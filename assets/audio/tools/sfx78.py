"""Procedural SFX batch 78 for the Bannerlord-clone (round 77).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx78.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx78")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx78-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(787878)


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
def stay_sail5(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stay sail: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.23, 0.23):
        m = int(0.16 * SR)
        flap = highpass(lowpass(noise(m), 1980), 680) * _env_decay(m, 43) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.54


def weasel4(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # weasel: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.036, 0.038):
        m = int(0.023 * SR)
        mt = np.arange(m) / SR
        f = 2900 + 950 * np.sin(2 * np.pi * 26 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.023)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.47


# ---------------------------------------------------------------- weather / horror
def levanter5(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # levanter: fifth variant
    x = highpass(lowpass(noise(n), 2120), 405) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.125 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def bean_nighe9(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: ninth variant
    out = np.zeros(n)
    # washing
    wm = int(0.85 * SR)
    wash = highpass(lowpass(noise(wm), 2150), 640) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 3.4 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(0.95, dur - 0.42, 0.56):
        m = int(0.32 * SR)
        mt = np.arange(m) / SR
        f = 740 - 300 * np.sin(2 * np.pi * 1.04 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.32)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.5


# ---------------------------------------------------------------- tavern / farm
def hazard4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # hazard: fourth variant
    out = np.zeros(n)
    # dice
    for b in _rng.uniform(0.05, 0.42, 4):
        m = int(0.052 * SR)
        dice = highpass(lowpass(noise(m), 4300), 1550) * _env_decay(m, 77) * 0.12
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dice
    # cheers
    cm = int(0.47 * SR)
    cheers = lowpass(noise(cm), 1150) * 0.16 * np.sin(np.pi * np.arange(cm) / cm)
    s = int(0.62 * SR)
    out[s:s + cm] += cheers
    return out * 0.5


def chick_peeps17(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: seventeenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.012, 0.007):
        m = int(0.004 * SR)
        mt = np.arange(m) / SR
        f = 3550 + 930 * np.sin(2 * np.pi * 41 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.004)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.36


# ---------------------------------------------------------------- mine / forge
def bord_work7(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bord: seventh variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.41, 0.46):
        m = int(0.34 * SR)
        work = lowpass(noise(m), 740) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.62


def finery6(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # finery: sixth variant
    x = lowpass(noise(n), 520) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.28 * t)
    return _seamless(x, fade_s=0.6) * 0.64


# ---------------------------------------------------------------- kitchen / stable
def posset_stir7():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # posset: seventh stir variant
    stir = lowpass(noise(m), 1180) * 0.2 * np.sin(np.pi * np.minimum(t / 0.7, 1.0))
    stir *= 0.68 + 0.32 * np.sin(2 * np.pi * 4.0 * t)
    return stir * 0.56


def manger10():
    m = int(0.58 * SR)
    t = np.arange(m) / SR
    # manger: tenth variant
    chew = lowpass(noise(m), 870) * 0.22 * np.sin(np.pi * np.minimum(t / 0.58, 1.0))
    chew *= 0.72 + 0.28 * np.sin(2 * np.pi * 4.4 * t)
    return chew * 0.59


# ---------------------------------------------------------------- ritual / combat
def compline9(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # compline: ninth variant
    out = np.zeros(n)
    for f in (109, 163, 218):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.54


def demi_cannon5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # demi-cannon: fifth variant
    out = np.zeros(n)
    # crack
    cm = int(0.17 * SR)
    crack = lowpass(noise(cm), 2050) * _env_decay(cm, 59) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.44 * SR)
    tail = lowpass(noise(tm), 710) * _env_decay(tm, 30) * 0.22
    s = int(0.14 * SR)
    out[s:s + tm] += tail
    return out * 0.65


# ---------------------------------------------------------------- foley / misc
def clog_step13(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: thirteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.22):
        m = int(0.058 * SR)
        step = lowpass(highpass(noise(m), 330), 1450) * _env_decay(m, 82) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.5


def cross_staff7():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # cross-staff: seventh variant
    cs = np.sin(2 * np.pi * 2140 * t) * _env_decay(m, 75) * 0.11
    cs += np.sin(2 * np.pi * 3210 * t) * _env_decay(m, 88) * 0.05
    return cs * 0.56


def osint_scrape4(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # OSINT: fourth scrape variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.26, 0.48):
        m = int(0.18 * SR)
        mt = np.arange(m) / SR
        scrape = np.sin(2 * np.pi * 1580 * mt) * _env_decay(m, 31) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += scrape
    return out * 0.6


SFX78 = [
    ("naval/stay-sail5", stay_sail5, "stay sail"),
    ("animal/weasel4", weasel4, "weasel chatter"),
    ("weather/levanter5", levanter5, "levanter wind"),
    ("horror/bean-nighe9", bean_nighe9, "bean nighe"),
    ("tavern/hazard4", hazard4, "hazard dice"),
    ("farm/chick-peeps17", chick_peeps17, "chick peeps"),
    ("mine/bord-work7", bord_work7, "bord work"),
    ("forge/finery6", finery6, "finery fire"),
    ("kitchen/posset-stir7", posset_stir7, "posset stirred"),
    ("stable/manger10", manger10, "manger chewing"),
    ("ritual/compline9", compline9, "compline prayer"),
    ("combat/demi-cannon5", demi_cannon5, "demi-cannon fired"),
    ("foley/clog-step13", clog_step13, "clogs stepping"),
    ("misc/cross-staff7", cross_staff7, "cross-staff sight"),
    ("modern/osint-scrape4", osint_scrape4, "OSINT scrape"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX78:
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
    with open(os.path.join(OUT, "sfx78-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX78:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
