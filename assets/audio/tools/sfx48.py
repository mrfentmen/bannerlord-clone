"""Procedural SFX batch 48 for the Bannerlord-clone (round 47).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx48.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx48")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx48-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(484848)


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
def mainmast(dur=1.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mainmast: tall rigging
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.32, 0.33):
        m = int(0.25 * SR)
        creak = np.sin(2 * np.pi * 158 * np.arange(m) / SR) * _env_decay(m, 30) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.62


def fisher_cat(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fisher: weasel-like chatter
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.09, 0.11):
        m = int(0.07 * SR)
        mt = np.arange(m) / SR
        f = 2700 + 920 * np.sin(2 * np.pi * 12 * mt)
        chit = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.07)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.56


# ---------------------------------------------------------------- weather / horror
def tehuano(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # tehuano: mexican wind gap
    x = highpass(lowpass(noise(n), 3500), 550) * 0.38
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.27 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def glaistig(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # glaistig: scottish spirit
    f = 480 - 200 * np.sin(2 * np.pi * 0.52 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.2
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 1.3 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.62


# ---------------------------------------------------------------- tavern / farm
def kayles_game(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # kayles: full game
    out = np.zeros(n)
    # throw
    tm = int(0.3 * SR)
    throw = highpass(lowpass(noise(tm), 3600), 850) * 0.26 * np.sin(np.pi * np.arange(tm) / tm)
    out[:tm] += throw
    # pins scatter
    for b in _rng.uniform(0.4, 1.3, 7):
        m = int(0.12 * SR)
        pin = np.sin(2 * np.pi * 880 * np.arange(m) / SR) * _env_decay(m, 53) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pin
    return out * 0.65


def chick_peeps6(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: soft peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.07, 0.05):
        m = int(0.04 * SR)
        mt = np.arange(m) / SR
        f = 3700 + 800 * np.sin(2 * np.pi * 14 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13 * np.sin(np.pi * mt / 0.04)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def shaft_collar(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # shaft collar: timber frame
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.6, 0.7):
        m = int(0.55 * SR)
        frame = lowpass(noise(m), 800) * 0.33 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += frame
    return out * 0.64


def finery_hearth(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # finery hearth: refining fire
    x = lowpass(noise(n), 720) * 0.39
    x *= 0.68 + 0.32 * np.sin(2 * np.pi * 0.46 * t)
    return _seamless(x, fade_s=0.6) * 0.65


# ---------------------------------------------------------------- kitchen / stable
def posset_serving():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # posset: ladled out
    out = np.zeros(m)
    # ladle
    lm = int(0.25 * SR)
    ladle = lowpass(noise(lm), 1400) * 0.26 * np.sin(np.pi * np.arange(lm) / lm)
    out[:lm] += ladle
    # pour
    pm = int(0.3 * SR)
    pour = lowpass(noise(pm), 1650) * 0.24 * np.sin(np.pi * np.arange(pm) / pm)
    s = int(0.28 * SR)
    out[s:s + pm] += pour
    return out * 0.6


def grain_scoop():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # grain: scooped
    scoop = highpass(lowpass(noise(m), 3500), 1400) * 0.27 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return scoop * 0.62


# ---------------------------------------------------------------- ritual / combat
def unition(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # unition: joining chant
    out = np.zeros(n)
    for f in (100, 150, 200):
        out += np.sin(2 * np.pi * f * t) * 0.07
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.64


def basilisk_fire(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # basilisk: heavy cannon
    out = np.zeros(n)
    # boom
    bm = int(0.26 * SR)
    boom = lowpass(noise(bm), 1300) * _env_decay(bm, 45) * 0.56
    out[:bm] += boom
    # rumble
    rm = int(0.55 * SR)
    rumble = lowpass(noise(rm), 550) * _env_decay(rm, 26) * 0.3
    s = int(0.22 * SR)
    out[s:s + rm] += rumble
    return out * 0.71


# ---------------------------------------------------------------- foley / misc
def clog_step3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.17, 0.37):
        m = int(0.13 * SR)
        step = lowpass(highpass(noise(m), 700), 3600) * _env_decay(m, 70) * 0.28
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.62


def solar_dial():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # solar dial: brass plate
    plate = np.sin(2 * np.pi * 1400 * t) * _env_decay(m, 52) * 0.17
    plate += np.sin(2 * np.pi * 2100 * t) * _env_decay(m, 65) * 0.09
    return plate * 0.58


def ew_sweep(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # EW: sweeping jam
    f = 1600 + 900 * np.sin(2 * np.pi * 0.8 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 2.8 * t))
    return _seamless(x, fade_s=0.4) * 0.58


SFX48 = [
    ("naval/mainmast", mainmast, "mainmast rigging"),
    ("animal/fisher-cat", fisher_cat, "fisher cat"),
    ("weather/tehuano", tehuano, "tehuano wind"),
    ("horror/glaistig", glaistig, "glaistig spirit"),
    ("tavern/kayles-game", kayles_game, "kayles game"),
    ("farm/chick-peeps6", chick_peeps6, "chick peeps"),
    ("mine/shaft-collar", shaft_collar, "shaft collar"),
    ("forge/finery-hearth", finery_hearth, "finery hearth"),
    ("kitchen/posset-serving", posset_serving, "posset served"),
    ("stable/grain-scoop", grain_scoop, "grain scooped"),
    ("ritual/unition", unition, "unition chant"),
    ("combat/basilisk-fire", basilisk_fire, "basilisk fired"),
    ("foley/clog-step3", clog_step3, "clogs stepping"),
    ("misc/solar-dial", solar_dial, "solar dial"),
    ("modern/ew-sweep", ew_sweep, "EW sweeping"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX48:
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
    with open(os.path.join(OUT, "sfx48-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX48:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
