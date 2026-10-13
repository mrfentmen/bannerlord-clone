"""Procedural SFX batch 83 for the Bannerlord-clone (round 82).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx83.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx83")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx83-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(838383)


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
def top_sail6(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # top sail: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.25):
        m = int(0.18 * SR)
        flap = highpass(lowpass(noise(m), 2050), 700) * _env_decay(m, 41) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.56


def ferret5(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ferret: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.038, 0.04):
        m = int(0.025 * SR)
        mt = np.arange(m) / SR
        f = 2900 + 950 * np.sin(2 * np.pi * 26 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.025)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.49


# ---------------------------------------------------------------- weather / horror
def gregale5(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gregale: fifth variant
    x = highpass(lowpass(noise(n), 2100), 405) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.125 * t)
    return _seamless(x, fade_s=0.6) * 0.65


def bean_nighe13(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: thirteenth variant
    out = np.zeros(n)
    # washing
    wm = int(0.65 * SR)
    wash = highpass(lowpass(noise(wm), 1750), 480) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 4.2 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(0.75, dur - 0.38, 0.48):
        m = int(0.28 * SR)
        mt = np.arange(m) / SR
        f = 660 - 260 * np.sin(2 * np.pi * 1.12 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.28)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.46


# ---------------------------------------------------------------- tavern / farm
def tick_tack4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # tick-tack: fourth variant
    out = np.zeros(n)
    # deal
    dm = int(0.36 * SR)
    deal = highpass(lowpass(noise(dm), 3900), 1450) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.46, 1.1, 3):
        m = int(0.061 * SR)
        card = highpass(noise(m), 2400) * _env_decay(m, 72) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.51


def gosling_peeps16(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: sixteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.013, 0.008):
        m = int(0.004 * SR)
        mt = np.arange(m) / SR
        f = 3300 + 920 * np.sin(2 * np.pi * 36 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.004)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.37


# ---------------------------------------------------------------- mine / forge
def stint_work7(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stint: seventh variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.38, 0.43):
        m = int(0.31 * SR)
        work = lowpass(noise(m), 690) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.59


def slitting10(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slitting: tenth variant
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.2, 0.25)):
        m = int(0.14 * SR)
        mt = np.arange(m) / SR
        cut = np.sin(2 * np.pi * 1080 * mt) * _env_decay(m, 70) * 0.22
        cut += lowpass(noise(m), 1180) * _env_decay(m, 77) * 0.14
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut * (1.0 - i * 0.04)
    return out * 0.56


# ---------------------------------------------------------------- kitchen / stable
def jelly_mould7():
    m = int(0.64 * SR)
    t = np.arange(m) / SR
    # jelly: seventh variant
    wobble = np.sin(2 * np.pi * 200 * t) * _env_decay(m, 57) * 0.11
    wobble += np.sin(2 * np.pi * 300 * t) * _env_decay(m, 64) * 0.07
    return wobble * 0.54


def hay_tines8():
    m = int(0.59 * SR)
    t = np.arange(m) / SR
    # hay tines: eighth variant
    toss = highpass(lowpass(noise(m), 3150), 1240) * 0.21 * np.sin(np.pi * np.minimum(t / 0.59, 1.0))
    return toss * 0.63


# ---------------------------------------------------------------- ritual / combat
def lauds6(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lauds: sixth variant
    out = np.zeros(n)
    for f in (114, 171, 228):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.57


def falconet8(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # falconet: eighth variant
    out = np.zeros(n)
    # crack
    cm = int(0.18 * SR)
    crack = lowpass(noise(cm), 2100) * _env_decay(cm, 59) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.45 * SR)
    tail = lowpass(noise(tm), 720) * _env_decay(tm, 30) * 0.22
    s = int(0.15 * SR)
    out[s:s + tm] += tail
    return out * 0.66


# ---------------------------------------------------------------- foley / misc
def pattens13(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: thirteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.25):
        m = int(0.064 * SR)
        step = lowpass(highpass(noise(m), 360), 1600) * _env_decay(m, 79) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.53


def backstaff10():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # backstaff: tenth variant
    bs = np.sin(2 * np.pi * 2180 * t) * _env_decay(m, 80) * 0.11
    bs += np.sin(2 * np.pi * 3270 * t) * _env_decay(m, 93) * 0.05
    return bs * 0.61


def geoint_task7(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # GEOINT: seventh task variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.31, 0.53):
        m = int(0.23 * SR)
        mt = np.arange(m) / SR
        task = np.sin(2 * np.pi * 1660 * mt) * _env_decay(m, 27) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += task
    return out * 0.64


SFX83 = [
    ("naval/top-sail6", top_sail6, "top sail"),
    ("animal/ferret5", ferret5, "ferret chatter"),
    ("weather/gregale5", gregale5, "gregale wind"),
    ("horror/bean-nighe13", bean_nighe13, "bean nighe"),
    ("tavern/tick-tack4", tick_tack4, "tick-tack game"),
    ("farm/gosling-peeps16", gosling_peeps16, "gosling peeps"),
    ("mine/stint-work7", stint_work7, "stint work"),
    ("forge/slitting10", slitting10, "slitting mill"),
    ("kitchen/jelly-mould7", jelly_mould7, "jelly mould"),
    ("stable/hay-tines8", hay_tines8, "hay tines"),
    ("ritual/lauds6", lauds6, "lauds prayer"),
    ("combat/falconet8", falconet8, "falconet fired"),
    ("foley/pattens13", pattens13, "pattens stepping"),
    ("misc/backstaff10", backstaff10, "backstaff sight"),
    ("modern/geoint-task7", geoint_task7, "GEOINT task"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX83:
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
    with open(os.path.join(OUT, "sfx83-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX83:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
