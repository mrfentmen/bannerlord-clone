"""Procedural SFX batch 30 for the Bannerlord-clone (round 29).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx30.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx30")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx30-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(303030)


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
def binnacle(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ship's compass binnacle: brass + glass
    out = np.zeros(n)
    m = int(0.2 * SR)
    brass = np.sin(2 * np.pi * 1600 * np.arange(m) / SR) * _env_decay(m, 80) * 0.2
    out[:m] += brass
    glass = np.sin(2 * np.pi * 3200 * np.arange(m) / SR) * _env_decay(m, 100) * 0.12
    out[:m] += glass
    return out * 0.6


def muskrat_splash(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # muskrat diving: plop + ripples
    out = np.zeros(n)
    pm = int(0.15 * SR)
    plop = lowpass(noise(pm), 1500) * _env_decay(pm, 70) * 0.4
    out[:pm] += plop
    ripples = highpass(lowpass(noise(n), 3000), 1000) * 0.15 * np.exp(-t * 3)
    out += ripples
    return out * 0.65


# ---------------------------------------------------------------- weather / horror
def diamond_dust(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # diamond dust: sparkling ice crystals
    x = highpass(noise(n), 9000) * 0.06
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.4 * t)
    return _seamless(x, fade_s=0.6) * 0.55


def doppelganger(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # doppelganger: doubled voice effect
    f = 220 + 80 * np.sin(2 * np.pi * 0.6 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.2
    x += np.sin(np.cumsum(2 * np.pi * f * 1.02 / SR)) * 0.2  # detuned double
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.65


# ---------------------------------------------------------------- tavern / farm
def pewter_mug():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    # pewter mug: dull metallic
    x = np.sin(2 * np.pi * 900 * t) * _env_decay(m, 75) * 0.25
    x += np.sin(2 * np.pi * 450 * t) * _env_decay(m, 85) * 0.15
    x += lowpass(noise(m), 1200) * _env_decay(m, 95) * 0.15
    return x * 0.6


def duckling_peep(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ducklings: rapid peeping
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.12):
        m = int(0.08 * SR)
        mt = np.arange(m) / SR
        f = 3000 + 800 * np.sin(2 * np.pi * 8 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.2 * np.sin(np.pi * mt / 0.08)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.6


# ---------------------------------------------------------------- mine / forge
def rock_burst(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rock burst: sudden fracture
    out = np.zeros(n)
    # crack
    cm = int(0.2 * SR)
    crack = highpass(noise(cm), 1500) * _env_decay(cm, 55) * 0.5
    out[:cm] += crack
    # falling debris
    for b in _rng.uniform(0.2, 1.3, 10):
        m = int(_rng.uniform(0.08, 0.15) * SR)
        debris = lowpass(noise(m), 1800) * _env_decay(m, _rng.uniform(45, 65)) * _rng.uniform(0.2, 0.35)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += debris
    return out * 0.75


def weld_flux(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # welding flux: sizzling + pops
    out = highpass(noise(n), 3000) * 0.25 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    for b in _rng.uniform(0.1, 1.1, 8):
        m = int(0.05 * SR)
        pop = highpass(noise(m), 5000) * _env_decay(m, 120) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pop
    return out * 0.65


# ---------------------------------------------------------------- kitchen / stable
def jam_bubble(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # jam bubbling: thick sweet bubbles
    out = np.zeros(n)
    for b in _rng.uniform(0.05, 1.4, 18):
        m = int(_rng.uniform(0.06, 0.12) * SR)
        bubble = lowpass(noise(m), 700) * _env_decay(m, _rng.uniform(50, 70)) * _rng.uniform(0.15, 0.3)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bubble
    return out * 0.65


def yearling_whinny(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # yearling: eager high whinny
    f = 900 + 400 * np.sin(2 * np.pi * 5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.28
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 8 * t)
    env = np.minimum(t / 0.1, 1.0) * np.exp(-np.maximum(t - dur + 0.4, 0) * 4)
    return x * env * 0.65


# ---------------------------------------------------------------- ritual / combat
def vigil_candles(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # candlelight vigil: soft flames + murmur
    flames = highpass(noise(n), 6000) * 0.08
    murmur = lowpass(noise(n), 400) * 0.15 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return _seamless(flames + murmur, fade_s=0.6) * 0.6


def corvus_drop(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # corvus boarding bridge dropped: massive wood crash
    out = np.zeros(n)
    cm = int(0.5 * SR)
    crash = lowpass(noise(cm), 1200) * _env_decay(cm, 35) * 0.6
    out[:cm] += crash
    # chains
    chains = highpass(lowpass(noise(n), 4000), 1500) * 0.2 * np.exp(-t * 2)
    out += chains
    return out * 0.75


# ---------------------------------------------------------------- foley / misc
def stirrup_clink():
    m = int(0.3 * SR)
    t = np.arange(m) / SR
    # stirrup: metallic jingle
    x = np.sin(2 * np.pi * 2200 * t) * _env_decay(m, 90) * 0.2
    x += np.sin(2 * np.pi * 3300 * t) * _env_decay(m, 110) * 0.12
    return x * 0.55


def quadrant():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # quadrant adjusted: brass arcs
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.28)):
        sm = int(0.15 * SR)
        arc = highpass(lowpass(noise(sm), 4500), 1800) * 0.2 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(off * SR)
        out[s:s + sm] += arc
    return out * 0.6


def uav_buzz(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # UAV: distant buzzing
    x = np.sin(2 * np.pi * 1800 * t) * 0.1
    x += np.sin(2 * np.pi * 3600 * t) * 0.05
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.8 * t)
    return _seamless(x, fade_s=0.5) * 0.6


SFX30 = [
    ("naval/binnacle", binnacle, "ship's compass"),
    ("animal/muskrat-splash", muskrat_splash, "muskrat diving"),
    ("weather/diamond-dust", diamond_dust, "diamond dust"),
    ("horror/doppelganger", doppelganger, "doppelganger voice"),
    ("tavern/pewter-mug", pewter_mug, "pewter mug"),
    ("farm/duckling-peep", duckling_peep, "ducklings peeping"),
    ("mine/rock-burst", rock_burst, "rock burst"),
    ("forge/weld-flux", weld_flux, "welding flux"),
    ("kitchen/jam-bubble", jam_bubble, "jam bubbling"),
    ("stable/yearling-whinny", yearling_whinny, "yearling whinny"),
    ("ritual/vigil-candles", vigil_candles, "candlelight vigil"),
    ("combat/corvus-drop", corvus_drop, "corvus dropped"),
    ("foley/stirrup-clink", stirrup_clink, "stirrup jingle"),
    ("misc/quadrant", quadrant, "quadrant adjusted"),
    ("modern/uav-buzz", uav_buzz, "UAV buzzing"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX30:
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
    with open(os.path.join(OUT, "sfx30-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX30:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
