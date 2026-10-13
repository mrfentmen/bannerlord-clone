"""Procedural SFX batch 69 for the Bannerlord-clone (round 68).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx69.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx69")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx69-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(696969)


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
def staysail3(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # staysail: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 1970), 690) * _env_decay(m, 42) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.54


def marten3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # marten: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.038, 0.04):
        m = int(0.023 * SR)
        mt = np.arange(m) / SR
        f = 3300 + 880 * np.sin(2 * np.pi * 25 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.023)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.48


# ---------------------------------------------------------------- weather / horror
def ghibli3(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ghibli: third variant
    x = highpass(lowpass(noise(n), 2180), 400) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.12 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def bean_sidhe2(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean sidhe: second variant
    out = np.zeros(n)
    # keening
    for b in np.arange(0.1, dur - 0.58, 0.78):
        m = int(0.5 * SR)
        mt = np.arange(m) / SR
        f = 900 - 400 * np.sin(2 * np.pi * 0.82 * mt)
        keen = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.135 * np.sin(np.pi * mt / 0.5)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += keen
    return out * 0.57


# ---------------------------------------------------------------- tavern / farm
def noddy2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # noddy: second variant
    out = np.zeros(n)
    # deal
    dm = int(0.36 * SR)
    deal = highpass(lowpass(noise(dm), 3950), 1480) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.46, 1.1, 3):
        m = int(0.06 * SR)
        card = highpass(noise(m), 2400) * _env_decay(m, 72) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.51


def poult_peeps11(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: eleventh variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.02, 0.013):
        m = int(0.008 * SR)
        mt = np.arange(m) / SR
        f = 3700 + 840 * np.sin(2 * np.pi * 35 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.008)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.41


# ---------------------------------------------------------------- mine / forge
def bord_work3(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bord: third variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.38, 0.43):
        m = int(0.31 * SR)
        work = lowpass(noise(m), 680) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.58


def finery4(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # finery: fourth variant
    x = lowpass(noise(n), 500) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.26 * t)
    return _seamless(x, fade_s=0.6) * 0.61


# ---------------------------------------------------------------- kitchen / stable
def syllabub6():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # syllabub: sixth variant
    whip = highpass(lowpass(noise(m), 2850), 920) * 0.18 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    whip *= 0.68 + 0.32 * np.sin(2 * np.pi * 4.8 * t)
    return whip * 0.53


def hay_tines3():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # hay tines: third variant
    toss = highpass(lowpass(noise(m), 3350), 1120) * 0.22 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return toss * 0.57


# ---------------------------------------------------------------- ritual / combat
def lauds3(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lauds: third variant
    out = np.zeros(n)
    for f in (110, 165, 220):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.53


def demi_cannon3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # demi-cannon: third variant
    out = np.zeros(n)
    # boom
    bm = int(0.21 * SR)
    boom = lowpass(noise(bm), 1700) * _env_decay(bm, 47) * 0.45
    out[:bm] += boom
    # rumble
    rm = int(0.5 * SR)
    rumble = lowpass(noise(rm), 610) * _env_decay(rm, 30) * 0.23
    s = int(0.16 * SR)
    out[s:s + rm] += rumble
    return out * 0.65


# ---------------------------------------------------------------- foley / misc
def sabot_step9(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: ninth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.21):
        m = int(0.058 * SR)
        step = lowpass(highpass(noise(m), 340), 1500) * _env_decay(m, 85) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.48


def backstaff5():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # backstaff: fifth variant
    bs = np.sin(2 * np.pi * 1820 * t) * _env_decay(m, 67) * 0.11
    bs += np.sin(2 * np.pi * 2730 * t) * _env_decay(m, 80) * 0.05
    return bs * 0.5


def geoint_task2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # GEOINT: second task variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.26, 0.5):
        m = int(0.18 * SR)
        mt = np.arange(m) / SR
        beep = np.sin(2 * np.pi * 1620 * mt) * _env_decay(m, 33) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += beep
    return out * 0.56


SFX69 = [
    ("naval/staysail3", staysail3, "staysail"),
    ("animal/marten3", marten3, "marten chatter"),
    ("weather/ghibli3", ghibli3, "ghibli wind"),
    ("horror/bean-sidhe2", bean_sidhe2, "bean sidhe keen"),
    ("tavern/noddy2", noddy2, "noddy game"),
    ("farm/poult-peeps11", poult_peeps11, "poult peeps"),
    ("mine/bord-work3", bord_work3, "bord work"),
    ("forge/finery4", finery4, "finery fire"),
    ("kitchen/syllabub6", syllabub6, "syllabub whipped"),
    ("stable/hay-tines3", hay_tines3, "hay tines"),
    ("ritual/lauds3", lauds3, "lauds prayer"),
    ("combat/demi-cannon3", demi_cannon3, "demi-cannon fired"),
    ("foley/sabot-step9", sabot_step9, "sabots stepping"),
    ("misc/backstaff5", backstaff5, "backstaff sight"),
    ("modern/geoint-task2", geoint_task2, "GEOINT task"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX69:
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
    with open(os.path.join(OUT, "sfx69-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX69:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
