"""Procedural SFX batch 6 for the Bannerlord-clone (round 5).

Radio extras, heavy ordnance, construction, farm animals, alarms.
All numpy DSP - no samples. Run: python3 sfx6.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx6")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx6-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(60606)


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


# ---------------------------------------------------------------- radio extras
def radio2(kind):
    if kind == "dispatch":
        # two-tone dispatch beep + squelch
        out = np.zeros(int(0.8 * SR))
        for i, f in enumerate((880, 660)):
            m = int(0.15 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.2 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 35) * 0.4
        sm = int(0.2 * SR)
        out[int(0.45 * SR):int(0.45 * SR) + sm] += highpass(noise(sm), 1200) * _env_decay(sm, 20) * 0.3
        return out
    if kind == "mayday":
        out = np.zeros(int(1.2 * SR))
        for i in range(3):
            m = int(0.2 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.35 * SR)
            out[s:s + m] += np.sin(2 * np.pi * 1200 * t) * _env_decay(m, 30) * 0.4
        return out
    if kind == "all-clear":
        out = np.zeros(int(0.9 * SR))
        # long steady tone
        m = int(0.7 * SR)
        t = np.arange(m) / SR
        out[:m] += np.sin(2 * np.pi * 660 * t) * 0.35 * np.minimum(t / 0.05, 1.0) * np.minimum((0.7 - t) / 0.1, 1.0)
        return out
    if kind == "static-burst":
        m = int(1.0 * SR)
        x = highpass(noise(m), 1800) * 0.25
        # gated bursts
        gate = (np.sin(2 * np.pi * 3 * np.arange(m) / SR) > 0).astype(float)
        return x * gate * 0.8
    raise ValueError(kind)


# ---------------------------------------------------------------- heavy ordnance
def explosion_huge():
    m = int(4.0 * SR)
    t = np.arange(m) / SR
    f = 24 + 60 * np.exp(-t * 5)
    ph = np.cumsum(2 * np.pi * f / SR)
    sub = np.sin(ph) * _env_decay(m, 2.2)
    boom = lowpass(noise(m), 400) * _env_decay(m, 3.0)
    debris = highpass(noise(m), 2500) * _env_decay(m, 10) * 0.4
    # secondary blasts
    out = sub + boom * 0.9 + debris
    for b in (0.4, 0.9):
        sm = int(1.0 * SR)
        st = np.arange(sm) / SR
        sec = lowpass(noise(sm), 600) * np.exp(-st * 5) * 0.4
        s = int(b * SR)
        out[s:s + sm] += sec
    return out * 0.75


def distant_artillery(dur=6.0):
    n = int(dur * SR)
    out = lowpass(noise(n), 120) * 0.25
    for b in _rng.uniform(0.5, dur - 1.0, 6):
        m = int(1.2 * SR)
        t = np.arange(m) / SR
        f = 35 + 45 * np.exp(-t * 6)
        ph = np.cumsum(2 * np.pi * f / SR)
        thump = np.sin(ph) * np.exp(-t * 4) * _rng.uniform(0.3, 0.6)
        # travel delay feel: lowpass more with distance
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += lowpass(thump, 300)
    return _seamless(out, fade_s=1.0) * 0.8


def implosion():
    m = int(1.5 * SR)
    t = np.arange(m) / SR
    # reverse-ish: suck then crack
    suck = lowpass(noise(m), 800) * 0.5
    suck *= np.sin(np.pi * np.minimum(t / 1.0, 1.0))  # swell then cut
    cm = int(0.3 * SR)
    crack = highpass(noise(cm), 3000) * _env_decay(cm, 30) * 0.7
    out = suck
    s = int(1.0 * SR)
    out[s:s + cm] += crack
    return out * 0.8


# ---------------------------------------------------------------- construction
def saw_cut(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # back-and-forth saw: amplitude gated by stroke
    stroke = np.abs(np.sin(2 * np.pi * 1.8 * t))
    x = highpass(noise(n), 1500) * 0.35 * (0.3 + 0.7 * stroke)
    x += np.sin(2 * np.pi * 220 * t) * 0.08 * stroke
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def hammer_nail():
    out = np.zeros(int(1.0 * SR))
    for i, off in enumerate((0.0, 0.3, 0.6)):
        m = int(0.1 * SR)
        t = np.arange(m) / SR
        hit = np.sin(2 * np.pi * 2400 * t) * _env_decay(m, 80) * 0.45
        hit += lowpass(noise(m), 3500) * _env_decay(m, 85) * 0.3
        s = int(off * SR)
        out[s:s + m] += hit * (1.0 - i * 0.12)
    return out * 0.7


def drill(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # power drill whine with trigger wobble
    f = 320 + 40 * np.sin(2 * np.pi * 7 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    x += np.sin(np.cumsum(2 * np.pi * f * 2.02 / SR)) * 0.12
    x += highpass(noise(n), 3000) * 0.1
    env = np.minimum(t / 0.2, 1.0) * np.minimum((dur - t) / 0.3, 1.0)
    return x * np.clip(env, 0, 1) * 0.65


# ---------------------------------------------------------------- farm animals
def cow_moo(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 160 - 50 * (t / dur) + 20 * np.sin(2 * np.pi * 4 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.5
    x += np.sin(np.cumsum(2 * np.pi * f * 2.01 / SR)) * 0.15
    x = np.sign(x) * 0.15 + x * 0.5
    env = np.minimum(t / 0.15, 1.0) * np.exp(-np.maximum(t - dur + 0.4, 0) * 4)
    return lowpass(x * env, 1200) * 0.7


def pig_squeal(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 900 + 500 * np.sin(2 * np.pi * 9 * t) - 300 * (t / dur)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.45
    x = np.sign(x) * 0.2 + x * 0.4
    env = np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * env * 0.65


def chicken_cluck():
    out = np.zeros(int(1.0 * SR))
    for i, off in enumerate((0.0, 0.18, 0.36, 0.62)):
        m = int(0.1 * SR)
        t = np.arange(m) / SR
        f = 700 - 300 * (t / 0.1)
        cluck = np.sin(np.cumsum(2 * np.pi * f / SR)) * _env_decay(m, 60) * 0.4
        s = int(off * SR)
        out[s:s + m] += cluck
    return out * 0.6


def goat_bleat(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bleat: vibrato-heavy mid tone
    f = 420 * (1.0 + 0.12 * np.sin(2 * np.pi * 11 * t))
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.45
    x += np.sin(np.cumsum(2 * np.pi * f * 1.5 / SR)) * 0.15
    env = np.minimum(t / 0.1, 1.0) * np.exp(-np.maximum(t - dur + 0.3, 0) * 5)
    return x * env * 0.65


# ---------------------------------------------------------------- alarms
def air_raid_siren(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # classic rising/falling siren
    f = 600 + 300 * np.sin(2 * np.pi * 0.25 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.5
    x += np.sin(np.cumsum(2 * np.pi * f * 2.0 / SR)) * 0.15
    env = np.minimum(t / 0.5, 1.0) * np.minimum((dur - t) / 0.5, 1.0)
    return x * np.clip(env, 0, 1) * 0.7


def bell_toll():
    out = np.zeros(int(2.5 * SR))
    for i, off in enumerate((0.0, 1.1)):
        m = int(1.3 * SR)
        t = np.arange(m) / SR
        # bell partials
        x = np.zeros(m)
        for j, f in enumerate((220, 550, 880, 1320)):
            x += np.sin(2 * np.pi * f * t) * np.exp(-t * (3 + j * 2)) * (0.5 / (j + 1))
        s = int(off * SR)
        if s + m <= len(out):
            out[s:s + m] += x
    return out * 0.7


def gong():
    m = int(3.0 * SR)
    t = np.arange(m) / SR
    x = np.zeros(m)
    for j, f in enumerate((98, 147, 196, 294, 392)):
        x += np.sin(2 * np.pi * f * t + _rng.uniform(0, 6.28)) * np.exp(-t * (1.5 + j * 0.8)) * (0.4 / (j * 0.5 + 1))
    x += lowpass(noise(m), 500) * np.exp(-t * 4) * 0.3
    return x * 0.75


SFX6 = [
    ("radio/dispatch", lambda: radio2("dispatch"), "radio dispatch beeps"),
    ("radio/mayday", lambda: radio2("mayday"), "mayday distress x3"),
    ("radio/all-clear", lambda: radio2("all-clear"), "all-clear tone"),
    ("radio/static-burst", lambda: radio2("static-burst"), "gated static bursts"),
    ("weapon/explosion-huge", explosion_huge, "massive explosion"),
    ("weapon/distant-artillery", distant_artillery, "distant artillery bed, loopable"),
    ("weapon/implosion", implosion, "implosion suck + crack"),
    ("foley/saw-cut", saw_cut, "hand saw cutting"),
    ("foley/hammer-nail", hammer_nail, "hammering nails"),
    ("foley/drill", drill, "power drill"),
    ("animal/cow-moo", cow_moo, "cow moo"),
    ("animal/pig-squeal", pig_squeal, "pig squeal"),
    ("animal/chicken-cluck", chicken_cluck, "chicken clucks"),
    ("animal/goat-bleat", goat_bleat, "goat bleat"),
    ("alarm/air-raid", air_raid_siren, "air raid siren"),
    ("alarm/bell-toll", bell_toll, "church bell tolls"),
    ("alarm/gong", gong, "ceremonial gong"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX6:
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
    with open(os.path.join(OUT, "sfx6-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX6:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
