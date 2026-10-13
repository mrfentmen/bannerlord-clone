"""Procedural SFX batch 68 for the Bannerlord-clone (round 67).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx68.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx68")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx68-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(686868)


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
def moon_sail2(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # moon sail: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 1980), 700) * _env_decay(m, 41) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.55


def stoat3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stoat: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.04, 0.042):
        m = int(0.024 * SR)
        mt = np.arange(m) / SR
        f = 3400 + 860 * np.sin(2 * np.pi * 24 * mt)
        chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.024)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chirp
    return out * 0.48


# ---------------------------------------------------------------- weather / horror
def levanter3(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # levanter: third variant
    x = highpass(lowpass(noise(n), 2280), 410) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.13 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def barghest2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # barghest: second variant
    out = np.zeros(n)
    # growling
    for b in np.arange(0.1, dur - 0.5, 0.7):
        m = int(0.42 * SR)
        mt = np.arange(m) / SR
        f = 95 + 45 * np.sin(2 * np.pi * 0.6 * mt)
        growl = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.2 * np.sin(np.pi * mt / 0.42)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += growl
    return out * 0.6


# ---------------------------------------------------------------- tavern / farm
def cribbage4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cribbage: fourth variant
    out = np.zeros(n)
    # deal
    dm = int(0.37 * SR)
    deal = highpass(lowpass(noise(dm), 4000), 1500) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # pegging
    for b in _rng.uniform(0.47, 1.1, 3):
        m = int(0.05 * SR)
        peg = np.sin(2 * np.pi * 2350 * np.arange(m) / SR) * _env_decay(m, 76) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peg
    return out * 0.52


def gosling_calls5(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.022, 0.014):
        m = int(0.009 * SR)
        mt = np.arange(m) / SR
        f = 3800 + 820 * np.sin(2 * np.pi * 34 * mt)
        call = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.009)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += call
    return out * 0.42


# ---------------------------------------------------------------- mine / forge
def longwall3(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # longwall: third variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.39, 0.44):
        m = int(0.32 * SR)
        cut = lowpass(noise(m), 690) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut
    return out * 0.58


def cementation2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cementation: second variant
    x = lowpass(noise(n), 510) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.27 * t)
    return _seamless(x, fade_s=0.6) * 0.62


# ---------------------------------------------------------------- kitchen / stable
def syllabub5():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # syllabub: fifth variant
    whip = highpass(lowpass(noise(m), 2900), 950) * 0.18 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    whip *= 0.68 + 0.32 * np.sin(2 * np.pi * 4.6 * t)
    return whip * 0.54


def hay_fork3():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # hay fork: third variant
    toss = highpass(lowpass(noise(m), 3400), 1150) * 0.22 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return toss * 0.58


# ---------------------------------------------------------------- ritual / combat
def office_dead2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # office of the dead: second variant
    out = np.zeros(n)
    for f in (98, 148, 198):
        out += np.sin(2 * np.pi * f * t) * 0.06
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.57


def wall_gun2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wall gun: second variant
    out = np.zeros(n)
    # crack
    cm = int(0.15 * SR)
    crack = lowpass(noise(cm), 2050) * _env_decay(cm, 61) * 0.46
    out[:cm] += crack
    # echo
    em = int(0.4 * SR)
    echo = lowpass(noise(em), 730) * _env_decay(em, 33) * 0.23
    s = int(0.13 * SR)
    out[s:s + em] += echo
    return out * 0.65


# ---------------------------------------------------------------- foley / misc
def sabot_step8(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: eighth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.22):
        m = int(0.06 * SR)
        step = lowpass(highpass(noise(m), 360), 1600) * _env_decay(m, 84) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.49


def pelorus4():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # pelorus: fourth variant
    pel = np.sin(2 * np.pi * 2120 * t) * _env_decay(m, 66) * 0.11
    pel += np.sin(2 * np.pi * 3180 * t) * _env_decay(m, 79) * 0.05
    return pel * 0.51


def masint_ping2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # MASINT: second ping variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.38, 0.68):
        m = int(0.28 * SR)
        mt = np.arange(m) / SR
        ping = np.sin(2 * np.pi * 1420 * mt) * _env_decay(m, 23) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += ping
    return out * 0.59


SFX68 = [
    ("naval/moon-sail2", moon_sail2, "moon sail"),
    ("animal/stoat3", stoat3, "stoat chirp"),
    ("weather/levanter3", levanter3, "levanter wind"),
    ("horror/barghest2", barghest2, "barghest growl"),
    ("tavern/cribbage4", cribbage4, "cribbage game"),
    ("farm/gosling-calls5", gosling_calls5, "gosling calls"),
    ("mine/longwall3", longwall3, "longwall cut"),
    ("forge/cementation2", cementation2, "cementation fire"),
    ("kitchen/syllabub5", syllabub5, "syllabub whipped"),
    ("stable/hay-fork3", hay_fork3, "hay fork"),
    ("ritual/office-dead2", office_dead2, "office of the dead"),
    ("combat/wall-gun2", wall_gun2, "wall gun fired"),
    ("foley/sabot-step8", sabot_step8, "sabots stepping"),
    ("misc/pelorus4", pelorus4, "pelorus sight"),
    ("modern/masint-ping2", masint_ping2, "MASINT ping"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX68:
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
    with open(os.path.join(OUT, "sfx68-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX68:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
