"""Procedural SFX batch 2 for the Bannerlord-clone (AUDIO_GAP_LIST.md section B).

Melee combat, siege engines, horses, extra UI, extra foley, extra ambience
beds, war horns. All synthesized with numpy DSP - no samples.
sfx.py (batch 1) is untouched. Run: python3 sfx2.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav, adsr

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx2")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx2-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(777)


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


# ------------------------------------------------------------------ melee
def sword_clash():
    """Metallic ring: inharmonic partials + noise scrape."""
    m = int(0.45 * SR)
    t = np.arange(m) / SR
    partials = [1244, 1866, 2511, 3320, 4180]
    x = np.zeros(m)
    for i, f in enumerate(partials):
        x += np.sin(2 * np.pi * f * t + _rng.uniform(0, 6.28)) * _env_decay(m, 18 + i * 9) * (0.5 / (i + 1))
    scrape = highpass(noise(m), 4000) * _env_decay(m, 55) * 0.5
    return (x + scrape) * 0.8


def sword_whoosh():
    m = int(0.28 * SR)
    n = noise(m)
    # bandpass sweep upward: whoosh
    x = lowpass(n, 3000) - lowpass(n, 400)
    return x * _env_decay(m, 14) * np.minimum(np.arange(m) / (0.05 * SR), 1.0) * 0.7


def shield_block():
    """Wood thud + dull metal edge."""
    m = int(0.30 * SR)
    t = np.arange(m) / SR
    thud = lowpass(noise(m), 700) * _env_decay(m, 40)
    tone = np.sin(2 * np.pi * 220 * t) * _env_decay(m, 45) * 0.5
    return (thud + tone) * 0.8


def parry():
    """Quick bright ting, shorter than clash."""
    m = int(0.22 * SR)
    t = np.arange(m) / SR
    x = np.sin(2 * np.pi * 2900 * t) * _env_decay(m, 60)
    x += np.sin(2 * np.pi * 4350 * t) * _env_decay(m, 80) * 0.5
    return x * 0.6 + highpass(noise(m), 6000) * _env_decay(m, 90) * 0.25


def axe_chop():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    crack = highpass(noise(m), 1500) * _env_decay(m, 45)
    thud = np.sin(2 * np.pi * 110 * t) * _env_decay(m, 30) * 0.8
    return (crack * 0.6 + thud) * 0.8


def mace_thud():
    m = int(0.40 * SR)
    t = np.arange(m) / SR
    f = 90 * np.exp(-t * 20) + 45
    ph = np.cumsum(2 * np.pi * f / SR)
    return np.sin(ph) * _env_decay(m, 22) * 0.9 + lowpass(noise(m), 500) * _env_decay(m, 30) * 0.4


def spear_thrust():
    m = int(0.25 * SR)
    whoosh = (lowpass(noise(m), 2500) - lowpass(noise(m), 300)) * 0.5
    env = np.minimum(np.arange(m) / (0.04 * SR), 1.0) * _env_decay(m, 25)
    return whoosh * env * 0.8


def dagger_stab():
    m = int(0.18 * SR)
    t = np.arange(m) / SR
    x = np.sin(2 * np.pi * 1800 * t) * _env_decay(m, 70) * 0.5
    x += highpass(noise(m), 5000) * _env_decay(m, 80) * 0.4
    return x * 0.7


def arrow_whoosh():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    # whistling arrow: narrowband noise with doppler-ish sweep
    f = 2200 - 800 * (t / 0.35)
    tone = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    air = highpass(noise(m), 3000) * 0.3
    env = np.sin(np.pi * np.minimum(t / 0.35, 1.0)) ** 2
    return (tone + air) * env * 0.6


def arrow_hit_wood():
    m = int(0.20 * SR)
    t = np.arange(m) / SR
    knock = np.sin(2 * np.pi * 480 * t) * _env_decay(m, 55)
    knock += np.sin(2 * np.pi * 960 * t) * _env_decay(m, 75) * 0.4
    return knock * 0.7 + lowpass(noise(m), 1200) * _env_decay(m, 60) * 0.3


def arrow_hit_flesh():
    m = int(0.22 * SR)
    thud = lowpass(noise(m), 900) * _env_decay(m, 50)
    squelch = lowpass(noise(m), 400) * _env_decay(m, 35) * 0.6
    return (thud + squelch) * 0.7


def bow_draw():
    """Creaking wood tension, 0.6s."""
    m = int(0.60 * SR)
    t = np.arange(m) / SR
    creak = np.sin(2 * np.pi * (90 + 40 * t) * t) * 0.25
    creak *= (0.5 + 0.5 * np.sin(2 * np.pi * 7 * t))  # stick-slip
    return creak * np.minimum(t / 0.5, 1.0) * 0.6


def bow_release():
    m = int(0.20 * SR)
    t = np.arange(m) / SR
    twang = np.sin(2 * np.pi * 180 * t) * _env_decay(m, 50)
    twang += np.sin(2 * np.pi * 360 * t) * _env_decay(m, 70) * 0.4
    snap = highpass(noise(m), 2500) * _env_decay(m, 90) * 0.5
    return (twang + snap) * 0.7


def crossbow_fire():
    m = int(0.30 * SR)
    t = np.arange(m) / SR
    # mechanical clack + string snap
    clack = lowpass(noise(m), 2000) * _env_decay(m, 60)
    twang = np.sin(2 * np.pi * 140 * t) * _env_decay(m, 45) * 0.7
    return (clack * 0.7 + twang) * 0.8


# ------------------------------------------------------------------ siege
def catapult_launch():
    """Creak, release whip, whoosh."""
    m = int(1.2 * SR)
    t = np.arange(m) / SR
    out = np.zeros(m)
    # creak 0-0.4s
    cm = int(0.4 * SR)
    ct = np.arange(cm) / SR
    out[:cm] += np.sin(2 * np.pi * 70 * ct) * (0.5 + 0.5 * np.sin(2 * np.pi * 5 * ct)) * 0.3
    # release whip at 0.4s
    wm = int(0.3 * SR)
    wt = np.arange(wm) / SR
    whip = np.sin(2 * np.pi * (300 - 600 * wt) * wt) * _env_decay(wm, 20) * 0.6
    s = int(0.4 * SR)
    out[s:s + wm] += whip
    # whoosh 0.5-1.2s
    hm = int(0.7 * SR)
    whoosh = (lowpass(noise(hm), 1200) - lowpass(noise(hm), 150)) * 0.5
    s = int(0.5 * SR)
    out[s:s + hm] += whoosh * np.sin(np.pi * np.arange(hm) / hm)
    return out * 0.8


def trebuchet_release():
    m = int(1.5 * SR)
    t = np.arange(m) / SR
    out = np.zeros(m)
    # long counterweight groan
    gm = int(0.8 * SR)
    gt = np.arange(gm) / SR
    groan = np.sin(2 * np.pi * (55 + 25 * gt) * gt) * 0.4 * np.minimum(gt / 0.7, 1.0)
    out[:gm] += groan
    # sling release crack
    cm = int(0.25 * SR)
    crack = highpass(noise(cm), 2000) * _env_decay(cm, 40) * 0.7
    s = int(0.8 * SR)
    out[s:s + cm] += crack
    return out * 0.8


def battering_ram():
    """Rhythmic heavy impacts x3."""
    out = np.zeros(int(2.2 * SR))
    for i, off in enumerate((0.0, 0.7, 1.4)):
        m = int(0.5 * SR)
        t = np.arange(m) / SR
        f = 60 * np.exp(-t * 15) + 35
        ph = np.cumsum(2 * np.pi * f / SR)
        hit = np.sin(ph) * _env_decay(m, 16) + lowpass(noise(m), 400) * _env_decay(m, 20) * 0.6
        s = int(off * SR)
        out[s:s + m] += hit * (0.9 - i * 0.1)
    return out * 0.85


def wall_breach():
    """Masonry collapse: rumble + debris cascade."""
    m = int(2.5 * SR)
    t = np.arange(m) / SR
    rumble = lowpass(noise(m), 250) * _env_decay(m, 2.5)
    out = rumble * 0.9
    for b in _rng.uniform(0.1, 2.0, 14):
        dm = int(0.25 * SR)
        debris = lowpass(noise(dm), 1800) * _env_decay(dm, 25) * _rng.uniform(0.2, 0.6)
        s = int(b * SR)
        if s + dm < m:
            out[s:s + dm] += debris
    return out * 0.8


def gate_break():
    m = int(1.8 * SR)
    t = np.arange(m) / SR
    # splintering wood + iron bands snapping
    wood = lowpass(noise(m), 1500) * _env_decay(m, 4) * 0.7
    out = wood
    for b in (0.15, 0.45, 0.9):
        sm = int(0.12 * SR)
        snap = highpass(noise(sm), 3000) * _env_decay(sm, 60) * 0.6
        s = int(b * SR)
        out[s:s + sm] += snap
    # final crash
    cm = int(0.8 * SR)
    crash = lowpass(noise(cm), 800) * _env_decay(cm, 6) * 0.8
    s = int(1.0 * SR)
    out[s:s + cm] += crash
    return out * 0.8


# ------------------------------------------------------------------ horse
def gallop():
    """4-beat loopable gallop, 1.2s loop."""
    beat = int(0.30 * SR)
    m = beat * 4
    out = np.zeros(m)
    for i in range(4):
        hm = int(0.09 * SR)
        t = np.arange(hm) / SR
        hoof = lowpass(noise(hm), 900) * _env_decay(hm, 55)
        hoof += np.sin(2 * np.pi * 140 * t) * _env_decay(hm, 70) * 0.4
        s = i * beat
        out[s:s + hm] += hoof * (1.0 if i % 2 == 0 else 0.7)
    return _seamless(out, fade_s=0.15) * 0.8


def trot():
    beat = int(0.45 * SR)
    m = beat * 2
    out = np.zeros(m)
    for i in range(2):
        hm = int(0.10 * SR)
        t = np.arange(hm) / SR
        hoof = lowpass(noise(hm), 800) * _env_decay(hm, 50)
        s = i * beat
        out[s:s + hm] += hoof * (1.0 if i == 0 else 0.8)
    return _seamless(out, fade_s=0.15) * 0.75


def neigh():
    """Horse neigh: descending whinny with vibrato."""
    m = int(1.1 * SR)
    t = np.arange(m) / SR
    f0 = 900 - 500 * (t / 1.1)
    vib = 30 * np.sin(2 * np.pi * 9 * t)
    f = f0 + vib
    ph = np.cumsum(2 * np.pi * f / SR)
    tone = _rng.uniform(-1, 1, m) * 0.15 + np.sin(ph) * 0.6 + np.sin(ph * 2.02) * 0.25
    env = np.minimum(t / 0.08, 1.0) * np.exp(-t * 2.2)
    return lowpass(tone * env, 3500) * 0.7


def horse_snort():
    m = int(0.45 * SR)
    t = np.arange(m) / SR
    # pulsed broadband exhale
    gate = (np.sin(2 * np.pi * 14 * t) > 0).astype(float)
    x = lowpass(noise(m), 1200) * gate * 0.6
    return x * _env_decay(m, 6) * 0.8


# ------------------------------------------------------------------ ui extras
def ui2(kind):
    if kind == "level-up":
        out = np.zeros(int(0.7 * SR))
        for i, f in enumerate((523, 659, 784, 1047)):
            m = int(0.18 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.12 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 25) * 0.45
        return out
    if kind == "quest-accept":
        out = np.zeros(int(0.5 * SR))
        for i, f in enumerate((392, 523)):
            m = int(0.15 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.14 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 30) * 0.45
        # parchment rustle
        rm = int(0.3 * SR)
        out[:rm] += highpass(noise(rm), 4000) * _env_decay(rm, 18) * 0.15
        return out
    if kind == "quest-complete":
        out = np.zeros(int(0.9 * SR))
        for i, f in enumerate((523, 659, 784, 1047, 1319)):
            m = int(0.22 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.13 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 22) * 0.4
        return out
    if kind == "quest-fail":
        out = np.zeros(int(0.6 * SR))
        for i, f in enumerate((392, 330, 262)):
            m = int(0.20 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.16 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 25) * 0.45
        return out
    if kind == "coin":
        m = int(0.25 * SR)
        t = np.arange(m) / SR
        x = np.sin(2 * np.pi * 3400 * t) * _env_decay(m, 45) * 0.4
        x += np.sin(2 * np.pi * 5100 * t) * _env_decay(m, 60) * 0.25
        return x
    if kind == "map-open":
        m = int(0.45 * SR)
        t = np.arange(m) / SR
        unfurl = highpass(noise(m), 2500) * 0.25
        env = np.minimum(t / 0.35, 1.0) * np.exp(-np.maximum(t - 0.35, 0) * 20)
        return unfurl * env * 0.7
    if kind == "paper":
        m = int(0.25 * SR)
        return highpass(noise(m), 3500) * _env_decay(m, 22) * 0.35
    if kind == "notification":
        out = np.zeros(int(0.4 * SR))
        for i, f in enumerate((1047, 784)):
            m = int(0.12 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.13 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 40) * 0.4
        return out
    if kind == "back":
        m = int(0.10 * SR)
        t = np.arange(m) / SR
        return np.sin(2 * np.pi * 1500 * t) * _env_decay(m, 80) * 0.35
    if kind == "craft":
        out = np.zeros(int(0.8 * SR))
        # hammer taps x3
        for i, off in enumerate((0.0, 0.25, 0.5)):
            hm = int(0.12 * SR)
            ht = np.arange(hm) / SR
            tap = np.sin(2 * np.pi * 2000 * ht) * _env_decay(hm, 70) * 0.4
            tap += lowpass(noise(hm), 3000) * _env_decay(hm, 80) * 0.3
            s = int(off * SR)
            out[s:s + hm] += tap
        return out
    raise ValueError(kind)


# ------------------------------------------------------------------ foley extras
def footstep2(surface):
    cfg = {"wood": (900, 0.6, 55), "metal": (2400, 0.5, 80),
           "water": (1100, 0.5, 35)}[surface]
    cf, vel, decay = cfg
    m = int(0.13 * SR)
    t = np.arange(m) / SR
    if surface == "metal":
        ring = np.sin(2 * np.pi * 620 * t) * _env_decay(m, 60) * 0.4
        return (lowpass(noise(m), cf) * _env_decay(m, decay) + ring) * vel
    if surface == "water":
        splash = highpass(noise(m), 1800) * _env_decay(m, decay) * 0.7
        return splash * vel
    thud = lowpass(noise(m), cf) * _env_decay(m, decay)
    tap = np.sin(2 * np.pi * 220 * t) * _env_decay(m, 90) * 0.35
    return (thud + tap) * vel


def jump_land():
    m = int(0.30 * SR)
    t = np.arange(m) / SR
    thud = lowpass(noise(m), 600) * _env_decay(m, 35)
    grunt_freq = 130 * np.exp(-t * 10)
    ph = np.cumsum(2 * np.pi * grunt_freq / SR)
    return (thud * 0.8 + np.sin(ph) * _env_decay(m, 40) * 0.25) * 0.8


def door_open():
    m = int(0.70 * SR)
    t = np.arange(m) / SR
    # hinge creak: slow stick-slip sweep
    f = 180 + 120 * t
    creak = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.5 + 0.5 * np.sin(2 * np.pi * 4 * t)) * 0.3
    # latch click at start
    cm = int(0.06 * SR)
    click = lowpass(noise(cm), 2500) * _env_decay(cm, 100) * 0.5
    out = creak * np.minimum(t / 0.6, 1.0)
    out[:cm] += click
    return out * 0.7


def door_close():
    m = int(0.45 * SR)
    t = np.arange(m) / SR
    swing = lowpass(noise(m), 800) * 0.3 * np.minimum(t / 0.3, 1.0)
    m2 = int(0.12 * SR)
    slam = lowpass(noise(m2), 500) * _env_decay(m2, 40) * 0.9
    slam += np.sin(2 * np.pi * 95 * np.arange(m2) / SR) * _env_decay(m2, 45) * 0.5
    out = swing
    s = int(0.30 * SR)
    out[s:s + m2] += slam
    return out * 0.8


def chest_open():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # wood creak + lid thump
    creak = np.sin(2 * np.pi * (140 + 60 * t) * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 6 * t)) * 0.3
    out = creak * np.minimum(t / 0.45, 1.0)
    tm = int(0.10 * SR)
    thump = lowpass(noise(tm), 700) * _env_decay(tm, 50) * 0.6
    s = int(0.42 * SR)
    out[s:s + tm] += thump
    return out * 0.7


def pick_up():
    m = int(0.15 * SR)
    t = np.arange(m) / SR
    # small object lift: soft tick + rustle
    tick = np.sin(2 * np.pi * 1200 * t) * _env_decay(m, 70) * 0.35
    rustle = highpass(noise(m), 4500) * _env_decay(m, 50) * 0.2
    return tick + rustle


def drop():
    m = int(0.25 * SR)
    t = np.arange(m) / SR
    thud = lowpass(noise(m), 1000) * _env_decay(m, 45)
    bounce = np.sin(2 * np.pi * 300 * t) * _env_decay(m, 60) * 0.3
    return (thud + bounce) * 0.7


# ------------------------------------------------------------------ ambience extras
def ambience2(kind, dur=10.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == "forest":
        base = lowpass(noise(n), 600) * 0.22
        # leaves rustle gusts
        gust = 0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t + 1.0)
        rustle = highpass(lowpass(noise(n), 4000), 1200) * gust * 0.12
        for b in _rng.uniform(0, dur, 9):
            m = int(0.15 * SR)
            bt = np.arange(m) / SR
            f = 3200 + 900 * np.sin(2 * np.pi * 25 * bt)
            chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * _env_decay(m, 28) * 0.10
            s = int(b * SR)
            if s + m < n:
                base[s:s + m] += chirp
        return _seamless(base + rustle)
    if kind == "campfire":
        crackle = np.zeros(n)
        for b in _rng.uniform(0, dur, 60):
            m = int(_rng.uniform(0.02, 0.09) * SR)
            pop = highpass(noise(m), 2000) * _env_decay(m, _rng.uniform(60, 120)) * _rng.uniform(0.1, 0.4)
            s = int(b * SR)
            if s + m < n:
                crackle[s:s + m] += pop
        bed = lowpass(noise(n), 500) * 0.18
        return _seamless(bed + crackle * 0.8)
    if kind == "tavern-interior":
        murmur = lowpass(noise(n), 500) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t)) * 0.25
        # clinks: glass/mug
        for b in _rng.uniform(0, dur, 8):
            m = int(0.12 * SR)
            bt = np.arange(m) / SR
            clink = np.sin(2 * np.pi * 2600 * bt) * _env_decay(m, 55) * 0.10
            clink += np.sin(2 * np.pi * 3900 * bt) * _env_decay(m, 70) * 0.06
            s = int(b * SR)
            if s + m < n:
                murmur[s:s + m] += clink
        # low lute-ish strum bed
        lute = np.sin(2 * np.pi * 196 * t) * 0.03 + np.sin(2 * np.pi * 294 * t) * 0.02
        return _seamless(murmur + lute)
    if kind == "market-crowd":
        crowd = lowpass(noise(n), 900) * 0.30
        swell = 0.6 + 0.4 * np.sin(2 * np.pi * 0.05 * t)
        # vendor shouts (unintelligible band blips)
        for b in _rng.uniform(0, dur, 6):
            m = int(0.4 * SR)
            bt = np.arange(m) / SR
            f = 300 + 150 * np.sin(2 * np.pi * 3 * bt)
            shout = np.sin(np.cumsum(2 * np.pi * f / SR)) * _env_decay(m, 8) * 0.08
            s = int(b * SR)
            if s + m < n:
                crowd[s:s + m] += lowpass(shout, 1200)
        return _seamless(crowd * swell)
    if kind == "ocean":
        swell = 0.5 + 0.5 * np.sin(2 * np.pi * 0.08 * t)
        waves = lowpass(noise(n), 700) * swell * 0.45
        hiss = highpass(lowpass(noise(n), 5000), 2000) * swell * 0.10
        return _seamless(waves + hiss)
    if kind == "cave":
        base = lowpass(noise(n), 200) * 0.20
        # water drips with long echo-ish decay
        for b in _rng.uniform(0, dur, 10):
            m = int(0.30 * SR)
            bt = np.arange(m) / SR
            drip = np.sin(2 * np.pi * (1800 - 900 * bt) * bt) * _env_decay(m, 30) * 0.14
            s = int(b * SR)
            if s + m < n:
                base[s:s + m] += drip
        return _seamless(base)
    if kind == "desert-wind":
        swell = 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 0.06 * t))
        x = lowpass(noise(n), 900) * swell * 0.4
        whistle = np.sin(2 * np.pi * (600 + 200 * np.sin(2 * np.pi * 0.11 * t)) * t) * 0.05
        return _seamless(x + whistle)
    if kind == "thunderstorm":
        rain = highpass(lowpass(noise(n), 6000), 1500) * 0.25
        out = rain
        for b in _rng.uniform(0.5, dur - 1.5, 4):
            th = int(2.0 * SR)
            tt = np.arange(th) / SR
            f = 40 + 60 * np.exp(-tt * 3)
            ph = np.cumsum(2 * np.pi * f / SR)
            thunder = np.sin(ph) * np.exp(-tt * 2.5) * 0.7
            s = int(b * SR)
            if s + th < n:
                out[s:s + th] += thunder
        return _seamless(out)
    raise ValueError(kind)


# ------------------------------------------------------------------ horns
def war_horn(dur=2.2):
    """Deep war horn blast."""
    m = int(dur * SR)
    t = np.arange(m) / SR
    f = 98  # G2
    x = np.sin(2 * np.pi * f * t) * 0.55
    x += np.sin(2 * np.pi * f * 2.01 * t) * 0.25
    x += np.sin(2 * np.pi * f * 2.98 * t) * 0.12
    # breath noise
    x += lowpass(noise(m), 600) * 0.12
    env = np.minimum(t / 0.25, 1.0) * np.exp(-np.maximum(t - dur + 0.6, 0) * 4)
    return x * env * 0.85


def signal_horn():
    """Two-note rally signal."""
    out = np.zeros(int(1.6 * SR))
    for i, (off, f) in enumerate(((0.0, 147), (0.55, 196))):
        m = int(0.55 * SR)
        t = np.arange(m) / SR
        x = np.sin(2 * np.pi * f * t) * 0.5 + np.sin(2 * np.pi * f * 2 * t) * 0.2
        x *= np.minimum(t / 0.08, 1.0) * np.exp(-np.maximum(t - 0.35, 0) * 6)
        s = int(off * SR)
        out[s:s + m] += x
    return out * 0.8


SFX2 = [
    # melee
    ("melee/sword-clash", sword_clash, "sword on sword clash"),
    ("melee/sword-whoosh", sword_whoosh, "sword swing whoosh"),
    ("melee/shield-block", shield_block, "shield block thud"),
    ("melee/parry", parry, "quick parry ting"),
    ("melee/axe-chop", axe_chop, "axe chop"),
    ("melee/mace-thud", mace_thud, "mace impact thud"),
    ("melee/spear-thrust", spear_thrust, "spear thrust whoosh"),
    ("melee/dagger-stab", dagger_stab, "dagger stab"),
    ("melee/arrow-whoosh", arrow_whoosh, "arrow flight whistle"),
    ("melee/arrow-hit-wood", arrow_hit_wood, "arrow hits wood"),
    ("melee/arrow-hit-flesh", arrow_hit_flesh, "arrow hits flesh"),
    ("melee/bow-draw", bow_draw, "bow draw creak"),
    ("melee/bow-release", bow_release, "bow string release"),
    ("melee/crossbow-fire", crossbow_fire, "crossbow shot"),
    # siege
    ("siege/catapult-launch", catapult_launch, "catapult launch"),
    ("siege/trebuchet-release", trebuchet_release, "trebuchet release"),
    ("siege/battering-ram", battering_ram, "battering ram impacts x3"),
    ("siege/wall-breach", wall_breach, "wall collapse"),
    ("siege/gate-break", gate_break, "gate splintering break"),
    # horse
    ("horse/gallop", gallop, "horse gallop loop"),
    ("horse/trot", trot, "horse trot loop"),
    ("horse/neigh", neigh, "horse neigh"),
    ("horse/snort", horse_snort, "horse snort"),
    # ui extras
    ("ui/level-up", lambda: ui2("level-up"), "level up fanfare"),
    ("ui/quest-accept", lambda: ui2("quest-accept"), "quest accepted"),
    ("ui/quest-complete", lambda: ui2("quest-complete"), "quest complete fanfare"),
    ("ui/quest-fail", lambda: ui2("quest-fail"), "quest failed"),
    ("ui/coin", lambda: ui2("coin"), "coin clink"),
    ("ui/map-open", lambda: ui2("map-open"), "map unfurl"),
    ("ui/paper", lambda: ui2("paper"), "paper rustle"),
    ("ui/notification", lambda: ui2("notification"), "notification ping"),
    ("ui/back", lambda: ui2("back"), "UI back tick"),
    ("ui/craft", lambda: ui2("craft"), "crafting hammer taps"),
    # foley extras
    ("foley/footstep-wood", lambda: footstep2("wood"), "footstep on wood"),
    ("foley/footstep-metal", lambda: footstep2("metal"), "footstep on metal"),
    ("foley/footstep-water", lambda: footstep2("water"), "footstep in water"),
    ("foley/jump-land", jump_land, "jump landing"),
    ("foley/door-open", door_open, "door creak open"),
    ("foley/door-close", door_close, "door slam close"),
    ("foley/chest-open", chest_open, "chest open"),
    ("foley/pick-up", pick_up, "pick up item"),
    ("foley/drop", drop, "drop item"),
    # ambience extras (loopable)
    ("ambience/forest", lambda: ambience2("forest"), "forest bed, loopable"),
    ("ambience/campfire", lambda: ambience2("campfire"), "campfire bed, loopable"),
    ("ambience/tavern-interior", lambda: ambience2("tavern-interior"), "tavern interior bed, loopable"),
    ("ambience/market-crowd", lambda: ambience2("market-crowd"), "market crowd bed, loopable"),
    ("ambience/ocean", lambda: ambience2("ocean"), "ocean waves bed, loopable"),
    ("ambience/cave", lambda: ambience2("cave"), "cave drips bed, loopable"),
    ("ambience/desert-wind", lambda: ambience2("desert-wind"), "desert wind bed, loopable"),
    ("ambience/thunderstorm", lambda: ambience2("thunderstorm"), "thunderstorm bed, loopable"),
    # horns
    ("horn/war-horn", war_horn, "deep war horn blast"),
    ("horn/signal-horn", signal_horn, "two-note rally signal"),
]


def to_mp3():
    for name, _, _ in SFX2:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"encoded mp3s -> {MP3}")


def main():
    import json
    manifest = []
    for name, fn, desc in SFX2:
        x = fn()
        assert np.all(np.isfinite(x)), name
        assert len(x) > 0, name
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
    with open(os.path.join(OUT, "sfx2-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"{len(manifest)} sfx rendered -> {OUT}")
    to_mp3()


if __name__ == "__main__":
    main()
