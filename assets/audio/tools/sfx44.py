"""Procedural SFX batch 44 for the Bannerlord-clone (round 43).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx44.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx44")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx44-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(444444)


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
def leeboard(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # leeboard: pivoting board
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.3, 0.35):
        m = int(0.25 * SR)
        creak = np.sin(2 * np.pi * 175 * np.arange(m) / SR) * _env_decay(m, 33) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.62


def badger(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # badger: growl + snuffle
    out = np.zeros(n)
    # growl
    f = 110 + 30 * np.sin(2 * np.pi * 1.5 * t)
    growl = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.22
    growl *= np.minimum(t / 0.1, 1.0) * np.exp(-np.maximum(t - dur + 0.3, 0) * 5)
    out += growl
    # snuffle
    for b in np.arange(0.5, dur - 0.08, 0.14):
        m = int(0.06 * SR)
        snuf = lowpass(noise(m), 1200) * _env_decay(m, 80) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += snuf
    return out * 0.62


# ---------------------------------------------------------------- weather / horror
def simoom(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # simoom: hot arabian wind
    x = highpass(lowpass(noise(n), 4000), 600) * 0.37
    x *= 0.62 + 0.38 * np.sin(2 * np.pi * 0.31 * t)
    grit = highpass(noise(n), 5400) * 0.05
    x += grit
    return _seamless(x, fade_s=0.6) * 0.64


def wight_wail(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wight: barrow wail
    f = 380 - 160 * np.sin(2 * np.pi * 0.55 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.22
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 1.6 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.64


# ---------------------------------------------------------------- tavern / farm
def quoit_pitch():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # quoits: ring tossed
    out = np.zeros(m)
    # throw whoosh
    wm = int(0.25 * SR)
    whoosh = highpass(lowpass(noise(wm), 3800), 900) * 0.22 * np.sin(np.pi * np.arange(wm) / wm)
    out[:wm] += whoosh
    # ring clank
    cm = int(0.18 * SR)
    clank = np.sin(2 * np.pi * 1600 * np.arange(cm) / SR) * _env_decay(cm, 58) * 0.2
    s = int(0.35 * SR)
    out[s:s + cm] += clank
    return out * 0.6


def gosling_peeps3(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: bright peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.11):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2700 + 640 * np.sin(2 * np.pi * 8 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def sump_pump(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sump pump: water lifted
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.5, 0.55):
        m = int(0.45 * SR)
        pump = lowpass(noise(m), 900) * 0.32 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pump
    return out * 0.64


def chafery(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chafery: reheating furnace
    x = lowpass(noise(n), 750) * 0.38
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.48 * t)
    return _seamless(x, fade_s=0.6) * 0.66


# ---------------------------------------------------------------- kitchen / stable
def posset_bowl():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # posset: bowl passed
    out = np.zeros(m)
    # slosh
    sm = int(0.3 * SR)
    slosh = lowpass(noise(sm), 1600) * 0.26 * np.sin(np.pi * np.arange(sm) / sm)
    out[:sm] += slosh
    # bowl set down
    tm = int(0.12 * SR)
    thud = lowpass(noise(tm), 800) * _env_decay(tm, 60) * 0.24
    s = int(0.38 * SR)
    out[s:s + tm] += thud
    return out * 0.6


def harness():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # harness: straps + buckles
    out = np.zeros(m)
    # leather
    lm = int(0.35 * SR)
    leather = highpass(lowpass(noise(lm), 3200), 850) * 0.24 * np.sin(np.pi * np.arange(lm) / lm)
    out[:lm] += leather
    # buckle
    for b in (0.4, 0.6):
        sm = int(0.08 * SR)
        buckle = np.sin(2 * np.pi * 2200 * np.arange(sm) / SR) * _env_decay(sm, 78) * 0.14
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += buckle
    return out * 0.6


# ---------------------------------------------------------------- ritual / combat
def extreme_unction(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # extreme unction: final blessing
    out = np.zeros(n)
    for f in (82.4, 123.5, 164.8):
        out += np.sin(2 * np.pi * f * t) * 0.075
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.64


def serpentine_fire(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # serpentine: early hand cannon
    out = np.zeros(n)
    # crack
    cm = int(0.19 * SR)
    crack = lowpass(noise(cm), 1750) * _env_decay(cm, 56) * 0.5
    out[:cm] += crack
    # smoke sizzle
    sm = int(0.5 * SR)
    sizzle = highpass(noise(sm), 3800) * _env_decay(sm, 35) * 0.18
    s = int(0.16 * SR)
    out[s:s + sm] += sizzle
    return out * 0.68


# ---------------------------------------------------------------- foley / misc
def clog_step2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: alternate step
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.17, 0.34):
        m = int(0.13 * SR)
        step = lowpass(highpass(noise(m), 730), 3650) * _env_decay(m, 70) * 0.28
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.62


def hour_line():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # hour line: sundial marking
    tick = np.sin(2 * np.pi * 2000 * t) * _env_decay(m, 65) * 0.16
    return tick * 0.58


def counter_drone(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # counter-drone: defense pulse
    f = 2000 + 800 * np.sin(2 * np.pi * 1.8 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 3.5 * t))
    return _seamless(x, fade_s=0.4) * 0.58


SFX44 = [
    ("naval/leeboard", leeboard, "leeboard pivoting"),
    ("animal/badger", badger, "badger growling"),
    ("weather/simoom", simoom, "simoom wind"),
    ("horror/wight-wail", wight_wail, "wight wailing"),
    ("tavern/quoit-pitch", quoit_pitch, "quoits pitched"),
    ("farm/gosling-peeps3", gosling_peeps3, "gosling peeps"),
    ("mine/sump-pump", sump_pump, "sump pump"),
    ("forge/chafery", chafery, "chafery furnace"),
    ("kitchen/posset-bowl", posset_bowl, "posset bowl"),
    ("stable/harness", harness, "harness fitted"),
    ("ritual/extreme-unction", extreme_unction, "extreme unction"),
    ("combat/serpentine-fire", serpentine_fire, "serpentine fired"),
    ("foley/clog-step2", clog_step2, "clogs stepping"),
    ("misc/hour-line", hour_line, "hour line tick"),
    ("modern/counter-drone", counter_drone, "counter-drone pulse"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX44:
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
    with open(os.path.join(OUT, "sfx44-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX44:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
