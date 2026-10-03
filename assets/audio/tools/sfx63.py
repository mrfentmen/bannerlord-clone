"""Procedural SFX batch 63 for the Bannerlord-clone (round 62).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx63.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx63")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx63-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(636363)


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
def jib_sail2(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # jib: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 1980), 710) * _env_decay(m, 40) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.55


def sable2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sable: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.046, 0.05):
        m = int(0.028 * SR)
        mt = np.arange(m) / SR
        f = 3200 + 900 * np.sin(2 * np.pi * 26 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.028)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.5


# ---------------------------------------------------------------- weather / horror
def simoom2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # simoom: second variant
    x = highpass(lowpass(noise(n), 2200), 400) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.12 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def headless_rider(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # headless rider: hooves in fog
    out = np.zeros(n)
    # hooves
    for b in np.arange(0.1, dur - 0.4, 0.45):
        m = int(0.12 * SR)
        hoof = lowpass(highpass(noise(m), 800), 2800) * _env_decay(m, 55) * 0.28
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += hoof
    # low drone
    out += np.sin(2 * np.pi * 65 * t) * 0.06 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.6


# ---------------------------------------------------------------- tavern / farm
def lantern2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lantern: second variant
    out = np.zeros(n)
    # strike
    sm = int(0.08 * SR)
    strike = highpass(noise(sm), 3200) * _env_decay(sm, 80) * 0.14
    out[:sm] += strike
    # glow hum
    hm = int(0.6 * SR)
    hum = np.sin(2 * np.pi * 120 * np.arange(hm) / SR) * 0.06 * np.sin(np.pi * np.arange(hm) / hm)
    s = int(0.1 * SR)
    out[s:s + hm] += hum
    return out * 0.54


def gosling_calls3(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.03, 0.02):
        m = int(0.014 * SR)
        mt = np.arange(m) / SR
        f = 4300 + 720 * np.sin(2 * np.pi * 29 * mt)
        call = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.014)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += call
    return out * 0.46


# ---------------------------------------------------------------- mine / forge
def bord_work2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bord: second variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.42, 0.47):
        m = int(0.35 * SR)
        work = lowpass(noise(m), 720) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.59


def chafery3(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chafery: third variant
    x = lowpass(noise(n), 510) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.3 * t)
    return _seamless(x, fade_s=0.6) * 0.62


# ---------------------------------------------------------------- kitchen / stable
def posset_stir3():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # posset: third stir variant
    stir = lowpass(noise(m), 1180) * 0.22 * np.sin(np.pi * np.minimum(t / 0.7, 1.0))
    stir *= 0.68 + 0.32 * np.sin(2 * np.pi * 3.4 * t)
    return stir * 0.56


def grain_bin2():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # grain bin: second variant
    pour = highpass(lowpass(noise(m), 2900), 1100) * 0.22 * np.sin(np.pi * np.minimum(t / 0.55, 1.0))
    return pour * 0.58


# ---------------------------------------------------------------- ritual / combat
def prime2(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # prime: second variant
    out = np.zeros(n)
    for f in (115, 172, 230):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.55


def falconet2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # falconet: second variant
    out = np.zeros(n)
    # crack
    cm = int(0.16 * SR)
    crack = lowpass(noise(cm), 2000) * _env_decay(cm, 60) * 0.43
    out[:cm] += crack
    # tail
    tm = int(0.44 * SR)
    tail = lowpass(noise(tm), 700) * _env_decay(tm, 32) * 0.23
    s = int(0.13 * SR)
    out[s:s + tm] += tail
    return out * 0.64


# ---------------------------------------------------------------- foley / misc
def pattens7(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: seventh variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.27):
        m = int(0.07 * SR)
        step = lowpass(highpass(noise(m), 460), 2100) * _env_decay(m, 79) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.53


def cross_staff3():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # cross-staff: third variant
    cs = np.sin(2 * np.pi * 2180 * t) * _env_decay(m, 64) * 0.11
    cs += np.sin(2 * np.pi * 3270 * t) * _env_decay(m, 77) * 0.05
    return cs * 0.52


def osint_scrape(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # OSINT: data scrape
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.26, 0.48):
        m = int(0.18 * SR)
        mt = np.arange(m) / SR
        scrape = np.sin(2 * np.pi * 1550 * mt) * _env_decay(m, 34) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += scrape
    return out * 0.57


SFX63 = [
    ("naval/jib-sail2", jib_sail2, "jib sail"),
    ("animal/sable2", sable2, "sable chatter"),
    ("weather/simoom2", simoom2, "simoom wind"),
    ("horror/headless-rider", headless_rider, "headless rider"),
    ("tavern/lantern2", lantern2, "lantern lit"),
    ("farm/gosling-calls3", gosling_calls3, "gosling calls"),
    ("mine/bord-work2", bord_work2, "bord work"),
    ("forge/chafery3", chafery3, "chafery fire"),
    ("kitchen/posset-stir3", posset_stir3, "posset stirred"),
    ("stable/grain-bin2", grain_bin2, "grain bin"),
    ("ritual/prime2", prime2, "prime prayer"),
    ("combat/falconet2", falconet2, "falconet fired"),
    ("foley/pattens7", pattens7, "pattens stepping"),
    ("misc/cross-staff3", cross_staff3, "cross-staff sight"),
    ("modern/osint-scrape", osint_scrape, "OSINT scrape"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX63:
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
    with open(os.path.join(OUT, "sfx63-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX63:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
