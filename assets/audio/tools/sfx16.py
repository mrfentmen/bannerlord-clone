"""Procedural SFX batch 16 for the Bannerlord-clone (round 15).

Siege, naval, ambience, combat, horror, foley, misc, animals, weather, prison, ritual, tavern, farm.
All numpy DSP - no samples. Run: python3 sfx16.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx16")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx16-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(161616)


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


# ---------------------------------------------------------------- siege / naval
def tunnel_dig(dur=3.0):
    n = int(dur * SR)
    out = np.zeros(n)
    # sappers digging: rhythmic shovel scrapes
    for start in np.arange(0, dur, 0.8):
        m = int(0.5 * SR)
        t = np.arange(m) / SR
        scrape = lowpass(noise(m), 1200) * 0.4 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
        s = int(start * SR)
        if s + m < n:
            out[s:s + m] += scrape
    # timber creaks
    out += np.sin(np.cumsum(2 * np.pi * (60 + 20 * np.sin(2 * np.pi * 0.5 * np.arange(n) / SR)) / SR)) * 0.1
    return _seamless(out, fade_s=0.5) * 0.7


def boiling_oil_pour(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # oil pouring + sizzling screams of steam
    pour = lowpass(noise(n), 800) * 0.4 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    sizzle = highpass(noise(n), 4000) * 0.3 * np.minimum(t / 0.5, 1.0)
    return (pour + sizzle) * 0.7


def hull_splinter():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # ship hull splintering: massive wood crack
    crack = lowpass(noise(int(0.15 * SR)), 2500) * 0.8
    out = np.zeros(m)
    out[:len(crack)] += crack * _env_decay(len(crack), 45)
    # splintering wood
    for b in _rng.uniform(0.15, 0.6, 8):
        pm = int(0.1 * SR)
        splinter = highpass(lowpass(noise(pm), 5000), 1200) * _env_decay(pm, 60) * _rng.uniform(0.2, 0.4)
        s = int(b * SR)
        if s + pm < m:
            out[s:s + pm] += splinter
    # water rushing in
    wm = int(0.3 * SR)
    rush = lowpass(noise(wm), 1200) * 0.4 * _env_decay(wm, 12)
    s = int(0.5 * SR)
    out[s:s + wm] += rush
    return out * 0.8


# ---------------------------------------------------------------- ambience
def swamp_night(dur=4.0):
    n = int(dur * SR)
    # swamp at night: frogs, insects, water
    out = lowpass(noise(n), 600) * 0.15  # water
    out += highpass(noise(n), 6000) * 0.08  # insects
    # frog croaks
    for b in _rng.uniform(0.3, dur - 0.5, 10):
        m = int(0.25 * SR)
        t = np.arange(m) / SR
        f = _rng.uniform(150, 300)
        croak = np.sin(np.cumsum(np.full(m, 2 * np.pi * f / SR))) * 0.2
        croak = np.sign(croak) * 0.08 + croak * 0.25
        croak *= np.sin(np.pi * np.minimum(t / 0.25, 1.0))
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += croak
    return _seamless(out, fade_s=0.8) * 0.7


def desert_night(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # desert night: wind + coyote + insects
    x = lowpass(noise(n), 500) * 0.2 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.2 * t))
    x += highpass(noise(n), 7000) * 0.05
    # distant coyote yips
    for b in _rng.uniform(1.0, 3.0, 3):
        m = int(0.5 * SR)
        bt = np.arange(m) / SR
        yip = np.sin(np.cumsum(2 * np.pi * (900 - 300 * bt) / SR)) * 0.12 * np.sin(np.pi * bt / 0.5)
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += yip
    return _seamless(x, fade_s=0.8) * 0.7


# ---------------------------------------------------------------- combat / horror
def arrow_volley_whizz(dur=1.5):
    n = int(dur * SR)
    out = np.zeros(n)
    # rain of arrows whizzing overhead
    for b in _rng.uniform(0.0, 1.0, 15):
        m = int(0.3 * SR)
        t = np.arange(m) / SR
        f = _rng.uniform(1200, 2200)
        whizz = np.sin(np.cumsum(2 * np.pi * (f - 600 * t) / SR)) * 0.15
        whizz *= np.sin(np.pi * np.minimum(t / 0.3, 1.0))
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += whizz
    return out * 0.7


def ghost_moan(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ethereal moan: sweeping sine with vibrato
    f = 300 + 150 * np.sin(2 * np.pi * 0.4 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 5 * t)
    x += np.sin(np.cumsum(2 * np.pi * f * 1.5 / SR)) * 0.08
    env = np.minimum(t / 0.6, 1.0) * np.exp(-np.maximum(t - dur + 0.8, 0) * 3)
    return x * env * 0.65


# ---------------------------------------------------------------- foley / misc
def bowstring_pluck():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # bowstring test pluck: deep twang
    x = np.sin(2 * np.pi * 140 * t) * _env_decay(m, 35) * 0.5
    x += np.sin(2 * np.pi * 280 * t) * _env_decay(m, 50) * 0.25
    return x * 0.7


def caravan_bell():
    out = np.zeros(int(1.5 * SR))
    # camel/caravan bell: rhythmic jingle
    for i, off in enumerate((0.0, 0.35, 0.7, 1.05)):
        m = int(0.2 * SR)
        t = np.arange(m) / SR
        jingle = np.sin(2 * np.pi * _rng.uniform(1600, 2200) * t) * _env_decay(m, 45) * 0.3
        jingle += highpass(noise(m), 4000) * _env_decay(m, 60) * 0.15
        s = int(off * SR)
        out[s:s + m] += jingle * (1.0 - i * 0.1)
    return out * 0.65


# ---------------------------------------------------------------- animals / weather / prison / ritual / tavern / farm
def wild_boar_snort():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # aggressive boar snorts
    out = np.zeros(m)
    for b in (0.0, 0.25):
        pm = int(0.2 * SR)
        pt = np.arange(pm) / SR
        snort = lowpass(noise(pm), 700) * 0.5 * np.minimum(pt / 0.03, 1.0) * _env_decay(pm, 20)
        s = int(b * SR)
        out[s:s + pm] += snort
    return out * 0.75


def monsoon(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # torrential rain + thunder
    x = lowpass(noise(n), 3000) * 0.5
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.3 * t)
    # thunder rumbles
    for b in _rng.uniform(0.5, 3.5, 3):
        m = int(1.0 * SR)
        thunder = lowpass(noise(m), 200) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += thunder
    return _seamless(x, fade_s=0.8) * 0.75


def bars_rattle(dur=0.9):
    n = int(dur * SR)
    out = np.zeros(n)
    # prisoner rattling cell bars
    for b in np.arange(0.05, dur - 0.15, 0.25):
        m = int(0.15 * SR)
        t = np.arange(m) / SR
        rattle = np.sin(2 * np.pi * _rng.uniform(400, 600) * t) * _env_decay(m, 50) * 0.4
        rattle += lowpass(noise(m), 2000) * _env_decay(m, 60) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += rattle
    return out * 0.7


def handbell():
    m = int(1.0 * SR)
    t = np.arange(m) / SR
    # small ritual handbell
    x = np.sin(2 * np.pi * 1568 * t) * _env_decay(m, 30) * 0.4
    x += np.sin(2 * np.pi * 2093 * t) * _env_decay(m, 40) * 0.2
    x += np.sin(2 * np.pi * 2637 * t) * _env_decay(m, 50) * 0.1
    return x * 0.65


def ale_pour(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ale poured into mug: liquid glug
    x = np.zeros(n)
    for b in np.arange(0.1, dur - 0.2, 0.2):
        m = int(0.12 * SR)
        bt = np.arange(m) / SR
        glug = np.sin(2 * np.pi * (300 - 100 * bt) * bt) * _env_decay(m, 45) * 0.3
        glug += lowpass(noise(m), 1500) * _env_decay(m, 50) * 0.2
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += glug
    return x * 0.7


def rooster_crow(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rooster crow: classic dawn call
    out = np.zeros(n)
    # cock-a-doodle-doo: 4 syllables
    syllables = [(0.1, 600, 0.25), (0.4, 750, 0.25), (0.7, 900, 0.3), (1.05, 700, 0.45)]
    for off, f, dur_s in syllables:
        m = int(dur_s * SR)
        bt = np.arange(m) / SR
        x = np.sin(np.cumsum(2 * np.pi * (f + 100 * np.sin(2 * np.pi * 8 * bt)) / SR)) * 0.35
        x = np.sign(x) * 0.12 + x * 0.35
        x *= np.sin(np.pi * np.minimum(bt / dur_s, 1.0))
        s = int(off * SR)
        if s + m < n:
            out[s:s + m] += x
    return out * 0.7


SFX16 = [
    ("siege/tunnel-dig", tunnel_dig, "sappers tunneling"),
    ("siege/boiling-oil-pour", boiling_oil_pour, "boiling oil poured"),
    ("naval/hull-splinter", hull_splinter, "ship hull splintering"),
    ("ambience/swamp-night", swamp_night, "swamp at night"),
    ("ambience/desert-night", desert_night, "desert at night"),
    ("combat/arrow-volley-whizz", arrow_volley_whizz, "arrow volley overhead"),
    ("horror/ghost-moan", ghost_moan, "ethereal ghost moan"),
    ("foley/bowstring-pluck", bowstring_pluck, "bowstring pluck"),
    ("misc/caravan-bell", caravan_bell, "caravan bell jingle"),
    ("animal/wild-boar-snort", wild_boar_snort, "wild boar snorts"),
    ("weather/monsoon", monsoon, "monsoon downpour"),
    ("prison/bars-rattle", bars_rattle, "prison bars rattled"),
    ("ritual/handbell", handbell, "ritual handbell"),
    ("tavern/ale-pour", ale_pour, "ale poured"),
    ("farm/rooster-crow", rooster_crow, "rooster crowing"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX16:
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
    with open(os.path.join(OUT, "sfx16-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX16:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
