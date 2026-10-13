"""Procedural SFX batch 41 for the Bannerlord-clone (round 40).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx41.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx41")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx41-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(414141)


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
def deadeye(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # deadeye: wooden block creak
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.3):
        m = int(0.2 * SR)
        creak = np.sin(2 * np.pi * 190 * np.arange(m) / SR) * _env_decay(m, 35) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.62


def opossum(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # opossum: hiss + clicks
    out = np.zeros(n)
    # hiss
    hm = int(0.5 * SR)
    hiss = highpass(noise(hm), 3200) * 0.24 * np.sin(np.pi * np.arange(hm) / hm)
    out[:hm] += hiss
    # clicks
    for b in np.arange(0.55, dur - 0.06, 0.09):
        m = int(0.04 * SR)
        click = highpass(noise(m), 4500) * _env_decay(m, 95) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += click
    return out * 0.6


# ---------------------------------------------------------------- weather / horror
def khamsin(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # khamsin: hot egyptian wind
    x = highpass(lowpass(noise(n), 4300), 630) * 0.36
    x *= 0.62 + 0.38 * np.sin(2 * np.pi * 0.35 * t)
    grit = highpass(noise(n), 5200) * 0.05
    x += grit
    return _seamless(x, fade_s=0.6) * 0.64


def poltergeist_rattle(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poltergeist: objects rattling
    out = np.zeros(n)
    for b in _rng.uniform(0.05, dur - 0.2, 9):
        m = int(0.15 * SR)
        rattle = highpass(lowpass(noise(m), 4800), 1800) * _env_decay(m, 68) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += rattle
    return out * 0.62


# ---------------------------------------------------------------- tavern / farm
def skittle_ball():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # skittle: wooden ball rolled
    roll = lowpass(noise(m), 650) * 0.32 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return roll * 0.62


def poult_peeps2(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: eager peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.1):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2900 + 680 * np.sin(2 * np.pi * 9 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def drift_timber():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # drift timber: horizontal tunnel
    out = np.zeros(m)
    for b in np.arange(0.05, 0.65, 0.22):
        sm = int(0.2 * SR)
        creak = np.sin(2 * np.pi * 148 * np.arange(sm) / SR) * _env_decay(sm, 28) * 0.23
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += creak
    return out * 0.65


def puddling(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # puddling: iron stirred
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.35, 0.38)):
        m = int(0.3 * SR)
        stir = lowpass(noise(m), 800) * 0.32 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += stir * (1.0 - i * 0.05)
    return out * 0.66


# ---------------------------------------------------------------- kitchen / stable
def syllabub_pot(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # syllabub: cream whipped
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.12, 0.15):
        m = int(0.1 * SR)
        whip = highpass(lowpass(noise(m), 5200), 2800) * 0.18 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += whip
    return out * 0.58


def straw_bed():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # straw: bedding spread
    rustle = highpass(lowpass(noise(m), 4500), 1000) * 0.26 * np.sin(np.pi * np.minimum(t / 0.7, 1.0))
    return rustle * 0.62


# ---------------------------------------------------------------- ritual / combat
def tonsure_bell():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # tonsure: small bell
    bell = np.sin(2 * np.pi * 880 * t) * _env_decay(m, 38) * 0.2
    bell += np.sin(2 * np.pi * 1320 * t) * _env_decay(m, 48) * 0.12
    return bell * 0.6


def falconet_fire(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # falconet: light cannon
    out = np.zeros(n)
    # crack
    cm = int(0.18 * SR)
    crack = lowpass(noise(cm), 1800) * _env_decay(cm, 58) * 0.5
    out[:cm] += crack
    # tail
    tm = int(0.45 * SR)
    tail = lowpass(noise(tm), 900) * _env_decay(tm, 32) * 0.28
    s = int(0.15 * SR)
    out[s:s + tm] += tail
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def buskin_step2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # buskins: alternate steps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.18, 0.29):
        m = int(0.12 * SR)
        step = lowpass(highpass(noise(m), 420), 1900) * _env_decay(m, 67) * 0.27
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.6


def cross_staff():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # cross-staff: navigation sight
    out = np.zeros(m)
    for i, off in enumerate((0.08, 0.3)):
        sm = int(0.14 * SR)
        slide = lowpass(highpass(noise(sm), 700), 3200) * _env_decay(sm, 70) * (0.2 - i * 0.02)
        s = int(off * SR)
        out[s:s + sm] += slide
    return out * 0.6


def ew_pulse(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # EW: jamming pulse
    f = 1800 + 600 * np.sin(2 * np.pi * 1.5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.14
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 3 * t))
    return _seamless(x, fade_s=0.4) * 0.6


SFX41 = [
    ("naval/deadeye", deadeye, "deadeye block"),
    ("animal/opossum", opossum, "opossum hiss"),
    ("weather/khamsin", khamsin, "khamsin wind"),
    ("horror/poltergeist-rattle", poltergeist_rattle, "poltergeist rattling"),
    ("tavern/skittle-ball", skittle_ball, "skittle ball"),
    ("farm/poult-peeps2", poult_peeps2, "poult peeps"),
    ("mine/drift-timber", drift_timber, "drift timber"),
    ("forge/puddling", puddling, "puddling iron"),
    ("kitchen/syllabub-pot", syllabub_pot, "syllabub whipped"),
    ("stable/straw-bed", straw_bed, "straw bedding"),
    ("ritual/tonsure-bell", tonsure_bell, "tonsure bell"),
    ("combat/falconet-fire", falconet_fire, "falconet fired"),
    ("foley/buskin-step2", buskin_step2, "buskins stepping"),
    ("misc/cross-staff", cross_staff, "cross-staff sight"),
    ("modern/ew-pulse", ew_pulse, "EW jamming pulse"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX41:
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
    with open(os.path.join(OUT, "sfx41-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX41:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
