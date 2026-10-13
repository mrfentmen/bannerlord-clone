"""Procedural SFX batch 15 for the Bannerlord-clone (round 14).

Horror, tavern, market, farm, mine, forge, kitchen, stable, misc.
All numpy DSP - no samples. Run: python3 sfx15.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx15")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx15-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(151515)


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


# ---------------------------------------------------------------- horror
def whisper_loop(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # unintelligible whispers: filtered noise shaped like speech
    x = highpass(lowpass(noise(n), 4000), 1500) * 0.25
    # speech-like amplitude modulation
    x *= 0.3 + 0.7 * np.abs(np.sin(2 * np.pi * 1.7 * t) * np.sin(2 * np.pi * 0.6 * t + 1))
    return _seamless(x, fade_s=0.8) * 0.65


def floorboard_creak(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slow ominous floorboard creak
    f = 90 + 60 * np.sin(2 * np.pi * 0.8 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.4 + 0.4 * np.sin(2 * np.pi * 2 * t)) * 0.4
    x += lowpass(noise(n), 500) * 0.12
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def chain_drag(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # heavy chain dragged across stone
    x = highpass(lowpass(noise(n), 4000), 900) * 0.35
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 1.2 * t)
    # periodic heavy clunks
    for b in np.arange(0.3, dur - 0.3, 0.6):
        m = int(0.12 * SR)
        clunk = lowpass(noise(m), 700) * _env_decay(m, 50) * 0.4
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += clunk
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


# ---------------------------------------------------------------- tavern / market
def mug_slam():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    # wooden mug slammed on table + ale slosh
    slam = lowpass(noise(m), 2000) * _env_decay(m, 55) * 0.6
    slam += np.sin(2 * np.pi * 300 * t) * _env_decay(m, 65) * 0.3
    return slam * 0.7


def dice_roll(dur=1.0):
    n = int(dur * SR)
    out = np.zeros(n)
    # dice bouncing on wood
    for b in _rng.uniform(0.05, 0.7, 8):
        m = int(0.06 * SR)
        t = np.arange(m) / SR
        clack = np.sin(2 * np.pi * _rng.uniform(1800, 3000) * t) * _env_decay(m, 95) * _rng.uniform(0.2, 0.4)
        clack += highpass(noise(m), 4000) * _env_decay(m, 110) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clack
    return out * 0.65


def crowd_haggle_loop(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # market crowd: many voices haggling
    out = np.zeros(n)
    for _ in range(16):
        f = _rng.uniform(120, 280)
        v = np.sin(np.cumsum(np.full(n, 2 * np.pi * f / SR))) * _rng.uniform(0.03, 0.07)
        v *= 0.5 + 0.5 * np.sin(2 * np.pi * _rng.uniform(1, 3) * t + _rng.uniform(0, 6))
        out += v
    out = np.sign(out) * 0.05 + out * 0.5
    return _seamless(out, fade_s=0.8) * 0.65


# ---------------------------------------------------------------- farm
def scythe_swish():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # scythe cutting wheat: whoosh + stalks
    whoosh = (lowpass(noise(m), 3000) - lowpass(noise(m), 400)) * 0.4
    whoosh *= np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    # stalk snaps
    for b in _rng.uniform(0.2, 0.4, 6):
        sm = int(0.04 * SR)
        snap = highpass(noise(sm), 3000) * _env_decay(sm, 110) * 0.2
        s = int(b * SR)
        if s + sm < m:
            whoosh[s:s + sm] += snap
    return whoosh * 0.7


def wheat_rustle(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wind through wheat
    x = highpass(lowpass(noise(n), 5000), 2000) * 0.25
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.5 * t)
    return _seamless(x, fade_s=0.6) * 0.65


# ---------------------------------------------------------------- mine
def pickaxe_loop(dur=3.0):
    n = int(dur * SR)
    out = np.zeros(n)
    # rhythmic pickaxe strikes
    for start in np.arange(0, dur, 1.0):
        m = int(0.15 * SR)
        t = np.arange(m) / SR
        strike = np.sin(2 * np.pi * _rng.uniform(2200, 3200) * t) * _env_decay(m, 80) * 0.4
        strike += highpass(noise(m), 4000) * _env_decay(m, 95) * 0.25
        s = int(start * SR)
        if s + m < n:
            out[s:s + m] += strike
    # cave ambience
    out += lowpass(noise(n), 300) * 0.1
    return _seamless(out, fade_s=0.5) * 0.7


def cart_rumble(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mine cart on rails
    x = lowpass(noise(n), 600) * 0.35
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 4 * t)
    # rail joints
    for b in np.arange(0.2, dur - 0.2, 0.8):
        m = int(0.08 * SR)
        clack = lowpass(noise(m), 1500) * _env_decay(m, 65) * 0.3
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += clack
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


# ---------------------------------------------------------------- forge / kitchen / stable / misc
def quench_hiss(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # hot metal quenched: explosive steam hiss
    x = highpass(noise(n), 3000) * 0.55
    x *= np.exp(-t * 3.5)
    # initial sizzle burst
    x[:int(0.1 * SR)] *= 1.5
    return x * 0.75


def knife_chop():
    out = np.zeros(int(0.8 * SR))
    # rhythmic chopping
    for i, off in enumerate((0.0, 0.25, 0.5)):
        m = int(0.08 * SR)
        t = np.arange(m) / SR
        chop = lowpass(noise(m), 2500) * _env_decay(m, 85) * 0.5
        chop += np.sin(2 * np.pi * 900 * t) * _env_decay(m, 95) * 0.2
        s = int(off * SR)
        out[s:s + m] += chop * (1.0 - i * 0.1)
    return out * 0.7


def kettle_whistle(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # kettle coming to boil
    f = 2200 + 400 * np.minimum(t / 1.0, 1.0)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.25
    x *= np.minimum(t / 0.5, 1.0) * (0.7 + 0.3 * np.sin(2 * np.pi * 8 * t))
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.6


def hay_rustle(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # hay being tossed
    x = highpass(lowpass(noise(n), 4500), 1800) * 0.35
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 2.2 * t)
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


def windmill_creak(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # old windmill: slow wooden creaks + sail whoosh
    creak = np.sin(np.cumsum(2 * np.pi * (45 + 15 * np.sin(2 * np.pi * 0.3 * t)) / SR)) * 0.2
    whoosh = lowpass(noise(n), 800) * 0.25
    whoosh *= 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 0.6 * t))
    return _seamless(creak + whoosh, fade_s=0.7) * 0.7


SFX15 = [
    ("horror/whisper-loop", whisper_loop, "unsettling whispers loop"),
    ("horror/floorboard-creak", floorboard_creak, "ominous floorboard creak"),
    ("horror/chain-drag", chain_drag, "chain dragged on stone"),
    ("tavern/mug-slam", mug_slam, "mug slammed on table"),
    ("tavern/dice-roll", dice_roll, "dice rolling"),
    ("market/crowd-haggle-loop", crowd_haggle_loop, "market haggling loop"),
    ("farm/scythe-swish", scythe_swish, "scythe cutting wheat"),
    ("farm/wheat-rustle", wheat_rustle, "wheat rustling"),
    ("mine/pickaxe-loop", pickaxe_loop, "pickaxe mining loop"),
    ("mine/cart-rumble", cart_rumble, "mine cart on rails"),
    ("forge/quench-hiss", quench_hiss, "hot metal quenched"),
    ("kitchen/knife-chop", knife_chop, "knife chopping"),
    ("kitchen/kettle-whistle", kettle_whistle, "kettle whistling"),
    ("stable/hay-rustle", hay_rustle, "hay rustling"),
    ("misc/windmill-creak", windmill_creak, "old windmill"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX15:
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
    with open(os.path.join(OUT, "sfx15-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX15:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
