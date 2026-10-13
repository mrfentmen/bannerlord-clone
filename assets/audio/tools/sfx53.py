"""Procedural SFX batch 53 for the Bannerlord-clone (round 52).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx53.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx53")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx53-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(535353)


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
def royal_sail(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # royal sail: highest sail
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.28, 0.27):
        m = int(0.2 * SR)
        flap = highpass(lowpass(noise(m), 2800), 700) * _env_decay(m, 32) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.6


def mink(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mink: chattering
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.07, 0.08):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 3200 + 900 * np.sin(2 * np.pi * 17 * mt)
        chit = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.14 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.54


# ---------------------------------------------------------------- weather / horror
def bora2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bora: second variant
    x = highpass(lowpass(noise(n), 3000), 500) * 0.43
    x *= 0.53 + 0.47 * np.sin(2 * np.pi * 0.22 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def gan_ceann(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gan ceann: headless rider
    out = np.zeros(n)
    # hooves
    for b in np.arange(0.1, dur - 0.2, 0.35):
        m = int(0.12 * SR)
        hoof = lowpass(noise(m), 900) * _env_decay(m, 48) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += hoof
    # wail
    f = 600 - 250 * np.sin(2 * np.pi * 0.4 * t)
    wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.1
    wail *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += wail
    return out * 0.63


# ---------------------------------------------------------------- tavern / farm
def drink_round(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # drink round: mugs clinked
    out = np.zeros(n)
    for b in _rng.uniform(0.1, 1.0, 5):
        m = int(0.14 * SR)
        clink = np.sin(2 * np.pi * 1600 * np.arange(m) / SR) * _env_decay(m, 52) * 0.17
        clink += np.sin(2 * np.pi * 2400 * np.arange(m) / SR) * _env_decay(m, 65) * 0.09
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clink
    return out * 0.6


def gosling_peeps2(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.06, 0.04):
        m = int(0.032 * SR)
        mt = np.arange(m) / SR
        f = 4200 + 740 * np.sin(2 * np.pi * 20 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.032)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.52


# ---------------------------------------------------------------- mine / forge
def underhand_stoping(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # underhand stoping: downward mining
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.44, 0.48):
        m = int(0.36 * SR)
        work = lowpass(noise(m), 780) * 0.35 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.6


def chafery2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chafery: second variant
    x = lowpass(noise(n), 680) * 0.4
    x *= 0.66 + 0.34 * np.sin(2 * np.pi * 0.44 * t)
    return _seamless(x, fade_s=0.6) * 0.64


# ---------------------------------------------------------------- kitchen / stable
def flummery2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # flummery: second variant
    simmer = lowpass(noise(m), 1100) * 0.24 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    simmer *= 0.7 + 0.3 * np.sin(2 * np.pi * 2.5 * t)
    return simmer * 0.59


def straw_mattress():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # straw mattress: bedding fluffed
    fluff = highpass(lowpass(noise(m), 3200), 1200) * 0.25 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return fluff * 0.61


# ---------------------------------------------------------------- ritual / combat
def te_deum(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # Te Deum: hymn of praise
    out = np.zeros(n)
    for f in (130, 195, 260):
        out += np.sin(2 * np.pi * f * t) * 0.07
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.63


def saker_blast(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # saker: medium cannon blast
    out = np.zeros(n)
    # blast
    bm = int(0.22 * SR)
    blast = lowpass(noise(bm), 1450) * _env_decay(bm, 47) * 0.53
    out[:bm] += blast
    # rumble
    rm = int(0.48 * SR)
    rumble = lowpass(noise(rm), 580) * _env_decay(rm, 27) * 0.28
    s = int(0.18 * SR)
    out[s:s + rm] += rumble
    return out * 0.69


# ---------------------------------------------------------------- foley / misc
def pattens_step4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.16, 0.3):
        m = int(0.1 * SR)
        step = lowpass(highpass(noise(m), 500), 2200) * _env_decay(m, 69) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.58


def traverse_board2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # traverse board: second variant
    peg = np.sin(2 * np.pi * 2100 * t) * _env_decay(m, 58) * 0.13
    peg += np.sin(2 * np.pi * 3150 * t) * _env_decay(m, 71) * 0.06
    return peg * 0.57


def uav_link(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # UAV: data link
    f = 1400 + 700 * np.sin(2 * np.pi * 0.6 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 2.5 * t))
    return _seamless(x, fade_s=0.4) * 0.57


SFX53 = [
    ("naval/royal-sail", royal_sail, "royal sail"),
    ("animal/mink", mink, "mink chatter"),
    ("weather/bora2", bora2, "bora wind"),
    ("horror/gan-ceann", gan_ceann, "gan ceann rider"),
    ("tavern/drink-round", drink_round, "drink round"),
    ("farm/gosling-peeps2", gosling_peeps2, "gosling peeps"),
    ("mine/underhand-stoping", underhand_stoping, "underhand stoping"),
    ("forge/chafery2", chafery2, "chafery fire"),
    ("kitchen/flummery2", flummery2, "flummery simmer"),
    ("stable/straw-mattress", straw_mattress, "straw mattress"),
    ("ritual/te-deum", te_deum, "Te Deum hymn"),
    ("combat/saker-blast", saker_blast, "saker blast"),
    ("foley/pattens-step4", pattens_step4, "pattens stepping"),
    ("misc/traverse-board2", traverse_board2, "traverse board"),
    ("modern/uav-link", uav_link, "UAV link"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX53:
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
    with open(os.path.join(OUT, "sfx53-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX53:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
