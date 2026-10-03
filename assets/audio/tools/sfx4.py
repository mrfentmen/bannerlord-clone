"""Procedural SFX batch 4 for the Bannerlord-clone (round 3).

Naval combat, crowd reactions, melee extras, ambience extras, foley extras.
All numpy DSP - no samples. Run: python3 sfx4.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx4")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx4-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(20260704)


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


# ---------------------------------------------------------------- naval
def cannon_fire():
    m = int(1.8 * SR)
    t = np.arange(m) / SR
    # deep boom + rolling echo
    f = 45 + 70 * np.exp(-t * 8)
    ph = np.cumsum(2 * np.pi * f / SR)
    boom = np.sin(ph) * _env_decay(m, 4)
    blast = lowpass(noise(m), 800) * _env_decay(m, 6) * 0.8
    crack = highpass(noise(m), 2500) * _env_decay(m, 25) * 0.4
    return (boom + blast + crack) * 0.8


def cannon_splash():
    m = int(1.2 * SR)
    # water column: splash + low boom
    splash = highpass(lowpass(noise(m), 5000), 1200) * _env_decay(m, 8) * 0.7
    bm = int(0.6 * SR)
    boom = lowpass(noise(bm), 300) * _env_decay(bm, 10) * 0.5
    out = splash
    out[:bm] += boom
    return out * 0.75


def ship_creak(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 90 + 60 * np.sin(2 * np.pi * 0.4 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.5 + 0.5 * np.sin(2 * np.pi * 1.8 * t)) * 0.35
    x += lowpass(noise(n), 500) * 0.1
    return _seamless(x, fade_s=0.5) * 0.7


def anchor_drop():
    m = int(1.4 * SR)
    # chain run + splash + thud
    cm = int(0.7 * SR)
    chain = highpass(noise(cm), 3000) * 0.35 * np.minimum(np.arange(cm) / (0.5 * SR), 1.0)
    out = np.zeros(m)
    out[:cm] += chain
    sm = int(0.5 * SR)
    splash = highpass(lowpass(noise(sm), 4000), 1000) * _env_decay(sm, 12) * 0.6
    s = int(0.7 * SR)
    out[s:s + sm] += splash
    return out * 0.75


def hull_knock():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    # deep wooden hull knock
    x = np.sin(2 * np.pi * 130 * t) * _env_decay(m, 35) * 0.7
    x += np.sin(2 * np.pi * 260 * t) * _env_decay(m, 50) * 0.3
    return x * 0.75 + lowpass(noise(m), 600) * _env_decay(m, 40) * 0.3


# ---------------------------------------------------------------- melee extras
def flail_swing():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # whistling chain swing
    f = 600 + 900 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    x += highpass(noise(m), 2000) * 0.25
    env = np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return x * env * 0.7


def warhammer_hit():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    f = 70 * np.exp(-t * 18) + 40
    ph = np.cumsum(2 * np.pi * f / SR)
    x = np.sin(ph) * _env_decay(m, 18) * 0.9
    x += lowpass(noise(m), 700) * _env_decay(m, 25) * 0.5
    x += np.sin(2 * np.pi * 2400 * t) * _env_decay(m, 60) * 0.2  # metal ring
    return x * 0.85


def pike_thrust():
    m = int(0.3 * SR)
    whoosh = (lowpass(noise(m), 1800) - lowpass(noise(m), 250)) * 0.5
    env = np.minimum(np.arange(m) / (0.05 * SR), 1.0) * _env_decay(m, 22)
    return whoosh * env * 0.75


def shield_bash():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    # shield rim slam: wood + metal edge
    thud = lowpass(noise(m), 900) * _env_decay(m, 35) * 0.8
    edge = np.sin(2 * np.pi * 1900 * t) * _env_decay(m, 55) * 0.3
    return (thud + edge) * 0.8


def helmet_clank():
    m = int(0.3 * SR)
    t = np.arange(m) / SR
    x = np.zeros(m)
    for i, f in enumerate((880, 1320, 2090)):
        x += np.sin(2 * np.pi * f * t + _rng.uniform(0, 6.28)) * _env_decay(m, 45 + i * 20) * (0.4 / (i + 1))
    return x * 0.7


# ---------------------------------------------------------------- crowd
def crowd_cheer_loop(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # roaring crowd: shaped noise + whistle peaks
    roar = lowpass(noise(n), 1200) * 0.5
    roar *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.5 * t)
    for b in _rng.uniform(0, dur, 12):
        m = int(0.3 * SR)
        bt = np.arange(m) / SR
        wh = np.sin(2 * np.pi * 2400 * bt) * _env_decay(m, 15) * 0.08
        s = int(b * SR)
        if s + m < n:
            roar[s:s + m] += wh
    return _seamless(roar, fade_s=0.8) * 0.75


def crowd_gasp(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sharp inhale: rising filtered noise
    x = highpass(lowpass(noise(n), 3000), 800) * 0.4
    env = np.minimum(t / 0.5, 1.0) * np.exp(-np.maximum(t - 0.7, 0) * 8)
    return x * env * 0.7


def crowd_angry_loop(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # low agitated murmur
    x = lowpass(noise(n), 700) * 0.45
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.8 * t)
    # rhythmic claps/stomps
    for b in np.arange(0, dur, 0.5):
        m = int(0.08 * SR)
        stomp = lowpass(noise(m), 500) * _env_decay(m, 60) * 0.35
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += stomp
    return _seamless(x, fade_s=0.8) * 0.75


def chant_loop(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rhythmic "oh" chant at 100 BPM
    x = np.zeros(n)
    beat = 0.6
    for b in np.arange(0, dur, beat):
        m = int(0.35 * SR)
        bt = np.arange(m) / SR
        chant = np.sin(2 * np.pi * 220 * bt) * 0.25 + np.sin(2 * np.pi * 330 * bt) * 0.12
        chant *= np.sin(np.pi * np.minimum(bt / 0.35, 1.0))
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += chant
    x += lowpass(noise(n), 600) * 0.15
    return _seamless(x, fade_s=0.6) * 0.7


# ---------------------------------------------------------------- ambience extras
def ambience4(kind, dur=10.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == "swamp":
        base = lowpass(noise(n), 400) * 0.22
        # frogs: pulsed croaks
        for b in _rng.uniform(0, dur, 20):
            m = int(0.25 * SR)
            bt = np.arange(m) / SR
            f = 180 + 60 * np.sin(2 * np.pi * 8 * bt)
            croak = np.sin(np.cumsum(2 * np.pi * f / SR)) * _env_decay(m, 18) * 0.12
            s = int(b * SR)
            if s + m < n:
                base[s:s + m] += croak
        # insects
        gate = (np.sin(2 * np.pi * 14 * t) > 0.3).astype(float)
        base += np.sin(2 * np.pi * 5200 * t) * lowpass(gate, 80) * 0.03
        return _seamless(base)
    if kind == "volcanic":
        rumble = lowpass(noise(n), 180) * 0.35
        # lava bubbles
        for b in _rng.uniform(0, dur, 15):
            m = int(0.2 * SR)
            bt = np.arange(m) / SR
            blub = np.sin(2 * np.pi * (120 - 60 * bt) * bt) * _env_decay(m, 25) * 0.15
            s = int(b * SR)
            if s + m < n:
                rumble[s:s + m] += blub
        hiss = highpass(noise(n), 4000) * 0.06
        return _seamless(rumble + hiss)
    if kind == "arctic":
        base = lowpass(noise(n), 600) * 0.20
        # ice groans: slow FM sweeps
        for b in _rng.uniform(0, dur - 2, 4):
            m = int(1.8 * SR)
            bt = np.arange(m) / SR
            f = 200 + 150 * np.sin(2 * np.pi * 0.5 * bt)
            groan = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.10
            groan *= np.sin(np.pi * np.minimum(bt / 1.8, 1.0))
            s = int(b * SR)
            if s + m < n:
                base[s:s + m] += groan
        return _seamless(base)
    if kind == "waterfall":
        roar = lowpass(noise(n), 2500) * 0.4
        mist = highpass(noise(n), 5000) * 0.12
        return _seamless(roar + mist)
    if kind == "jungle":
        base = lowpass(noise(n), 800) * 0.22
        # exotic bird calls
        for b in _rng.uniform(0, dur, 12):
            m = int(0.3 * SR)
            bt = np.arange(m) / SR
            f = 2000 + 1500 * np.sin(2 * np.pi * 6 * bt + _rng.uniform(0, 6))
            call = np.sin(np.cumsum(2 * np.pi * f / SR)) * _env_decay(m, 12) * 0.10
            s = int(b * SR)
            if s + m < n:
                base[s:s + m] += call
        return _seamless(base)
    raise ValueError(kind)


# ---------------------------------------------------------------- foley extras
def ladder_climb():
    out = np.zeros(int(1.6 * SR))
    for i, off in enumerate((0.0, 0.4, 0.8, 1.2)):
        m = int(0.14 * SR)
        t = np.arange(m) / SR
        rung = lowpass(noise(m), 1000) * _env_decay(m, 50) * 0.5
        rung += np.sin(2 * np.pi * 300 * t) * _env_decay(m, 65) * 0.25
        s = int(off * SR)
        out[s:s + m] += rung
    return out * 0.7


def torch_ignite():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # strike + flare whoosh + crackle settle
    sm = int(0.1 * SR)
    strike = highpass(noise(sm), 3000) * _env_decay(sm, 70) * 0.5
    out = np.zeros(m)
    out[:sm] += strike
    wm = int(0.4 * SR)
    whoosh = lowpass(noise(wm), 1500) * 0.4 * np.sin(np.pi * np.arange(wm) / wm)
    s = int(0.1 * SR)
    out[s:s + wm] += whoosh
    # settle crackle
    cm = int(0.3 * SR)
    crackle = highpass(noise(cm), 2500) * _env_decay(cm, 15) * 0.2
    s = int(0.5 * SR)
    out[s:s + cm] += crackle
    return out * 0.75


def lock_pick():
    out = np.zeros(int(1.2 * SR))
    for i, off in enumerate((0.0, 0.3, 0.55, 0.85)):
        m = int(0.07 * SR)
        t = np.arange(m) / SR
        click = np.sin(2 * np.pi * _rng.uniform(2000, 3500) * t) * _env_decay(m, 100) * 0.35
        click += highpass(noise(m), 5000) * _env_decay(m, 110) * 0.2
        s = int(off * SR)
        out[s:s + m] += click
    # success clunk
    cm = int(0.12 * SR)
    clunk = lowpass(noise(cm), 1500) * _env_decay(cm, 55) * 0.6
    s = int(1.0 * SR)
    out[s:s + cm] += clunk
    return out * 0.7


def coins_pour(dur=1.0):
    n = int(dur * SR)
    out = np.zeros(n)
    for b in _rng.uniform(0, dur - 0.1, 25):
        m = int(0.06 * SR)
        t = np.arange(m) / SR
        coin = np.sin(2 * np.pi * _rng.uniform(3000, 5500) * t) * _env_decay(m, 90) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += coin
    return out * 0.7


# ---------------------------------------------------------------- ui extras
def ui4(kind):
    if kind == "tutorial-ping":
        m = int(0.3 * SR)
        t = np.arange(m) / SR
        return np.sin(2 * np.pi * 880 * t) * _env_decay(m, 35) * 0.35
    if kind == "objective-update":
        out = np.zeros(int(0.55 * SR))
        for i, f in enumerate((587, 880)):
            m = int(0.16 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.18 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 35) * 0.4
        return out
    if kind == "morale-up":
        out = np.zeros(int(0.7 * SR))
        for i, f in enumerate((392, 523, 659)):
            m = int(0.18 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.16 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 28) * 0.4
        return out
    raise ValueError(kind)


SFX4 = [
    ("naval/cannon-fire", cannon_fire, "naval cannon broadside"),
    ("naval/cannon-splash", cannon_splash, "cannonball water splash"),
    ("naval/ship-creak", ship_creak, "ship hull creak loop"),
    ("naval/anchor-drop", anchor_drop, "anchor chain + splash"),
    ("naval/hull-knock", hull_knock, "wooden hull knock"),
    ("melee/flail-swing", flail_swing, "flail swing whistle"),
    ("melee/warhammer-hit", warhammer_hit, "warhammer impact"),
    ("melee/pike-thrust", pike_thrust, "pike thrust"),
    ("melee/shield-bash", shield_bash, "shield bash slam"),
    ("melee/helmet-clank", helmet_clank, "helmet clank"),
    ("crowd/cheer-loop", crowd_cheer_loop, "crowd cheer loop"),
    ("crowd/gasp", crowd_gasp, "crowd gasp"),
    ("crowd/angry-loop", crowd_angry_loop, "angry crowd loop"),
    ("crowd/chant-loop", chant_loop, "crowd chant loop"),
    ("ambience/swamp", lambda: ambience4("swamp"), "swamp bed with frogs, loopable"),
    ("ambience/volcanic", lambda: ambience4("volcanic"), "volcanic bed, loopable"),
    ("ambience/arctic", lambda: ambience4("arctic"), "arctic bed with ice groans, loopable"),
    ("ambience/waterfall", lambda: ambience4("waterfall"), "waterfall bed, loopable"),
    ("ambience/jungle", lambda: ambience4("jungle"), "jungle bed, loopable"),
    ("foley/ladder-climb", ladder_climb, "ladder climb"),
    ("foley/torch-ignite", torch_ignite, "torch ignite"),
    ("foley/lock-pick", lock_pick, "lock picking"),
    ("foley/coins-pour", coins_pour, "coins pouring"),
    ("ui/tutorial-ping", lambda: ui4("tutorial-ping"), "tutorial ping"),
    ("ui/objective-update", lambda: ui4("objective-update"), "objective updated"),
    ("ui/morale-up", lambda: ui4("morale-up"), "morale up chime"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX4:
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
    with open(os.path.join(OUT, "sfx4-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX4:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
