"""Procedural SFX batch 3 for the Bannerlord-clone (round 2).

Vehicles, animals, combat foley extras, UI extras, weather beds.
All numpy DSP - no samples. sfx.py/sfx2.py untouched. Run: python3 sfx3.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx3")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx3-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(999)


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


# ---------------------------------------------------------------- vehicles
def helicopter_loop(dur=2.0):
    """Chopper: blade whomp + turbine whine, seamless loop."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    # blade pass ~13 Hz whomp
    whomp = np.sin(2 * np.pi * 13 * t) * 0.5 + np.sin(2 * np.pi * 26 * t) * 0.25
    whomp *= 0.6 + 0.4 * np.sin(2 * np.pi * 13 * t + 1.0)
    turbine = np.sin(2 * np.pi * 880 * t) * 0.08 + np.sin(2 * np.pi * 1320 * t) * 0.05
    x = lowpass(whomp, 400) + turbine + lowpass(noise(n), 300) * 0.15
    # force loop: integer blade cycles
    return _seamless(x, fade_s=0.3) * 0.75


def car_skid(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 1800 - 900 * (t / dur)
    tone = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.35
    tone += np.sin(np.cumsum(2 * np.pi * f * 1.5 / SR)) * 0.2
    env = np.sin(np.pi * np.minimum(t / dur, 1.0))
    return tone * env * 0.7 + highpass(noise(n), 3000) * env * 0.15


def car_crash():
    m = int(1.6 * SR)
    t = np.arange(m) / SR
    impact = lowpass(noise(m), 900) * _env_decay(m, 5) * 0.9
    out = impact
    # glass shatter
    gm = int(0.5 * SR)
    glass = highpass(noise(gm), 5000) * _env_decay(gm, 18) * 0.5
    s = int(0.15 * SR)
    out[s:s + gm] += glass
    # metal groan
    mm = int(0.8 * SR)
    mt = np.arange(mm) / SR
    groan = np.sin(2 * np.pi * (120 - 60 * mt) * mt) * _env_decay(mm, 6) * 0.4
    s = int(0.3 * SR)
    out[s:s + mm] += groan
    return out * 0.85


def car_horn(dur=0.8):
    m = int(dur * SR)
    t = np.arange(m) / SR
    # dual-tone horn: 370 + 466 Hz
    x = np.sin(2 * np.pi * 370 * t) * 0.4 + np.sin(2 * np.pi * 466 * t) * 0.4
    env = np.minimum(t / 0.05, 1.0) * np.minimum((dur - t) / 0.1, 1.0)
    return x * np.clip(env, 0, 1) * 0.7


def truck_engine_loop(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # low diesel chug ~9 Hz
    chug = np.sin(2 * np.pi * 9 * t) * 0.6 + np.sin(2 * np.pi * 18 * t) * 0.3
    x = lowpass(chug, 250) + lowpass(noise(n), 200) * 0.2
    return _seamless(x, fade_s=0.4) * 0.7


def brake_squeal(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 2800 + 400 * np.sin(2 * np.pi * 3 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.25
    env = np.sin(np.pi * np.minimum(t / dur, 1.0)) ** 2
    return x * env * 0.6


# ---------------------------------------------------------------- animals
def wolf_howl(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # howl contour: rise, hold, fall
    f = 400 + 300 * np.sin(np.pi * np.minimum(t / dur, 1.0)) ** 0.7
    vib = 1.0 + 0.04 * np.sin(2 * np.pi * 5.5 * t)
    ph = np.cumsum(2 * np.pi * f * vib / SR)
    x = np.sin(ph) * 0.5 + np.sin(ph * 2.01) * 0.18
    env = np.minimum(t / 0.4, 1.0) * np.exp(-np.maximum(t - dur + 0.8, 0) * 3)
    return x * env * 0.65


def dog_bark():
    out = np.zeros(int(0.9 * SR))
    for i, off in enumerate((0.0, 0.28, 0.56)):
        m = int(0.16 * SR)
        t = np.arange(m) / SR
        f = 500 - 200 * (t / 0.16)
        bark = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.5
        bark += lowpass(noise(m), 1500) * 0.3
        bark *= _env_decay(m, 30)
        s = int(off * SR)
        out[s:s + m] += bark * (1.0 - i * 0.15)
    return out * 0.7


def crow_caw():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # harsh descending caw x2
    out = np.zeros(m)
    for i, off in enumerate((0.0, 0.22)):
        cm = int(0.18 * SR)
        ct = np.arange(cm) / SR
        f = 1400 - 700 * (ct / 0.18)
        caw = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.4
        caw = np.sign(caw) * 0.3 + caw * 0.4  # harsh
        s = int(off * SR)
        out[s:s + cm] += caw * _env_decay(cm, 25)
    return out * 0.6


def owl_hoot():
    out = np.zeros(int(1.2 * SR))
    for i, (off, f, dur) in enumerate(((0.0, 350, 0.35), (0.5, 300, 0.5))):
        m = int(dur * SR)
        t = np.arange(m) / SR
        hoot = np.sin(2 * np.pi * f * t) * 0.45 + np.sin(2 * np.pi * f * 2 * t) * 0.1
        hoot *= np.sin(np.pi * np.minimum(t / dur, 1.0))
        s = int(off * SR)
        out[s:s + m] += hoot
    return out * 0.65


def bear_growl(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 70 + 25 * np.sin(2 * np.pi * 0.8 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.6
    x = np.sign(x) * 0.25 + x * 0.5  # guttural
    x += lowpass(noise(n), 400) * 0.35
    env = np.minimum(t / 0.2, 1.0) * np.exp(-np.maximum(t - dur + 0.5, 0) * 4)
    return x * env * 0.8


def rattlesnake(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # high pulsed rattle
    gate = (np.sin(2 * np.pi * 28 * t) > 0).astype(float)
    x = highpass(noise(n), 4500) * gate * 0.5
    env = np.minimum(t / 0.1, 1.0) * np.minimum((dur - t) / 0.2, 1.0)
    return x * np.clip(env, 0, 1) * 0.6


# ---------------------------------------------------------------- combat foley extras
def sword_draw():
    m = int(0.45 * SR)
    t = np.arange(m) / SR
    # metal sliding from scabbard
    slide = highpass(noise(m), 2500) * 0.35
    ring = np.sin(2 * np.pi * 2100 * t) * _env_decay(m, 12) * 0.25
    env = np.minimum(t / 0.35, 1.0) * np.exp(-np.maximum(t - 0.35, 0) * 30)
    return (slide + ring) * env * 0.7


def sword_sheathe():
    m = int(0.40 * SR)
    t = np.arange(m) / SR
    slide = highpass(noise(m), 2000) * 0.3
    clunk_m = int(0.08 * SR)
    clunk = lowpass(noise(clunk_m), 1200) * _env_decay(clunk_m, 60) * 0.6
    out = slide * np.minimum(t / 0.3, 1.0)
    s = int(0.30 * SR)
    out[s:s + clunk_m] += clunk
    return out * 0.7


def shield_raise():
    m = int(0.30 * SR)
    t = np.arange(m) / SR
    # straps + wood knock
    rustle = highpass(noise(m), 3000) * 0.2 * np.minimum(t / 0.2, 1.0)
    km = int(0.10 * SR)
    knock = lowpass(noise(km), 800) * _env_decay(km, 55) * 0.6
    out = rustle
    s = int(0.18 * SR)
    out[s:s + km] += knock
    return out * 0.7


def armor_rustle(dur=0.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chainmail jingle: metallic noise bursts
    x = highpass(noise(n), 3500) * 0.25
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 2.5 * t)
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.6


def grenade_bounce():
    out = np.zeros(int(0.8 * SR))
    for i, (off, f) in enumerate(((0.0, 900), (0.25, 700), (0.45, 550))):
        m = int(0.09 * SR)
        t = np.arange(m) / SR
        b = np.sin(2 * np.pi * f * t) * _env_decay(m, 70) * 0.5
        b += lowpass(noise(m), 2000) * _env_decay(m, 80) * 0.3
        s = int(off * SR)
        out[s:s + m] += b * (1.0 - i * 0.25)
    # pin pull at start
    pm = int(0.06 * SR)
    pin = highpass(noise(pm), 4000) * _env_decay(pm, 90) * 0.4
    out[:pm] += pin
    return out * 0.7


def molotov_break():
    m = int(0.5 * SR)
    # glass shatter + liquid splash + whoosh ignition
    glass = highpass(noise(m), 4500) * _env_decay(m, 25) * 0.6
    sm = int(0.3 * SR)
    splash = lowpass(noise(sm), 1200) * _env_decay(sm, 20) * 0.4
    out = glass
    s = int(0.08 * SR)
    out[s:s + sm] += splash
    # ignition whoosh
    wm = int(0.35 * SR)
    whoosh = (lowpass(noise(wm), 2000) - lowpass(noise(wm), 300)) * 0.5
    s = int(0.15 * SR)
    out[s:s + wm] += whoosh * _env_decay(wm, 12) * 0.7
    return out * 0.8


# ---------------------------------------------------------------- ui extras
def ui3(kind):
    if kind == "achievement":
        out = np.zeros(int(1.0 * SR))
        for i, f in enumerate((659, 784, 988, 1319)):
            m = int(0.25 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.16 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 20) * 0.4
        # shimmer
        sh = np.sin(2 * np.pi * 5200 * np.arange(int(1.0 * SR)) / SR) * 0.05
        return out + sh * _env_decay(int(1.0 * SR), 4)
    if kind == "trade":
        out = np.zeros(int(0.5 * SR))
        # two coins
        for i, off in enumerate((0.0, 0.18)):
            m = int(0.15 * SR)
            t = np.arange(m) / SR
            c = np.sin(2 * np.pi * 3400 * t) * _env_decay(m, 50) * 0.35
            s = int(off * SR)
            out[s:s + m] += c
        return out
    if kind == "dialogue-open":
        m = int(0.35 * SR)
        t = np.arange(m) / SR
        # soft page + low blip
        page = highpass(noise(m), 3000) * 0.15 * np.minimum(t / 0.25, 1.0)
        blip = np.sin(2 * np.pi * 660 * t) * _env_decay(m, 30) * 0.3
        return page + blip
    if kind == "skill-point":
        out = np.zeros(int(0.5 * SR))
        for i, f in enumerate((784, 1175)):
            m = int(0.16 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.15 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 35) * 0.4
        return out
    if kind == "error-critical":
        m = int(0.5 * SR)
        t = np.arange(m) / SR
        sq = np.sign(np.sin(2 * np.pi * 110 * t))
        x = lowpass(sq, 700) * 0.5
        # alarm pulse
        x *= 0.6 + 0.4 * np.sin(2 * np.pi * 4 * t)
        return x * np.minimum(t / 0.02, 1.0)
    raise ValueError(kind)


# ---------------------------------------------------------------- weather
def blizzard(dur=10.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t)
    howl = lowpass(noise(n), 1200) * swell * 0.5
    whistle = np.sin(2 * np.pi * (900 + 300 * np.sin(2 * np.pi * 0.09 * t)) * t) * 0.06
    return _seamless(howl + whistle)


def hail(dur=8.0):
    n = int(dur * SR)
    out = highpass(lowpass(noise(n), 7000), 2500) * 0.20
    # ice pellet ticks
    for b in _rng.uniform(0, dur, 120):
        m = int(0.03 * SR)
        tick = highpass(noise(m), 5000) * _env_decay(m, 150) * _rng.uniform(0.1, 0.35)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += tick
    return _seamless(out)


def dust_storm(dur=10.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    swell = 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 0.04 * t + 0.5))
    x = lowpass(noise(n), 500) * swell * 0.55
    grit = highpass(noise(n), 2500) * swell * 0.08
    return _seamless(x + grit)


# ---------------------------------------------------------------- foley extras
def rope_creak(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 130 + 50 * np.sin(2 * np.pi * 1.2 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.5 + 0.5 * np.sin(2 * np.pi * 3.5 * t)) * 0.3
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def chain_rattle(dur=0.7):
    n = int(dur * SR)
    out = np.zeros(n)
    for b in _rng.uniform(0, dur - 0.1, 8):
        m = int(0.07 * SR)
        t = np.arange(m) / SR
        link = np.sin(2 * np.pi * _rng.uniform(1800, 3200) * t) * _env_decay(m, 80) * 0.3
        link += highpass(noise(m), 4000) * _env_decay(m, 90) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += link
    return out * 0.7


def wood_knock():
    out = np.zeros(int(0.6 * SR))
    for i, off in enumerate((0.0, 0.22)):
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        k = np.sin(2 * np.pi * 420 * t) * _env_decay(m, 60) * 0.6
        k += np.sin(2 * np.pi * 840 * t) * _env_decay(m, 80) * 0.25
        s = int(off * SR)
        out[s:s + m] += k
    return out * 0.7


def metal_clank():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    x = np.zeros(m)
    for i, f in enumerate((620, 930, 1470, 2200)):
        x += np.sin(2 * np.pi * f * t + _rng.uniform(0, 6.28)) * _env_decay(m, 30 + i * 15) * (0.4 / (i + 1))
    return x * 0.8 + highpass(noise(m), 5000) * _env_decay(m, 70) * 0.2


SFX3 = [
    ("vehicle/helicopter", helicopter_loop, "helicopter loop"),
    ("vehicle/car-skid", car_skid, "car tire skid"),
    ("vehicle/car-crash", car_crash, "car crash"),
    ("vehicle/car-horn", car_horn, "car horn"),
    ("vehicle/truck-engine", truck_engine_loop, "truck diesel loop"),
    ("vehicle/brake-squeal", brake_squeal, "brake squeal"),
    ("animal/wolf-howl", wolf_howl, "wolf howl"),
    ("animal/dog-bark", dog_bark, "dog bark x3"),
    ("animal/crow-caw", crow_caw, "crow caw"),
    ("animal/owl-hoot", owl_hoot, "owl hoot"),
    ("animal/bear-growl", bear_growl, "bear growl"),
    ("animal/rattlesnake", rattlesnake, "rattlesnake rattle"),
    ("melee/sword-draw", sword_draw, "sword drawn from scabbard"),
    ("melee/sword-sheathe", sword_sheathe, "sword sheathed"),
    ("melee/shield-raise", shield_raise, "shield raised"),
    ("melee/armor-rustle", armor_rustle, "chainmail rustle"),
    ("weapon/grenade-bounce", grenade_bounce, "grenade pin + bounces"),
    ("weapon/molotov-break", molotov_break, "molotov shatter + ignite"),
    ("ui/achievement", lambda: ui3("achievement"), "achievement fanfare"),
    ("ui/trade", lambda: ui3("trade"), "trade coins"),
    ("ui/dialogue-open", lambda: ui3("dialogue-open"), "dialogue open"),
    ("ui/skill-point", lambda: ui3("skill-point"), "skill point gained"),
    ("ui/error-critical", lambda: ui3("error-critical"), "critical error alarm"),
    ("ambience/blizzard", blizzard, "blizzard bed, loopable"),
    ("ambience/hail", hail, "hail storm bed, loopable"),
    ("ambience/dust-storm", dust_storm, "dust storm bed, loopable"),
    ("foley/rope-creak", rope_creak, "rope creak"),
    ("foley/chain-rattle", chain_rattle, "chain rattle"),
    ("foley/wood-knock", wood_knock, "wooden door knock"),
    ("foley/metal-clank", metal_clank, "metal clank"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX3:
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
    with open(os.path.join(OUT, "sfx3-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX3:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
