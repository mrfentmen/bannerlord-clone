"""Procedural SFX batch 9 for the Bannerlord-clone (round 8).

Caves, siege extras, weather extras, misc.
All numpy DSP - no samples. Run: python3 sfx9.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx9")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx9-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(90909)


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


# ---------------------------------------------------------------- caves
def cave_drip_loop(dur=6.0):
    n = int(dur * SR)
    out = np.zeros(n)
    for b in _rng.uniform(0.3, dur - 0.5, 12):
        m = int(0.25 * SR)
        t = np.arange(m) / SR
        # drip: high ping + reverb tail
        drip = np.sin(2 * np.pi * (2800 - 1200 * t) * t) * _env_decay(m, 45) * 0.4
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += drip
    return _seamless(out, fade_s=0.5) * 0.7


def echo_step(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    # boot step in stone corridor: thud + 3 echoes
    for i, (off, v) in enumerate(((0.0, 1.0), (0.28, 0.5), (0.56, 0.28), (0.84, 0.15))):
        m = int(0.15 * SR)
        thud = lowpass(noise(m), 900) * _env_decay(m, 60) * 0.5 * v
        s = int(off * SR)
        if s + m < n:
            out[s:s + m] += thud
    return out * 0.75


def bat_flutter(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wing flutter + occasional squeak
    x = highpass(lowpass(noise(n), 4000), 1800) * 0.35
    x *= 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 9 * t))
    squeak = np.sin(2 * np.pi * 5200 * t) * 0.08 * (t > 0.5)
    return (x + squeak) * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


# ---------------------------------------------------------------- siege extras
def boulder_rolling(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # massive boulder grinding along
    x = lowpass(noise(n), 450) * 0.55
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 1.6 * t)
    # final crash
    cm = int(0.7 * SR)
    crash = lowpass(noise(cm), 800) * _env_decay(cm, 12) * 0.8
    out = x * np.minimum(t / 1.6, 1.0) * np.exp(-np.maximum(t - 1.8, 0) * 4)
    s = int(1.8 * SR)
    out[s:s + cm] += crash
    return out * 0.8


def ram_crew_chant(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    # low rhythmic crew grunts "heave"
    for start in np.arange(0, dur, 1.0):
        m = int(0.4 * SR)
        bt = np.arange(m) / SR
        f = 110 + 30 * bt
        chant = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
        chant *= 0.5 + 0.5 * np.sin(2 * np.pi * 2 * bt)
        chant = np.sign(chant) * 0.12 + chant * 0.4
        s = int(start * SR)
        if s + m < n:
            out[s:s + m] += chant
    return _seamless(out, fade_s=0.4) * 0.7


def breach_dust(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wall breach: explosion of stone + settling dust
    blast = lowpass(noise(n), 1200) * _env_decay(n, 6) * 0.8
    settling = lowpass(noise(n), 300) * 0.3 * np.exp(-t * 2)
    # falling rocks
    for b in _rng.uniform(0.5, 1.8, 10):
        m = int(0.15 * SR)
        rock = lowpass(noise(m), 2000) * _env_decay(m, 35) * _rng.uniform(0.15, 0.4)
        s = int(b * SR)
        if s + m < n:
            blast[s:s + m] += rock
    return (blast + settling) * 0.75


# ---------------------------------------------------------------- weather extras
def hail(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = lowpass(noise(n), 2000) * 0.25
    # hailstone impacts
    for b in _rng.uniform(0, dur - 0.05, 60):
        m = int(0.04 * SR)
        hit = np.sin(2 * np.pi * _rng.uniform(2500, 5000) * np.arange(m) / SR) * _env_decay(m, 130) * _rng.uniform(0.1, 0.3)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += hit
    return _seamless(out, fade_s=0.5) * 0.7


def sandstorm(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = lowpass(noise(n), 600) * 0.5
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.4 * t) + 0.15 * np.sin(2 * np.pi * 1.7 * t)
    return _seamless(x, fade_s=0.8) * 0.75


def icicle_break(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # snap + shatter
    snap = highpass(noise(int(0.05 * SR)), 5000) * 0.5
    out = np.zeros(n)
    out[:len(snap)] += snap
    for b in _rng.uniform(0.1, 0.6, 12):
        m = int(0.06 * SR)
        shard = np.sin(2 * np.pi * _rng.uniform(3000, 7000) * np.arange(m) / SR) * _env_decay(m, 95) * _rng.uniform(0.1, 0.25)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += shard
    return out * 0.7


# ---------------------------------------------------------------- misc
def gavel():
    out = np.zeros(int(0.8 * SR))
    for i, off in enumerate((0.0, 0.4)):
        m = int(0.15 * SR)
        t = np.arange(m) / SR
        hit = lowpass(noise(m), 2500) * _env_decay(m, 55) * 0.6
        hit += np.sin(2 * np.pi * 850 * t) * _env_decay(m, 65) * 0.3
        s = int(off * SR)
        out[s:s + m] += hit * (1.0 - i * 0.2)
    return out * 0.75


def drum_roll(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # snare roll building to crash
    x = highpass(lowpass(noise(n), 4000), 1500) * 0.4
    x *= 0.4 + 0.6 * np.minimum(t / 1.6, 1.0)
    # final crash
    cm = int(0.4 * SR)
    crash = highpass(noise(cm), 2000) * _env_decay(cm, 18) * 0.6
    out = x
    s = int(1.6 * SR)
    out[s:s + cm] += crash
    return out * 0.75


def quarry_blast():
    m = int(1.2 * SR)
    t = np.arange(m) / SR
    # dynamite: sharp crack + deep rumble + rock rain
    crack = highpass(noise(int(0.1 * SR)), 1500) * 0.7
    out = np.zeros(m)
    out[:len(crack)] += crack * _env_decay(len(crack), 90)
    rumble = lowpass(noise(m), 250) * _env_decay(m, 5) * 0.8
    out += rumble
    for b in _rng.uniform(0.3, 1.0, 10):
        pm = int(0.1 * SR)
        rock = lowpass(noise(pm), 1800) * _env_decay(pm, 45) * _rng.uniform(0.1, 0.3)
        s = int(b * SR)
        if s + pm < m:
            out[s:s + pm] += rock
    return out * 0.8


def drawbridge_chains(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # heavy chains rattling + wood creaking
    chain = highpass(lowpass(noise(n), 5000), 1200) * 0.3
    chain *= 0.5 + 0.5 * np.sin(2 * np.pi * 4 * t)
    creak = np.sin(np.cumsum(2 * np.pi * (60 + 40 * np.sin(2 * np.pi * 0.6 * t)) / SR)) * 0.15
    x = (chain + creak) * np.minimum(t / 2.0, 1.0) * np.exp(-np.maximum(t - 2.0, 0) * 5)
    # final wooden slam
    sm = int(0.3 * SR)
    slam = lowpass(noise(sm), 700) * _env_decay(sm, 20) * 0.7
    out = x
    s = int(2.0 * SR)
    out[s:s + sm] += slam
    return out * 0.75


def rope_bridge_creak(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # swaying rope bridge creaks + plank knocks
    creak = np.sin(np.cumsum(2 * np.pi * (90 + 50 * np.sin(2 * np.pi * 0.9 * t)) / SR)) * 0.2
    creak += np.sin(np.cumsum(2 * np.pi * (140 + 60 * np.sin(2 * np.pi * 1.3 * t)) / SR)) * 0.12
    out = creak * np.sin(np.pi * np.minimum(t / dur, 1.0))
    for b in _rng.uniform(0.2, dur - 0.2, 5):
        m = int(0.08 * SR)
        knock = lowpass(noise(m), 1500) * _env_decay(m, 60) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += knock
    return out * 0.7


SFX9 = [
    ("cave/cave-drip-loop", cave_drip_loop, "cave drips loop"),
    ("cave/echo-step", echo_step, "stone corridor footsteps"),
    ("cave/bat-flutter", bat_flutter, "bat wings flutter"),
    ("siege/boulder-rolling", boulder_rolling, "rolling boulder + crash"),
    ("siege/ram-crew-chant", ram_crew_chant, "battering ram crew chant"),
    ("siege/breach-dust", breach_dust, "wall breach + settling dust"),
    ("weather/hail", hail, "hailstorm"),
    ("weather/sandstorm", sandstorm, "sandstorm loop"),
    ("weather/icicle-break", icicle_break, "icicle snap + shatter"),
    ("misc/gavel", gavel, "gavel strike"),
    ("misc/drum-roll", drum_roll, "drum roll + crash"),
    ("misc/quarry-blast", quarry_blast, "quarry dynamite blast"),
    ("misc/drawbridge-chains", drawbridge_chains, "drawbridge lowering"),
    ("misc/rope-bridge-creak", rope_bridge_creak, "rope bridge sway"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX9:
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
    with open(os.path.join(OUT, "sfx9-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX9:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
