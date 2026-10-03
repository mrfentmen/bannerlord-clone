"""Procedural SFX batch 31 for the Bannerlord-clone (round 30).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx31.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx31")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx31-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(313131)


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
def dead_reckoning(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # navigation: dividers + chart
    out = np.zeros(n)
    for i, off in enumerate((0.05, 0.35, 0.65)):
        cm = int(0.12 * SR)
        step = highpass(noise(cm), 4000) * _env_decay(cm, 90) * 0.2
        s = int(off * SR)
        out[s:s + cm] += step
    # chart rustle
    rustle = highpass(lowpass(noise(n), 5000), 1500) * 0.12 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += rustle
    return out * 0.6


def lemming_squeak(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lemming: frantic squeaks
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.06):
        m = int(0.04 * SR)
        mt = np.arange(m) / SR
        f = 5500 + 1200 * np.sin(2 * np.pi * 11 * mt)
        squeak = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16 * np.sin(np.pi * mt / 0.04)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += squeak
    return out * 0.55


# ---------------------------------------------------------------- weather / horror
def williwaw(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # williwaw: violent katabatic gust
    env = np.minimum(t / 0.3, 1.0) * np.exp(-np.maximum(t - 2.0, 0) * 2.8)
    x = highpass(lowpass(noise(n), 6000), 900) * 0.5 * env
    return x * 0.75


def ghoul_snarl(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ghoul: hungry snarling
    f = 150 + 60 * np.sin(2 * np.pi * 4 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    x = np.sign(x) * 0.15 + x * 0.25
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 8 * t)
    env = np.minimum(t / 0.15, 1.0) * np.exp(-np.maximum(t - dur + 0.5, 0) * 3)
    return x * env * 0.7


# ---------------------------------------------------------------- tavern / farm
def bar_back(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # behind the bar: bottles + glasses
    out = np.zeros(n)
    for b in _rng.uniform(0.05, 1.1, 10):
        m = int(_rng.uniform(0.05, 0.1) * SR)
        clink = np.sin(2 * np.pi * _rng.uniform(2200, 3000) * np.arange(m) / SR) * _env_decay(m, _rng.uniform(80, 100)) * _rng.uniform(0.12, 0.22)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clink
    return out * 0.6


def gosling_peep(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: soft peeping
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.14):
        m = int(0.09 * SR)
        mt = np.arange(m) / SR
        f = 2800 + 600 * np.sin(2 * np.pi * 7 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.18 * np.sin(np.pi * mt / 0.09)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def mine_stope(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stope: echoing chamber work
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.5, 0.7):
        m = int(0.6 * SR)
        work = lowpass(noise(m), 800) * 0.35 * np.sin(np.pi * np.arange(m) / m)
        # echo
        echo = np.roll(work, int(0.15 * SR)) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work + echo[:m]
    return out * 0.7


def decarburize(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # decarburizing: controlled burn-off
    x = lowpass(noise(n), 900) * 0.35 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    # scale pops
    for b in _rng.uniform(0.2, 1.3, 8):
        m = int(0.06 * SR)
        pop = np.sin(2 * np.pi * _rng.uniform(2000, 2800) * np.arange(m) / SR) * _env_decay(m, 100) * 0.15
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += pop
    return x * 0.65


# ---------------------------------------------------------------- kitchen / stable
def sourdough(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sourdough kneaded: sticky dough
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.35):
        m = int(0.28 * SR)
        knead = lowpass(noise(m), 700) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += knead
    return out * 0.65


def broodmare_nicker(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # broodmare: gentle maternal nicker
    f = 400 + 120 * np.sin(2 * np.pi * 6 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.28
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 8 * t)
    env = np.minimum(t / 0.08, 1.0) * np.exp(-np.maximum(t - dur + 0.3, 0) * 5)
    return x * env * 0.65


# ---------------------------------------------------------------- ritual / combat
def flagellant(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # procession: chains + chant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.6):
        m = int(0.5 * SR)
        chains = highpass(lowpass(noise(m), 4000), 1500) * 0.25 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chains
    # low chant
    chant = np.sin(2 * np.pi * 98 * t) * 0.1 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += chant
    return out * 0.7


def scorpion_release(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # scorpion bolt: snap + whizz
    out = np.zeros(n)
    # release snap
    sm = int(0.12 * SR)
    snap = highpass(noise(sm), 2500) * _env_decay(sm, 85) * 0.45
    out[:sm] += snap
    # bolt whizz
    wm = int(0.6 * SR)
    whizz = highpass(lowpass(noise(wm), 6000), 2000) * 0.3 * np.exp(-np.arange(wm) / SR * 3)
    s = int(0.1 * SR)
    out[s:s + wm] += whizz
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def spats_step(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # spats: crisp steps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.25):
        m = int(0.1 * SR)
        step = highpass(lowpass(noise(m), 3500), 1200) * _env_decay(m, 75) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.6


def nocturnal():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nocturnal dial: fine brass rotation
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.32)):
        sm = int(0.2 * SR)
        rot = highpass(lowpass(noise(sm), 4000), 1500) * 0.18 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(off * SR)
        out[s:s + sm] += rot
    return out * 0.55


def loiter_drone(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # loitering drone: circling buzz
    x = np.sin(2 * np.pi * 2000 * t) * 0.1
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.5 * t)  # doppler-ish
    return _seamless(x, fade_s=0.5) * 0.6


SFX31 = [
    ("naval/dead-reckoning", dead_reckoning, "dead reckoning"),
    ("animal/lemming-squeak", lemming_squeak, "lemming squeaking"),
    ("weather/williwaw", williwaw, "williwaw gust"),
    ("horror/ghoul-snarl", ghoul_snarl, "ghoul snarling"),
    ("tavern/bar-back", bar_back, "behind the bar"),
    ("farm/gosling-peep", gosling_peep, "goslings peeping"),
    ("mine/mine-stope", mine_stope, "stope working"),
    ("forge/decarburize", decarburize, "decarburizing"),
    ("kitchen/sourdough", sourdough, "sourdough kneaded"),
    ("stable/broodmare-nicker", broodmare_nicker, "broodmare nickering"),
    ("ritual/flagellant", flagellant, "penitent procession"),
    ("combat/scorpion-release", scorpion_release, "scorpion fired"),
    ("foley/spats-step", spats_step, "spats stepping"),
    ("misc/nocturnal", nocturnal, "nocturnal dial"),
    ("modern/loiter-drone", loiter_drone, "drone loitering"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX31:
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
    with open(os.path.join(OUT, "sfx31-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX31:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
