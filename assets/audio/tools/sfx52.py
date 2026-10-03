"""Procedural SFX batch 52 for the Bannerlord-clone (round 51).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx52.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx52")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx52-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(525252)


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
def spritsail(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # spritsail: fore-and-aft rig
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.27, 0.26):
        m = int(0.19 * SR)
        creak = np.sin(2 * np.pi * 186 * np.arange(m) / SR) * _env_decay(m, 34) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.61


def weasel2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # weasel: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.09):
        m = int(0.055 * SR)
        mt = np.arange(m) / SR
        f = 3100 + 920 * np.sin(2 * np.pi * 15 * mt)
        chit = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.14 * np.sin(np.pi * mt / 0.055)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.55


# ---------------------------------------------------------------- weather / horror
def mistral2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mistral: second variant
    x = highpass(lowpass(noise(n), 3100), 510) * 0.42
    x *= 0.54 + 0.46 * np.sin(2 * np.pi * 0.23 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def banshee2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # banshee: second variant
    f = 750 - 300 * np.sin(2 * np.pi * 0.42 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 2.1 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.6


# ---------------------------------------------------------------- tavern / farm
def quoits2(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # quoits: second variant
    out = np.zeros(n)
    # throw
    tm = int(0.32 * SR)
    throw = highpass(lowpass(noise(tm), 3400), 950) * 0.25 * np.sin(np.pi * np.arange(tm) / tm)
    out[:tm] += throw
    # rings
    for b in _rng.uniform(0.45, 1.25, 4):
        m = int(0.12 * SR)
        ring = np.sin(2 * np.pi * 1450 * np.arange(m) / SR) * _env_decay(m, 60) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += ring
    return out * 0.62


def chick_peeps8(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: eighth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.05, 0.035):
        m = int(0.028 * SR)
        mt = np.arange(m) / SR
        f = 4100 + 760 * np.sin(2 * np.pi * 19 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12 * np.sin(np.pi * mt / 0.028)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.53


# ---------------------------------------------------------------- mine / forge
def overhand_stoping(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # overhand stoping: upward mining
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.46, 0.5):
        m = int(0.38 * SR)
        work = lowpass(noise(m), 800) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.61


def helve_hammer(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # helve hammer: water-powered
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.2, 0.34):
        m = int(0.16 * SR)
        hammer = lowpass(noise(m), 1700) * _env_decay(m, 60) * 0.43
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += hammer
    return out * 0.67


# ---------------------------------------------------------------- kitchen / stable
def syllabub2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # syllabub: second variant
    whip = highpass(lowpass(noise(m), 3100), 1050) * 0.2 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    whip *= 0.7 + 0.3 * np.sin(2 * np.pi * 4 * t)
    return whip * 0.58


def manger2():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # manger: second variant
    munch = lowpass(noise(m), 950) * 0.26 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    munch *= 0.6 + 0.4 * np.sin(2 * np.pi * 5 * t)
    return munch * 0.6


# ---------------------------------------------------------------- ritual / combat
def absolution2(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # absolution: second variant
    out = np.zeros(n)
    for f in (105, 158, 210):
        out += np.sin(2 * np.pi * f * t) * 0.065
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.62


def falconet_blast(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # falconet: light gun blast
    out = np.zeros(n)
    # blast
    bm = int(0.18 * SR)
    blast = lowpass(noise(bm), 1900) * _env_decay(bm, 55) * 0.48
    out[:bm] += blast
    # tail
    tm = int(0.38 * SR)
    tail = lowpass(noise(tm), 850) * _env_decay(tm, 36) * 0.24
    s = int(0.15 * SR)
    out[s:s + tm] += tail
    return out * 0.66


# ---------------------------------------------------------------- foley / misc
def clog_step4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.35):
        m = int(0.11 * SR)
        step = lowpass(highpass(noise(m), 680), 3500) * _env_decay(m, 69) * 0.27
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.6


def nocturnal2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nocturnal: second variant
    noc = np.sin(2 * np.pi * 1950 * t) * _env_decay(m, 57) * 0.14
    noc += np.sin(2 * np.pi * 2925 * t) * _env_decay(m, 70) * 0.07
    return noc * 0.57


def depth_ping(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # depth ping: underwater (renamed from sonar-ping, taken)
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.5, 0.8):
        m = int(0.4 * SR)
        mt = np.arange(m) / SR
        ping = np.sin(2 * np.pi * 1200 * mt) * _env_decay(m, 18) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += ping
    return out * 0.62


SFX52 = [
    ("naval/spritsail", spritsail, "spritsail rig"),
    ("animal/weasel2", weasel2, "weasel chitter"),
    ("weather/mistral2", mistral2, "mistral wind"),
    ("horror/banshee2", banshee2, "banshee wail"),
    ("tavern/quoits2", quoits2, "quoits game"),
    ("farm/chick-peeps8", chick_peeps8, "chick peeps"),
    ("mine/overhand-stoping", overhand_stoping, "overhand stoping"),
    ("forge/helve-hammer", helve_hammer, "helve hammer"),
    ("kitchen/syllabub2", syllabub2, "syllabub whipped"),
    ("stable/manger2", manger2, "manger munching"),
    ("ritual/absolution2", absolution2, "absolution prayer"),
    ("combat/falconet-blast", falconet_blast, "falconet blast"),
    ("foley/clog-step4", clog_step4, "clogs stepping"),
    ("misc/nocturnal2", nocturnal2, "nocturnal dial"),
    ("modern/depth-ping", depth_ping, "depth ping"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX52:
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
    with open(os.path.join(OUT, "sfx52-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX52:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
