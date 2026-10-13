"""Procedural SFX batch 13 for the Bannerlord-clone (round 12).

Disasters, ritual, animals, foley, combat, naval, weather, modern, misc.
All numpy DSP - no samples. Run: python3 sfx13.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx13")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx13-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(131313)


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


# ---------------------------------------------------------------- disasters
def earthquake(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # deep sub-bass rumble with debris
    rumble = np.sin(2 * np.pi * 28 * t) * 0.4 + np.sin(2 * np.pi * 42 * t) * 0.25
    rumble += lowpass(noise(n), 120) * 0.4
    env = np.minimum(t / 1.0, 1.0) * np.exp(-np.maximum(t - 3.0, 0) * 3)
    out = rumble * env
    for b in _rng.uniform(0.5, 3.0, 12):
        m = int(0.2 * SR)
        crash = lowpass(noise(m), 1000) * _env_decay(m, 25) * _rng.uniform(0.2, 0.5)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += crash
    return out * 0.8


def building_collapse(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # structure groans then falls
    groan = np.sin(np.cumsum(2 * np.pi * (80 - 30 * np.minimum(t / 1.0, 1.0)) / SR)) * 0.3 * np.minimum(t / 1.0, 1.0)
    out = groan * np.exp(-np.maximum(t - 1.2, 0) * 2)
    # collapse roar
    cm = int(1.8 * SR)
    roar = lowpass(noise(cm), 700) * 0.7 * np.sin(np.pi * np.arange(cm) / cm)
    s = int(1.2 * SR)
    out[s:s + cm] += roar
    # debris rain
    for b in _rng.uniform(1.5, 2.8, 10):
        m = int(0.1 * SR)
        debris = lowpass(noise(m), 2500) * _env_decay(m, 40) * _rng.uniform(0.15, 0.35)
        sd = int(b * SR)
        if sd + m < n:
            out[sd:sd + m] += debris
    return out * 0.75


def fire_spread(dur=3.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # growing fire: crackle bed + whooshes
    base = highpass(lowpass(noise(n), 6000), 2000) * 0.3
    base *= 0.4 + 0.6 * np.minimum(t / 2.5, 1.0)
    out = base
    for b in _rng.uniform(0.5, 3.0, 6):
        m = int(0.5 * SR)
        whoosh = lowpass(noise(m), 1500) * 0.35 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += whoosh
    return _seamless(out, fade_s=0.5) * 0.7


# ---------------------------------------------------------------- ritual
def temple_bell():
    m = int(3.0 * SR)
    t = np.arange(m) / SR
    # deep temple bell with long decay
    x = np.sin(2 * np.pi * 165 * t) * _env_decay(m, 6) * 0.5
    x += np.sin(2 * np.pi * 247 * t) * _env_decay(m, 9) * 0.3
    x += np.sin(2 * np.pi * 412 * t) * _env_decay(m, 14) * 0.15
    return x * 0.75


def prayer_murmur_loop(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # low crowd murmur: many soft voices
    out = np.zeros(n)
    for _ in range(12):
        f = _rng.uniform(90, 180)
        v = np.sin(np.cumsum(2 * np.pi * f / SR + 0.1 * np.sin(2 * np.pi * 2 * t))) * _rng.uniform(0.03, 0.08)
        out += v
    out = np.sign(out) * 0.05 + out * 0.5
    return _seamless(out, fade_s=0.8) * 0.65


# ---------------------------------------------------------------- animals
def turkey_gobble(dur=1.2):
    n = int(dur * SR)
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.22):
        m = int(0.14 * SR)
        t = np.arange(m) / SR
        f = 500 + 200 * np.sin(2 * np.pi * 6 * t)
        gobble = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
        gobble = np.sign(gobble) * 0.12 + gobble * 0.35
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += gobble * _env_decay(m, 25)
    return out * 0.7


def donkey_bray(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # donkey bray: harsh alternating pitch
    f = 350 + 250 * np.sign(np.sin(2 * np.pi * 4 * t))
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.35
    x = np.sign(x) * 0.18 + x * 0.35
    env = np.minimum(t / 0.15, 1.0) * np.exp(-np.maximum(t - dur + 0.5, 0) * 4)
    return x * env * 0.7


# ---------------------------------------------------------------- foley
def saddle_creak(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # leather saddle creaking
    f = 180 + 60 * np.sin(2 * np.pi * 1.5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.3 + 0.3 * np.sin(2 * np.pi * 2.5 * t)) * 0.35
    x += lowpass(noise(n), 900) * 0.1
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def stirrup_clink():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # metal stirrup clinking
    x = np.sin(2 * np.pi * 2400 * t) * _env_decay(m, 70) * 0.35
    x += np.sin(2 * np.pi * 3600 * t) * _env_decay(m, 90) * 0.2
    x += highpass(noise(m), 5000) * _env_decay(m, 100) * 0.15
    return x * 0.65


# ---------------------------------------------------------------- combat / naval / weather / modern / misc
def spear_volley(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    # many javelins whooshing
    for b in _rng.uniform(0.0, 0.8, 10):
        m = int(0.35 * SR)
        whoosh = (lowpass(noise(m), 2000) - lowpass(noise(m), 250)) * 0.35
        whoosh *= np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += whoosh
    return out * 0.7


def dock_creak(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wooden dock swaying on water
    creak = np.sin(np.cumsum(2 * np.pi * (70 + 30 * np.sin(2 * np.pi * 0.5 * t)) / SR)) * 0.25
    creak += np.sin(np.cumsum(2 * np.pi * (110 + 40 * np.sin(2 * np.pi * 0.8 * t)) / SR)) * 0.15
    water = lowpass(noise(n), 700) * 0.2
    return (creak + water) * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def wind_gust(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # single strong wind gust
    x = lowpass(noise(n), 1200) * 0.5
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0)) ** 1.5
    return x * 0.75


def jet_flyby(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # jet passing overhead: rising then falling roar
    roar = lowpass(noise(n), 2000) * 0.5
    whistle = np.sin(np.cumsum(2 * np.pi * (3000 - 1500 * np.minimum(t / dur, 1.0)) / SR)) * 0.12
    env = np.sin(np.pi * np.minimum(t / dur, 1.0))
    return (roar + whistle) * env * 0.75


def farrier_shoe():
    out = np.zeros(int(1.2 * SR))
    # horse shoeing: hammer taps on anvil + horse snort
    for i, off in enumerate((0.0, 0.3, 0.6)):
        m = int(0.1 * SR)
        t = np.arange(m) / SR
        tap = np.sin(2 * np.pi * 2900 * t) * _env_decay(m, 85) * 0.35
        tap += np.sin(2 * np.pi * 1450 * t) * _env_decay(m, 95) * 0.2
        s = int(off * SR)
        out[s:s + m] += tap * (1.0 - i * 0.1)
    return out * 0.65


def water_wheel(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mill water wheel: rhythmic splashes + wood groan
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.75):
        m = int(0.4 * SR)
        splash = highpass(lowpass(noise(m), 4000), 1000) * 0.3 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += splash
    groan = np.sin(np.cumsum(2 * np.pi * (50 + 15 * np.sin(2 * np.pi * 0.4 * t)) / SR)) * 0.12
    return _seamless(out + groan, fade_s=0.6) * 0.7


SFX13 = [
    ("disaster/earthquake", earthquake, "earthquake rumble"),
    ("disaster/building-collapse", building_collapse, "building collapse"),
    ("disaster/fire-spread", fire_spread, "fire spreading"),
    ("ritual/temple-bell", temple_bell, "temple bell"),
    ("ritual/prayer-murmur-loop", prayer_murmur_loop, "prayer murmur loop"),
    ("animal/turkey-gobble", turkey_gobble, "turkey gobble"),
    ("animal/donkey-bray", donkey_bray, "donkey bray"),
    ("foley/saddle-creak", saddle_creak, "saddle leather creak"),
    ("foley/stirrup-clink", stirrup_clink, "stirrup clink"),
    ("combat/spear-volley", spear_volley, "spear volley"),
    ("naval/dock-creak", dock_creak, "wooden dock swaying"),
    ("weather/wind-gust", wind_gust, "strong wind gust"),
    ("modern/jet-flyby", jet_flyby, "jet flyby"),
    ("misc/farrier-shoe", farrier_shoe, "horse shoeing"),
    ("misc/water-wheel", water_wheel, "mill water wheel"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX13:
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
    with open(os.path.join(OUT, "sfx13-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX13:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
