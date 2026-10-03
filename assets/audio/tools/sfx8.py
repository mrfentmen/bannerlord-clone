"""Procedural SFX batch 8 for the Bannerlord-clone (round 7).

Ranged extras, traps, survival, workshop extras, animals.
All numpy DSP - no samples. Run: python3 sfx8.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx8")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx8-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(80808)


def _env_decay(n, rate):
    t = np.arange(n) / SR
    return np.exp(-t * rate)


# ---------------------------------------------------------------- ranged extras
def ballista_fire():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # massive crossbow: deep thrum + bolt whoosh
    thrum = np.sin(2 * np.pi * 70 * t) * _env_decay(m, 22) * 0.8
    thrum += lowpass(noise(m), 500) * _env_decay(m, 25) * 0.5
    wm = int(0.4 * SR)
    whoosh = (lowpass(noise(wm), 1500) - lowpass(noise(wm), 200)) * 0.4
    out = thrum
    s = int(0.15 * SR)
    out[s:s + wm] += whoosh * _env_decay(wm, 14)
    return out * 0.85


def crossbow_reload():
    out = np.zeros(int(1.1 * SR))
    # crank ratchet + string set
    for i, off in enumerate((0.0, 0.25, 0.5)):
        m = int(0.1 * SR)
        t = np.arange(m) / SR
        ratchet = np.sin(2 * np.pi * 1600 * t) * _env_decay(m, 85) * 0.35
        ratchet += highpass(noise(m), 4000) * _env_decay(m, 95) * 0.2
        s = int(off * SR)
        out[s:s + m] += ratchet
    # string locks
    cm = int(0.08 * SR)
    lock = np.sin(2 * np.pi * 900 * np.arange(cm) / SR) * _env_decay(cm, 75) * 0.5
    s = int(0.85 * SR)
    out[s:s + cm] += lock
    return out * 0.7


def javelin_throw():
    m = int(0.45 * SR)
    t = np.arange(m) / SR
    whoosh = (lowpass(noise(m), 2200) - lowpass(noise(m), 300)) * 0.5
    # slight whistle from shaft
    f = 900 - 300 * (t / 0.45)
    whistle = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15
    env = np.sin(np.pi * np.minimum(t / 0.45, 1.0))
    return (whoosh + whistle) * env * 0.7


def net_throw():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # weighted net unfurling: soft whoosh + rope whips
    whoosh = lowpass(noise(m), 1200) * 0.4 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    out = whoosh
    for b in _rng.uniform(0.1, 0.4, 5):
        wm = int(0.05 * SR)
        whip = highpass(noise(wm), 3000) * _env_decay(wm, 100) * 0.25
        s = int(b * SR)
        if s + wm < m:
            out[s:s + wm] += whip
    return out * 0.7


# ---------------------------------------------------------------- traps
def spike_trap():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # spring release + spikes
    sm = int(0.1 * SR)
    spring = np.sin(2 * np.pi * (400 + 800 * np.arange(sm) / SR) * np.arange(sm) / SR) * _env_decay(sm, 60) * 0.4
    out = np.zeros(m)
    out[:sm] += spring
    # spike impacts
    for b in _rng.uniform(0.08, 0.3, 6):
        pm = int(0.06 * SR)
        pt = np.arange(pm) / SR
        hit = np.sin(2 * np.pi * _rng.uniform(1200, 2400) * pt) * _env_decay(pm, 90) * 0.3
        s = int(b * SR)
        if s + pm < m:
            out[s:s + pm] += hit
    return out * 0.7


def tripwire_snap():
    m = int(0.25 * SR)
    t = np.arange(m) / SR
    snap = highpass(noise(m), 3500) * _env_decay(m, 85) * 0.6
    twang = np.sin(2 * np.pi * (800 - 400 * t) * t) * _env_decay(m, 70) * 0.3
    return (snap + twang) * 0.7


def bear_trap():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    # heavy steel jaws slam
    slam = lowpass(noise(m), 2500) * _env_decay(m, 55) * 0.8
    ring = np.sin(2 * np.pi * 1750 * t) * _env_decay(m, 65) * 0.35
    return (slam + ring) * 0.75


# ---------------------------------------------------------------- survival
def tent_flap(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # canvas flapping in wind
    flap = lowpass(noise(n), 900) * 0.45
    flap *= 0.3 + 0.7 * np.abs(np.sin(2 * np.pi * 1.3 * t + 0.5))
    return flap * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def backpack_rustle(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = highpass(lowpass(noise(n), 5000), 1500) * 0.3
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 3 * t)
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


def flint_strike():
    m = int(0.3 * SR)
    t = np.arange(m) / SR
    # steel on flint: sharp metallic tick + spark fizz
    tick = np.sin(2 * np.pi * 4200 * t) * _env_decay(m, 110) * 0.4
    tick += highpass(noise(m), 6000) * _env_decay(m, 120) * 0.3
    return tick * 0.7


def water_drink(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gulping: low pulsed liquid
    x = np.zeros(n)
    for b in np.arange(0.1, dur - 0.1, 0.22):
        m = int(0.12 * SR)
        bt = np.arange(m) / SR
        gulp = np.sin(2 * np.pi * (220 - 80 * bt) * bt) * _env_decay(m, 40) * 0.35
        gulp += lowpass(noise(m), 800) * _env_decay(m, 45) * 0.2
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += gulp
    return x * 0.7


# ---------------------------------------------------------------- workshop extras
def forge_bellows(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rhythmic bellows whoosh
    x = lowpass(noise(n), 700) * 0.4
    x *= 0.3 + 0.7 * np.abs(np.sin(2 * np.pi * 0.8 * t))
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def grindstone(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stone grinding: rough band noise with rotation wobble
    x = lowpass(highpass(noise(n), 800), 3000) * 0.35
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 2.1 * t)
    # occasional spark tick
    for b in _rng.uniform(0, dur, 6):
        m = int(0.03 * SR)
        tick = highpass(noise(m), 5000) * _env_decay(m, 140) * 0.2
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += tick
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


# ---------------------------------------------------------------- animals
def elk_bugle(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bugle: rising whistle to roar
    f = 500 + 900 * np.minimum(t / 1.2, 1.0) - 300 * np.maximum(t - 1.2, 0)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.4
    x += np.sin(np.cumsum(2 * np.pi * f * 1.5 / SR)) * 0.12
    x = np.sign(x) * 0.15 + x * 0.5
    env = np.minimum(t / 0.4, 1.0) * np.exp(-np.maximum(t - dur + 0.7, 0) * 3.5)
    return x * env * 0.65


def fox_yip():
    out = np.zeros(int(1.0 * SR))
    for i, off in enumerate((0.0, 0.22, 0.44, 0.66)):
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        f = 1400 - 500 * (t / 0.12)
        yip = np.sin(np.cumsum(2 * np.pi * f / SR)) * _env_decay(m, 55) * 0.35
        s = int(off * SR)
        out[s:s + m] += yip * (1.0 - i * 0.1)
    return out * 0.6


SFX8 = [
    ("ranged/ballista-fire", ballista_fire, "ballista shot"),
    ("ranged/crossbow-reload", crossbow_reload, "crossbow crank reload"),
    ("ranged/javelin-throw", javelin_throw, "javelin throw"),
    ("ranged/net-throw", net_throw, "weighted net throw"),
    ("trap/spike-trap", spike_trap, "spike trap triggers"),
    ("trap/tripwire-snap", tripwire_snap, "tripwire snap"),
    ("trap/bear-trap", bear_trap, "bear trap slam"),
    ("survival/tent-flap", tent_flap, "tent canvas flapping"),
    ("survival/backpack-rustle", backpack_rustle, "backpack rummage"),
    ("survival/flint-strike", flint_strike, "flint strike sparks"),
    ("survival/water-drink", water_drink, "drinking water"),
    ("workshop/forge-bellows", forge_bellows, "forge bellows"),
    ("workshop/grindstone", grindstone, "grindstone sharpening"),
    ("animal/elk-bugle", elk_bugle, "elk bugle"),
    ("animal/fox-yip", fox_yip, "fox yips"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX8:
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
    with open(os.path.join(OUT, "sfx8-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX8:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
