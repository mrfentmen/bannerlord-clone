"""Procedural SFX batch 39 for the Bannerlord-clone (round 38).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx39.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx39")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx39-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(393939)


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
def halyard(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # halyard: rope through block
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.3, 0.35):
        m = int(0.25 * SR)
        haul = lowpass(noise(m), 1300) * 0.32 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += haul
    return out * 0.65


def muskrat():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # muskrat: water plop
    plop = lowpass(highpass(noise(m), 400), 2000) * _env_decay(m, 65) * 0.36
    return plop * 0.62


# ---------------------------------------------------------------- weather / horror
def harmattan(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # harmattan: dusty west african wind
    x = highpass(lowpass(noise(n), 4200), 620) * 0.36
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.34 * t)
    # dust grit
    grit = highpass(noise(n), 5000) * 0.06
    x += grit
    return _seamless(x, fade_s=0.6) * 0.64


def ghoul_howl(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ghoul: pack howl
    f = 280 - 120 * np.sin(2 * np.pi * 0.6 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.24
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 1.8 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.66


# ---------------------------------------------------------------- tavern / farm
def cribbage_peg():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # cribbage: single peg placed
    peg = np.sin(2 * np.pi * 1500 * t) * _env_decay(m, 68) * 0.22
    peg += np.sin(2 * np.pi * 2250 * t) * _env_decay(m, 80) * 0.1
    return peg * 0.6


def gosling_peeps(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: soft peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.13):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2600 + 600 * np.sin(2 * np.pi * 7 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def raise_timber():
    m = int(0.9 * SR)
    t = np.arange(m) / SR
    # raise timber: vertical shaft timber
    out = np.zeros(m)
    for b in np.arange(0.05, 0.7, 0.24):
        sm = int(0.22 * SR)
        creak = np.sin(2 * np.pi * 145 * np.arange(sm) / SR) * _env_decay(sm, 27) * 0.23
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += creak
    return out * 0.65


def pattern_welding(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattern welding: layered steel
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.3, 0.32)):
        m = int(0.24 * SR)
        mt = np.arange(m) / SR
        blow = np.sin(2 * np.pi * 1080 * mt) * _env_decay(m, 60) * 0.27
        blow += lowpass(noise(m), 1350) * _env_decay(m, 67) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += blow * (1.0 - i * 0.04)
    return out * 0.68


# ---------------------------------------------------------------- kitchen / stable
def posset_pot(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # posset: simmering pot
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.14, 0.17):
        m = int(0.11 * SR)
        bubble = lowpass(noise(m), 950) * _env_decay(m, 72) * 0.21
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bubble
    return out * 0.6


def manger():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # manger: hay rustle
    rustle = highpass(lowpass(noise(m), 4200), 1100) * 0.26 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return rustle * 0.62


# ---------------------------------------------------------------- ritual / combat
def exorcism_bell():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # exorcism: bell rung
    bell = np.sin(2 * np.pi * 680 * t) * _env_decay(m, 32) * 0.24
    bell += np.sin(2 * np.pi * 1020 * t) * _env_decay(m, 42) * 0.14
    return bell * 0.62


def bombard_fire(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bombard: heavy siege gun
    out = np.zeros(n)
    # blast
    bm = int(0.3 * SR)
    blast = lowpass(noise(bm), 1200) * _env_decay(bm, 42) * 0.58
    out[:bm] += blast
    # rumble
    rm = int(0.6 * SR)
    rumble = lowpass(noise(rm), 500) * _env_decay(rm, 25) * 0.32
    s = int(0.25 * SR)
    out[s:s + rm] += rumble
    return out * 0.72


# ---------------------------------------------------------------- foley / misc
def clog_step(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: wooden shoes
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.17, 0.33):
        m = int(0.13 * SR)
        clack = lowpass(highpass(noise(m), 750), 3700) * _env_decay(m, 70) * 0.29
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clack
    return out * 0.62


def mariner_astrolabe():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # astrolabe: brass ring adjusted
    out = np.zeros(m)
    for i, off in enumerate((0.08, 0.32)):
        sm = int(0.16 * SR)
        ring = np.sin(2 * np.pi * 1800 * np.arange(sm) / SR) * _env_decay(sm, 68) * (0.18 - i * 0.02)
        s = int(off * SR)
        out[s:s + sm] += ring
    return out * 0.6


def satellite_ping(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # satellite: orbital ping
    out = np.zeros(n)
    for b in np.arange(0.3, dur - 0.35, 0.8):
        m = int(0.25 * SR)
        ping = np.sin(2 * np.pi * 1200 * np.arange(m) / SR) * _env_decay(m, 35) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += ping
    return out * 0.64


SFX39 = [
    ("naval/halyard", halyard, "halyard hauled"),
    ("animal/muskrat", muskrat, "muskrat plop"),
    ("weather/harmattan", harmattan, "harmattan wind"),
    ("horror/ghoul-howl", ghoul_howl, "ghoul howling"),
    ("tavern/cribbage-peg", cribbage_peg, "cribbage peg"),
    ("farm/gosling-peeps", gosling_peeps, "gosling peeps"),
    ("mine/raise-timber", raise_timber, "raise timber"),
    ("forge/pattern-welding", pattern_welding, "pattern welding"),
    ("kitchen/posset-pot", posset_pot, "posset simmering"),
    ("stable/manger", manger, "manger hay"),
    ("ritual/exorcism-bell", exorcism_bell, "exorcism bell"),
    ("combat/bombard-fire", bombard_fire, "bombard fired"),
    ("foley/clog-step", clog_step, "clogs stepping"),
    ("misc/mariner-astrolabe", mariner_astrolabe, "mariner astrolabe"),
    ("modern/satellite-ping", satellite_ping, "satellite ping"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX39:
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
    with open(os.path.join(OUT, "sfx39-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX39:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
