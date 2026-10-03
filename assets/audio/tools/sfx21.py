"""Procedural SFX batch 21 for the Bannerlord-clone (round 20).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx21.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx21")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx21-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(212121)


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
def sail_reef(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sails being reefed: heavy canvas pulls + rope
    x = lowpass(noise(n), 1100) * 0.4
    x *= 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 1.5 * t))
    # rope strains
    for b in np.arange(0.2, dur - 0.2, 0.5):
        m = int(0.15 * SR)
        strain = np.sin(2 * np.pi * 160 * np.arange(m) / SR) * _env_decay(m, 45) * 0.25
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += strain
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def wolverine_growl(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wolverine: vicious snarling growl
    f = 120 + 40 * np.sin(2 * np.pi * 3 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.35
    x = np.sign(x) * 0.2 + x * 0.3
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 9 * t)
    env = np.minimum(t / 0.15, 1.0) * np.exp(-np.maximum(t - dur + 0.4, 0) * 4)
    return x * env * 0.7


# ---------------------------------------------------------------- weather / horror
def static_charge(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pre-storm static: crackling electric air
    x = highpass(noise(n), 5000) * 0.2
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.8 * t)
    # static pops
    for b in _rng.uniform(0.2, 1.8, 8):
        m = int(0.04 * SR)
        pop = highpass(noise(m), 4000) * _env_decay(m, 120) * 0.25
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += pop
    return _seamless(x, fade_s=0.4) * 0.65


def crypt_door_grind(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ancient stone door grinding open
    x = lowpass(noise(n), 500) * 0.45
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.9 * t)
    # stone-on-stone screech
    screech = np.sin(np.cumsum(2 * np.pi * (300 + 100 * np.sin(2 * np.pi * 1.1 * t)) / SR)) * 0.15
    return (x + screech) * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.75


# ---------------------------------------------------------------- tavern / farm
def shot_glass_clink():
    m = int(0.3 * SR)
    t = np.arange(m) / SR
    # two shot glasses clinking
    x = np.sin(2 * np.pi * 3200 * t) * _env_decay(m, 85) * 0.3
    x += np.sin(2 * np.pi * 4200 * t) * _env_decay(m, 105) * 0.15
    x += highpass(noise(m), 6000) * _env_decay(m, 115) * 0.1
    return x * 0.6


def corn_rustle(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wind through cornfield: deeper than wheat
    x = highpass(lowpass(noise(n), 4000), 1200) * 0.3
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.4 * t)
    return _seamless(x, fade_s=0.6) * 0.65


# ---------------------------------------------------------------- mine / forge
def timbers_settle(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mine timbers groaning under weight
    out = np.zeros(n)
    for b in _rng.uniform(0.2, 1.2, 5):
        m = int(0.4 * SR)
        bt = np.arange(m) / SR
        f = 70 + 30 * np.sin(2 * np.pi * 0.8 * bt)
        groan = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3 * np.sin(np.pi * bt / 0.4)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += groan
    return out * 0.7


def steel_pour(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # molten steel poured: roaring liquid metal
    x = lowpass(noise(n), 900) * 0.45 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    # metallic shimmer
    x += np.sin(2 * np.pi * 1800 * t) * 0.08 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.75


# ---------------------------------------------------------------- kitchen / stable
def bread_tear():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    # crusty bread torn: crackle + soft tear
    crackle = highpass(lowpass(noise(m), 6000), 2000) * 0.4 * _env_decay(m, 35)
    tear = lowpass(noise(m), 1200) * 0.3 * np.sin(np.pi * np.minimum(t / 0.35, 1.0))
    return (crackle + tear) * 0.65


def horseshoe_nail():
    out = np.zeros(int(0.9 * SR))
    # farrier nailing shoe: precise taps
    for i, off in enumerate((0.0, 0.22, 0.44, 0.66)):
        m = int(0.08 * SR)
        t = np.arange(m) / SR
        tap = np.sin(2 * np.pi * 2600 * t) * _env_decay(m, 90) * 0.35
        tap += np.sin(2 * np.pi * 1300 * t) * _env_decay(m, 100) * 0.2
        s = int(off * SR)
        out[s:s + m] += tap * (1.0 - i * 0.08)
    return out * 0.65


# ---------------------------------------------------------------- ritual / combat
def crowd_kneel(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # crowd kneeling: fabric + armor rustle wave
    x = lowpass(highpass(noise(n), 600), 3000) * 0.3
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.7


def arrow_snap():
    m = int(0.25 * SR)
    t = np.arange(m) / SR
    # arrow shaft snapped: sharp wood crack
    crack = highpass(noise(m), 2000) * _env_decay(m, 95) * 0.5
    crack += np.sin(2 * np.pi * 1800 * t) * _env_decay(m, 110) * 0.2
    return crack * 0.65


# ---------------------------------------------------------------- foley / misc
def cloak_swish():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # dramatic cloak turn: heavy fabric whoosh
    x = lowpass(noise(m), 1300) * 0.45 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return x * 0.7


def hourglass_sand(dur=2.0):
    n = int(dur * SR)
    # sand trickling: fine high hiss
    x = highpass(noise(n), 6000) * 0.12
    return _seamless(x, fade_s=0.6) * 0.6


def radar_sweep(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # radar sweep: rotating ping
    out = np.zeros(n)
    for b in np.arange(0.2, dur - 0.3, 1.0):
        m = int(0.12 * SR)
        ping = np.sin(2 * np.pi * 1100 * np.arange(m) / SR) * _env_decay(m, 50) * 0.35
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += ping
    # sweep hum
    out += np.sin(2 * np.pi * 60 * t) * 0.08
    return _seamless(out, fade_s=0.5) * 0.65


SFX21 = [
    ("naval/sail-reef", sail_reef, "sails reefed"),
    ("animal/wolverine-growl", wolverine_growl, "wolverine snarl"),
    ("weather/static-charge", static_charge, "pre-storm static"),
    ("horror/crypt-door-grind", crypt_door_grind, "crypt door grinding"),
    ("tavern/shot-glass-clink", shot_glass_clink, "shot glasses toast"),
    ("farm/corn-rustle", corn_rustle, "cornfield rustling"),
    ("mine/timbers-settle", timbers_settle, "mine timbers groaning"),
    ("forge/steel-pour", steel_pour, "molten steel poured"),
    ("kitchen/bread-tear", bread_tear, "bread torn"),
    ("stable/horseshoe-nail", horseshoe_nail, "horseshoe nailed"),
    ("ritual/crowd-kneel", crowd_kneel, "crowd kneeling"),
    ("combat/arrow-snap", arrow_snap, "arrow shaft snapped"),
    ("foley/cloak-swish", cloak_swish, "cloak swish"),
    ("misc/hourglass-sand", hourglass_sand, "hourglass sand"),
    ("modern/radar-sweep", radar_sweep, "radar sweeping"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX21:
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
    with open(os.path.join(OUT, "sfx21-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX21:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
