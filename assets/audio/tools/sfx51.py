"""Procedural SFX batch 51 for the Bannerlord-clone (round 50).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx51.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx51")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx51-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(515151)


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
def fore_top(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fore top: forward platform
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.26, 0.25):
        m = int(0.18 * SR)
        creak = np.sin(2 * np.pi * 191 * np.arange(m) / SR) * _env_decay(m, 35) * 0.21
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.61


def stoat(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stoat: quick chirps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.07, 0.08):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 3000 + 950 * np.sin(2 * np.pi * 16 * mt)
        chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.14 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chirp
    return out * 0.55


# ---------------------------------------------------------------- weather / horror
def solano(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # solano: hot easterly
    x = highpass(lowpass(noise(n), 3200), 520) * 0.41
    x *= 0.55 + 0.45 * np.sin(2 * np.pi * 0.24 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def kelpie2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # kelpie: second variant
    out = np.zeros(n)
    for f in (180, 270, 360):
        fmod = f + 70 * np.sin(2 * np.pi * 0.5 * t)
        voice = np.sin(np.cumsum(2 * np.pi * fmod / SR)) * 0.11
        voice *= np.sin(np.pi * np.minimum(t / dur, 1.0))
        out += voice
    return out * 0.62


# ---------------------------------------------------------------- tavern / farm
def nine_pins2(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # nine pins: second variant
    out = np.zeros(n)
    # roll
    rm = int(0.38 * SR)
    roll = lowpass(noise(rm), 720) * 0.31 * np.sin(np.pi * np.arange(rm) / rm)
    out[:rm] += roll
    # pins
    for b in _rng.uniform(0.45, 1.25, 5):
        m = int(0.1 * SR)
        pin = np.sin(2 * np.pi * 960 * np.arange(m) / SR) * _env_decay(m, 58) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pin
    return out * 0.63


def poult_peeps5(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.055, 0.04):
        m = int(0.032 * SR)
        mt = np.arange(m) / SR
        f = 4000 + 780 * np.sin(2 * np.pi * 18 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12 * np.sin(np.pi * mt / 0.032)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.54


# ---------------------------------------------------------------- mine / forge
def stoping(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stoping: overhead mining
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.48, 0.52):
        m = int(0.4 * SR)
        work = lowpass(noise(m), 850) * 0.33 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.62


def tilt_hammer(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # tilt hammer: forge hammer
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.22, 0.36):
        m = int(0.18 * SR)
        hammer = lowpass(noise(m), 1600) * _env_decay(m, 58) * 0.42
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += hammer
    return out * 0.68


# ---------------------------------------------------------------- kitchen / stable
def posset_stir():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # posset: stirred
    stir = lowpass(noise(m), 1250) * 0.24 * np.sin(np.pi * np.minimum(t / 0.7, 1.0))
    stir *= 0.7 + 0.3 * np.sin(2 * np.pi * 3 * t)
    return stir * 0.6


def feed_bin():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # grain bin: lid opened (renamed from feed-bin, taken by batch 38)
    out = np.zeros(m)
    # creak
    cm = int(0.2 * SR)
    creak = np.sin(2 * np.pi * 320 * np.arange(cm) / SR) * _env_decay(cm, 42) * 0.18
    out[:cm] += creak
    # grain
    gm = int(0.28 * SR)
    grain = highpass(lowpass(noise(gm), 3300), 1350) * 0.24 * np.sin(np.pi * np.arange(gm) / gm)
    s = int(0.2 * SR)
    out[s:s + gm] += grain
    return out * 0.61


# ---------------------------------------------------------------- ritual / combat
def extreme_unction2(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # extreme unction: second variant
    out = np.zeros(n)
    for f in (110, 165, 220):
        out += np.sin(2 * np.pi * f * t) * 0.06
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.62


def demi_culverin(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # demi-culverin: medium gun
    out = np.zeros(n)
    # blast
    bm = int(0.22 * SR)
    blast = lowpass(noise(bm), 1600) * _env_decay(bm, 50) * 0.52
    out[:bm] += blast
    # tail
    tm = int(0.45 * SR)
    tail = lowpass(noise(tm), 650) * _env_decay(tm, 30) * 0.26
    s = int(0.18 * SR)
    out[s:s + tm] += tail
    return out * 0.69


# ---------------------------------------------------------------- foley / misc
def buskin_step4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # buskins: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.16, 0.29):
        m = int(0.11 * SR)
        step = lowpass(highpass(noise(m), 450), 2000) * _env_decay(m, 68) * 0.26
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.59


def octant2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # octant: second variant
    oct_ = np.sin(2 * np.pi * 1820 * t) * _env_decay(m, 56) * 0.14
    oct_ += np.sin(2 * np.pi * 2730 * t) * _env_decay(m, 69) * 0.07
    return oct_ * 0.58


def sigint_burst(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # SIGINT: intercepted burst
    f = 1500 + 800 * np.sin(2 * np.pi * 1.3 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 4.1 * t))
    # burst envelope
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0)) ** 0.5
    return x * 0.57


SFX51 = [
    ("naval/fore-top", fore_top, "fore top"),
    ("animal/stoat", stoat, "stoat chirp"),
    ("weather/solano", solano, "solano wind"),
    ("horror/kelpie2", kelpie2, "kelpie spirit"),
    ("tavern/nine-pins2", nine_pins2, "nine pins"),
    ("farm/poult-peeps5", poult_peeps5, "poult peeps"),
    ("mine/stoping", stoping, "stoping work"),
    ("forge/tilt-hammer", tilt_hammer, "tilt hammer"),
    ("kitchen/posset-stir", posset_stir, "posset stirred"),
    ("stable/grain-bin", feed_bin, "grain bin"),
    ("ritual/extreme-unction2", extreme_unction2, "extreme unction"),
    ("combat/demi-cannon", demi_culverin, "demi-cannon fired"),
    ("foley/buskin-step4", buskin_step4, "buskins stepping"),
    ("misc/octant2", octant2, "octant sight"),
    ("modern/sigint-burst", sigint_burst, "SIGINT burst"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX51:
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
    with open(os.path.join(OUT, "sfx51-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX51:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
