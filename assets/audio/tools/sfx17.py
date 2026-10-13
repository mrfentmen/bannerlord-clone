"""Procedural SFX batch 17 for the Bannerlord-clone (round 16).

Horses, horror, tavern, farm, mine, naval, modern, animals, weather, misc, ritual, combat, foley.
All numpy DSP - no samples. Run: python3 sfx17.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx17")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx17-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(171717)


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


# ---------------------------------------------------------------- horse
def whinny(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # horse whinny: high neigh with vibrato
    f = 1200 + 400 * np.sin(2 * np.pi * 3 * t) - 300 * (t / dur)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    x = np.sign(x) * 0.1 + x * 0.35
    env = np.minimum(t / 0.1, 1.0) * np.exp(-np.maximum(t - dur + 0.4, 0) * 4)
    return x * env * 0.65


# ---------------------------------------------------------------- horror
def door_knock_ominous():
    out = np.zeros(int(1.5 * SR))
    # slow heavy knocks
    for i, off in enumerate((0.0, 0.7)):
        m = int(0.2 * SR)
        t = np.arange(m) / SR
        knock = lowpass(noise(m), 900) * _env_decay(m, 45) * 0.6
        knock += np.sin(2 * np.pi * 180 * t) * _env_decay(m, 55) * 0.3
        s = int(off * SR)
        out[s:s + m] += knock * (1.0 - i * 0.15)
    return out * 0.75


def candle_snuff():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # candle snuffed: soft puff + flame die
    puff = lowpass(noise(int(0.1 * SR)), 1500) * 0.4
    out = np.zeros(m)
    out[:len(puff)] += puff * _env_decay(len(puff), 70)
    # flame sizzle out
    sm = int(0.2 * SR)
    sizzle = highpass(noise(sm), 5000) * 0.2 * _env_decay(sm, 40)
    s = int(0.1 * SR)
    out[s:s + sm] += sizzle
    return out * 0.6


# ---------------------------------------------------------------- tavern / farm
def chair_scrape():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # wooden chair dragged on floor
    x = lowpass(noise(m), 1400) * 0.4 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    x += np.sin(np.cumsum(2 * np.pi * (200 + 100 * t) / SR)) * 0.15
    return x * 0.65


def plow_drag(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # plow cutting earth: heavy scrape
    x = lowpass(noise(n), 700) * 0.45
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 1.1 * t)
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def milk_pail(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # milk streaming into pail: rhythmic liquid
    x = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.18):
        m = int(0.1 * SR)
        bt = np.arange(m) / SR
        stream = np.sin(2 * np.pi * (500 - 200 * bt) * bt) * _env_decay(m, 55) * 0.25
        stream += lowpass(noise(m), 2000) * _env_decay(m, 60) * 0.2
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += stream
    return x * 0.65


# ---------------------------------------------------------------- mine / naval
def canary_chirp(dur=1.0):
    n = int(dur * SR)
    out = np.zeros(n)
    # canary warning chirps
    for b in np.arange(0.05, dur - 0.1, 0.2):
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        chirp = np.sin(np.cumsum(2 * np.pi * (3200 + 800 * np.sin(2 * np.pi * 10 * t)) / SR)) * 0.25
        chirp *= np.sin(np.pi * np.minimum(t / 0.12, 1.0))
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chirp
    return out * 0.6


def ship_launch(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ship sliding down slipway + splash
    slide = lowpass(noise(n), 800) * 0.4 * np.minimum(t / 1.5, 1.0)
    out = slide * np.exp(-np.maximum(t - 1.5, 0) * 5)
    # big splash
    sm = int(1.0 * SR)
    splash = highpass(lowpass(noise(sm), 6000), 1200) * 0.6 * np.sin(np.pi * np.arange(sm) / sm)
    s = int(1.5 * SR)
    out[s:s + sm] += splash
    return out * 0.75


# ---------------------------------------------------------------- modern / animals / weather
def radio_jammer(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # jamming signal: harsh modulated static
    x = highpass(noise(n), 1000) * 0.4
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 11 * t)
    x += np.sin(2 * np.pi * 1800 * t) * 0.15 * np.sin(2 * np.pi * 7 * t)
    return _seamless(x, fade_s=0.4) * 0.65


def jackal_yip(dur=1.0):
    n = int(dur * SR)
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.12, 0.16):
        m = int(0.1 * SR)
        t = np.arange(m) / SR
        yip = np.sin(np.cumsum(2 * np.pi * (1500 - 500 * t) / SR)) * 0.3
        yip *= _env_decay(m, 70)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += yip
    return out * 0.6


def sleet(dur=3.0):
    n = int(dur * SR)
    # sleet: rain + ice ticks
    x = lowpass(noise(n), 2500) * 0.3
    for b in _rng.uniform(0, dur - 0.05, 50):
        m = int(0.03 * SR)
        tick = np.sin(2 * np.pi * _rng.uniform(3500, 6500) * np.arange(m) / SR) * _env_decay(m, 160) * _rng.uniform(0.08, 0.18)
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += tick
    return _seamless(x, fade_s=0.6) * 0.7


# ---------------------------------------------------------------- misc / ritual / combat / foley
def wax_seal_stamp():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # wax seal pressed + stamp lift
    press = lowpass(noise(int(0.08 * SR)), 1200) * 0.5
    out = np.zeros(m)
    out[:len(press)] += press * _env_decay(len(press), 70)
    # seal crack as lifted
    cm = int(0.1 * SR)
    crack = highpass(noise(cm), 3000) * _env_decay(cm, 85) * 0.25
    s = int(0.2 * SR)
    out[s:s + cm] += crack
    return out * 0.65


def singing_bowl(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # tibetan singing bowl: rich harmonics
    x = np.sin(2 * np.pi * 320 * t) * 0.35
    x += np.sin(2 * np.pi * 480 * t) * 0.2
    x += np.sin(2 * np.pi * 800 * t) * 0.1
    x *= np.minimum(t / 0.5, 1.0) * np.exp(-t * 1.2)
    return x * 0.7


def shield_drop():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    # shield dropped: metal/wood clatter
    clatter = lowpass(noise(m), 2200) * _env_decay(m, 50) * 0.6
    clatter += np.sin(2 * np.pi * 700 * t) * _env_decay(m, 65) * 0.25
    return clatter * 0.7


def grappling_hook():
    m = int(0.7 * SR)
    # hook thrown: whoosh + metal catch
    wm = int(0.3 * SR)
    whoosh = lowpass(noise(wm), 1800) * 0.35 * np.sin(np.pi * np.arange(wm) / wm)
    out = np.zeros(m)
    out[:wm] += whoosh
    # catch clank
    cm = int(0.15 * SR)
    t = np.arange(cm) / SR
    clank = np.sin(2 * np.pi * 1100 * t) * _env_decay(cm, 60) * 0.4
    clank += highpass(noise(cm), 3500) * _env_decay(cm, 75) * 0.25
    s = int(0.35 * SR)
    out[s:s + cm] += clank
    # rope tighten
    rm = int(0.2 * SR)
    tighten = np.sin(2 * np.pi * 180 * np.arange(rm) / SR) * _env_decay(rm, 40) * 0.25
    s2 = int(0.5 * SR)
    seg_len = min(rm, m - s2)
    out[s2:s2 + seg_len] += tighten[:seg_len]
    return out * 0.7


SFX17 = [
    ("horse/whinny", whinny, "horse whinny"),
    ("horror/door-knock-ominous", door_knock_ominous, "ominous door knocks"),
    ("horror/candle-snuff", candle_snuff, "candle snuffed out"),
    ("tavern/chair-scrape", chair_scrape, "chair dragged"),
    ("farm/plow-drag", plow_drag, "plow cutting earth"),
    ("farm/milk-pail", milk_pail, "milking into pail"),
    ("mine/canary-chirp", canary_chirp, "canary chirps"),
    ("naval/ship-launch", ship_launch, "ship launched"),
    ("modern/radio-jammer", radio_jammer, "radio jamming signal"),
    ("animal/jackal-yip", jackal_yip, "jackal yips"),
    ("weather/sleet", sleet, "sleet storm"),
    ("misc/wax-seal-stamp", wax_seal_stamp, "wax seal stamped"),
    ("ritual/singing-bowl", singing_bowl, "singing bowl"),
    ("combat/shield-drop", shield_drop, "shield dropped"),
    ("foley/grappling-hook", grappling_hook, "grappling hook thrown"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX17:
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
    with open(os.path.join(OUT, "sfx17-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX17:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
