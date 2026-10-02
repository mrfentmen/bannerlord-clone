"""Batch 2 SFX for the Bannerlord-clone: UI rewards, battle signals,
vehicle rotor, weather hits, foley. Pure numpy DSP, no samples.
Run: python3 sfx2.py"""
import os
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav, adsr, midi_to_freq

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx")
os.makedirs(OUT, exist_ok=True)
_rng = np.random.default_rng(777)


def _env(n, rate):
    t = np.arange(n) / SR
    return np.exp(-t * rate)


def _ping(freq, dur=0.5, decay=14.0, vel=1.0, harmonics=(1.0, 2.76, 5.4)):
    """Metallic ping: inharmonic partials, like a coin."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    amps = (1.0, 0.45, 0.22)
    for f_mult, a in zip(harmonics, amps):
        x += a * np.sin(2 * np.pi * freq * f_mult * t + _rng.uniform(0, 6.28))
    return x * _env(n, decay) * vel * 0.5


def coin():
    """Handful of gold coins: 5 staggered metallic pings."""
    n = int(1.1 * SR)
    out = np.zeros(n)
    freqs = [5200, 6100, 4800, 6600, 5600]
    for i, f in enumerate(freqs):
        p = _ping(f, dur=0.45, decay=16.0, vel=0.9)
        s = int((0.03 + i * 0.09 + _rng.uniform(-0.015, 0.015)) * SR)
        out[s:s + len(p)] += p
    return out


def quest_complete():
    """Rising major arpeggio with shimmer: C E G C up two octaves."""
    notes = [72, 76, 79, 84, 88]
    n_total = int(1.6 * SR)
    out = np.zeros(n_total)
    for i, m in enumerate(notes):
        f = midi_to_freq(m)
        nn = int(0.7 * SR)
        t = np.arange(nn) / SR
        tone = (np.sin(2 * np.pi * f * t) * 0.6 +
                np.sin(2 * np.pi * f * 2 * t) * 0.25 +
                np.sin(2 * np.pi * f * 3 * t) * 0.12)
        tone *= adsr(nn, 0.01, 0.08, 0.7, 0.45)
        s = int(i * 0.16 * SR)
        out[s:s + nn] += tone * 0.55
    # shimmer tail
    shimmer = highpass(noise(n_total), 8000) * _env(n_total, 4.0) * 0.06
    return out + shimmer


def ui_notify():
    """Soft two-tone notification ping."""
    n_total = int(0.8 * SR)
    out = np.zeros(n_total)
    for i, m in enumerate([88, 84]):
        f = midi_to_freq(m)
        nn = int(0.5 * SR)
        t = np.arange(nn) / SR
        tone = np.sin(2 * np.pi * f * t) * _env(nn, 9.0)
        s = int(i * 0.22 * SR)
        out[s:s + nn] += tone * 0.5
    return out


def level_up():
    """Shimmering rising sweep for level-up."""
    dur = 1.4
    n = int(dur * SR)
    t = np.arange(n) / SR
    f0, f1 = 300.0, 2400.0
    f = f0 * (f1 / f0) ** (t / dur)
    ph = np.cumsum(2 * np.pi * f / SR)
    sweep = np.sin(ph) * np.sin(np.pi * t / dur) ** 0.5
    harm = np.sin(2 * ph) * 0.3 * np.sin(np.pi * t / dur)
    return (sweep + harm) * 0.45


def war_horn():
    """Deep battle horn: low brass-ish blast with growl."""
    dur = 2.2
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 98.0  # G2
    # slight downward pitch for weight
    f_inst = f * (1 - 0.06 * t / dur)
    ph = np.cumsum(2 * np.pi * f_inst / SR)
    growl = 1 + 0.25 * np.sin(2 * np.pi * 27 * t)
    tone = (np.sin(ph) * 0.7 + np.sin(2 * ph) * 0.35 +
            np.sin(3 * ph) * 0.18) * growl
    env = adsr(n, 0.15, 0.3, 0.85, 0.8)
    breath = lowpass(noise(n), 500) * 0.12 * env
    return (tone * env * 0.75 + breath)


def crowd_cheer():
    """Crowd swell: band-passed noise shaped like many voices."""
    dur = 3.0
    n = int(dur * SR)
    t = np.arange(n) / SR
    # voices live ~300-3000 Hz
    x = noise(n)
    x = lowpass(x, 3200)
    x = highpass(x, 280)
    # amplitude swells like a crowd wave
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * 0.9 * t + 0.7)
    swell *= np.sin(np.pi * np.minimum(t / dur, 1.0)) ** 0.4
    # add some whistle-ish peaks
    for _ in range(24):
        f = _rng.uniform(1200, 3200)
        s = int(_rng.uniform(0, dur - 0.3) * SR)
        nn = int(0.25 * SR)
        tt = np.arange(nn) / SR
        x[s:s + nn] += np.sin(2 * np.pi * f * tt) * _env(nn, 12) * 0.05
    return x * swell * 0.5


def helicopter(dur=4.0):
    """Loopable helicopter rotor: chop + turbine whine."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rotor chop at ~13 Hz with harmonics
    chop = (np.sin(2 * np.pi * 13 * t) * 0.5 +
            np.sin(2 * np.pi * 26 * t) * 0.3 +
            np.sin(2 * np.pi * 39 * t) * 0.15)
    chop = lowpass(chop, 400)
    # turbine whine
    whine = np.sin(2 * np.pi * 880 * t) * 0.06 + np.sin(2 * np.pi * 1320 * t) * 0.03
    x = (chop * 0.8 + whine) * 0.6
    # seamless loop: crossfade last 0.25s into first 0.25s
    m = int(0.25 * SR)
    fade = np.linspace(0, 1, m)
    x[:m] = x[:m] * fade + x[-m:] * (1 - fade)
    return x[:n - m]


def thunder():
    """Deep thunder: sub rumble with slow attack."""
    dur = 4.5
    n = int(dur * SR)
    t = np.arange(n) / SR
    rumble = lowpass(noise(n), 120)
    # rolling amplitude
    roll = 0.5 + 0.5 * np.sin(2 * np.pi * 0.8 * t + 1.2)
    roll *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.23 * t)
    env = adsr(n, 0.08, 1.2, 0.6, 2.5)
    crack = highpass(noise(n), 900) * _env(n, 22.0) * 0.25
    return (rumble * roll * env * 1.1 + crack)


def car_door():
    """Car door thunk: low thump + latch click."""
    n = int(0.5 * SR)
    t = np.arange(n) / SR
    f = 70 + 60 * np.exp(-t * 40)
    ph = np.cumsum(2 * np.pi * f / SR)
    thump = np.sin(ph) * _env(n, 26.0)
    latch = highpass(noise(n), 3000) * _env(n, 90.0) * 0.4
    # latch hits slightly after the thump starts
    latch = np.roll(latch, int(0.03 * SR))
    return (thump * 0.9 + latch) * 0.8


def melee_hit():
    """Whoosh into a heavy thud for close combat."""
    dur = 0.6
    n = int(dur * SR)
    t = np.arange(n) / SR
    # whoosh: bandpassed noise swelling then cut
    whoosh = noise(n)
    whoosh = lowpass(whoosh, 2500) - lowpass(whoosh, 400)
    whoosh_env = np.sin(np.pi * np.minimum(t / 0.35, 1.0)) ** 2
    whoosh_env[t > 0.35] = 0
    # thud
    f = 90 + 70 * np.exp(-t * 50)
    ph = np.cumsum(2 * np.pi * f / SR)
    thud = np.sin(ph) * _env(n, 30.0)
    thud = np.roll(thud, int(0.32 * SR))
    return (whoosh * whoosh_env * 0.5 + thud * 0.9) * 0.85


SFX2 = [
    ("ui/coin", coin, "gold coins clink"),
    ("ui/quest-complete", quest_complete, "quest complete fanfare"),
    ("ui/notify", ui_notify, "soft notification ping"),
    ("ui/level-up", level_up, "level-up shimmer sweep"),
    ("battle/horn", war_horn, "war horn blast"),
    ("battle/crowd-cheer", crowd_cheer, "crowd cheer swell"),
    ("battle/melee-hit", melee_hit, "melee whoosh and thud"),
    ("vehicle/helicopter", helicopter, "helicopter rotor, loopable"),
    ("weapon/thunder", thunder, "deep thunder rumble"),
    ("foley/car-door", car_door, "car door thunk"),
]

META2 = {name: desc for name, _, desc in SFX2}


def main():
    import json
    # load existing manifest to append
    mpath = os.path.join(OUT, "sfx-manifest.json")
    manifest = []
    if os.path.exists(mpath):
        with open(mpath) as f:
            manifest = json.load(f)
    existing = {m["name"] for m in manifest}
    for name, fn, desc in SFX2:
        if name in existing:
            print(f"{name:32s} already in manifest, skipping")
            continue
        x = fn()
        assert np.all(np.isfinite(x)), name
        x = limiter(x, ceiling=0.89)
        path = os.path.join(OUT, name + ".wav")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        write_wav(path, x)
        peak = float(np.max(np.abs(x)))
        print(f"{name:32s} {len(x)/SR:5.1f}s peak={peak:.2f}")
        manifest.append({"name": name, "description": desc,
                         "duration_s": round(len(x) / SR, 2), "peak": round(peak, 3)})
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"{len(manifest)} total sfx in manifest -> {mpath}")


if __name__ == "__main__":
    main()
