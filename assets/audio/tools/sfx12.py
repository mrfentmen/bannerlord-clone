"""Procedural SFX batch 12 for the Bannerlord-clone (round 11).

Naval extras, animals, weather, prison, modern, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx12.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx12")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx12-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(121212)


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


# ---------------------------------------------------------------- naval extras
def rowing_oars(dur=3.0):
    n = int(dur * SR)
    out = np.zeros(n)
    # rhythmic oar strokes: dip + pull + lift
    for start in np.arange(0, dur, 1.5):
        m = int(1.2 * SR)
        t = np.arange(m) / SR
        dip = highpass(lowpass(noise(int(0.2 * SR)), 4000), 1000) * 0.3
        stroke = np.zeros(m)
        stroke[:len(dip)] += dip * _env_decay(len(dip), 30)
        # water pull
        pm = int(0.5 * SR)
        pull = lowpass(noise(pm), 900) * 0.25 * np.sin(np.pi * np.arange(pm) / pm)
        s2 = int(0.25 * SR)
        stroke[s2:s2 + pm] += pull
        s = int(start * SR)
        if s + m < n:
            out[s:s + m] += stroke
    return _seamless(out, fade_s=0.4) * 0.7


def ship_bell():
    out = np.zeros(int(1.5 * SR))
    for i, off in enumerate((0.0, 0.75)):
        m = int(0.5 * SR)
        t = np.arange(m) / SR
        x = np.sin(2 * np.pi * 880 * t) * _env_decay(m, 28) * 0.45
        x += np.sin(2 * np.pi * 1320 * t) * _env_decay(m, 38) * 0.2
        s = int(off * SR)
        out[s:s + m] += x * (1.0 - i * 0.15)
    return out * 0.7


def whale_call(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # humpback-like moan: sweeping low tone
    f = 180 + 120 * np.sin(2 * np.pi * 0.3 * t) + 60 * np.sin(2 * np.pi * 0.9 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.35
    x += np.sin(np.cumsum(2 * np.pi * f * 1.5 / SR)) * 0.1
    env = np.minimum(t / 0.8, 1.0) * np.exp(-np.maximum(t - dur + 1.0, 0) * 2.5)
    return x * env * 0.65


# ---------------------------------------------------------------- animals
def seagull_cry(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for b in (0.1, 0.6, 1.0):
        m = int(0.35 * SR)
        bt = np.arange(m) / SR
        f = 1400 - 600 * (bt / 0.35)
        cry = np.sin(np.cumsum(2 * np.pi * f / SR)) * _env_decay(m, 22) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cry
    return out * 0.65


def goose_honk():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # goose honk: nasal low burst
    f = 400 + 100 * np.sin(2 * np.pi * 8 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.35
    x = np.sign(x) * 0.15 + x * 0.4
    env = np.minimum(t / 0.05, 1.0) * _env_decay(m, 12)
    return x * env * 0.7


# ---------------------------------------------------------------- weather
def blizzard(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # howling blizzard: wind + ice particles
    x = lowpass(noise(n), 900) * 0.5
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.25 * t) + 0.2 * np.sin(2 * np.pi * 1.1 * t)
    # ice hiss
    x += highpass(noise(n), 6000) * 0.08
    return _seamless(x, fade_s=0.8) * 0.75


def drizzle(dur=3.0):
    n = int(dur * SR)
    # light drizzle: sparse high ticks
    out = lowpass(noise(n), 1500) * 0.12
    for b in _rng.uniform(0, dur - 0.05, 40):
        m = int(0.03 * SR)
        tick = np.sin(2 * np.pi * _rng.uniform(3000, 6000) * np.arange(m) / SR) * _env_decay(m, 150) * _rng.uniform(0.08, 0.2)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += tick
    return _seamless(out, fade_s=0.5) * 0.65


# ---------------------------------------------------------------- prison / modern
def prison_door_creak(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rusty iron door creak
    f = 120 + 80 * np.sin(2 * np.pi * 0.7 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.4 + 0.4 * np.sin(2 * np.pi * 3 * t)) * 0.4
    x += lowpass(noise(n), 600) * 0.15
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def apc_door_slam():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # armored vehicle door: heavy metal slam
    slam = lowpass(noise(m), 1500) * _env_decay(m, 45) * 0.7
    ring = np.sin(2 * np.pi * 340 * t) * _env_decay(m, 55) * 0.3
    return (slam + ring) * 0.75


def satellite_uplink():
    out = np.zeros(int(1.4 * SR))
    # data burst: rapid digital chirps
    for i, off in enumerate(np.arange(0.1, 1.2, 0.14)):
        m = int(0.08 * SR)
        t = np.arange(m) / SR
        f = _rng.uniform(1800, 3200)
        chirp = np.sin(2 * np.pi * f * t) * _env_decay(m, 80) * 0.3
        s = int(off * SR)
        out[s:s + m] += chirp
    return out * 0.6


# ---------------------------------------------------------------- combat / foley / misc
def banner_plant():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # banner pole slammed into ground + fabric snap
    thud = lowpass(noise(int(0.1 * SR)), 800) * 0.6
    out = np.zeros(m)
    out[:len(thud)] += thud * _env_decay(len(thud), 50)
    # fabric unfurl snap
    sm = int(0.25 * SR)
    snap = highpass(lowpass(noise(sm), 5000), 1500) * 0.4 * np.sin(np.pi * np.arange(sm) / sm)
    s = int(0.15 * SR)
    out[s:s + sm] += snap
    return out * 0.7


def chest_open():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # wooden chest: latch click + lid creak open
    latch = highpass(noise(int(0.06 * SR)), 3000) * 0.4
    out = np.zeros(m)
    out[:len(latch)] += latch * _env_decay(len(latch), 90)
    # lid creak
    cm = int(0.4 * SR)
    ct = np.arange(cm) / SR
    creak = np.sin(np.cumsum(2 * np.pi * (150 + 100 * ct) / SR)) * 0.3 * np.sin(np.pi * ct / 0.4)
    s = int(0.15 * SR)
    out[s:s + cm] += creak
    return out * 0.7


def quiver_rustle(dur=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # arrows shifting in quiver
    x = highpass(lowpass(noise(n), 6000), 2000) * 0.3
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 4 * t)
    # wooden shaft knocks
    for b in _rng.uniform(0.1, 0.6, 4):
        m = int(0.04 * SR)
        knock = np.sin(2 * np.pi * _rng.uniform(800, 1200) * np.arange(m) / SR) * _env_decay(m, 100) * 0.2
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += knock
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


def clock_chime():
    out = np.zeros(int(3.0 * SR))
    # town clock: deep bell tolls
    for i, off in enumerate((0.0, 1.0, 2.0)):
        m = int(0.8 * SR)
        t = np.arange(m) / SR
        x = np.sin(2 * np.pi * 220 * t) * _env_decay(m, 12) * 0.5
        x += np.sin(2 * np.pi * 330 * t) * _env_decay(m, 18) * 0.25
        s = int(off * SR)
        if s + m < len(out):
            out[s:s + m] += x * (1.0 - i * 0.1)
    return out * 0.7


def well_bucket(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    # rope lowering + bucket splash + haul up
    creak = np.sin(np.cumsum(2 * np.pi * (100 + 30 * np.sin(2 * np.pi * 2 * t)) / SR)) * 0.15
    out += creak * np.minimum(t / 0.8, 1.0) * np.exp(-np.maximum(t - 1.2, 0) * 3)
    # splash
    sm = int(0.4 * SR)
    splash = highpass(lowpass(noise(sm), 5000), 1200) * 0.4 * _env_decay(sm, 18)
    s = int(0.8 * SR)
    out[s:s + sm] += splash
    return out * 0.7


SFX12 = [
    ("naval/rowing-oars", rowing_oars, "rowing oar strokes loop"),
    ("naval/ship-bell", ship_bell, "ship's bell"),
    ("naval/whale-call", whale_call, "whale call"),
    ("animal/seagull-cry", seagull_cry, "seagull cries"),
    ("animal/goose-honk", goose_honk, "goose honk"),
    ("weather/blizzard", blizzard, "blizzard howl"),
    ("weather/drizzle", drizzle, "light drizzle"),
    ("prison/prison-door-creak", prison_door_creak, "rusty prison door"),
    ("modern/apc-door-slam", apc_door_slam, "armored vehicle door slam"),
    ("modern/satellite-uplink", satellite_uplink, "satellite uplink chirps"),
    ("combat/banner-plant", banner_plant, "banner planted"),
    ("foley/chest-open", chest_open, "chest opening"),
    ("foley/quiver-rustle", quiver_rustle, "arrows in quiver"),
    ("misc/clock-chime", clock_chime, "town clock chimes"),
    ("misc/well-bucket", well_bucket, "well bucket"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX12:
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
    with open(os.path.join(OUT, "sfx12-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX12:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
