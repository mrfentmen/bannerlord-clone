"""Procedural SFX batch 62 for the Bannerlord-clone (round 61).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx62.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx62")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx62-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(626262)


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
def staysail2(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # staysail: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.25):
        m = int(0.18 * SR)
        flap = highpass(lowpass(noise(m), 2050), 750) * _env_decay(m, 38) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.56


def marten2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # marten: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.048, 0.052):
        m = int(0.03 * SR)
        mt = np.arange(m) / SR
        f = 3300 + 880 * np.sin(2 * np.pi * 25 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.03)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.5


# ---------------------------------------------------------------- weather / horror
def ghibli2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ghibli: second variant
    x = highpass(lowpass(noise(n), 2250), 410) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.13 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def bean_sidhe(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean sidhe: fairy woman
    out = np.zeros(n)
    # keening
    for b in np.arange(0.1, dur - 0.6, 0.8):
        m = int(0.52 * SR)
        mt = np.arange(m) / SR
        f = 920 - 420 * np.sin(2 * np.pi * 0.8 * mt)
        keen = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.14 * np.sin(np.pi * mt / 0.52)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += keen
    return out * 0.58


# ---------------------------------------------------------------- tavern / farm
def noddy(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # noddy: card game
    out = np.zeros(n)
    # deal
    dm = int(0.41 * SR)
    deal = highpass(lowpass(noise(dm), 4150), 1580) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.51, 1.1, 3):
        m = int(0.06 * SR)
        card = highpass(noise(m), 2550) * _env_decay(m, 69) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.53


def poult_peeps9(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: ninth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.034, 0.021):
        m = int(0.015 * SR)
        mt = np.arange(m) / SR
        f = 4600 + 700 * np.sin(2 * np.pi * 28 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.015)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.46


# ---------------------------------------------------------------- mine / forge
def bord_work(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bord: working the gallery
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.43, 0.48):
        m = int(0.36 * SR)
        work = lowpass(noise(m), 740) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.59


def finery3(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # finery: third variant
    x = lowpass(noise(n), 520) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.31 * t)
    return _seamless(x, fade_s=0.6) * 0.63


# ---------------------------------------------------------------- kitchen / stable
def syllabub4():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # syllabub: fourth variant
    whip = highpass(lowpass(noise(m), 2950), 980) * 0.19 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    whip *= 0.68 + 0.32 * np.sin(2 * np.pi * 4.4 * t)
    return whip * 0.55


def hay_tines2():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # hay tines: second variant
    toss = highpass(lowpass(noise(m), 3450), 1180) * 0.23 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return toss * 0.59


# ---------------------------------------------------------------- ritual / combat
def lauds2(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lauds: second variant
    out = np.zeros(n)
    for f in (118, 177, 236):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.56


def demi_cannon2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # demi-cannon: second variant
    out = np.zeros(n)
    # boom
    bm = int(0.22 * SR)
    boom = lowpass(noise(bm), 1750) * _env_decay(bm, 46) * 0.46
    out[:bm] += boom
    # rumble
    rm = int(0.52 * SR)
    rumble = lowpass(noise(rm), 630) * _env_decay(rm, 29) * 0.24
    s = int(0.17 * SR)
    out[s:s + rm] += rumble
    return out * 0.66


# ---------------------------------------------------------------- foley / misc
def sabot_step6(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.28):
        m = int(0.075 * SR)
        step = lowpass(highpass(noise(m), 480), 2200) * _env_decay(m, 78) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.53


def backstaff3():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # backstaff: third variant
    bs = np.sin(2 * np.pi * 1850 * t) * _env_decay(m, 66) * 0.11
    bs += np.sin(2 * np.pi * 2775 * t) * _env_decay(m, 79) * 0.05
    return bs * 0.51


def geoint_task(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # GEOINT: tasking beep
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.28, 0.52):
        m = int(0.2 * SR)
        mt = np.arange(m) / SR
        beep = np.sin(2 * np.pi * 1650 * mt) * _env_decay(m, 32) * 0.21
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += beep
    return out * 0.58


SFX62 = [
    ("naval/staysail2", staysail2, "staysail"),
    ("animal/marten2", marten2, "marten chatter"),
    ("weather/ghibli2", ghibli2, "ghibli wind"),
    ("horror/bean-sidhe", bean_sidhe, "bean sidhe keen"),
    ("tavern/noddy", noddy, "noddy game"),
    ("farm/poult-peeps9", poult_peeps9, "poult peeps"),
    ("mine/bord-work", bord_work, "bord work"),
    ("forge/finery3", finery3, "finery fire"),
    ("kitchen/syllabub4", syllabub4, "syllabub whipped"),
    ("stable/hay-tines2", hay_tines2, "hay tines"),
    ("ritual/lauds2", lauds2, "lauds prayer"),
    ("combat/demi-cannon2", demi_cannon2, "demi-cannon fired"),
    ("foley/sabot-step6", sabot_step6, "sabots stepping"),
    ("misc/backstaff4", backstaff3, "backstaff sight"),
    ("modern/geoint-task", geoint_task, "GEOINT task"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX62:
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
    with open(os.path.join(OUT, "sfx62-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX62:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
