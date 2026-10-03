"""Procedural SFX batch 61 for the Bannerlord-clone (round 60).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx61.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx61")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx61-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(616161)


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
def moon_sail(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # moon sail: small square
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 2000), 720) * _env_decay(m, 39) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.56


def stoat2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stoat: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.05, 0.055):
        m = int(0.032 * SR)
        mt = np.arange(m) / SR
        f = 3500 + 840 * np.sin(2 * np.pi * 24 * mt)
        chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.032)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chirp
    return out * 0.5


# ---------------------------------------------------------------- weather / horror
def levanter2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # levanter: second variant
    x = highpass(lowpass(noise(n), 2300), 420) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.14 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def black_shuck(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # black shuck: spectral hound
    out = np.zeros(n)
    # howling
    for b in np.arange(0.1, dur - 0.55, 0.75):
        m = int(0.48 * SR)
        mt = np.arange(m) / SR
        f = 380 - 200 * np.sin(2 * np.pi * 0.7 * mt)
        howl = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.17 * np.sin(np.pi * mt / 0.48)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += howl
    return out * 0.61


# ---------------------------------------------------------------- tavern / farm
def all_fours(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # all fours: card game
    out = np.zeros(n)
    # deal
    dm = int(0.42 * SR)
    deal = highpass(lowpass(noise(dm), 4200), 1600) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.52, 1.1, 3):
        m = int(0.06 * SR)
        card = highpass(noise(m), 2600) * _env_decay(m, 68) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.54


def chick_peeps11(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: eleventh variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.036, 0.023):
        m = int(0.017 * SR)
        mt = np.arange(m) / SR
        f = 4500 + 680 * np.sin(2 * np.pi * 27 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.017)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.47


# ---------------------------------------------------------------- mine / forge
def pillar_work(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pillar: working the seam
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.44, 0.49):
        m = int(0.37 * SR)
        work = lowpass(noise(m), 760) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.6


def puddling2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # puddling: second variant
    x = lowpass(noise(n), 530) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.32 * t)
    return _seamless(x, fade_s=0.6) * 0.63


# ---------------------------------------------------------------- kitchen / stable
def caudle_mug2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # caudle: second mug variant
    swirl = lowpass(noise(m), 1120) * 0.22 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    swirl *= 0.68 + 0.32 * np.sin(2 * np.pi * 3.9 * t)
    return swirl * 0.56


def straw_bed2():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # straw bed: second variant
    rustle = highpass(lowpass(noise(m), 3200), 1200) * 0.23 * np.sin(np.pi * np.minimum(t / 0.55, 1.0))
    return rustle * 0.59


# ---------------------------------------------------------------- ritual / combat
def tenebrae2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # tenebrae: second variant
    out = np.zeros(n)
    for f in (98, 147, 196):
        out += np.sin(2 * np.pi * f * t) * 0.06
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.57


def serpentine2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # serpentine: second variant
    out = np.zeros(n)
    # crack
    cm = int(0.17 * SR)
    crack = lowpass(noise(cm), 1950) * _env_decay(cm, 58) * 0.44
    out[:cm] += crack
    # tail
    tm = int(0.45 * SR)
    tail = lowpass(noise(tm), 680) * _env_decay(tm, 31) * 0.23
    s = int(0.14 * SR)
    out[s:s + tm] += tail
    return out * 0.65


# ---------------------------------------------------------------- foley / misc
def clog_step7(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: seventh variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.29):
        m = int(0.075 * SR)
        step = lowpass(highpass(noise(m), 500), 2300) * _env_decay(m, 77) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.54


def sextant2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # sextant: second variant
    sx = np.sin(2 * np.pi * 1950 * t) * _env_decay(m, 65) * 0.11
    sx += np.sin(2 * np.pi * 2925 * t) * _env_decay(m, 78) * 0.05
    return sx * 0.52


def imint_frame(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # IMINT: frame capture
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.55):
        m = int(0.22 * SR)
        mt = np.arange(m) / SR
        frame = np.sin(2 * np.pi * 1750 * mt) * _env_decay(m, 30) * 0.21
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += frame
    return out * 0.58


SFX61 = [
    ("naval/moon-sail", moon_sail, "moon sail"),
    ("animal/stoat2", stoat2, "stoat chirp"),
    ("weather/levanter2", levanter2, "levanter wind"),
    ("horror/black-shuck", black_shuck, "black shuck howl"),
    ("tavern/all-fours", all_fours, "all fours game"),
    ("farm/chick-peeps11", chick_peeps11, "chick peeps"),
    ("mine/pillar-work", pillar_work, "pillar work"),
    ("forge/puddling2", puddling2, "puddling furnace"),
    ("kitchen/caudle-mug2", caudle_mug2, "caudle mug"),
    ("stable/straw-bed2", straw_bed2, "straw bed"),
    ("ritual/tenebrae2", tenebrae2, "tenebrae service"),
    ("combat/serpentine2", serpentine2, "serpentine fired"),
    ("foley/clog-step7", clog_step7, "clogs stepping"),
    ("misc/sextant2", sextant2, "sextant sight"),
    ("modern/imint-frame", imint_frame, "IMINT frame"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX61:
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
    with open(os.path.join(OUT, "sfx61-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX61:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
