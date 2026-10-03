"""Procedural SFX batch 57 for the Bannerlord-clone (round 56).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx57.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx57")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx57-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(575757)


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
def spanker_sail(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # spanker: aft gaff sail
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.26, 0.25):
        m = int(0.18 * SR)
        flap = highpass(lowpass(noise(m), 2400), 820) * _env_decay(m, 36) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.58


def otter2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # otter: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.06, 0.06):
        m = int(0.038 * SR)
        mt = np.arange(m) / SR
        f = 2600 + 820 * np.sin(2 * np.pi * 21 * mt)
        chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12 * np.sin(np.pi * mt / 0.038)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chirp
    return out * 0.5


# ---------------------------------------------------------------- weather / horror
def chinook2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chinook: second variant
    x = highpass(lowpass(noise(n), 2600), 460) * 0.47
    x *= 0.49 + 0.51 * np.sin(2 * np.pi * 0.18 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def bean_nighe(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: washerwoman
    out = np.zeros(n)
    # washing
    wm = int(0.8 * SR)
    wash = highpass(lowpass(noise(wm), 3200), 1400) * 0.16 * np.sin(np.pi * np.arange(wm) / wm)
    out[:wm] += wash
    # wail
    f = 720 - 300 * np.sin(2 * np.pi * 0.35 * t)
    wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12
    wail *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += wail
    return out * 0.6


# ---------------------------------------------------------------- tavern / farm
def dice_cup2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # dice cup: second variant
    out = np.zeros(n)
    # shake
    sm = int(0.35 * SR)
    shake = highpass(lowpass(noise(sm), 4800), 1900) * 0.2 * np.sin(np.pi * np.arange(sm) / sm)
    out[:sm] += shake
    # roll
    for b in _rng.uniform(0.4, 0.85, 4):
        m = int(0.07 * SR)
        die = np.sin(2 * np.pi * 1950 * np.arange(m) / SR) * _env_decay(m, 62) * 0.13
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += die
    return out * 0.57


def gosling_calls(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: calls variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.05, 0.035):
        m = int(0.028 * SR)
        mt = np.arange(m) / SR
        f = 4000 + 700 * np.sin(2 * np.pi * 18 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.028)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.5


# ---------------------------------------------------------------- mine / forge
def gophering(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gophering: burrowing
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.38, 0.42):
        m = int(0.3 * SR)
        dig = lowpass(noise(m), 900) * 0.32 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dig
    return out * 0.59


def faggot_furnace(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # faggot furnace: bundle fire
    x = lowpass(noise(n), 600) * 0.43
    x *= 0.63 + 0.37 * np.sin(2 * np.pi * 0.37 * t)
    return _seamless(x, fade_s=0.6) * 0.64


# ---------------------------------------------------------------- kitchen / stable
def flummery_pot2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # flummery: second pot variant
    simmer = lowpass(noise(m), 1050) * 0.23 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    simmer *= 0.68 + 0.32 * np.sin(2 * np.pi * 2.8 * t)
    return simmer * 0.58


def manger3():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # manger: third variant
    munch = lowpass(noise(m), 900) * 0.25 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    munch *= 0.58 + 0.42 * np.sin(2 * np.pi * 5.5 * t)
    return munch * 0.59


# ---------------------------------------------------------------- ritual / combat
def compline2(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # compline: second variant
    out = np.zeros(n)
    for f in (110, 165, 220):
        out += np.sin(2 * np.pi * f * t) * 0.06
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.58


def cannonade(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cannonade: rolling fire
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.4, 0.35):
        m = int(0.3 * SR)
        shot = lowpass(noise(m), 1250) * _env_decay(m, 45) * 0.42
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += shot * (1.0 - b * 0.15)
    return out * 0.68


# ---------------------------------------------------------------- foley / misc
def buskin_step5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # buskins: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.12, 0.28):
        m = int(0.085 * SR)
        step = lowpass(highpass(noise(m), 470), 2100) * _env_decay(m, 73) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.56


def nocturnal3():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nocturnal: third variant
    noc = np.sin(2 * np.pi * 2050 * t) * _env_decay(m, 61) * 0.12
    noc += np.sin(2 * np.pi * 3075 * t) * _env_decay(m, 74) * 0.05
    return noc * 0.54


def comint_burst(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # COMINT: intercepted chatter
    f = 1600 + 750 * np.sin(2 * np.pi * 1.1 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.1
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 3.8 * t))
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0)) ** 0.5
    return x * 0.55


SFX57 = [
    ("naval/spanker-sail", spanker_sail, "spanker sail"),
    ("animal/otter2", otter2, "otter chirp"),
    ("weather/chinook2", chinook2, "chinook wind"),
    ("horror/bean-nighe", bean_nighe, "bean nighe"),
    ("tavern/dice-cup2", dice_cup2, "dice cup"),
    ("farm/gosling-calls", gosling_calls, "gosling calls"),
    ("mine/gophering", gophering, "gophering dig"),
    ("forge/faggot-furnace", faggot_furnace, "faggot furnace"),
    ("kitchen/flummery-pot2", flummery_pot2, "flummery simmer"),
    ("stable/manger3", manger3, "manger munching"),
    ("ritual/compline2", compline2, "compline prayer"),
    ("combat/cannonade", cannonade, "cannonade fire"),
    ("foley/buskin-step5", buskin_step5, "buskins stepping"),
    ("misc/nocturnal3", nocturnal3, "nocturnal dial"),
    ("modern/comint-burst", comint_burst, "COMINT burst"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX57:
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
    with open(os.path.join(OUT, "sfx57-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX57:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
