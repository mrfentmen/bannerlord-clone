"""Procedural SFX batch 37 for the Bannerlord-clone (round 36).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx37.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx37")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx37-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(373737)


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
def lee_shore(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lee shore: waves breaking on rocks
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.8, 0.9):
        m = int(0.8 * SR)
        wave = lowpass(highpass(noise(m), 300), 1800) * 0.42 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wave
    return out * 0.68


def skunk_spray(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # skunk: warning hiss
    x = highpass(noise(n), 2800) * 0.26
    x *= np.minimum(t / 0.1, 1.0) * np.exp(-np.maximum(t - dur + 0.3, 0) * 6)
    return x * 0.6


# ---------------------------------------------------------------- weather / horror
def mistral_wind(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mistral: cold french wind
    x = highpass(lowpass(noise(n), 5200), 720) * 0.38
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.42 * t)
    return _seamless(x, fade_s=0.6) * 0.68


def ghoul_feast(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ghoul: feeding sounds
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.2, 0.28):
        m = int(0.18 * SR)
        tear = lowpass(highpass(noise(m), 500), 2800) * 0.3 * np.exp(-np.arange(m) / SR * 9)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += tear
    # growl bed
    f = 65 + 20 * np.sin(2 * np.pi * 0.8 * t)
    growl = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12
    out += growl
    return out * 0.66


# ---------------------------------------------------------------- tavern / farm
def ninepins(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ninepins: ball + pins
    out = np.zeros(n)
    # ball roll
    rm = int(0.55 * SR)
    roll = lowpass(noise(rm), 550) * 0.32 * np.sin(np.pi * np.arange(rm) / rm)
    out[:rm] += roll
    # pins scatter
    for b in _rng.uniform(0.6, 1.4, 8):
        m = int(0.13 * SR)
        pin = np.sin(2 * np.pi * 850 * np.arange(m) / SR) * _env_decay(m, 52) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pin
    return out * 0.68


def chick_chorus(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: soft chorus
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.07, 0.1):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 3100 + 700 * np.sin(2 * np.pi * 9 * mt)
        chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chirp
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def stope_timber():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # stope timber: props settling
    out = np.zeros(m)
    for b in np.arange(0.05, 0.65, 0.22):
        sm = int(0.2 * SR)
        creak = np.sin(2 * np.pi * 150 * np.arange(sm) / SR) * _env_decay(sm, 28) * 0.24
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += creak
    return out * 0.65


def welding_heat(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # forge welding: heat + hammer
    out = np.zeros(n)
    # heat roar
    hr = int(0.8 * SR)
    heat = lowpass(noise(hr), 900) * 0.35 * np.sin(np.pi * np.arange(hr) / hr)
    out[:hr] += heat
    # weld blows
    for i, b in enumerate(np.arange(0.9, dur - 0.25, 0.3)):
        m = int(0.2 * SR)
        mt = np.arange(m) / SR
        blow = np.sin(2 * np.pi * 1150 * mt) * _env_decay(m, 62) * 0.27
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += blow * (1.0 - i * 0.05)
    return out * 0.7


# ---------------------------------------------------------------- kitchen / stable
def frumenty_pot(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # frumenty: wheat porridge bubbling
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.18):
        m = int(0.12 * SR)
        bubble = lowpass(noise(m), 900) * _env_decay(m, 75) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bubble
    return out * 0.6


def grooming_kit():
    m = int(0.9 * SR)
    t = np.arange(m) / SR
    # grooming: brush strokes
    out = np.zeros(m)
    for b in np.arange(0.05, 0.8, 0.2):
        sm = int(0.16 * SR)
        brush = highpass(lowpass(noise(sm), 4000), 1200) * 0.24 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += brush
    return out * 0.6


# ---------------------------------------------------------------- ritual / combat
def procession(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # procession: chant + footsteps
    out = np.zeros(n)
    for f in (104, 130.8, 156.8):
        out += np.sin(2 * np.pi * f * t) * 0.08
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # footsteps
    for b in np.arange(0.1, dur - 0.15, 0.35):
        m = int(0.12 * SR)
        step = lowpass(highpass(noise(m), 400), 2000) * _env_decay(m, 65) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.68


def scorpion_loose(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # scorpion: bolt thrower
    out = np.zeros(n)
    # release
    rm = int(0.16 * SR)
    release = lowpass(noise(rm), 2200) * _env_decay(rm, 65) * 0.5
    out[:rm] += release
    # bolt
    fm = int(0.55 * SR)
    flight = highpass(lowpass(noise(fm), 6000), 2200) * 0.24 * np.exp(-np.arange(fm) / SR * 3.2)
    s = int(0.14 * SR)
    out[s:s + fm] += flight
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def sabot_clack(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: wooden shoes
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.16, 0.3):
        m = int(0.12 * SR)
        clack = lowpass(highpass(noise(m), 800), 3800) * _env_decay(m, 70) * 0.29
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clack
    return out * 0.62


def hourglass():
    m = int(1.0 * SR)
    t = np.arange(m) / SR
    # hourglass: sand trickling
    x = highpass(lowpass(noise(m), 6500), 3200) * 0.14
    x *= np.sin(np.pi * np.minimum(t / 1.0, 1.0))
    return x * 0.6


def lidar_sweep(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lidar: rotating sweep
    f = 900 + 1200 * np.sin(2 * np.pi * 0.6 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13
    return _seamless(x, fade_s=0.5) * 0.6


SFX37 = [
    ("naval/lee-shore", lee_shore, "lee shore breakers"),
    ("animal/skunk-spray", skunk_spray, "skunk warning"),
    ("weather/mistral-wind", mistral_wind, "mistral wind"),
    ("horror/ghoul-feast", ghoul_feast, "ghoul feeding"),
    ("tavern/ninepins", ninepins, "ninepins game"),
    ("farm/chick-chorus", chick_chorus, "chick chorus"),
    ("mine/stope-timber", stope_timber, "stope timber"),
    ("forge/welding-heat", welding_heat, "forge welding"),
    ("kitchen/frumenty-pot", frumenty_pot, "frumenty bubbling"),
    ("stable/grooming-kit", grooming_kit, "horse grooming"),
    ("ritual/procession", procession, "ritual procession"),
    ("combat/scorpion-loose", scorpion_loose, "scorpion fired"),
    ("foley/sabot-clack", sabot_clack, "sabots clacking"),
    ("misc/hourglass", hourglass, "hourglass sand"),
    ("modern/lidar-sweep", lidar_sweep, "lidar sweeping"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX37:
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
    with open(os.path.join(OUT, "sfx37-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX37:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
