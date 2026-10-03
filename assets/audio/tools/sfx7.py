"""Procedural SFX batch 7 for the Bannerlord-clone (round 6).

Underwater, climbing, heavy doors, signals, nature hazards.
All numpy DSP - no samples. Run: python3 sfx7.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx7")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx7-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(70707)


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


# ---------------------------------------------------------------- underwater
def dive_splash():
    m = int(1.0 * SR)
    t = np.arange(m) / SR
    entry = highpass(lowpass(noise(m), 6000), 1500) * 0.6
    entry *= np.minimum(t / 0.08, 1.0) * _env_decay(m, 8)
    # underwater transition: lowpass sweep down
    return entry * 0.75


def underwater_loop(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # muffled, pressure-y bed
    x = lowpass(noise(n), 400) * 0.35
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.3 * t)
    # distant whale-ish moan
    f = 60 + 20 * np.sin(2 * np.pi * 0.2 * t)
    x += np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.08
    return _seamless(x, fade_s=0.8) * 0.7


def sonar_ping():
    m = int(1.5 * SR)
    t = np.arange(m) / SR
    ping = np.sin(2 * np.pi * 1800 * t) * _env_decay(m, 12) * 0.5
    ping += np.sin(2 * np.pi * 3600 * t) * _env_decay(m, 18) * 0.2
    return ping * 0.7


def bubbles(dur=1.2):
    n = int(dur * SR)
    out = np.zeros(n)
    for b in _rng.uniform(0, dur - 0.1, 20):
        m = int(0.08 * SR)
        t = np.arange(m) / SR
        f = _rng.uniform(600, 1800)
        blub = np.sin(2 * np.pi * (f + 400 * t) * t) * _env_decay(m, 60) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += blub
    return lowpass(out, 2500) * 0.8


# ---------------------------------------------------------------- climbing
def rock_scrape(dur=0.7):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = lowpass(noise(n), 1800) * 0.4
    x *= 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 2.2 * t))
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def rope_tighten():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    f = 150 + 100 * (t / 0.6)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.5 + 0.5 * np.sin(2 * np.pi * 6 * t)) * 0.35
    return x * np.sin(np.pi * np.minimum(t / 0.6, 1.0)) * 0.7


def piton_hammer():
    out = np.zeros(int(1.4 * SR))
    for i, off in enumerate((0.0, 0.35, 0.7, 1.05)):
        m = int(0.09 * SR)
        t = np.arange(m) / SR
        hit = np.sin(2 * np.pi * 2800 * t) * _env_decay(m, 90) * 0.4
        hit += lowpass(noise(m), 4000) * _env_decay(m, 95) * 0.3
        s = int(off * SR)
        out[s:s + m] += hit * (1.0 - i * 0.07)
    return out * 0.7


# ---------------------------------------------------------------- heavy doors
def portcullis(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # grinding iron gate descending
    grind = lowpass(noise(n), 900) * 0.45 * np.minimum(t / 1.6, 1.0)
    grind *= 0.6 + 0.4 * np.sin(2 * np.pi * 3 * t)
    # final slam
    sm = int(0.4 * SR)
    slam = lowpass(noise(sm), 500) * _env_decay(sm, 18) * 0.9
    slam += np.sin(2 * np.pi * 70 * np.arange(sm) / SR) * _env_decay(sm, 22) * 0.5
    out = grind
    s = int(1.6 * SR)
    out[s:s + sm] += slam
    return out * 0.8


def gate_creak_big(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 70 + 50 * np.sin(2 * np.pi * 0.5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.5 + 0.5 * np.sin(2 * np.pi * 2.5 * t)) * 0.4
    x += lowpass(noise(n), 400) * 0.15
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.75


def lock_clunk_heavy():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # big tumblers
    out = np.zeros(m)
    for i, off in enumerate((0.0, 0.12, 0.24)):
        cm = int(0.08 * SR)
        clunk = lowpass(noise(cm), 900) * _env_decay(cm, 70) * 0.6
        clunk += np.sin(2 * np.pi * 180 * np.arange(cm) / SR) * _env_decay(cm, 80) * 0.3
        s = int(off * SR)
        out[s:s + cm] += clunk * (1.0 - i * 0.15)
    return out * 0.8


# ---------------------------------------------------------------- signals
def drum_war_loop(dur=3.0):
    n = int(dur * SR)
    out = np.zeros(n)
    # war drum pattern: boom-boom-CRACK
    pattern = [(0.0, 90, 1.0), (0.4, 90, 0.8), (0.8, 200, 1.0)]
    for start in np.arange(0, dur, 1.2):
        for off, f, v in pattern:
            m = int(0.35 * SR)
            t = np.arange(m) / SR
            hit = np.sin(2 * np.pi * f * t) * _env_decay(m, 25) * 0.6 * v
            hit += lowpass(noise(m), 600) * _env_decay(m, 30) * 0.4 * v
            s = int((start + off) * SR)
            if s + m < n:
                out[s:s + m] += hit
    return _seamless(out, fade_s=0.4) * 0.8


def trumpet_charge(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rising cavalry charge call
    notes = [(0.0, 392, 0.4), (0.4, 523, 0.4), (0.8, 659, 0.8)]
    out = np.zeros(n)
    for off, f, dur_n in notes:
        m = int(dur_n * SR)
        bt = np.arange(m) / SR
        x = np.sin(2 * np.pi * f * bt) * 0.45 + np.sin(2 * np.pi * f * 2 * bt) * 0.15
        x *= np.minimum(bt / 0.05, 1.0) * np.minimum((dur_n - bt) / 0.1, 1.0)
        s = int(off * SR)
        out[s:s + m] += x
    return out * 0.75


def bell_alarm():
    out = np.zeros(int(2.0 * SR))
    for i, off in enumerate((0.0, 0.5, 1.0, 1.5)):
        m = int(0.4 * SR)
        t = np.arange(m) / SR
        x = np.sin(2 * np.pi * 1240 * t) * _env_decay(m, 35) * 0.45
        x += np.sin(2 * np.pi * 1860 * t) * _env_decay(m, 45) * 0.2
        s = int(off * SR)
        out[s:s + m] += x
    return out * 0.7


# ---------------------------------------------------------------- nature hazards
def avalanche(dur=5.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # building roar
    env = np.minimum(t / 2.5, 1.0) * np.exp(-np.maximum(t - 3.5, 0) * 3)
    x = lowpass(noise(n), 700) * env * 0.7
    # cracking ice
    for b in _rng.uniform(0, 2.0, 8):
        m = int(0.2 * SR)
        crack = highpass(noise(m), 2000) * _env_decay(m, 30) * _rng.uniform(0.2, 0.5)
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += crack
    return x * 0.8


def rockslide(dur=3.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.minimum(t / 1.0, 1.0) * np.exp(-np.maximum(t - 2.5, 0) * 4)
    x = lowpass(noise(n), 1500) * env * 0.6
    for b in _rng.uniform(0, dur - 0.5, 20):
        m = int(0.12 * SR)
        clack = lowpass(noise(m), 3000) * _env_decay(m, 40) * _rng.uniform(0.15, 0.4)
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += clack
    return x * 0.8


def geyser(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pressure build + eruption
    build = lowpass(noise(n), 600) * 0.3 * np.minimum(t / 1.5, 1.0)
    em = int(1.0 * SR)
    erupt = highpass(lowpass(noise(em), 5000), 1500) * 0.6 * np.sin(np.pi * np.arange(em) / em)
    out = build
    s = int(1.5 * SR)
    out[s:s + em] += erupt
    return out * 0.75


SFX7 = [
    ("water/dive-splash", dive_splash, "diving entry splash"),
    ("water/underwater-loop", underwater_loop, "underwater ambience loop"),
    ("water/sonar-ping", sonar_ping, "sonar ping"),
    ("water/bubbles", bubbles, "underwater bubbles"),
    ("climb/rock-scrape", rock_scrape, "rock climbing scrape"),
    ("climb/rope-tighten", rope_tighten, "rope tightening"),
    ("climb/piton-hammer", piton_hammer, "piton hammering"),
    ("door/portcullis", portcullis, "portcullis descending + slam"),
    ("door/gate-creak-big", gate_creak_big, "massive gate creak"),
    ("door/lock-clunk-heavy", lock_clunk_heavy, "heavy lock tumblers"),
    ("signal/drum-war-loop", drum_war_loop, "war drum loop"),
    ("signal/trumpet-charge", trumpet_charge, "trumpet charge call"),
    ("signal/bell-alarm", bell_alarm, "alarm bells"),
    ("nature/avalanche", avalanche, "avalanche roar"),
    ("nature/rockslide", rockslide, "rockslide"),
    ("nature/geyser", geyser, "geyser eruption"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX7:
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
    with open(os.path.join(OUT, "sfx7-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX7:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
