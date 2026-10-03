"""Procedural SFX batch 11 for the Bannerlord-clone (round 10).

Modern military, vehicles, naval, weapons, ambience, animals, foley.
All numpy DSP - no samples. Run: python3 sfx11.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx11")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx11-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(111111)


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


# ---------------------------------------------------------------- modern military
def tank_engine_loop(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # heavy diesel idle: low rumble + tread clatter
    rumble = np.sin(2 * np.pi * 45 * t) * 0.4 + np.sin(2 * np.pi * 90 * t) * 0.2
    rumble += lowpass(noise(n), 200) * 0.3
    clatter = highpass(lowpass(noise(n), 3000), 800) * 0.12
    clatter *= 0.5 + 0.5 * np.sin(2 * np.pi * 6.5 * t)
    return _seamless((rumble + clatter) * 0.7, fade_s=0.8) * 0.75


def drone_buzz(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # quadcopter: high whine + rotor chop
    whine = np.sin(2 * np.pi * 3200 * t) * 0.15
    chop = np.sin(2 * np.pi * 160 * t) * 0.3
    chop = np.sign(chop) * 0.1 + chop * 0.3
    doppler = 0.7 + 0.3 * np.sin(2 * np.pi * 0.25 * t)
    return _seamless((whine + chop) * doppler * 0.6, fade_s=0.6) * 0.7


def radar_beep():
    out = np.zeros(int(1.2 * SR))
    for i, off in enumerate((0.0, 0.6)):
        m = int(0.15 * SR)
        t = np.arange(m) / SR
        beep = np.sin(2 * np.pi * 1100 * t) * _env_decay(m, 40) * 0.4
        s = int(off * SR)
        out[s:s + m] += beep
    return out * 0.65


def missile_launch(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ignition crack + roaring ascent
    crack = highpass(noise(int(0.15 * SR)), 1000) * 0.6
    out = np.zeros(n)
    out[:len(crack)] += crack * _env_decay(len(crack), 50)
    roar = lowpass(noise(n), 900) * 0.6 * np.minimum(t / 0.4, 1.0)
    roar *= 1.0 - 0.6 * np.minimum(np.maximum(t - 1.2, 0) / 0.8, 1.0)
    whistle = np.sin(np.cumsum(2 * np.pi * (2000 - 800 * np.minimum(t / 2.0, 1.0)) / SR)) * 0.15 * np.minimum(t / 0.3, 1.0)
    return (out + roar + whistle) * 0.8


# ---------------------------------------------------------------- vehicles
def motorcycle_engine(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # v-twin rumble
    f = 60 + 20 * np.sin(2 * np.pi * 0.8 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.35
    x += np.sin(np.cumsum(2 * np.pi * f * 2 / SR)) * 0.15
    x = np.sign(x) * 0.12 + x * 0.4
    return _seamless(x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.75, fade_s=0.4) * 0.7


def train_horn():
    m = int(2.0 * SR)
    t = np.arange(m) / SR
    # freight train horn chord
    chord = 0
    for f in (311, 370, 466):
        chord += np.sin(2 * np.pi * f * t) * 0.2
    chord *= np.minimum(t / 0.2, 1.0) * np.exp(-np.maximum(t - 1.6, 0) * 4)
    return chord * 0.75


def freight_train_pass(dur=5.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rumble + rail clicks, doppler-ish envelope
    env = np.sin(np.pi * np.minimum(t / dur, 1.0))
    rumble = lowpass(noise(n), 400) * 0.4 * env
    clicks = np.zeros(n)
    for b in np.arange(0.2, dur - 0.3, 0.55):
        m = int(0.08 * SR)
        click = lowpass(noise(m), 2000) * _env_decay(m, 70) * 0.35
        s = int(b * SR)
        if s + m < n:
            clicks[s:s + m] += click
    return (rumble + clicks * env) * 0.75


# ---------------------------------------------------------------- naval / weapons
def foghorn():
    m = int(2.5 * SR)
    t = np.arange(m) / SR
    # deep foghorn blast
    x = np.sin(2 * np.pi * 92 * t) * 0.45 + np.sin(2 * np.pi * 138 * t) * 0.2
    x *= np.minimum(t / 0.3, 1.0) * np.exp(-np.maximum(t - 2.0, 0) * 4)
    return x * 0.8


def minigun_spin(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # barrels spinning up: rising whir
    f = 200 + 600 * np.minimum(t / 1.2, 1.0)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.25
    x += highpass(noise(n), 3000) * 0.15 * np.minimum(t / 1.2, 1.0)
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def mortar_whistle(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # incoming mortar: descending whistle + distant thump
    f = 1800 - 1200 * np.minimum(t / 1.2, 1.0)
    whistle = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3 * np.minimum(t / 0.2, 1.0)
    out = whistle * np.exp(-np.maximum(t - 1.2, 0) * 10)
    # distant impact
    im = int(0.3 * SR)
    thump = lowpass(noise(im), 300) * _env_decay(im, 25) * 0.5
    s = int(1.2 * SR)
    out[s:s + im] += thump
    return out * 0.7


# ---------------------------------------------------------------- ambience
def highway_bed(dur=4.0):
    n = int(dur * SR)
    # distant highway: filtered rumble + passing whooshes
    x = lowpass(noise(n), 500) * 0.3
    for b in _rng.uniform(0.5, dur - 1.0, 4):
        m = int(0.8 * SR)
        whoosh = lowpass(noise(m), 1200) * 0.25 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += whoosh
    return _seamless(x, fade_s=0.8) * 0.7


def rail_yard(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # distant clanks + air brake hiss
    out = lowpass(noise(n), 600) * 0.2
    for b in _rng.uniform(0.3, dur - 0.5, 8):
        m = int(0.15 * SR)
        clank = np.sin(2 * np.pi * _rng.uniform(500, 900) * np.arange(m) / SR) * _env_decay(m, 45) * _rng.uniform(0.15, 0.35)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clank
    # air brake hiss
    hm = int(0.6 * SR)
    hiss = highpass(noise(hm), 4000) * 0.2 * np.sin(np.pi * np.arange(hm) / hm)
    s = int(2.0 * SR)
    out[s:s + hm] += hiss
    return _seamless(out, fade_s=0.6) * 0.7


# ---------------------------------------------------------------- animals / foley
def moose_call(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # moose bellow: low guttural grunt
    f = 90 + 30 * np.sin(2 * np.pi * 1.2 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.35
    x = np.sign(x) * 0.15 + x * 0.4
    env = np.minimum(t / 0.3, 1.0) * np.exp(-np.maximum(t - dur + 0.6, 0) * 4)
    return x * env * 0.7


def raccoon_chitter(dur=0.9):
    n = int(dur * SR)
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.12):
        m = int(0.07 * SR)
        t = np.arange(m) / SR
        chit = np.sin(2 * np.pi * _rng.uniform(2200, 3200) * t) * _env_decay(m, 90) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.6


def ladder_climb(dur=1.6):
    n = int(dur * SR)
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.15, 0.35):
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        rung = lowpass(noise(m), 1200) * _env_decay(m, 55) * 0.4
        rung += np.sin(2 * np.pi * 420 * t) * _env_decay(m, 65) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += rung
    return out * 0.7


SFX11 = [
    ("modern/tank-engine-loop", tank_engine_loop, "tank engine idle loop"),
    ("modern/drone-buzz", drone_buzz, "surveillance drone buzz"),
    ("modern/radar-beep", radar_beep, "radar pings"),
    ("modern/missile-launch", missile_launch, "missile launch"),
    ("vehicle/motorcycle-engine", motorcycle_engine, "motorcycle engine"),
    ("vehicle/train-horn", train_horn, "freight train horn"),
    ("vehicle/freight-train-pass", freight_train_pass, "freight train passing"),
    ("naval/foghorn", foghorn, "ship foghorn"),
    ("weapon/minigun-spin", minigun_spin, "minigun spin-up"),
    ("weapon/mortar-whistle", mortar_whistle, "incoming mortar whistle"),
    ("ambience/highway-bed", highway_bed, "distant highway bed"),
    ("ambience/rail-yard", rail_yard, "rail yard ambience"),
    ("animal/moose-call", moose_call, "moose bellow"),
    ("animal/raccoon-chitter", raccoon_chitter, "raccoon chittering"),
    ("foley/ladder-climb", ladder_climb, "climbing ladder"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX11:
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
    with open(os.path.join(OUT, "sfx11-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX11:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
