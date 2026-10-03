"""Procedural SFX batch 32 for the Bannerlord-clone (round 31).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx32.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx32")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx32-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(323232)


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
def heave_ho(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sailors heaving: rhythmic grunts + rope
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.5):
        m = int(0.4 * SR)
        heave = lowpass(noise(m), 600) * 0.35 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += heave
    return out * 0.7


def pika_chirp(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pika: high mountain chirps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.12, 0.15):
        m = int(0.1 * SR)
        mt = np.arange(m) / SR
        f = 4000 + 1200 * np.sin(2 * np.pi * 9 * mt)
        chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.2 * np.sin(np.pi * mt / 0.1)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chirp
    return out * 0.6


# ---------------------------------------------------------------- weather / horror
def haboob_wall(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # haboob: massive dust wall approaching
    env = np.minimum(t / 1.0, 1.0) * np.exp(-np.maximum(t - 2.0, 0) * 2.5)
    x = lowpass(highpass(noise(n), 300), 2500) * 0.45 * env
    return x * 0.75


def banshee_keening(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # banshee: mournful keening wail
    f = 800 + 400 * np.sin(2 * np.pi * 0.5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.22
    x += np.sin(np.cumsum(2 * np.pi * f * 1.5 / SR)) * 0.1
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.7


# ---------------------------------------------------------------- tavern / farm
def tankard_stack():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # tankards stacked: wooden clunks
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.2, 0.35)):
        tm = int(0.1 * SR)
        clunk = lowpass(noise(tm), 1400) * _env_decay(tm, 70) * (0.35 - i * 0.05)
        s = int(off * SR)
        out[s:s + tm] += clunk
    return out * 0.65


def chick_peep(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: tiny rapid peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.08):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 3500 + 900 * np.sin(2 * np.pi * 10 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def assay_crush(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ore assay: crushing + grinding
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.45):
        m = int(0.4 * SR)
        crush = lowpass(highpass(noise(m), 500), 2500) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += crush
    return out * 0.7


def normalize_cool(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # normalizing: even cooling ticks
    out = np.zeros(n)
    for b in _rng.uniform(0.1, 1.9, 20):
        m = int(0.04 * SR)
        tick = np.sin(2 * np.pi * _rng.uniform(1600, 2200) * np.arange(m) / SR) * _env_decay(m, 110) * _rng.uniform(0.08, 0.15)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += tick
    return out * 0.6


# ---------------------------------------------------------------- kitchen / stable
def suet_chop(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # suet chopped: soft dense cuts
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.2, 0.22):
        m = int(0.18 * SR)
        chop = lowpass(noise(m), 900) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chop
    return out * 0.65


def weanling_nicker(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # weanling: curious nicker
    f = 700 + 250 * np.sin(2 * np.pi * 7 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.25
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 10 * t)
    env = np.minimum(t / 0.07, 1.0) * np.exp(-np.maximum(t - dur + 0.3, 0) * 5)
    return x * env * 0.6


# ---------------------------------------------------------------- ritual / combat
def pilgrim_bells(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pilgrims: distant bells + footsteps
    out = np.zeros(n)
    for b in (0.2, 1.0):
        m = int(0.5 * SR)
        mt = np.arange(m) / SR
        bell = np.sin(2 * np.pi * 660 * mt) * _env_decay(m, 30) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bell
    # footsteps
    for b in np.arange(0.1, dur - 0.2, 0.4):
        m = int(0.12 * SR)
        step = lowpass(noise(m), 800) * _env_decay(m, 65) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.65


def testudo_lock(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # testudo: shields locking overhead
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.35):
        m = int(0.28 * SR)
        lock = lowpass(highpass(noise(m), 400), 1800) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += lock
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def gaiter_snap():
    m = int(0.25 * SR)
    t = np.arange(m) / SR
    # gaiter snapped: sharp fabric
    snap = highpass(noise(m), 2800) * _env_decay(m, 105) * 0.35
    return snap * 0.6


def backstaff():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # backstaff: nautical instrument
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.3)):
        sm = int(0.18 * SR)
        adj = highpass(lowpass(noise(sm), 4200), 1600) * 0.2 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(off * SR)
        out[s:s + sm] += adj
    return out * 0.6


def drone_swarm(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # drone swarm: multiple buzzing
    x = np.zeros(n)
    for _ in range(5):
        f = _rng.uniform(1600, 2200)
        x += np.sin(2 * np.pi * f * t + _rng.uniform(0, 6.28)) * 0.06
    return _seamless(x, fade_s=0.5) * 0.6


SFX32 = [
    ("naval/heave-ho", heave_ho, "sailors heaving"),
    ("animal/pika-chirp", pika_chirp, "pika chirping"),
    ("weather/haboob-wall", haboob_wall, "haboob approaching"),
    ("horror/banshee-keening", banshee_keening, "banshee keening"),
    ("tavern/tankard-stack", tankard_stack, "tankards stacked"),
    ("farm/chick-peep", chick_peep, "chicks peeping"),
    ("mine/assay-crush", assay_crush, "ore assayed"),
    ("forge/normalize-cool", normalize_cool, "normalizing"),
    ("kitchen/suet-chop", suet_chop, "suet chopped"),
    ("stable/weanling-nicker", weanling_nicker, "weanling nickering"),
    ("ritual/pilgrim-bells", pilgrim_bells, "pilgrim bells"),
    ("combat/testudo-lock", testudo_lock, "testudo forming"),
    ("foley/gaiter-snap", gaiter_snap, "gaiter snapped"),
    ("misc/backstaff", backstaff, "backstaff used"),
    ("modern/drone-swarm", drone_swarm, "drone swarm"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX32:
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
    with open(os.path.join(OUT, "sfx32-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX32:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
