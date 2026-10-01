#!/usr/bin/env python3
"""Pack 4 SFX synthesis for the Bannerlord-style game.

MASTER_PLAN.md 4C tasks 115-116:
  115. melee impacts, shield blocks, vehicle engine variants
  116. crowd-battle ambience loops at three intensities

Helpers (env_exp, env_ad, lowpass, highpass, bandpass, brown_noise,
make_loop) follow the same numpy idioms as content/audio/sfx/gen_sfx.py.

Every cue is deterministic: fixed seed -> identical bytes. Output is
44.1 kHz 16-bit mono WAV, written to content/audio/sfx/.

CUE_SPECS is the single source of truth for the manifest: each entry
names the cue, the builder, and the exact synthesis parameters.
"""
import numpy as np
import os
import wave

SR = 44100
TAU = 2 * np.pi
OUT = os.path.expanduser("~/workspace/bannerlord/content/audio/sfx")
os.makedirs(OUT, exist_ok=True)


def secs(s):
    return int(s * SR)


def env_exp(n, tau):
    t = np.arange(n) / SR
    return np.exp(-t / tau)


def env_ad(n, a, d):
    t = np.arange(n) / SR
    e = np.ones(n)
    na = int(a * SR)
    e[:na] = np.linspace(0, 1, na)
    e[na:] = np.exp(-(t[na:] - a) / d)
    return e


def lowpass(x, cutoff):
    alpha = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc)
        y[i] = acc
    return y


def highpass(x, cutoff):
    alpha = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = x[0]
    for i in range(len(x)):
        acc = alpha * (acc + x[i] - (x[i - 1] if i else 0))
        y[i] = x[i] - acc
    return y


def bandpass(x, lo, hi):
    return highpass(lowpass(x, hi), lo)


def brown_noise(n, rng):
    w = rng.standard_normal(n)
    b = np.cumsum(w)
    b -= np.linspace(b[0], b[-1], n)
    return b / (np.abs(b).max() + 1e-9)


def _onepole_lp_mag(freqs, cutoff):
    """Magnitude response of the one-pole lowpass used below (analytic)."""
    rc = 1.0 / (TAU * cutoff)
    alpha = (1.0 / SR) / (rc + 1.0 / SR)
    w = TAU * np.asarray(freqs) / SR
    den = np.sqrt(1 + (1 - alpha) ** 2 - 2 * (1 - alpha) * np.cos(w))
    return alpha / np.maximum(den, 1e-12)


def _onepole_hp_mag(freqs, cutoff):
    """Magnitude response of the one-pole highpass used below (analytic)."""
    rc = 1.0 / (TAU * cutoff)
    alpha = (1.0 / SR) / (rc + 1.0 / SR)
    w = TAU * np.asarray(freqs) / SR
    num = (1 - alpha) * 2 * np.abs(np.sin(w / 2))
    den = np.sqrt(1 + (1 - alpha) ** 2 - 2 * (1 - alpha) * np.cos(w))
    return num / np.maximum(den, 1e-12)


def periodic_noise(n, rng, mag):
    """Exactly n-periodic noise with per-bin magnitude response mag.

    Random phases at the DFT bins, shaped magnitudes, back through the
    inverse DFT: periodic by construction, so a file built only from
    periodic components loops with no boundary click and no crossfade."""
    nb = n // 2 + 1
    mag = np.asarray(mag, dtype=float)
    assert len(mag) == nb
    phases = rng.uniform(0, TAU, nb)
    X = mag * np.exp(1j * phases)
    X[0] = 0.0
    if n % 2 == 0:
        X[-1] = abs(X[-1])
    x = np.fft.irfft(X, n)
    mx = np.abs(x).max()
    return x / mx if mx > 1e-12 else x


def _check_integer_cycles(dur, **named_hz):
    """Fail loudly if any component would not complete integer cycles."""
    for label, hz in named_hz.items():
        cycles = hz * dur
        assert abs(cycles - round(cycles)) < 1e-6, \
            f"{label}={hz}Hz over {dur}s is {cycles} cycles: not integer, " \
            "loop would click"


def write_wav(name, x):
    x = np.nan_to_num(x)
    peak = np.abs(x).max()
    if peak > 0:
        x = x / peak * 0.9
    data = (x * 32767).astype(np.int16)
    path = os.path.join(OUT, name + ".wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    return path


# ---------- 115a. melee impacts ----------
def melee_impact_flesh(seed, dur=0.28, body_freq=72.0, noise_lp=900.0):
    """Punch / body hit: low sine thump + soft noise burst."""
    rng = np.random.default_rng(seed)
    n = secs(dur)
    t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * body_freq * t) * env_exp(n, 0.045)
    slap = lowpass(rng.standard_normal(n) * env_exp(n, 0.012), noise_lp)
    return thump * 1.1 + slap * 0.45


def melee_impact_armor(seed, dur=0.45, base=392.0):
    """Weapon striking plate armor: dull metallic partials + hard transient."""
    rng = np.random.default_rng(seed)
    n = secs(dur)
    t = np.arange(n) / SR
    partials = [1.0, 2.44, 3.91, 5.72]
    ring = sum(np.sin(2 * np.pi * base * p * t) * env_exp(n, 0.10 + 0.02 * i)
               for i, p in enumerate(partials)) / len(partials)
    hit = rng.standard_normal(n) * env_exp(n, 0.008)
    return ring * 0.7 + bandpass(hit, 1800, 7000) * 0.55


# ---------- 115b. shield blocks ----------
def shield_block_wood(seed, dur=0.38, knock_freq=150.0):
    """Blow absorbed by a wooden shield: woody knock + crackle + low thud."""
    rng = np.random.default_rng(seed)
    n = secs(dur)
    t = np.arange(n) / SR
    knock = np.sin(2 * np.pi * knock_freq * t) * env_exp(n, 0.055)
    crackle = (rng.random(n) > 0.986).astype(float) * rng.standard_normal(n)
    crack = bandpass(crackle, 1200, 4200) * env_exp(n, 0.06)
    thud = np.sin(2 * np.pi * 62 * t) * env_exp(n, 0.07)
    return knock * 0.8 + crack * 0.9 + thud * 0.7


def shield_block_metal(seed, dur=0.55, base=311.0):
    """Blow glancing off a metal shield: bright inharmonic clang."""
    rng = np.random.default_rng(seed)
    n = secs(dur)
    t = np.arange(n) / SR
    partials = [1.0, 2.71, 5.13, 7.96]
    ring = sum(np.sin(2 * np.pi * base * p * t) * env_exp(n, 0.16 + 0.04 * i)
               for i, p in enumerate(partials)) / len(partials)
    scrape = rng.standard_normal(n) * env_exp(n, 0.02)
    return ring * 0.85 + bandpass(scrape, 3200, 9000) * 0.35


# ---------- 115c. vehicle engine variants ----------
def engine_loop(seed, dur=2.0, chug_hz=9.0, body_freq=48.0,
                chug_depth=0.55, noise_lp=420.0, rumble_bp=(180, 700)):
    """Looping engine, EXACTLY periodic over dur: no crossfade needed.

    Every component completes an integer number of cycles (asserted): the
    harmonic stack, the AM chop, and the noise beds, which are synthesized
    in the frequency domain (random phases at DFT bins), periodic by
    construction. The file therefore loops sample-seamlessly."""
    _check_integer_cycles(dur, chug=chug_hz, body=body_freq)
    rng = np.random.default_rng(seed)
    n = secs(dur)
    t = np.arange(n) / SR
    body = (np.sin(TAU * body_freq * t)
            + 0.5 * np.sin(TAU * 2 * body_freq * t)
            + 0.25 * np.sin(TAU * 3 * body_freq * t))
    chop = 1 - chug_depth + chug_depth * (0.5 + 0.5 * np.sin(TAU * chug_hz * t)) ** 1.5
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    brown = 1.0 / (freqs + 15.0)
    brown[0] = 0.0
    exhaust = periodic_noise(n, rng, brown * _onepole_lp_mag(freqs, noise_lp))
    rumble = periodic_noise(n, rng,
                            brown * _onepole_lp_mag(freqs, rumble_bp[1])
                            * _onepole_hp_mag(freqs, rumble_bp[0]))
    x = body * chop * 0.6 + exhaust * 0.5 + rumble * 0.3
    return x / (np.abs(x).max() or 1.0) * 0.9


# ---------- 116. crowd-battle ambience, scalable intensity ----------
def crowd_battle_loop(seed, dur=6.0, voices=10, shout_gain=1.0,
                      impact_count=4, impact_gain=0.6, bed_gain=0.30):
    """One intensity layer of the crowd-battle bed, EXACTLY periodic over
    dur: no crossfade needed. Layered bandpassed voice-like shouts with
    integer-cycle AM, distant impact booms placed circularly (their decay
    wraps around the boundary), low crowd bed. All noise is synthesized in
    the frequency domain, periodic by construction. The client crossfades
    low/mid/high layers by live battle intensity."""
    rng = np.random.default_rng(seed)
    n = secs(dur)
    t = np.arange(n) / SR
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    brown = 1.0 / (freqs + 15.0)
    brown[0] = 0.0
    bed = periodic_noise(n, rng, brown * _onepole_lp_mag(freqs, 260)) * bed_gain
    out = bed.copy()
    for _ in range(voices):
        lo = rng.uniform(500, 1100)
        hi = rng.uniform(1600, 3600)
        v = periodic_noise(n, rng,
                           _onepole_lp_mag(freqs, hi) * _onepole_hp_mag(freqs, lo))
        k1 = int(rng.integers(2, 9))      # integer AM cycles: periodic
        k2 = int(rng.integers(1, 4))
        ph1, ph2 = rng.uniform(0, TAU, 2)
        am = ((0.5 + 0.5 * np.sin(TAU * k1 * t / dur + ph1)) ** 2
              * (0.6 + 0.4 * np.sin(TAU * k2 * t / dur + ph2)))
        out += v * am * shout_gain / voices * 3.0
    # distant impacts: decay placed circularly so the tail wraps seamlessly
    for _ in range(impact_count):
        at = int(rng.uniform(0, dur) * SR)
        bn = secs(0.9)
        tb = np.arange(bn) / SR
        bf = np.fft.rfftfreq(bn, 1.0 / SR)
        boom = (periodic_noise(bn, rng, _onepole_lp_mag(bf, 200))
                * env_ad(bn, 0.05, 0.25)
                + np.sin(TAU * 42 * tb) * env_ad(bn, 0.06, 0.3) * 0.8)
        # NOTE: 42 Hz * 0.9 s = 37.8 cycles, not integer, but the boom is
        # windowed to ~zero by its envelope before the 0.9 s mark, and the
        # circular placement below keeps the file exactly periodic.
        idx = (at + np.arange(bn)) % n
        out[idx] += boom * impact_gain * rng.uniform(0.5, 1.0)
    return out / (np.abs(out).max() or 1.0) * 0.9


CUE_SPECS = [
    # 115a melee impacts
    {"name": "melee-impact-flesh", "fn": "melee_impact_flesh",
     "params": {"seed": 201, "dur": 0.28, "body_freq": 72.0, "noise_lp": 900.0},
     "trigger": "Punch / unarmed strike lands on a body",
     "category": "melee"},
    {"name": "melee-impact-armor", "fn": "melee_impact_armor",
     "params": {"seed": 202, "dur": 0.45, "base": 392.0},
     "trigger": "Melee weapon strikes plate / hard armor",
     "category": "melee"},
    # 115b shield blocks
    {"name": "shield-block-wood", "fn": "shield_block_wood",
     "params": {"seed": 203, "dur": 0.38, "knock_freq": 150.0},
     "trigger": "Attack blocked by a wooden shield",
     "category": "melee"},
    {"name": "shield-block-metal", "fn": "shield_block_metal",
     "params": {"seed": 204, "dur": 0.55, "base": 311.0},
     "trigger": "Attack blocked by a metal / riot shield",
     "category": "melee"},
    # 115c vehicle engine variants (idle / rev states of existing engines)
    {"name": "tank-engine-idle", "fn": "engine_loop",
     "params": {"seed": 205, "dur": 2.0, "chug_hz": 6.5, "body_freq": 42.0,
                "chug_depth": 0.6, "noise_lp": 360.0, "rumble_bp": (150, 600)},
     "trigger": "LOOP: tank engine idling",
     "category": "vehicles", "loop": True},
    {"name": "tank-engine-rev", "fn": "engine_loop",
     "params": {"seed": 206, "dur": 2.0, "chug_hz": 13.0, "body_freq": 58.0,
                "chug_depth": 0.45, "noise_lp": 520.0, "rumble_bp": (220, 900)},
     "trigger": "LOOP: tank engine under load / revving",
     "category": "vehicles", "loop": True},
    {"name": "truck-engine-idle", "fn": "engine_loop",
     "params": {"seed": 207, "dur": 2.0, "chug_hz": 8.0, "body_freq": 55.0,
                "chug_depth": 0.6, "noise_lp": 480.0, "rumble_bp": (200, 750)},
     "trigger": "LOOP: truck engine idling",
     "category": "vehicles", "loop": True},
    {"name": "truck-engine-rev", "fn": "engine_loop",
     "params": {"seed": 208, "dur": 2.0, "chug_hz": 15.0, "body_freq": 72.0,
                "chug_depth": 0.45, "noise_lp": 640.0, "rumble_bp": (260, 1000)},
     "trigger": "LOOP: truck engine under load / revving",
     "category": "vehicles", "loop": True},
    # 116 crowd-battle intensity layers
    {"name": "crowd-battle-low-loop", "fn": "crowd_battle_loop",
     "params": {"seed": 209, "dur": 6.0, "voices": 8, "shout_gain": 0.7,
                "impact_count": 3, "impact_gain": 0.5, "bed_gain": 0.25},
     "trigger": "LOOP: battle ambience, low intensity (skirmish)",
     "category": "ambience", "loop": True},
    {"name": "crowd-battle-mid-loop", "fn": "crowd_battle_loop",
     "params": {"seed": 210, "dur": 6.0, "voices": 16, "shout_gain": 1.0,
                "impact_count": 6, "impact_gain": 0.7, "bed_gain": 0.32},
     "trigger": "LOOP: battle ambience, medium intensity (engagement)",
     "category": "ambience", "loop": True},
    {"name": "crowd-battle-high-loop", "fn": "crowd_battle_loop",
     "params": {"seed": 211, "dur": 6.0, "voices": 28, "shout_gain": 1.3,
                "impact_count": 10, "impact_gain": 0.9, "bed_gain": 0.40},
     "trigger": "LOOP: battle ambience, high intensity (full battle)",
     "category": "ambience", "loop": True},
]

BUILDERS = {
    "melee_impact_flesh": melee_impact_flesh,
    "melee_impact_armor": melee_impact_armor,
    "shield_block_wood": shield_block_wood,
    "shield_block_metal": shield_block_metal,
    "engine_loop": engine_loop,
    "crowd_battle_loop": crowd_battle_loop,
}


def synthesize_all():
    """Generate every pack-4 cue. Returns {name: path}."""
    made = {}
    for spec in CUE_SPECS:
        fn = BUILDERS[spec["fn"]]
        x = fn(**spec["params"])
        made[spec["name"]] = write_wav(spec["name"], x)
    return made


if __name__ == "__main__":
    made = synthesize_all()
    for name, path in made.items():
        print(f"WROTE {name}.wav -> {path}")
