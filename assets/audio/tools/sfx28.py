"""Procedural SFX batch 28 for the Bannerlord-clone (round 27).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx28.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx28")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx28-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(282828)


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
def deck_lantern(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # deck lantern: glass + flame
    out = np.zeros(n)
    # glass clink
    m = int(0.15 * SR)
    clink = np.sin(2 * np.pi * 2800 * np.arange(m) / SR) * _env_decay(m, 85) * 0.2
    out[:m] += clink
    # flame hiss
    hiss = highpass(noise(n), 5000) * 0.08
    out += hiss
    return _seamless(out, fade_s=0.3) * 0.6


def shrew_squeak(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # shrew: rapid tiny squeaks
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.08):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 5000 + 1000 * np.sin(2 * np.pi * 10 * mt)
        squeak = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.18 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += squeak
    return out * 0.55


# ---------------------------------------------------------------- weather / horror
def graupel(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # graupel: soft pellet precipitation
    x = highpass(lowpass(noise(n), 5000), 2000) * 0.2
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.6 * t)
    return _seamless(x, fade_s=0.5) * 0.6


def vampire_hiss(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # vampire hiss: menacing sibilant
    x = highpass(noise(n), 4000) * 0.3
    x *= np.minimum(t / 0.2, 1.0) * np.exp(-np.maximum(t - dur + 0.4, 0) * 4)
    # low growl under
    growl = np.sin(2 * np.pi * 80 * t) * 0.12 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return (x + growl) * 0.65


# ---------------------------------------------------------------- tavern / farm
def bar_rag():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # bar wiped down: wet cloth
    x = lowpass(highpass(noise(m), 600), 2500) * 0.3 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return x * 0.6


def lamb_bleat(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lamb: soft high bleat
    f = 800 + 250 * np.sin(2 * np.pi * 8 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.28
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 10 * t)
    env = np.minimum(t / 0.08, 1.0) * np.exp(-np.maximum(t - dur + 0.3, 0) * 5)
    return x * env * 0.6


# ---------------------------------------------------------------- mine / forge
def mine_vent(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ventilation shaft: deep air movement
    x = lowpass(noise(n), 400) * 0.35
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.4 * t)
    return _seamless(x, fade_s=0.6) * 0.65


def pattern_weld(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattern welding: rhythmic folding hammer
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.3, 0.3)):
        m = int(0.2 * SR)
        mt = np.arange(m) / SR
        fold = np.sin(2 * np.pi * 1200 * mt) * _env_decay(m, 55) * 0.3
        fold += lowpass(noise(m), 1500) * _env_decay(m, 65) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += fold * (1.0 - i * 0.05)
    return out * 0.7


# ---------------------------------------------------------------- kitchen / stable
def smokehouse(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # smokehouse: low smolder + drips
    smolder = lowpass(noise(n), 500) * 0.3 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    out = smolder
    for b in _rng.uniform(0.3, 2.3, 8):
        m = int(0.08 * SR)
        drip = lowpass(noise(m), 1000) * _env_decay(m, 70) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += drip
    return out * 0.65


def tethering():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # horse tethered: rope + post
    out = np.zeros(m)
    # rope around post
    rm = int(0.25 * SR)
    rope = lowpass(noise(rm), 900) * 0.3 * np.sin(np.pi * np.arange(rm) / rm)
    out[:rm] += rope
    # post thump
    pm = int(0.12 * SR)
    thump = lowpass(noise(pm), 800) * _env_decay(pm, 60) * 0.35
    s = int(0.3 * SR)
    out[s:s + pm] += thump
    return out * 0.65


# ---------------------------------------------------------------- ritual / combat
def relic_unveil(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sacred relic unveiled: cloth + choir swell
    cloth = highpass(lowpass(noise(n), 4000), 1200) * 0.2 * np.sin(np.pi * np.minimum(t / 0.8, 1.0))
    # choir
    choir = np.zeros(n)
    for f in (261.6, 329.6, 392.0):
        choir += np.sin(2 * np.pi * f * t) * 0.08
    choir *= np.minimum(np.maximum(t - 0.5, 0) / 0.5, 1.0) * np.exp(-np.maximum(t - dur + 0.5, 0) * 2)
    return (cloth + choir) * 0.7


def siege_ladder(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # siege ladder raised: wood + ropes
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.4):
        m = int(0.35 * SR)
        raise_sfx = lowpass(noise(m), 1100) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += raise_sfx
    # final thud against wall
    fm = int(0.2 * SR)
    thud = lowpass(noise(fm), 900) * _env_decay(fm, 50) * 0.5
    s = int(1.2 * SR)
    out[s:s + fm] += thud
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def wax_drip():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # candle wax dripping: soft plops
    out = np.zeros(m)
    for b in _rng.uniform(0.05, 0.35, 5):
        dm = int(0.06 * SR)
        plop = lowpass(noise(dm), 900) * _env_decay(dm, 80) * 0.2
        s = int(b * SR)
        if s + dm < m:
            out[s:s + dm] += plop
    return out * 0.55


def lodestone():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # lodestone: magnetic hum
    x = np.sin(2 * np.pi * 180 * t) * 0.15
    x += np.sin(2 * np.pi * 360 * t) * 0.08
    return _seamless(x, fade_s=0.3) * 0.6


def ew_jammer(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # electronic warfare: sweeping interference
    f = 800 + 1200 * np.sin(2 * np.pi * 0.5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.18
    return _seamless(x, fade_s=0.4) * 0.6


SFX28 = [
    ("naval/deck-lantern", deck_lantern, "deck lantern lit"),
    ("animal/shrew-squeak", shrew_squeak, "shrew squeaking"),
    ("weather/graupel", graupel, "graupel falling"),
    ("horror/vampire-hiss", vampire_hiss, "vampire hissing"),
    ("tavern/bar-rag", bar_rag, "bar wiped down"),
    ("farm/lamb-bleat", lamb_bleat, "lamb bleating"),
    ("mine/mine-vent", mine_vent, "ventilation shaft"),
    ("forge/pattern-weld", pattern_weld, "pattern welding"),
    ("kitchen/smokehouse", smokehouse, "smokehouse smoldering"),
    ("stable/tethering", tethering, "horse tethered"),
    ("ritual/relic-unveil", relic_unveil, "relic unveiled"),
    ("combat/siege-ladder", siege_ladder, "siege ladder raised"),
    ("foley/wax-drip", wax_drip, "wax dripping"),
    ("misc/lodestone", lodestone, "lodestone hum"),
    ("modern/ew-jammer", ew_jammer, "EW jammer"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX28:
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
    with open(os.path.join(OUT, "sfx28-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX28:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
