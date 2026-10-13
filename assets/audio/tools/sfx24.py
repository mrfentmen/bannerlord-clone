"""Procedural SFX batch 24 for the Bannerlord-clone (round 23).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx24.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx24")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx24-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(242424)


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
def bilge_pump(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bilge pump: rhythmic sloshing pump
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.5):
        m = int(0.4 * SR)
        pump = lowpass(noise(m), 1200) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pump
    return out * 0.7


def fox_kit_yip(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fox kits playing: high yips
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.18):
        m = int(0.1 * SR)
        mt = np.arange(m) / SR
        f = 2800 + 800 * np.sin(2 * np.pi * 6 * mt)
        yip = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.25 * np.sin(np.pi * mt / 0.1)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += yip
    return out * 0.6


# ---------------------------------------------------------------- weather / horror
def monsoon_burst(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # monsoon: sudden torrential wall of rain
    env = np.minimum(t / 0.4, 1.0) * np.exp(-np.maximum(t - 2.0, 0) * 3)
    x = highpass(lowpass(noise(n), 7000), 2000) * 0.45 * env
    return x * 0.75


def grave_dig(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # grave being dug: shovel in earth
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.6):
        m = int(0.5 * SR)
        dig = lowpass(noise(m), 1000) * 0.45 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dig
    return out * 0.7


# ---------------------------------------------------------------- tavern / farm
def bar_fight(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # tavern brawl: crashes + shouts
    out = np.zeros(n)
    for b in _rng.uniform(0.1, 1.7, 8):
        m = int(_rng.uniform(0.15, 0.3) * SR)
        crash = lowpass(noise(m), 2500) * _env_decay(m, _rng.uniform(30, 50)) * _rng.uniform(0.3, 0.5)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += crash
    return out * 0.75


def winnowing_fan(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # winnowing grain: rhythmic tossing
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.45):
        m = int(0.35 * SR)
        toss = highpass(lowpass(noise(m), 5000), 1500) * 0.35 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += toss
    return out * 0.65


# ---------------------------------------------------------------- mine / forge
def ore_cart_rumble(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ore cart on rails: rumbling + clacks
    rumble = lowpass(noise(n), 500) * 0.4 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    out = rumble
    for b in np.arange(0.2, dur - 0.2, 0.4):
        m = int(0.08 * SR)
        clack = lowpass(noise(m), 1800) * _env_decay(m, 70) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clack
    return out * 0.7


def tongs_clank():
    m = int(0.3 * SR)
    t = np.arange(m) / SR
    # blacksmith tongs: metallic clank
    x = np.sin(2 * np.pi * 1800 * t) * _env_decay(m, 85) * 0.3
    x += np.sin(2 * np.pi * 900 * t) * _env_decay(m, 95) * 0.2
    x += highpass(noise(m), 4000) * _env_decay(m, 110) * 0.15
    return x * 0.6


# ---------------------------------------------------------------- kitchen / stable
def pie_crust():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # pie crust crimped: dough pinches
    out = np.zeros(m)
    for b in np.arange(0.05, 0.45, 0.08):
        dm = int(0.05 * SR)
        pinch = lowpass(noise(dm), 1500) * _env_decay(dm, 90) * 0.25
        s = int(b * SR)
        if s + dm < m:
            out[s:s + dm] += pinch
    return out * 0.6


def feed_bucket():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # feed poured into bucket: grain cascade
    out = np.zeros(m)
    for b in _rng.uniform(0.05, 0.5, 15):
        gm = int(0.04 * SR)
        grain = highpass(noise(gm), 4000) * _env_decay(gm, 120) * _rng.uniform(0.1, 0.2)
        s = int(b * SR)
        if s + gm < m:
            out[s:s + gm] += grain
    # bucket ring
    ring = np.sin(2 * np.pi * 700 * t) * _env_decay(m, 40) * 0.15
    return (out + ring) * 0.65


# ---------------------------------------------------------------- ritual / combat
def anointing_oil():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # oil poured: viscous glug
    out = np.zeros(m)
    for b in np.arange(0.05, 0.55, 0.12):
        gm = int(0.08 * SR)
        glug = lowpass(noise(gm), 600) * _env_decay(gm, 60) * 0.3
        s = int(b * SR)
        if s + gm < m:
            out[s:s + gm] += glug
    return out * 0.6


def chariot_wheels(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chariot at speed: rattling wheels + hooves
    rattle = lowpass(highpass(noise(n), 400), 2000) * 0.35
    rattle *= 0.6 + 0.4 * np.sin(2 * np.pi * 4 * t)
    # hoofbeats
    for b in np.arange(0.1, dur - 0.2, 0.25):
        m = int(0.08 * SR)
        hoof = lowpass(noise(m), 1200) * _env_decay(m, 75) * 0.25
        s = int(b * SR)
        if s + m < n:
            rattle[s:s + m] += hoof
    return rattle * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


# ---------------------------------------------------------------- foley / misc
def glove_snap():
    m = int(0.25 * SR)
    t = np.arange(m) / SR
    # leather glove snapped on: sharp snap
    snap = highpass(noise(m), 2500) * _env_decay(m, 105) * 0.4
    snap += lowpass(noise(m), 1200) * _env_decay(m, 85) * 0.2
    return snap * 0.6


def sextant_click():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # sextant adjusted: precise mechanical clicks
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.18, 0.31)):
        cm = int(0.05 * SR)
        click = highpass(noise(cm), 5000) * _env_decay(cm, 130) * (0.25 - i * 0.03)
        s = int(off * SR)
        out[s:s + cm] += click
    return out * 0.6


def night_vision_hum(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # night vision: electronic hum
    x = np.sin(2 * np.pi * 15000 * t) * 0.06
    x += np.sin(2 * np.pi * 120 * t) * 0.08
    return _seamless(x, fade_s=0.5) * 0.55


SFX24 = [
    ("naval/bilge-pump", bilge_pump, "bilge pump working"),
    ("animal/fox-kit-yip", fox_kit_yip, "fox kits playing"),
    ("weather/monsoon-burst", monsoon_burst, "monsoon burst"),
    ("horror/grave-dig", grave_dig, "grave being dug"),
    ("tavern/bar-fight", bar_fight, "tavern brawl"),
    ("farm/winnowing-fan", winnowing_fan, "winnowing grain"),
    ("mine/ore-cart-rumble", ore_cart_rumble, "ore cart rumbling"),
    ("forge/tongs-clank", tongs_clank, "tongs clank"),
    ("kitchen/pie-crust", pie_crust, "pie crust crimped"),
    ("stable/feed-bucket", feed_bucket, "feed poured"),
    ("ritual/anointing-oil", anointing_oil, "oil poured"),
    ("combat/chariot-wheels", chariot_wheels, "chariot at speed"),
    ("foley/glove-snap", glove_snap, "glove snapped"),
    ("misc/sextant-click", sextant_click, "sextant adjusted"),
    ("modern/night-vision-hum", night_vision_hum, "night vision hum"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX24:
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
    with open(os.path.join(OUT, "sfx24-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX24:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
