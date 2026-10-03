"""Procedural SFX batch 42 for the Bannerlord-clone (round 41).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx42.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx42")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx42-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(424242)


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
def anchor_watch(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # anchor watch: night sounds
    out = np.zeros(n)
    # water lapping
    wl = int(1.0 * SR)
    lap = lowpass(highpass(noise(wl), 300), 1500) * 0.28 * np.sin(np.pi * np.arange(wl) / wl)
    out[:wl] += lap
    # bell
    for b in (0.8, 1.6):
        m = int(0.3 * SR)
        bell = np.sin(2 * np.pi * 740 * np.arange(m) / SR) * _env_decay(m, 38) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bell
    return out * 0.65


def raccoon(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # raccoon: chittering
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.11):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2400 + 800 * np.sin(2 * np.pi * 11 * mt)
        chit = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.56


# ---------------------------------------------------------------- weather / horror
def buran(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # buran: russian blizzard
    x = highpass(lowpass(noise(n), 3800), 580) * 0.4
    x *= 0.55 + 0.45 * np.sin(2 * np.pi * 0.32 * t)
    return _seamless(x, fade_s=0.7) * 0.68


def wendigo_howl(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wendigo: chilling howl
    f = 420 - 200 * np.sin(2 * np.pi * 0.45 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.22
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 1.2 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.66


# ---------------------------------------------------------------- tavern / farm
def round_of_ale(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # round: mugs clinked
    out = np.zeros(n)
    for i, b in enumerate(_rng.uniform(0.05, 1.0, 5)):
        m = int(0.12 * SR)
        clink = np.sin(2 * np.pi * 1900 * np.arange(m) / SR) * _env_decay(m, 62) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clink * (1.0 - i * 0.06)
    return out * 0.62


def duckling_peeps2(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ducklings: happy peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.12):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2500 + 620 * np.sin(2 * np.pi * 8 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def adit_level():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # adit: horizontal entrance
    out = np.zeros(m)
    for b in np.arange(0.05, 0.65, 0.23):
        sm = int(0.21 * SR)
        echo = lowpass(noise(sm), 750) * 0.32 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += echo
    return out * 0.65


def finery_forge(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # finery: refining iron
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.3, 0.34)):
        m = int(0.26 * SR)
        mt = np.arange(m) / SR
        blow = np.sin(2 * np.pi * 1120 * mt) * _env_decay(m, 61) * 0.27
        blow += lowpass(noise(m), 1320) * _env_decay(m, 68) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += blow * (1.0 - i * 0.04)
    return out * 0.68


# ---------------------------------------------------------------- kitchen / stable
def flummery():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # flummery: oatmeal jelly
    out = np.zeros(m)
    for b in np.arange(0.05, 0.6, 0.17):
        sm = int(0.13 * SR)
        wobble = lowpass(noise(sm), 850) * 0.24 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += wobble
    return out * 0.6


def oat_bin():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # oats: grain poured
    pour = highpass(lowpass(noise(m), 3600), 1500) * 0.28 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return pour * 0.62


# ---------------------------------------------------------------- ritual / combat
def baptism(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # baptism: water + chant
    out = np.zeros(n)
    for f in (98, 147, 196):
        out += np.sin(2 * np.pi * f * t) * 0.07
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # water
    wm = int(0.5 * SR)
    water = lowpass(highpass(noise(wm), 500), 2800) * 0.24 * np.sin(np.pi * np.arange(wm) / wm)
    s = int(0.6 * SR)
    out[s:s + wm] += water
    return out * 0.66


def saker_fire(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # saker: medium cannon
    out = np.zeros(n)
    # boom
    bm = int(0.22 * SR)
    boom = lowpass(noise(bm), 1500) * _env_decay(bm, 52) * 0.53
    out[:bm] += boom
    # echo
    em = int(0.5 * SR)
    echo = lowpass(noise(em), 750) * _env_decay(em, 29) * 0.29
    s = int(0.2 * SR)
    out[s:s + em] += echo
    return out * 0.71


# ---------------------------------------------------------------- foley / misc
def sabot_step(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: french wooden shoes
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.17, 0.35):
        m = int(0.13 * SR)
        step = lowpass(highpass(noise(m), 720), 3700) * _env_decay(m, 69) * 0.28
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.62


def backstaff2():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # backstaff: alternate sighting
    click = np.sin(2 * np.pi * 1750 * t) * _env_decay(m, 62) * 0.18
    click += np.sin(2 * np.pi * 2600 * t) * _env_decay(m, 75) * 0.09
    return click * 0.6


def sigint_pulse(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # SIGINT: intercept pulse
    f = 1400 + 700 * np.sin(2 * np.pi * 1.2 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 2.5 * t))
    return _seamless(x, fade_s=0.4) * 0.6


SFX42 = [
    ("naval/anchor-watch", anchor_watch, "anchor watch night"),
    ("animal/raccoon", raccoon, "raccoon chitter"),
    ("weather/buran", buran, "buran blizzard"),
    ("horror/wendigo-howl", wendigo_howl, "wendigo howling"),
    ("tavern/round-of-ale", round_of_ale, "round of ale"),
    ("farm/duckling-peeps2", duckling_peeps2, "duckling peeps"),
    ("mine/adit-level", adit_level, "adit level echo"),
    ("forge/finery-forge", finery_forge, "finery forge"),
    ("kitchen/flummery", flummery, "flummery jelly"),
    ("stable/oat-bin", oat_bin, "oat bin filled"),
    ("ritual/baptism", baptism, "baptism rite"),
    ("combat/saker-fire", saker_fire, "saker fired"),
    ("foley/sabot-step", sabot_step, "sabots stepping"),
    ("misc/backstaff2", backstaff2, "backstaff sight"),
    ("modern/sigint-pulse", sigint_pulse, "SIGINT pulse"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX42:
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
    with open(os.path.join(OUT, "sfx42-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX42:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
