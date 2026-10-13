"""Procedural SFX batch 26 for the Bannerlord-clone (round 25).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx26.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx26")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx26-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(262626)


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
def crows_nest(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # crow's nest in wind: high whistling + wood
    whistle = highpass(noise(n), 3000) * 0.2 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.7 * t))
    wood = np.sin(2 * np.pi * 180 * t) * 0.08 * np.sin(2 * np.pi * 0.5 * t)
    return _seamless(whistle + wood, fade_s=0.5) * 0.65


def hedgehog_snuffle(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # hedgehog foraging: tiny snuffles
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.15):
        m = int(0.1 * SR)
        snuffle = highpass(lowpass(noise(m), 2500), 800) * 0.25 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += snuffle
    return out * 0.6


# ---------------------------------------------------------------- weather / horror
def ice_fog(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ice fog: crystalline shimmer in cold air
    x = highpass(noise(n), 8000) * 0.08
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.3 * t)
    return _seamless(x, fade_s=0.6) * 0.55


def blood_drip(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slow ominous dripping
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.2, 0.45):
        m = int(0.12 * SR)
        mt = np.arange(m) / SR
        drip = np.sin(2 * np.pi * (1200 - 400 * mt / 0.12) * mt) * _env_decay(m, 65) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += drip
    return out * 0.65


# ---------------------------------------------------------------- tavern / farm
def dart_thunk():
    m = int(0.3 * SR)
    t = np.arange(m) / SR
    # dart hitting board: thunk + board wobble
    thunk = lowpass(noise(m), 1500) * _env_decay(m, 85) * 0.4
    wobble = np.sin(2 * np.pi * 300 * t) * _env_decay(m, 45) * 0.2
    return (thunk + wobble) * 0.65


def goat_kid_bleat(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # baby goat: high trembling bleat
    f = 700 + 200 * np.sin(2 * np.pi * 7 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 11 * t)
    env = np.minimum(t / 0.1, 1.0) * np.exp(-np.maximum(t - dur + 0.3, 0) * 5)
    return x * env * 0.65


# ---------------------------------------------------------------- mine / forge
def water_pump(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mine water pump: rhythmic clanking pump
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.7):
        m = int(0.6 * SR)
        pump = lowpass(noise(m), 700) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        # metal clank
        cm = int(0.08 * SR)
        clank = np.sin(2 * np.pi * 900 * np.arange(cm) / SR) * _env_decay(cm, 75) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pump
            out[s:s + cm] += clank
    return out * 0.7


def forge_scale():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # hammer scale falling: metallic shower
    out = np.zeros(m)
    for b in _rng.uniform(0.05, 0.4, 10):
        sm = int(0.04 * SR)
        ping = np.sin(2 * np.pi * _rng.uniform(3000, 4500) * np.arange(sm) / SR) * _env_decay(sm, 110) * _rng.uniform(0.1, 0.2)
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += ping
    return out * 0.6


# ---------------------------------------------------------------- kitchen / stable
def cider_press(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cider press: creaking + juice flow
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.5, 0.6):
        m = int(0.5 * SR)
        creak = np.sin(2 * np.pi * 120 * np.arange(m) / SR) * _env_decay(m, 25) * 0.25
        juice = lowpass(noise(m), 1500) * 0.2 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak + juice
    return out * 0.7


def manure_fork(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stable mucking: fork + straw
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.4):
        m = int(0.3 * SR)
        fork = lowpass(highpass(noise(m), 600), 2500) * 0.35 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += fork
    return out * 0.65


# ---------------------------------------------------------------- ritual / combat
def blessing_chant(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # priestly blessing: low solemn tones
    out = np.zeros(n)
    for f in (110, 146.8, 164.8):
        out += np.sin(2 * np.pi * f * t) * 0.12
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # bell
    bm = int(0.4 * SR)
    bell = np.sin(2 * np.pi * 880 * np.arange(bm) / SR) * _env_decay(bm, 30) * 0.15
    s = int(2.0 * SR)
    out[s:s + bm] += bell
    return out * 0.7


def javelin_throw(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # javelin: whoosh + distant thud
    whoosh = lowpass(noise(n), 1200) * 0.4 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    # thud
    m = int(0.15 * SR)
    thud = lowpass(noise(m), 900) * _env_decay(m, 60) * 0.4
    s = int(0.6 * SR)
    whoosh[s:s + m] += thud
    return whoosh * 0.7


# ---------------------------------------------------------------- foley / misc
def saddlebag_drop():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # saddlebag dropped: leather + contents
    thud = lowpass(noise(m), 1000) * _env_decay(m, 50) * 0.45
    jingle = highpass(noise(m), 4000) * _env_decay(m, 90) * 0.15
    return (thud + jingle) * 0.65


def spyglass_extend():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # spyglass extended: brass slides
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.2, 0.35)):
        sm = int(0.12 * SR)
        slide = highpass(lowpass(noise(sm), 5000), 2000) * 0.25 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(off * SR)
        out[s:s + sm] += slide
    return out * 0.6


def thermal_imager(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # thermal imager: soft electronic sweep
    x = np.sin(2 * np.pi * 600 * t) * 0.1
    x += np.sin(2 * np.pi * 900 * t) * 0.06 * np.sin(2 * np.pi * 0.8 * t)
    return _seamless(x, fade_s=0.5) * 0.6


SFX26 = [
    ("naval/crows-nest", crows_nest, "crow's nest in wind"),
    ("animal/hedgehog-snuffle", hedgehog_snuffle, "hedgehog foraging"),
    ("weather/ice-fog", ice_fog, "ice fog shimmer"),
    ("horror/blood-drip", blood_drip, "ominous dripping"),
    ("tavern/dart-thunk", dart_thunk, "dart hitting board"),
    ("farm/goat-kid-bleat", goat_kid_bleat, "baby goat bleating"),
    ("mine/water-pump", water_pump, "mine water pump"),
    ("forge/forge-scale", forge_scale, "hammer scale falling"),
    ("kitchen/cider-press", cider_press, "cider press working"),
    ("stable/manure-fork", manure_fork, "stable mucking"),
    ("ritual/blessing-chant", blessing_chant, "priestly blessing"),
    ("combat/javelin-throw", javelin_throw, "javelin thrown"),
    ("foley/saddlebag-drop", saddlebag_drop, "saddlebag dropped"),
    ("misc/spyglass-extend", spyglass_extend, "spyglass extended"),
    ("modern/thermal-imager", thermal_imager, "thermal imager"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX26:
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
    with open(os.path.join(OUT, "sfx26-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX26:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
