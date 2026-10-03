"""Procedural SFX batch 47 for the Bannerlord-clone (round 46).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx47.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx47")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx47-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(474747)


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
def foremast(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # foremast: forward rigging
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.3, 0.31):
        m = int(0.23 * SR)
        creak = np.sin(2 * np.pi * 172 * np.arange(m) / SR) * _env_decay(m, 32) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.62


def marten(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # marten: chattering
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.1):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2800 + 950 * np.sin(2 * np.pi * 14 * mt)
        chit = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.56


# ---------------------------------------------------------------- weather / horror
def levant(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # levant: easterly wind
    x = highpass(lowpass(noise(n), 3600), 560) * 0.37
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.28 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def barghest(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # barghest: monstrous dog
    out = np.zeros(n)
    # growl
    f = 95 + 35 * np.sin(2 * np.pi * 1.1 * t)
    growl = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.24
    growl *= 0.5 + 0.5 * np.sin(2 * np.pi * 3 * t)
    out += growl
    # howl
    hf = 340 - 140 * np.sin(2 * np.pi * 0.6 * t)
    howl = np.sin(np.cumsum(2 * np.pi * hf / SR)) * 0.12
    howl *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += howl
    return out * 0.64


# ---------------------------------------------------------------- tavern / farm
def nine_holes(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # nine-holes: ball rolled
    out = np.zeros(n)
    # roll
    rm = int(0.55 * SR)
    roll = lowpass(noise(rm), 580) * 0.3 * np.sin(np.pi * np.arange(rm) / rm)
    out[:rm] += roll
    # holes
    for b in _rng.uniform(0.6, 1.2, 5):
        m = int(0.11 * SR)
        thud = lowpass(noise(m), 1100) * _env_decay(m, 62) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += thud
    return out * 0.64


def chick_peeps5(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: cheerful peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.07, 0.06):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 3600 + 780 * np.sin(2 * np.pi * 13 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def forepoling(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # forepoling: tunnel support
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.5, 0.6):
        m = int(0.45 * SR)
        drive = lowpass(noise(m), 950) * 0.32 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += drive
    return out * 0.64


def faggoting(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # faggoting: bundling iron
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.3, 0.35)):
        m = int(0.25 * SR)
        mt = np.arange(m) / SR
        blow = np.sin(2 * np.pi * 1090 * mt) * _env_decay(m, 60) * 0.26
        blow += lowpass(noise(m), 1310) * _env_decay(m, 67) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += blow * (1.0 - i * 0.04)
    return out * 0.66


# ---------------------------------------------------------------- kitchen / stable
def posset_cup2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # posset: second serving
    pour = lowpass(noise(m), 1500) * 0.26 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    spice = highpass(noise(m), 4800) * 0.06
    return (pour + spice) * 0.6


def nosebag():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nosebag: feed bag rustle
    rustle = highpass(lowpass(noise(m), 3900), 1150) * 0.25 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return rustle * 0.6


# ---------------------------------------------------------------- ritual / combat
def holy_oil(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # holy oil: anointing
    out = np.zeros(n)
    for f in (108, 162, 216):
        out += np.sin(2 * np.pi * f * t) * 0.065
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # oil pour
    pour = lowpass(noise(n), 1750) * 0.18 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += pour
    return out * 0.64


def fowler_fire(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fowler: light cannon
    out = np.zeros(n)
    # crack
    cm = int(0.17 * SR)
    crack = lowpass(noise(cm), 1850) * _env_decay(cm, 58) * 0.49
    out[:cm] += crack
    # tail
    tm = int(0.43 * SR)
    tail = lowpass(noise(tm), 920) * _env_decay(tm, 32) * 0.26
    s = int(0.15 * SR)
    out[s:s + tm] += tail
    return out * 0.68


# ---------------------------------------------------------------- foley / misc
def buskin_step3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # buskins: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.18, 0.28):
        m = int(0.12 * SR)
        step = lowpass(highpass(noise(m), 430), 1950) * _env_decay(m, 66) * 0.27
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.6


def polaris():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # polaris: north star sighting
    out = np.zeros(m)
    # alignment click
    cm = int(0.1 * SR)
    click = np.sin(2 * np.pi * 2300 * np.arange(cm) / SR) * _env_decay(cm, 72) * 0.16
    out[:cm] += click
    # star tone
    tone = np.sin(2 * np.pi * 880 * t) * 0.08 * np.sin(np.pi * np.minimum(t / 0.7, 1.0))
    out += tone
    return out * 0.6


def sat_uplink(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # satellite: uplink tone
    f = 1100 + 500 * np.sin(2 * np.pi * 0.9 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 2 * t)
    return _seamless(x, fade_s=0.5) * 0.58


SFX47 = [
    ("naval/foremast", foremast, "foremast rigging"),
    ("animal/marten", marten, "marten chatter"),
    ("weather/levant", levant, "levant wind"),
    ("horror/barghest", barghest, "barghest hound"),
    ("tavern/nine-holes", nine_holes, "nine-holes game"),
    ("farm/chick-peeps5", chick_peeps5, "chick peeps"),
    ("mine/forepoling", forepoling, "forepoling tunnel"),
    ("forge/faggoting", faggoting, "faggoting iron"),
    ("kitchen/posset-cup2", posset_cup2, "posset served"),
    ("stable/nosebag", nosebag, "nosebag rustle"),
    ("ritual/holy-oil", holy_oil, "holy oil anointing"),
    ("combat/fowler-fire", fowler_fire, "fowler fired"),
    ("foley/buskin-step3", buskin_step3, "buskins stepping"),
    ("misc/polaris", polaris, "polaris sighting"),
    ("modern/sat-uplink", sat_uplink, "satellite uplink"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX47:
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
    with open(os.path.join(OUT, "sfx47-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX47:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
