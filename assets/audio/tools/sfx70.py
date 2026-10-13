"""Procedural SFX batch 70 for the Bannerlord-clone (round 69).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx70.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx70")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx70-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(707070)


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
def jib_sail3(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # jib: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.23, 0.23):
        m = int(0.16 * SR)
        flap = highpass(lowpass(noise(m), 1960), 680) * _env_decay(m, 43) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.54


def sable3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sable: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.036, 0.038):
        m = int(0.022 * SR)
        mt = np.arange(m) / SR
        f = 3200 + 900 * np.sin(2 * np.pi * 26 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.022)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.47


# ---------------------------------------------------------------- weather / horror
def simoom3(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # simoom: third variant
    x = highpass(lowpass(noise(n), 2080), 390) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.11 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def headless_rider2(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # headless rider: second variant
    out = np.zeros(n)
    # hooves
    for b in np.arange(0.1, dur - 0.38, 0.43):
        m = int(0.11 * SR)
        hoof = lowpass(highpass(noise(m), 780), 2700) * _env_decay(m, 56) * 0.27
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += hoof
    # low drone
    out += np.sin(2 * np.pi * 63 * t) * 0.058 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.59


# ---------------------------------------------------------------- tavern / farm
def lantern3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lantern: third variant
    out = np.zeros(n)
    # strike
    sm = int(0.075 * SR)
    strike = highpass(noise(sm), 3100) * _env_decay(sm, 82) * 0.135
    out[:sm] += strike
    # glow hum
    hm = int(0.58 * SR)
    hum = np.sin(2 * np.pi * 118 * np.arange(hm) / SR) * 0.058 * np.sin(np.pi * np.arange(hm) / hm)
    s = int(0.095 * SR)
    out[s:s + hm] += hum
    return out * 0.53


def gosling_calls6(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.018, 0.012):
        m = int(0.007 * SR)
        mt = np.arange(m) / SR
        f = 3600 + 860 * np.sin(2 * np.pi * 36 * mt)
        call = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.007)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += call
    return out * 0.4


# ---------------------------------------------------------------- mine / forge
def bord_work4(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bord: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.37, 0.42):
        m = int(0.3 * SR)
        work = lowpass(noise(m), 670) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.57


def chafery4(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chafery: fourth variant
    x = lowpass(noise(n), 490) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.25 * t)
    return _seamless(x, fade_s=0.6) * 0.61


# ---------------------------------------------------------------- kitchen / stable
def posset_stir5():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # posset: fifth stir variant
    stir = lowpass(noise(m), 1140) * 0.2 * np.sin(np.pi * np.minimum(t / 0.7, 1.0))
    stir *= 0.68 + 0.32 * np.sin(2 * np.pi * 3.8 * t)
    return stir * 0.54


def grain_bin3():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # grain bin: third variant
    pour = highpass(lowpass(noise(m), 2850), 1080) * 0.21 * np.sin(np.pi * np.minimum(t / 0.55, 1.0))
    return pour * 0.57


# ---------------------------------------------------------------- ritual / combat
def prime3(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # prime: third variant
    out = np.zeros(n)
    for f in (108, 162, 216):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.52


def falconet3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # falconet: third variant
    out = np.zeros(n)
    # crack
    cm = int(0.15 * SR)
    crack = lowpass(noise(cm), 1950) * _env_decay(cm, 62) * 0.42
    out[:cm] += crack
    # tail
    tm = int(0.42 * SR)
    tail = lowpass(noise(tm), 680) * _env_decay(tm, 33) * 0.22
    s = int(0.12 * SR)
    out[s:s + tm] += tail
    return out * 0.63


# ---------------------------------------------------------------- foley / misc
def pattens8(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: eighth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.2):
        m = int(0.055 * SR)
        step = lowpass(highpass(noise(m), 320), 1400) * _env_decay(m, 86) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.47


def cross_staff5():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # cross-staff: fifth variant
    cs = np.sin(2 * np.pi * 2100 * t) * _env_decay(m, 67) * 0.11
    cs += np.sin(2 * np.pi * 3150 * t) * _env_decay(m, 80) * 0.05
    return cs * 0.5


def osint_scrape2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # OSINT: second scrape variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.24, 0.46):
        m = int(0.16 * SR)
        mt = np.arange(m) / SR
        scrape = np.sin(2 * np.pi * 1520 * mt) * _env_decay(m, 35) * 0.19
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += scrape
    return out * 0.56


SFX70 = [
    ("naval/jib-sail3", jib_sail3, "jib sail"),
    ("animal/sable3", sable3, "sable chatter"),
    ("weather/simoom3", simoom3, "simoom wind"),
    ("horror/headless-rider2", headless_rider2, "headless rider"),
    ("tavern/lantern3", lantern3, "lantern lit"),
    ("farm/gosling-calls6", gosling_calls6, "gosling calls"),
    ("mine/bord-work4", bord_work4, "bord work"),
    ("forge/chafery4", chafery4, "chafery fire"),
    ("kitchen/posset-stir5", posset_stir5, "posset stirred"),
    ("stable/grain-bin3", grain_bin3, "grain bin"),
    ("ritual/prime3", prime3, "prime prayer"),
    ("combat/falconet3", falconet3, "falconet fired"),
    ("foley/pattens8", pattens8, "pattens stepping"),
    ("misc/cross-staff5", cross_staff5, "cross-staff sight"),
    ("modern/osint-scrape2", osint_scrape2, "OSINT scrape"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX70:
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
    with open(os.path.join(OUT, "sfx70-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX70:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
