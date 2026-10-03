"""Procedural SFX batch 19 for the Bannerlord-clone (round 18).

Naval, modern, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx19.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx19")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx19-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(191919)


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


# ---------------------------------------------------------------- naval / modern
def anchor_splash():
    m = int(1.0 * SR)
    t = np.arange(m) / SR
    # anchor hitting water: heavy splash
    splash = highpass(lowpass(noise(m), 5000), 1000) * 0.6 * _env_decay(m, 14)
    thud = lowpass(noise(int(0.1 * SR)), 500) * 0.4
    out = splash
    out[:len(thud)] += thud * _env_decay(len(thud), 50)
    return out * 0.75


def night_vision_goggles():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # NVG power-on: electronic whir + confirmation beep
    whir = np.sin(2 * np.pi * 1200 * t) * 0.2 * np.minimum(t / 0.3, 1.0)
    out = whir * np.exp(-np.maximum(t - 0.5, 0) * 6)
    # beep
    bm = int(0.1 * SR)
    beep = np.sin(2 * np.pi * 2000 * np.arange(bm) / SR) * _env_decay(bm, 60) * 0.3
    s = int(0.6 * SR)
    out[s:s + bm] += beep
    return out * 0.6


# ---------------------------------------------------------------- animals / weather
def polar_bear_growl(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # massive bear growl: deep and terrifying
    f = 55 + 15 * np.sin(2 * np.pi * 1.5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.4
    x = np.sign(x) * 0.22 + x * 0.3
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 5 * t)
    env = np.minimum(t / 0.25, 1.0) * np.exp(-np.maximum(t - dur + 0.6, 0) * 3.5)
    return x * env * 0.75


def whiteout_wind(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # blinding snowstorm: screaming wind
    x = lowpass(noise(n), 1100) * 0.55
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.18 * t) + 0.2 * np.sin(2 * np.pi * 0.9 * t)
    # ice crystals
    x += highpass(noise(n), 7000) * 0.1
    return _seamless(x, fade_s=0.8) * 0.75


# ---------------------------------------------------------------- horror / tavern
def mirror_crack(dur=0.8):
    n = int(dur * SR)
    out = np.zeros(n)
    # mirror cracking: sharp spiderweb cracks
    for b in _rng.uniform(0.05, 0.6, 6):
        m = int(0.12 * SR)
        crack = highpass(noise(m), 2500) * _env_decay(m, 55) * _rng.uniform(0.25, 0.45)
        crack += np.sin(2 * np.pi * _rng.uniform(2000, 4000) * np.arange(m) / SR) * _env_decay(m, 70) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += crack
    return out * 0.7


def closing_bell():
    out = np.zeros(int(1.2 * SR))
    # tavern last-call bell: bright triple ring
    for i, off in enumerate((0.0, 0.3, 0.6)):
        m = int(0.25 * SR)
        t = np.arange(m) / SR
        ring = np.sin(2 * np.pi * 1568 * t) * _env_decay(m, 40) * 0.35
        ring += np.sin(2 * np.pi * 2093 * t) * _env_decay(m, 55) * 0.15
        s = int(off * SR)
        out[s:s + m] += ring * (1.0 - i * 0.15)
    return out * 0.65


# ---------------------------------------------------------------- farm / mine
def sheep_shearing(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # shears clipping wool: rhythmic snips
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.3):
        m = int(0.12 * SR)
        snip = highpass(noise(m), 3500) * _env_decay(m, 85) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += snip
    # sheep bleat
    bm = int(0.4 * SR)
    bt = np.arange(bm) / SR
    bleat = np.sin(np.cumsum(2 * np.pi * (400 + 100 * np.sin(2 * np.pi * 6 * bt)) / SR)) * 0.25
    bleat = np.sign(bleat) * 0.1 + bleat * 0.3
    s = int(1.0 * SR)
    out[s:s + bm] += bleat * np.sin(np.pi * np.minimum(bt / 0.4, 1.0))
    return out * 0.7


def shaft_elevator(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mine cage descending: chains + rumble
    chain = highpass(lowpass(noise(n), 4000), 1500) * 0.2
    chain *= 0.5 + 0.5 * np.sin(2 * np.pi * 2.5 * t)
    rumble = lowpass(noise(n), 400) * 0.3
    # brake screech at end
    sm = int(0.4 * SR)
    screech = np.sin(2 * np.pi * 2500 * np.arange(sm) / SR) * 0.15 * np.sin(np.pi * np.arange(sm) / sm)
    out = chain + rumble
    s = int(2.1 * SR)
    out[s:s + sm] += screech
    return out * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


# ---------------------------------------------------------------- forge / kitchen
def coal_shovel(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # coal shoveled into forge: scrape + clatter
    scrape = lowpass(noise(n), 1500) * 0.35 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    out = scrape
    for b in _rng.uniform(0.3, 0.8, 8):
        m = int(0.06 * SR)
        clatter = lowpass(noise(m), 2500) * _env_decay(m, 80) * _rng.uniform(0.15, 0.3)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clatter
    return out * 0.7


def oven_door_creak(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # heavy oven door: iron creak
    f = 140 + 60 * np.sin(2 * np.pi * 1.0 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.35 + 0.25 * np.sin(2 * np.pi * 3 * t)) * 0.4
    x += lowpass(noise(n), 700) * 0.12
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


# ---------------------------------------------------------------- stable / ritual
def water_trough_splash(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # horse drinking: splashes + snorts
    splash = highpass(lowpass(noise(n), 4000), 1000) * 0.3 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    out = splash
    for b in (0.3, 0.65):
        m = int(0.15 * SR)
        snort = lowpass(noise(m), 600) * _env_decay(m, 35) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += snort
    return out * 0.7


def candle_light():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # match strike + candle catch
    strike = highpass(noise(int(0.08 * SR)), 4000) * 0.4
    out = np.zeros(m)
    out[:len(strike)] += strike * _env_decay(len(strike), 90)
    # flame whoosh
    fm = int(0.25 * SR)
    whoosh = lowpass(noise(fm), 2000) * 0.25 * np.sin(np.pi * np.arange(fm) / fm)
    s = int(0.12 * SR)
    out[s:s + fm] += whoosh
    return out * 0.65


# ---------------------------------------------------------------- combat / foley / misc
def arrow_nock():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    # arrow nocked: wood click + string creak
    click = highpass(noise(int(0.05 * SR)), 3000) * 0.35
    out = np.zeros(m)
    out[:len(click)] += click * _env_decay(len(click), 95)
    # string drawn
    sm = int(0.2 * SR)
    creak = np.sin(2 * np.pi * 220 * np.arange(sm) / SR) * 0.15 * np.sin(np.pi * np.arange(sm) / sm)
    s = int(0.12 * SR)
    out[s:s + sm] += creak
    return out * 0.65


def map_case_open():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # leather map tube: cap pop + parchment slide
    pop = lowpass(noise(int(0.06 * SR)), 1500) * 0.45
    out = np.zeros(m)
    out[:len(pop)] += pop * _env_decay(len(pop), 75)
    # parchment unroll
    pm = int(0.3 * SR)
    unroll = highpass(lowpass(noise(pm), 5000), 1500) * 0.3 * np.sin(np.pi * np.arange(pm) / pm)
    s = int(0.12 * SR)
    out[s:s + pm] += unroll
    return out * 0.65


def fishing_reel(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fishing reel: rapid clicking whir
    x = np.sin(2 * np.pi * 40 * t) * 0.2
    x = np.sign(x) * 0.1 + x * 0.25
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 2 * t)
    # line splash at end
    sm = int(0.3 * SR)
    splash = highpass(lowpass(noise(sm), 4000), 1200) * 0.3 * _env_decay(sm, 25)
    out = x
    s = int(1.2 * SR)
    out[s:s + sm] += splash
    return out * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


SFX19 = [
    ("naval/anchor-splash", anchor_splash, "anchor splashing down"),
    ("modern/night-vision-goggles", night_vision_goggles, "NVG power-on"),
    ("animal/polar-bear-growl", polar_bear_growl, "polar bear growl"),
    ("weather/whiteout-wind", whiteout_wind, "whiteout blizzard"),
    ("horror/mirror-crack", mirror_crack, "mirror cracking"),
    ("tavern/closing-bell", closing_bell, "tavern last call"),
    ("farm/sheep-shearing", sheep_shearing, "sheep shearing"),
    ("mine/shaft-elevator", shaft_elevator, "mine cage descending"),
    ("forge/coal-shovel", coal_shovel, "coal shoveled"),
    ("kitchen/oven-door-creak", oven_door_creak, "oven door creak"),
    ("stable/water-trough-splash", water_trough_splash, "horse drinking"),
    ("ritual/candle-light", candle_light, "candle lit"),
    ("combat/arrow-nock", arrow_nock, "arrow nocked"),
    ("foley/map-case-open", map_case_open, "map case opened"),
    ("misc/fishing-reel", fishing_reel, "fishing reel"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX19:
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
    with open(os.path.join(OUT, "sfx19-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX19:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
