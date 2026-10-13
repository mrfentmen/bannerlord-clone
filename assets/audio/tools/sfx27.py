"""Procedural SFX batch 27 for the Bannerlord-clone (round 26).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx27.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx27")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx27-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(272727)


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
def sea_anchor(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sea anchor deployed: heavy splash + rope run
    out = np.zeros(n)
    # splash
    sm = int(0.4 * SR)
    splash = highpass(lowpass(noise(sm), 4000), 1000) * _env_decay(sm, 30) * 0.5
    out[:sm] += splash
    # rope paying out
    rm = int(1.0 * SR)
    rope = lowpass(noise(rm), 900) * 0.3 * np.sin(np.pi * np.arange(rm) / rm)
    s = int(0.3 * SR)
    out[s:s + rm] += rope
    return out * 0.7


def mole_dig(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mole tunneling: soft earth displacement
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.2, 0.2):
        m = int(0.15 * SR)
        dig = lowpass(noise(m), 600) * 0.3 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dig
    return out * 0.6


# ---------------------------------------------------------------- weather / horror
def sun_shower(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sunshower: light rain + bright air
    rain = highpass(lowpass(noise(n), 6000), 2500) * 0.18
    rain *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.5 * t)
    return _seamless(rain, fade_s=0.6) * 0.65


def poltergeist(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poltergeist activity: objects sliding + crashes
    out = np.zeros(n)
    for b in _rng.uniform(0.1, 1.7, 6):
        m = int(_rng.uniform(0.2, 0.4) * SR)
        slide = lowpass(highpass(noise(m), 400), 2500) * _env_decay(m, _rng.uniform(25, 40)) * _rng.uniform(0.25, 0.4)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += slide
    return out * 0.7


# ---------------------------------------------------------------- tavern / farm
def last_round_bell():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # last call: bright bell
    x = np.sin(2 * np.pi * 1568 * t) * _env_decay(m, 35) * 0.3
    x += np.sin(2 * np.pi * 2093 * t) * _env_decay(m, 45) * 0.15
    return x * 0.6


def sheep_dip(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sheep dipped: splash + bleat
    out = np.zeros(n)
    # splash
    sm = int(0.3 * SR)
    splash = highpass(lowpass(noise(sm), 3500), 900) * _env_decay(sm, 35) * 0.4
    out[:sm] += splash
    # protest bleat
    bm = int(0.6 * SR)
    bt = np.arange(bm) / SR
    f = 500 + 150 * np.sin(2 * np.pi * 6 * bt)
    bleat = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.25 * np.sin(np.pi * bt / 0.6)
    s = int(0.4 * SR)
    out[s:s + bm] += bleat
    return out * 0.7


# ---------------------------------------------------------------- mine / forge
def shaft_bucket(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bucket lowered down shaft: creaking descent
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.5):
        m = int(0.4 * SR)
        creak = np.sin(2 * np.pi * 200 * np.arange(m) / SR) * _env_decay(m, 30) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    # water at bottom
    wm = int(0.3 * SR)
    water = lowpass(noise(wm), 1200) * _env_decay(wm, 40) * 0.25
    s = int(1.1 * SR)
    out[s:s + wm] += water
    return out * 0.65


def anneal_cool(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # hot metal cooling: ticking contraction
    out = np.zeros(n)
    for b in _rng.uniform(0.1, 1.9, 15):
        m = int(0.05 * SR)
        tick = np.sin(2 * np.pi * _rng.uniform(1800, 2400) * np.arange(m) / SR) * _env_decay(m, 100) * _rng.uniform(0.1, 0.2)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += tick
    return out * 0.6


# ---------------------------------------------------------------- kitchen / stable
def mead_pour(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mead poured: thick golden flow
    x = lowpass(noise(n), 1800) * 0.35 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.65


def tack_clean(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # leather tack cleaned: rubbing + jingle
    rub = lowpass(highpass(noise(n), 500), 2500) * 0.3 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    # buckle jingle
    jingle = highpass(noise(n), 5000) * 0.08 * np.abs(np.sin(2 * np.pi * 2 * t))
    return (rub + jingle) * 0.65


# ---------------------------------------------------------------- ritual / combat
def scapegoat_bell(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ritual bell: deep solemn tolling
    out = np.zeros(n)
    for b in (0.1, 0.8):
        m = int(0.6 * SR)
        mt = np.arange(m) / SR
        toll = np.sin(2 * np.pi * 220 * mt) * _env_decay(m, 25) * 0.3
        toll += np.sin(2 * np.pi * 330 * mt) * _env_decay(m, 35) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += toll
    return out * 0.7


def pike_plant():
    out = np.zeros(int(0.8 * SR))
    # pikes planted: rhythmic ground strikes
    for i, off in enumerate((0.0, 0.2, 0.4, 0.6)):
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        strike = lowpass(noise(m), 1000) * _env_decay(m, 60) * 0.45
        strike += np.sin(2 * np.pi * 180 * t) * _env_decay(m, 70) * 0.2
        s = int(off * SR)
        out[s:s + m] += strike * (1.0 - i * 0.06)
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def map_tube():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # map tube opened: wooden pop
    pop = lowpass(noise(m), 1200) * _env_decay(m, 75) * 0.4
    return pop * 0.6


def astrolabe():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # astrolabe adjusted: delicate brass
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.25, 0.45)):
        cm = int(0.08 * SR)
        click = np.sin(2 * np.pi * _rng.uniform(2000, 2500) * np.arange(cm) / SR) * _env_decay(cm, 90) * 0.2
        s = int(off * SR)
        out[s:s + cm] += click
    return out * 0.6


def laser_designator(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # laser designator: pulsing tone
    x = np.sin(2 * np.pi * 1200 * t) * 0.15
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 3 * t))
    return _seamless(x, fade_s=0.3) * 0.6


SFX27 = [
    ("naval/sea-anchor", sea_anchor, "sea anchor deployed"),
    ("animal/mole-dig", mole_dig, "mole tunneling"),
    ("weather/sun-shower", sun_shower, "sunshower"),
    ("horror/poltergeist", poltergeist, "poltergeist activity"),
    ("tavern/last-round-bell", last_round_bell, "last call bell"),
    ("farm/sheep-dip", sheep_dip, "sheep dipped"),
    ("mine/shaft-bucket", shaft_bucket, "bucket down shaft"),
    ("forge/anneal-cool", anneal_cool, "metal cooling"),
    ("kitchen/mead-pour", mead_pour, "mead poured"),
    ("stable/tack-clean", tack_clean, "tack cleaned"),
    ("ritual/scapegoat-bell", scapegoat_bell, "ritual bell"),
    ("combat/pike-plant", pike_plant, "pikes planted"),
    ("foley/map-tube", map_tube, "map tube opened"),
    ("misc/astrolabe", astrolabe, "astrolabe adjusted"),
    ("modern/laser-designator", laser_designator, "laser designator"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX27:
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
    with open(os.path.join(OUT, "sfx27-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX27:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
