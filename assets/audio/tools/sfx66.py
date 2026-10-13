"""Procedural SFX batch 66 for the Bannerlord-clone (round 65).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx66.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx66")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx66-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(666666)


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
def gaff_sail2(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gaff sail: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.25):
        m = int(0.18 * SR)
        flap = highpass(lowpass(noise(m), 2020), 720) * _env_decay(m, 40) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.55


def beaver3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # beaver: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.044, 0.046):
        m = int(0.026 * SR)
        mt = np.arange(m) / SR
        f = 2900 + 960 * np.sin(2 * np.pi * 29 * mt)
        gnaw = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.026)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += gnaw
    return out * 0.48


# ---------------------------------------------------------------- weather / horror
def santa_ana3(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # santa ana: third variant
    x = highpass(lowpass(noise(n), 2050), 370) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.09 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def cu_sith2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cu sith: second variant
    out = np.zeros(n)
    # baying
    for b in np.arange(0.1, dur - 0.38, 0.58):
        m = int(0.33 * SR)
        mt = np.arange(m) / SR
        f = 410 - 170 * np.sin(2 * np.pi * 0.85 * mt)
        bay = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.17 * np.sin(np.pi * mt / 0.33)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bay
    return out * 0.61


# ---------------------------------------------------------------- tavern / farm
def whist3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # whist: third variant
    out = np.zeros(n)
    # deal
    dm = int(0.38 * SR)
    deal = highpass(lowpass(noise(dm), 4050), 1520) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.48, 1.1, 3):
        m = int(0.06 * SR)
        card = highpass(noise(m), 2450) * _env_decay(m, 71) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.52


def chick_peeps13(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: thirteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.026, 0.016):
        m = int(0.011 * SR)
        mt = np.arange(m) / SR
        f = 4000 + 780 * np.sin(2 * np.pi * 32 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.011)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.44


# ---------------------------------------------------------------- mine / forge
def drift_mining2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # drift: second variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.32, 0.37):
        m = int(0.25 * SR)
        work = lowpass(noise(m), 810) * 0.32 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.58


def slitting4(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slitting: fourth variant
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.26, 0.31)):
        m = int(0.2 * SR)
        mt = np.arange(m) / SR
        cut = np.sin(2 * np.pi * 1160 * mt) * _env_decay(m, 64) * 0.23
        cut += lowpass(noise(m), 1300) * _env_decay(m, 71) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut * (1.0 - i * 0.04)
    return out * 0.62


# ---------------------------------------------------------------- kitchen / stable
def posset_stir4():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # posset: fourth stir variant
    stir = lowpass(noise(m), 1160) * 0.21 * np.sin(np.pi * np.minimum(t / 0.7, 1.0))
    stir *= 0.68 + 0.32 * np.sin(2 * np.pi * 3.6 * t)
    return stir * 0.55


def straw_tick3():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # straw tick: third variant
    rustle = highpass(lowpass(noise(m), 3150), 1150) * 0.23 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return rustle * 0.59


# ---------------------------------------------------------------- ritual / combat
def benediction3(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # benediction: third variant
    out = np.zeros(n)
    for f in (112, 168, 224):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.54


def ribaudequin3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ribaudequin: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.23, 0.16):
        m = int(0.13 * SR)
        shot = lowpass(noise(m), 1600) * _env_decay(m, 57) * 0.34
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += shot
    return out * 0.64


# ---------------------------------------------------------------- foley / misc
def clog_step9(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: ninth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.24):
        m = int(0.065 * SR)
        step = lowpass(highpass(noise(m), 400), 1800) * _env_decay(m, 82) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.51


def cross_staff4():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # cross-staff: fourth variant
    cs = np.sin(2 * np.pi * 2140 * t) * _env_decay(m, 65) * 0.11
    cs += np.sin(2 * np.pi * 3210 * t) * _env_decay(m, 78) * 0.05
    return cs * 0.51


def sigint_scan2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # SIGINT: second scan variant
    f = 1480 + 980 * np.sin(2 * np.pi * 0.34 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.098
    # scan pattern
    x *= 0.4 + 0.6 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.88 * t))
    return _seamless(x, fade_s=0.4) * 0.53


SFX66 = [
    ("naval/gaff-sail2", gaff_sail2, "gaff sail"),
    ("animal/beaver3", beaver3, "beaver gnaw"),
    ("weather/santa-ana3", santa_ana3, "santa ana wind"),
    ("horror/cu-sith2", cu_sith2, "cu sith hound"),
    ("tavern/whist3", whist3, "whist game"),
    ("farm/chick-peeps13", chick_peeps13, "chick peeps"),
    ("mine/drift-mining2", drift_mining2, "drift mining"),
    ("forge/slitting4", slitting4, "slitting mill"),
    ("kitchen/posset-stir4", posset_stir4, "posset stirred"),
    ("stable/straw-tick3", straw_tick3, "straw tick"),
    ("ritual/benediction3", benediction3, "benediction prayer"),
    ("combat/ribaudequin3", ribaudequin3, "ribaudequin fired"),
    ("foley/clog-step9", clog_step9, "clogs stepping"),
    ("misc/cross-staff4", cross_staff4, "cross-staff sight"),
    ("modern/sigint-scan2", sigint_scan2, "SIGINT scan"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX66:
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
    with open(os.path.join(OUT, "sfx66-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX66:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
