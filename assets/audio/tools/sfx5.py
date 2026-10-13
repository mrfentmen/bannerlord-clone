"""Procedural SFX batch 5 for the Bannerlord-clone (round 4).

Combat extras, workshop foley, tavern games, UI system, ambience extras.
All numpy DSP - no samples. Run: python3 sfx5.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx5")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx5-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(424242)


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


# ---------------------------------------------------------------- combat
def mounted_charge(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # many hooves: layered gallop patterns
    x = np.zeros(n)
    for v in range(6):
        off = _rng.uniform(0, 0.3)
        beat = 0.28 + _rng.uniform(-0.03, 0.03)
        for b in np.arange(0, dur - off, beat):
            m = int(0.08 * SR)
            hoof = lowpass(noise(m), 800) * _env_decay(m, 55) * _rng.uniform(0.3, 0.6)
            s = int((off + b) * SR)
            if s + m < n:
                x[s:s + m] += hoof
    # armor jingle
    x += highpass(noise(n), 4000) * 0.08 * (0.5 + 0.5 * np.sin(2 * np.pi * 2 * t))
    env = np.minimum(t / 1.5, 1.0)
    return x * env * 0.7


def volley_release():
    m = int(1.0 * SR)
    out = np.zeros(m)
    # dozens of bowstrings
    for b in _rng.uniform(0, 0.25, 30):
        bm = int(0.15 * SR)
        bt = np.arange(bm) / SR
        twang = np.sin(2 * np.pi * _rng.uniform(150, 220) * bt) * _env_decay(bm, 45) * 0.18
        s = int(b * SR)
        if s + bm < m:
            out[s:s + bm] += twang
    # arrow storm whoosh
    wm = int(0.6 * SR)
    whoosh = highpass(noise(wm), 2500) * 0.3 * np.sin(np.pi * np.arange(wm) / wm)
    s = int(0.3 * SR)
    out[s:s + wm] += whoosh
    return out * 0.8


def catapult_impact():
    m = int(1.5 * SR)
    t = np.arange(m) / SR
    # projectile slam: crash + debris
    crash = lowpass(noise(m), 1200) * _env_decay(m, 7) * 0.9
    out = crash
    for b in _rng.uniform(0.1, 1.0, 10):
        dm = int(0.15 * SR)
        debris = lowpass(noise(dm), 2500) * _env_decay(dm, 30) * _rng.uniform(0.15, 0.4)
        s = int(b * SR)
        if s + dm < m:
            out[s:s + dm] += debris
    return out * 0.8


def shield_wall():
    m = int(1.0 * SR)
    out = np.zeros(m)
    # many shields slamming together
    for b in _rng.uniform(0, 0.3, 12):
        sm = int(0.2 * SR)
        thud = lowpass(noise(sm), 800) * _env_decay(sm, 40) * _rng.uniform(0.3, 0.6)
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += thud
    return out * 0.8


# ---------------------------------------------------------------- workshop foley
def book_open():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # cover creak + pages flutter
    creak = np.sin(2 * np.pi * (120 + 80 * t) * t) * 0.2 * np.minimum(t / 0.3, 1.0)
    pm = int(0.25 * SR)
    pages = highpass(noise(pm), 3500) * _env_decay(pm, 20) * 0.3
    out = creak
    s = int(0.2 * SR)
    out[s:s + pm] += pages
    return out * 0.7


def scroll_unroll():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    x = highpass(noise(m), 2800) * 0.3
    env = np.minimum(t / 0.45, 1.0) * np.exp(-np.maximum(t - 0.45, 0) * 25)
    return x * env * 0.7


def hammer_forge():
    out = np.zeros(int(1.8 * SR))
    for i, off in enumerate((0.0, 0.45, 0.9, 1.35)):
        m = int(0.15 * SR)
        t = np.arange(m) / SR
        # hammer on hot metal: bright ring
        ring = np.sin(2 * np.pi * 2600 * t) * _env_decay(m, 55) * 0.4
        ring += np.sin(2 * np.pi * 3900 * t) * _env_decay(m, 70) * 0.2
        ring += lowpass(noise(m), 4000) * _env_decay(m, 75) * 0.3
        s = int(off * SR)
        out[s:s + m] += ring * (1.0 - i * 0.08)
    return out * 0.75


def anvil_ring():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    x = np.zeros(m)
    for i, f in enumerate((1560, 2340, 3120, 4680)):
        x += np.sin(2 * np.pi * f * t + _rng.uniform(0, 6.28)) * _env_decay(m, 22 + i * 10) * (0.45 / (i + 1))
    return x * 0.7


def sword_sharpen(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rhythmic grinding: back-and-forth
    grate = highpass(noise(n), 2200) * 0.3
    grate *= 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 1.5 * t))
    return grate * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def wood_chop_civilian():
    out = np.zeros(int(1.2 * SR))
    for i, off in enumerate((0.0, 0.55)):
        m = int(0.25 * SR)
        t = np.arange(m) / SR
        crack = highpass(noise(m), 1800) * _env_decay(m, 50) * 0.6
        thud = np.sin(2 * np.pi * 130 * t) * _env_decay(m, 40) * 0.5
        s = int(off * SR)
        out[s:s + m] += (crack + thud) * (1.0 - i * 0.1)
    return out * 0.75


def dice_roll():
    m = int(0.9 * SR)
    out = np.zeros(m)
    for b in _rng.uniform(0, 0.5, 7):
        dm = int(0.06 * SR)
        dt = np.arange(dm) / SR
        clack = np.sin(2 * np.pi * _rng.uniform(1800, 2800) * dt) * _env_decay(dm, 95) * 0.35
        clack += lowpass(noise(dm), 3000) * _env_decay(dm, 100) * 0.25
        s = int(b * SR)
        if s + dm < m:
            out[s:s + dm] += clack
    return out * 0.7


def cards_shuffle(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # riffling cards: rapid soft ticks
    x = np.zeros(n)
    for b in np.arange(0, dur, 0.035):
        m = int(0.02 * SR)
        tick = highpass(noise(m), 4000) * _env_decay(m, 160) * _rng.uniform(0.15, 0.3)
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += tick
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def well_creak(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 110 + 70 * np.sin(2 * np.pi * 0.7 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.5 + 0.5 * np.sin(2 * np.pi * 4 * t)) * 0.3
    # rope + bucket splash at end
    sm = int(0.3 * SR)
    splash = highpass(lowpass(noise(sm), 4000), 1000) * _env_decay(sm, 15) * 0.4
    s = int(1.1 * SR)
    x[s:s + sm] += splash
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


# ---------------------------------------------------------------- ui system
def ui5(kind):
    if kind == "pause":
        m = int(0.25 * SR)
        t = np.arange(m) / SR
        return np.sin(2 * np.pi * 520 * t) * _env_decay(m, 40) * 0.35
    if kind == "resume":
        out = np.zeros(int(0.3 * SR))
        for i, f in enumerate((520, 780)):
            m = int(0.12 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.11 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 45) * 0.35
        return out
    if kind == "save-game":
        out = np.zeros(int(0.6 * SR))
        # writing scribble + confirm
        wm = int(0.35 * SR)
        scribble = highpass(noise(wm), 4000) * 0.15 * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * np.arange(wm) / SR))
        out[:wm] += scribble
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        s = int(0.4 * SR)
        out[s:s + m] += np.sin(2 * np.pi * 880 * t) * _env_decay(m, 40) * 0.35
        return out
    if kind == "load-game":
        out = np.zeros(int(0.6 * SR))
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        out[:m] += np.sin(2 * np.pi * 660 * t) * _env_decay(m, 40) * 0.35
        s = int(0.15 * SR)
        wm = int(0.35 * SR)
        whoosh = lowpass(noise(wm), 2000) * 0.25 * np.sin(np.pi * np.arange(wm) / wm)
        out[s:s + wm] += whoosh
        return out
    raise ValueError(kind)


# ---------------------------------------------------------------- ambience extras
def ambience5(kind, dur=10.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == "library":
        base = lowpass(noise(n), 350) * 0.14
        # occasional page turns
        for b in _rng.uniform(0, dur, 5):
            m = int(0.3 * SR)
            page = highpass(noise(m), 3200) * _env_decay(m, 22) * 0.10
            s = int(b * SR)
            if s + m < n:
                base[s:s + m] += page
        # clock tick
        for b in np.arange(0, dur, 1.0):
            m = int(0.04 * SR)
            tick = np.sin(2 * np.pi * 2000 * np.arange(m) / SR) * _env_decay(m, 120) * 0.06
            s = int(b * SR)
            if s + m < n:
                base[s:s + m] += tick
        return _seamless(base)
    if kind == "dungeon":
        base = lowpass(noise(n), 220) * 0.20
        # chains + distant moans
        for b in _rng.uniform(0, dur - 1, 4):
            m = int(0.5 * SR)
            bt = np.arange(m) / SR
            moan = np.sin(2 * np.pi * (140 - 40 * bt) * bt) * _env_decay(m, 8) * 0.08
            s = int(b * SR)
            if s + m < n:
                base[s:s + m] += moan
        drip_m = int(0.25 * SR)
        for b in _rng.uniform(0, dur, 8):
            bt = np.arange(drip_m) / SR
            drip = np.sin(2 * np.pi * (1500 - 700 * bt) * bt) * _env_decay(drip_m, 35) * 0.08
            s = int(b * SR)
            if s + drip_m < n:
                base[s:s + drip_m] += drip
        return _seamless(base)
    if kind == "throne-room":
        base = lowpass(noise(n), 500) * 0.12
        # hushed murmurs + fire crackle
        murmur = lowpass(noise(n), 600) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.08 * t)) * 0.10
        for b in _rng.uniform(0, dur, 30):
            m = int(0.04 * SR)
            pop = highpass(noise(m), 2200) * _env_decay(m, 90) * 0.06
            s = int(b * SR)
            if s + m < n:
                base[s:s + m] += pop
        return _seamless(base + murmur)
    raise ValueError(kind)


# ---------------------------------------------------------------- animals
def hawk_screech(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 2600 - 1200 * (t / dur)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.4
    x += np.sin(np.cumsum(2 * np.pi * f * 1.5 / SR)) * 0.15
    # raspy
    x = np.sign(x) * 0.2 + x * 0.5
    env = np.sin(np.pi * np.minimum(t / dur, 1.0)) ** 1.5
    return x * env * 0.65


def coyote_howl(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # yipping howl: warbling high pitch
    f = 800 + 400 * np.sin(2 * np.pi * 2.2 * t) + 200 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.4
    x += np.sin(np.cumsum(2 * np.pi * f * 2.02 / SR)) * 0.12
    env = np.minimum(t / 0.3, 1.0) * np.exp(-np.maximum(t - dur + 0.6, 0) * 3.5)
    return x * env * 0.6


SFX5 = [
    ("combat/mounted-charge", mounted_charge, "cavalry charge, many hooves"),
    ("combat/volley-release", volley_release, "arrow volley release"),
    ("combat/catapult-impact", catapult_impact, "catapult projectile impact"),
    ("combat/shield-wall", shield_wall, "shield wall formation slam"),
    ("foley/book-open", book_open, "book opened"),
    ("foley/scroll-unroll", scroll_unroll, "scroll unrolled"),
    ("foley/hammer-forge", hammer_forge, "blacksmith hammering"),
    ("foley/anvil-ring", anvil_ring, "anvil ring"),
    ("foley/sword-sharpen", sword_sharpen, "sword sharpening"),
    ("foley/wood-chop", wood_chop_civilian, "wood chopping"),
    ("foley/dice-roll", dice_roll, "dice roll"),
    ("foley/cards-shuffle", cards_shuffle, "cards shuffling"),
    ("foley/well-creak", well_creak, "well bucket creak + splash"),
    ("ui/pause", lambda: ui5("pause"), "game paused"),
    ("ui/resume", lambda: ui5("resume"), "game resumed"),
    ("ui/save-game", lambda: ui5("save-game"), "game saved"),
    ("ui/load-game", lambda: ui5("load-game"), "game loaded"),
    ("ambience/library", lambda: ambience5("library"), "library bed with clock, loopable"),
    ("ambience/dungeon", lambda: ambience5("dungeon"), "dungeon bed, loopable"),
    ("ambience/throne-room", lambda: ambience5("throne-room"), "throne room bed, loopable"),
    ("animal/hawk-screech", hawk_screech, "hawk screech"),
    ("animal/coyote-howl", coyote_howl, "coyote howl"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX5:
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
    with open(os.path.join(OUT, "sfx5-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX5:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
