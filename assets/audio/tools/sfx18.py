"""Procedural SFX batch 18 for the Bannerlord-clone (round 17).

Naval, disasters, horror, farm, mine, forge, kitchen, stable, misc, ritual, combat, weather, animals, modern.
All numpy DSP - no samples. Run: python3 sfx18.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx18")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx18-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(181818)


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


# ---------------------------------------------------------------- naval / disaster
def mast_snap():
    m = int(0.7 * SR)
    # ship mast snapping: massive wood crack + falling
    crack = lowpass(noise(int(0.12 * SR)), 2000) * 0.8
    out = np.zeros(m)
    out[:len(crack)] += crack * _env_decay(len(crack), 50)
    # mast falling + rigging whips
    fm = int(0.5 * SR)
    fall = lowpass(noise(fm), 1000) * 0.5 * np.sin(np.pi * np.arange(fm) / fm)
    s = int(0.15 * SR)
    out[s:s + fm] += fall
    for b in _rng.uniform(0.2, 0.5, 4):
        wm = int(0.08 * SR)
        whip = highpass(noise(wm), 2500) * _env_decay(wm, 80) * 0.25
        ss = int(b * SR)
        if ss + wm < m:
            out[ss:ss + wm] += whip
    return out * 0.8


def volcano_rumble(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # deep volcanic churning
    x = np.sin(2 * np.pi * 22 * t) * 0.4 + np.sin(2 * np.pi * 33 * t) * 0.25
    x += lowpass(noise(n), 100) * 0.4
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.4 * t)
    # rock bursts
    for b in _rng.uniform(0.5, 3.5, 6):
        m = int(0.3 * SR)
        burst = lowpass(noise(m), 500) * _env_decay(m, 15) * _rng.uniform(0.2, 0.4)
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += burst
    return _seamless(x, fade_s=0.8) * 0.75


# ---------------------------------------------------------------- horror / farm
def book_slam():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # heavy book slammed shut
    slam = lowpass(noise(m), 1800) * _env_decay(m, 60) * 0.6
    slam += np.sin(2 * np.pi * 250 * t) * _env_decay(m, 70) * 0.3
    return slam * 0.7


def tractor_engine(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # old farm tractor: puttering diesel
    f = 50 + 10 * np.sin(2 * np.pi * 1.2 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.35
    x = np.sign(x) * 0.15 + x * 0.35
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 3.5 * t)
    return _seamless(x * 0.7, fade_s=0.5) * 0.7


# ---------------------------------------------------------------- mine / forge
def dynamite_fuse_hiss(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fuse burning: sizzling hiss that quickens
    x = highpass(noise(n), 4500) * 0.35
    x *= 0.5 + 0.5 * np.minimum(t / 1.2, 1.0)
    # sputters
    for b in _rng.uniform(0.2, 1.3, 8):
        m = int(0.05 * SR)
        sputter = highpass(noise(m), 3000) * _env_decay(m, 100) * 0.3
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += sputter
    return x * 0.65


def tongs_clank():
    m = int(0.3 * SR)
    t = np.arange(m) / SR
    # blacksmith tongs clanking
    x = np.sin(2 * np.pi * 1900 * t) * _env_decay(m, 75) * 0.35
    x += np.sin(2 * np.pi * 2800 * t) * _env_decay(m, 95) * 0.2
    x += highpass(noise(m), 5000) * _env_decay(m, 105) * 0.15
    return x * 0.65


# ---------------------------------------------------------------- kitchen / stable
def dough_slap():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # dough slapped on counter
    slap = lowpass(noise(m), 900) * _env_decay(m, 55) * 0.6
    slap += np.sin(2 * np.pi * 200 * t) * _env_decay(m, 65) * 0.25
    return slap * 0.7


def brush_strokes(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # horse grooming: rhythmic brush strokes
    x = highpass(lowpass(noise(n), 3500), 1200) * 0.3
    x *= 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 1.8 * t))
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


# ---------------------------------------------------------------- misc / ritual / combat
def spyglass_extend():
    out = np.zeros(int(0.6 * SR))
    # brass telescope extending: 3 clicks
    for i, off in enumerate((0.0, 0.2, 0.4)):
        m = int(0.08 * SR)
        t = np.arange(m) / SR
        click = np.sin(2 * np.pi * 1400 * t) * _env_decay(m, 85) * 0.35
        click += highpass(noise(m), 4000) * _env_decay(m, 100) * 0.15
        s = int(off * SR)
        out[s:s + m] += click * (1.0 - i * 0.1)
    return out * 0.65


def censer_swing(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # swinging censer: chain rhythm + smoke
    chain = highpass(lowpass(noise(n), 5000), 2000) * 0.15
    chain *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.9 * t)
    # deep swing whoosh
    whoosh = lowpass(noise(n), 600) * 0.2 * np.abs(np.sin(2 * np.pi * 0.9 * t))
    return _seamless(chain + whoosh, fade_s=0.5) * 0.65


def weapon_dropped():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # sword dropped: clatter + ring
    clatter = lowpass(noise(m), 3000) * _env_decay(m, 45) * 0.6
    ring = np.sin(2 * np.pi * 2100 * t) * _env_decay(m, 55) * 0.3
    return (clatter + ring) * 0.7


# ---------------------------------------------------------------- weather / animals / modern
def thunder_distant(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # distant thunder: low rolling
    x = lowpass(noise(n), 150) * 0.5
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0)) ** 0.7
    return x * 0.75


def marmot_whistle(dur=0.9):
    n = int(dur * SR)
    out = np.zeros(n)
    # marmot alarm whistles
    for b in np.arange(0.05, dur - 0.15, 0.25):
        m = int(0.15 * SR)
        t = np.arange(m) / SR
        whistle = np.sin(2 * np.pi * 2800 * t) * _env_decay(m, 60) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += whistle
    return out * 0.6


def diesel_generator(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # portable generator: steady putter
    f = 55 + 5 * np.sin(2 * np.pi * 0.8 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    x = np.sign(x) * 0.12 + x * 0.3
    x += lowpass(noise(n), 300) * 0.15
    return _seamless(x * 0.7, fade_s=0.6) * 0.7


def owl_wingbeat(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # owl taking flight: soft deep wingbeats
    x = lowpass(noise(n), 700) * 0.35
    x *= 0.3 + 0.7 * np.abs(np.sin(2 * np.pi * 4.5 * t))
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


SFX18 = [
    ("naval/mast-snap", mast_snap, "ship mast snapping"),
    ("disaster/volcano-rumble", volcano_rumble, "volcanic churning"),
    ("horror/book-slam", book_slam, "heavy book slammed"),
    ("farm/tractor-engine", tractor_engine, "old tractor engine"),
    ("mine/dynamite-fuse-hiss", dynamite_fuse_hiss, "dynamite fuse burning"),
    ("forge/tongs-clank", tongs_clank, "blacksmith tongs"),
    ("kitchen/dough-slap", dough_slap, "dough slapped"),
    ("stable/brush-strokes", brush_strokes, "horse grooming"),
    ("misc/spyglass-extend", spyglass_extend, "telescope extending"),
    ("ritual/censer-swing", censer_swing, "swinging censer"),
    ("combat/weapon-dropped", weapon_dropped, "weapon dropped"),
    ("weather/thunder-distant", thunder_distant, "distant thunder"),
    ("animal/marmot-whistle", marmot_whistle, "marmot alarm calls"),
    ("modern/diesel-generator", diesel_generator, "portable generator"),
    ("misc/owl-wingbeat", owl_wingbeat, "owl taking flight"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX18:
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
    with open(os.path.join(OUT, "sfx18-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX18:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
