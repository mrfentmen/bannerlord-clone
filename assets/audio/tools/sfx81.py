"""Procedural SFX batch 81 for the Bannerlord-clone (round 80).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx81.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx81")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx81-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(818181)


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
def fore_sail5(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fore sail: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 2020), 690) * _env_decay(m, 42) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.55


def pine_marten5(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pine marten: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.037, 0.039):
        m = int(0.024 * SR)
        mt = np.arange(m) / SR
        f = 3000 + 940 * np.sin(2 * np.pi * 30 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.024)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.48


# ---------------------------------------------------------------- weather / horror
def khamsin5(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # khamsin: fifth variant
    x = highpass(lowpass(noise(n), 2150), 410) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.13 * t)
    return _seamless(x, fade_s=0.6) * 0.66


def bean_nighe11(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: eleventh variant
    out = np.zeros(n)
    # washing
    wm = int(0.75 * SR)
    wash = highpass(lowpass(noise(wm), 1950), 560) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 3.8 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(0.85, dur - 0.4, 0.52):
        m = int(0.3 * SR)
        mt = np.arange(m) / SR
        f = 700 - 280 * np.sin(2 * np.pi * 1.08 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.3)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.48


# ---------------------------------------------------------------- tavern / farm
def put5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # put: fifth variant
    out = np.zeros(n)
    # deal
    dm = int(0.37 * SR)
    deal = highpass(lowpass(noise(dm), 4000), 1500) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.47, 1.1, 3):
        m = int(0.062 * SR)
        card = highpass(noise(m), 2450) * _env_decay(m, 71) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.52


def chick_peeps18(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: eighteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.011, 0.006):
        m = int(0.003 * SR)
        mt = np.arange(m) / SR
        f = 3600 + 940 * np.sin(2 * np.pi * 42 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.003)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.35


# ---------------------------------------------------------------- mine / forge
def longwall8(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # longwall: eighth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.43, 0.48):
        m = int(0.36 * SR)
        cut = lowpass(noise(m), 760) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut
    return out * 0.64


def slitting9(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slitting: ninth variant
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.21, 0.26)):
        m = int(0.15 * SR)
        mt = np.arange(m) / SR
        cut = np.sin(2 * np.pi * 1100 * mt) * _env_decay(m, 69) * 0.22
        cut += lowpass(noise(m), 1200) * _env_decay(m, 76) * 0.14
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut * (1.0 - i * 0.04)
    return out * 0.57


# ---------------------------------------------------------------- kitchen / stable
def flummery_pot7():
    m = int(0.69 * SR)
    t = np.arange(m) / SR
    # flummery: seventh variant
    bubble = lowpass(noise(m), 1040) * 0.2 * np.sin(np.pi * np.minimum(t / 0.69, 1.0))
    bubble *= 0.68 + 0.32 * np.sin(2 * np.pi * 4.2 * t)
    return bubble * 0.56


def manger11():
    m = int(0.59 * SR)
    t = np.arange(m) / SR
    # manger: eleventh variant
    chew = lowpass(noise(m), 880) * 0.22 * np.sin(np.pi * np.minimum(t / 0.59, 1.0))
    chew *= 0.72 + 0.28 * np.sin(2 * np.pi * 4.5 * t)
    return chew * 0.6


# ---------------------------------------------------------------- ritual / combat
def compline10(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # compline: tenth variant
    out = np.zeros(n)
    for f in (110, 165, 220):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.55


def ribaudequin6(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ribaudequin: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.2, 0.13):
        m = int(0.1 * SR)
        shot = lowpass(noise(m), 1450) * _env_decay(m, 60) * 0.33
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += shot
    return out * 0.61


# ---------------------------------------------------------------- foley / misc
def clog_step14(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: fourteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.23):
        m = int(0.06 * SR)
        step = lowpass(highpass(noise(m), 340), 1500) * _env_decay(m, 81) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.51


def nocturnal8():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nocturnal: eighth variant
    nc = np.sin(2 * np.pi * 2020 * t) * _env_decay(m, 78) * 0.11
    nc += np.sin(2 * np.pi * 3030 * t) * _env_decay(m, 91) * 0.05
    return nc * 0.59


def comint_burst6(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # COMINT: sixth burst variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.31, 0.61):
        m = int(0.25 * SR)
        burst = highpass(lowpass(noise(m), 3400), 840) * _env_decay(m, 26) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += burst
    return out * 0.62


SFX81 = [
    ("naval/fore-sail5", fore_sail5, "fore sail"),
    ("animal/pine-marten5", pine_marten5, "pine marten"),
    ("weather/khamsin5", khamsin5, "khamsin wind"),
    ("horror/bean-nighe11", bean_nighe11, "bean nighe"),
    ("tavern/put5", put5, "put game"),
    ("farm/chick-peeps18", chick_peeps18, "chick peeps"),
    ("mine/longwall8", longwall8, "longwall cut"),
    ("forge/slitting9", slitting9, "slitting mill"),
    ("kitchen/flummery-pot7", flummery_pot7, "flummery pot"),
    ("stable/manger11", manger11, "manger chewing"),
    ("ritual/compline10", compline10, "compline prayer"),
    ("combat/ribaudequin6", ribaudequin6, "ribaudequin fired"),
    ("foley/clog-step14", clog_step14, "clogs stepping"),
    ("misc/nocturnal8", nocturnal8, "nocturnal dial"),
    ("modern/comint-burst6", comint_burst6, "COMINT burst"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX81:
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
    with open(os.path.join(OUT, "sfx81-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX81:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
