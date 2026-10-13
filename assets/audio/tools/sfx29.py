"""Procedural SFX batch 29 for the Bannerlord-clone (round 28).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx29.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx29")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx29-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(292929)


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
def sea_bag(dur=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sea bag dropped: canvas + kit
    thud = lowpass(noise(n), 900) * _env_decay(n, 45) * 0.45
    rustle = highpass(lowpass(noise(n), 3500), 1200) * _env_decay(n, 60) * 0.2
    return (thud + rustle) * 0.65


def vole_squeak(dur=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # vole: ultra-high squeaks
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.07):
        m = int(0.04 * SR)
        mt = np.arange(m) / SR
        f = 6000 + 1500 * np.sin(2 * np.pi * 12 * mt)
        squeak = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.04)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += squeak
    return out * 0.55


# ---------------------------------------------------------------- weather / horror
def chinook_wind(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chinook: warm downslope wind
    x = highpass(lowpass(noise(n), 4000), 700) * 0.35
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * t)
    return _seamless(x, fade_s=0.6) * 0.65


def wraith_moan(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wraith: ethereal moaning
    f = 300 + 150 * np.sin(2 * np.pi * 0.4 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.25
    x += np.sin(np.cumsum(2 * np.pi * f * 1.5 / SR)) * 0.12
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.7


# ---------------------------------------------------------------- tavern / farm
def shots_lined():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # shots lined up: glass taps
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.18, 0.31, 0.44)):
        gm = int(0.06 * SR)
        tap = np.sin(2 * np.pi * _rng.uniform(2800, 3200) * np.arange(gm) / SR) * _env_decay(gm, 95) * 0.2
        s = int(off * SR)
        out[s:s + gm] += tap
    return out * 0.6


def calf_moo(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # calf: higher moo
    f = 350 + 100 * np.sin(2 * np.pi * 4 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 7 * t)
    env = np.minimum(t / 0.12, 1.0) * np.exp(-np.maximum(t - dur + 0.4, 0) * 4)
    return x * env * 0.65


# ---------------------------------------------------------------- mine / forge
def mine_sump(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sump pump: deep water pumping
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.5, 0.8):
        m = int(0.7 * SR)
        pump = lowpass(noise(m), 500) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pump
    return out * 0.7


def case_harden(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # case hardening: quench + sizzle
    out = np.zeros(n)
    # quench plunge
    qm = int(0.4 * SR)
    quench = highpass(noise(qm), 2000) * _env_decay(qm, 35) * 0.45
    out[:qm] += quench
    # sizzle
    sm = int(1.0 * SR)
    sizzle = highpass(noise(sm), 5000) * 0.2 * np.exp(-np.arange(sm) / SR * 2)
    s = int(0.3 * SR)
    out[s:s + sm] += sizzle
    return out * 0.7


# ---------------------------------------------------------------- kitchen / stable
def pickle_jar():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # pickle jar sealed: pop + glass
    pop = lowpass(noise(m), 1000) * _env_decay(m, 85) * 0.35
    ring = np.sin(2 * np.pi * 2400 * t) * _env_decay(m, 110) * 0.15
    return (pop + ring) * 0.6


def foal_nicker(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # foal: soft high nicker
    f = 600 + 200 * np.sin(2 * np.pi * 9 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.25
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 12 * t)
    env = np.minimum(t / 0.06, 1.0) * np.exp(-np.maximum(t - dur + 0.25, 0) * 6)
    return x * env * 0.6


# ---------------------------------------------------------------- ritual / combat
def ordination_chant(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ordination: rising sacred chant
    out = np.zeros(n)
    for f in (130.8, 164.8, 196.0, 261.6):
        out += np.sin(2 * np.pi * f * t) * 0.08
    out *= np.minimum(t / 1.0, 1.0) * np.exp(-np.maximum(t - dur + 0.6, 0) * 2.5)
    return out * 0.7


def phalanx_advance(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # phalanx: synchronized steps + shields
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.5):
        m = int(0.25 * SR)
        step = lowpass(noise(m), 700) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        # shield rattle
        rattle = highpass(lowpass(noise(m), 3000), 1000) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step + rattle
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def belt_buckle():
    m = int(0.3 * SR)
    t = np.arange(m) / SR
    # belt buckled: metal + leather
    metal = np.sin(2 * np.pi * 1800 * t) * _env_decay(m, 95) * 0.25
    leather = lowpass(noise(m), 900) * _env_decay(m, 70) * 0.2
    return (metal + leather) * 0.6


def divider_click():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # divider adjusted: fine clicks
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.2, 0.35)):
        cm = int(0.04 * SR)
        click = highpass(noise(cm), 6000) * _env_decay(cm, 140) * 0.18
        s = int(off * SR)
        out[s:s + cm] += click
    return out * 0.55


def satcom_beep(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # satcom: uplink beeps
    out = np.zeros(n)
    for i, (off, f) in enumerate([(0.1, 1200), (0.5, 1400), (0.9, 1600)]):
        bm = int(0.15 * SR)
        beep = np.sin(2 * np.pi * f * np.arange(bm) / SR) * _env_decay(bm, 40) * 0.22
        s = int(off * SR)
        out[s:s + bm] += beep
    return _seamless(out, fade_s=0.3) * 0.6


SFX29 = [
    ("naval/sea-bag", sea_bag, "sea bag dropped"),
    ("animal/vole-squeak", vole_squeak, "vole squeaking"),
    ("weather/chinook-wind", chinook_wind, "chinook wind"),
    ("horror/wraith-moan", wraith_moan, "wraith moaning"),
    ("tavern/shots-lined", shots_lined, "shots lined up"),
    ("farm/calf-moo", calf_moo, "calf mooing"),
    ("mine/mine-sump", mine_sump, "sump pump"),
    ("forge/case-harden", case_harden, "case hardening"),
    ("kitchen/pickle-jar", pickle_jar, "pickle jar sealed"),
    ("stable/foal-nicker", foal_nicker, "foal nickering"),
    ("ritual/ordination-chant", ordination_chant, "ordination chant"),
    ("combat/phalanx-advance", phalanx_advance, "phalanx advancing"),
    ("foley/belt-buckle", belt_buckle, "belt buckled"),
    ("misc/divider-click", divider_click, "divider adjusted"),
    ("modern/satcom-beep", satcom_beep, "satcom uplink"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX29:
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
    with open(os.path.join(OUT, "sfx29-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX29:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
