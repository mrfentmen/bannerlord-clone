"""Procedural SFX batch 36 for the Bannerlord-clone (round 35).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx36.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx36")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx36-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(363636)


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
def warping(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # warping: ship hauled by rope
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.4, 0.5):
        m = int(0.35 * SR)
        haul = lowpass(noise(m), 1100) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += haul
    return out * 0.65


def chipmunk_chatter(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chipmunk: rapid chatter
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.06, 0.08):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 4200 + 800 * np.sin(2 * np.pi * 14 * mt)
        chit = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.55


# ---------------------------------------------------------------- weather / horror
def chinook_gale(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chinook: warm mountain wind
    x = highpass(lowpass(noise(n), 4800), 680) * 0.36
    x *= 0.65 + 0.35 * np.sin(2 * np.pi * 0.38 * t)
    return _seamless(x, fade_s=0.6) * 0.66


def bogeyman(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bogeyman: lurking menace
    f = 75 + 30 * np.sin(2 * np.pi * 0.6 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 2.5 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # scrape
    scrape = highpass(noise(n), 2500) * 0.08 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return (x + scrape) * 0.68


# ---------------------------------------------------------------- tavern / farm
def cribbage_board():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # cribbage: pegs moved
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.25, 0.45)):
        sm = int(0.12 * SR)
        peg = np.sin(2 * np.pi * 1400 * np.arange(sm) / SR) * _env_decay(sm, 70) * (0.22 - i * 0.02)
        s = int(off * SR)
        out[s:s + sm] += peg
    return out * 0.6


def duckling_chorus(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ducklings: soft chorus
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.12):
        m = int(0.07 * SR)
        mt = np.arange(m) / SR
        f = 2400 + 600 * np.sin(2 * np.pi * 7 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16 * np.sin(np.pi * mt / 0.07)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def shaft_sinking(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # shaft sinking: deep digging
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.7, 0.9):
        m = int(0.8 * SR)
        dig = lowpass(noise(m), 600) * 0.38 * np.sin(np.pi * np.arange(m) / m)
        echo = np.roll(dig, int(0.25 * SR)) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dig + echo[:m]
    return out * 0.68


def upsetting(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # upsetting: thickening metal
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.3, 0.36)):
        m = int(0.26 * SR)
        mt = np.arange(m) / SR
        blow = np.sin(2 * np.pi * 1000 * mt) * _env_decay(m, 56) * 0.28
        blow += lowpass(noise(m), 1300) * _env_decay(m, 66) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += blow * (1.0 - i * 0.04)
    return out * 0.7


# ---------------------------------------------------------------- kitchen / stable
def syllabub_cup():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # syllabub: whipped cream drink
    pour = lowpass(noise(m), 1500) * 0.28 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    whip = highpass(noise(m), 4500) * 0.07
    return (pour + whip) * 0.6


def water_trough(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # water trough: horses drinking
    out = np.zeros(n)
    # water slosh
    sm = int(0.6 * SR)
    slosh = lowpass(highpass(noise(sm), 400), 2500) * 0.32 * np.sin(np.pi * np.arange(sm) / sm)
    out[:sm] += slosh
    # drinking laps
    for b in np.arange(0.7, dur - 0.1, 0.15):
        m = int(0.08 * SR)
        lap = lowpass(noise(m), 1200) * _env_decay(m, 90) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += lap
    return out * 0.65


# ---------------------------------------------------------------- ritual / combat
def flagellation(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # flagellation: ritual scourging
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.4):
        m = int(0.25 * SR)
        lash = highpass(lowpass(noise(m), 4500), 1500) * 0.32 * np.exp(-np.arange(m) / SR * 8)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += lash
    return out * 0.68


def trebuchet_loose(dur=1.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # trebuchet: counterweight drop + launch
    out = np.zeros(n)
    # counterweight
    cm = int(0.3 * SR)
    drop = lowpass(noise(cm), 800) * 0.45 * np.sin(np.pi * np.arange(cm) / cm)
    out[:cm] += drop
    # arm swing
    sm = int(0.25 * SR)
    swing = lowpass(noise(sm), 1500) * _env_decay(sm, 50) * 0.4
    s = int(0.25 * SR)
    out[s:s + sm] += swing
    # stone launch
    fm = int(0.6 * SR)
    flight = highpass(lowpass(noise(fm), 4800), 1700) * 0.23 * np.exp(-np.arange(fm) / SR * 2.8)
    s2 = int(0.45 * SR)
    out[s2:s2 + fm] += flight
    return out * 0.72


# ---------------------------------------------------------------- foley / misc
def cothurnus_step(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cothurnus: thick-soled boots
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.18, 0.32):
        m = int(0.14 * SR)
        step = lowpass(highpass(noise(m), 350), 2200) * _env_decay(m, 62) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.62


def nocturnal_dial():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nocturnal: night-dial clicks
    out = np.zeros(m)
    for i, off in enumerate((0.08, 0.32)):
        sm = int(0.14 * SR)
        click = np.sin(2 * np.pi * 1700 * np.arange(sm) / SR) * _env_decay(sm, 75) * (0.2 - i * 0.03)
        s = int(off * SR)
        out[s:s + sm] += click
    return out * 0.6


def sonar_ping(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sonar: deep ping
    out = np.zeros(n)
    for b in np.arange(0.3, dur - 0.4, 0.9):
        m = int(0.3 * SR)
        ping = np.sin(2 * np.pi * 900 * np.arange(m) / SR) * _env_decay(m, 30) * 0.26
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += ping
    return out * 0.65


SFX36 = [
    ("naval/warping", warping, "warping the ship"),
    ("animal/chipmunk-chatter", chipmunk_chatter, "chipmunk chatter"),
    ("weather/chinook-gale", chinook_gale, "chinook wind"),
    ("horror/bogeyman", bogeyman, "bogeyman lurking"),
    ("tavern/cribbage-board", cribbage_board, "cribbage pegs"),
    ("farm/duckling-chorus", duckling_chorus, "ducklings"),
    ("mine/shaft-sinking", shaft_sinking, "shaft sinking"),
    ("forge/upsetting", upsetting, "upsetting metal"),
    ("kitchen/syllabub-cup", syllabub_cup, "syllabub served"),
    ("stable/water-trough", water_trough, "horses drinking"),
    ("ritual/flagellation", flagellation, "ritual scourging"),
    ("combat/trebuchet-loose", trebuchet_loose, "trebuchet fired"),
    ("foley/cothurnus-step", cothurnus_step, "cothurnus boots"),
    ("misc/nocturnal-dial", nocturnal_dial, "nocturnal dial"),
    ("modern/sonar-ping", sonar_ping, "sonar sweeping"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX36:
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
    with open(os.path.join(OUT, "sfx36-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX36:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
