"""Procedural SFX batch 22 for the Bannerlord-clone (round 21).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx22.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx22")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx22-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(222222)


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
def sail_snap():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # sail catching wind: sharp canvas crack
    crack = lowpass(noise(m), 2200) * 0.5 * _env_decay(m, 28)
    # follow-through flap
    fm = int(0.3 * SR)
    flap = lowpass(noise(fm), 1400) * 0.3 * _env_decay(fm, 40)
    s = int(0.15 * SR)
    crack[s:s + fm] += flap
    return crack * 0.7


def ermine_chitter(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ermine chittering: rapid high clicks
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.09):
        m = int(0.03 * SR)
        click = highpass(noise(m), 6000) * _env_decay(m, 180) * _rng.uniform(0.15, 0.3)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += click
    return out * 0.6


# ---------------------------------------------------------------- weather / horror
def white_squall(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # white squall: sudden violent wind burst
    env = np.minimum(t / 0.5, 1.0) * np.exp(-np.maximum(t - 1.8, 0) * 2.5)
    x = highpass(lowpass(noise(n), 5000), 800) * 0.5 * env
    return x * 0.75


def morgue_door(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cold storage door: heavy metal + seal hiss
    out = np.zeros(n)
    # door rumble
    rumble = lowpass(noise(n), 400) * 0.4 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += rumble
    # seal breaks
    m = int(0.2 * SR)
    hiss = highpass(noise(m), 4000) * _env_decay(m, 45) * 0.3
    s = int(0.6 * SR)
    out[s:s + m] += hiss
    return out * 0.7


# ---------------------------------------------------------------- tavern / farm
def dice_cup():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # dice shaken in cup: rattling
    out = np.zeros(m)
    for b in np.arange(0.05, 0.35, 0.08):
        cm = int(0.05 * SR)
        rattle = highpass(noise(cm), 4000) * _env_decay(cm, 100) * _rng.uniform(0.2, 0.35)
        s = int(b * SR)
        if s + cm < m:
            out[s:s + cm] += rattle
    return out * 0.65


def milk_pail(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # milking into pail: rhythmic streams
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.2, 0.25):
        m = int(0.15 * SR)
        stream = lowpass(noise(m), 2000) * 0.3 * np.sin(np.pi * np.arange(m) / m)
        # metallic pail ring
        ring = np.sin(2 * np.pi * 900 * np.arange(m) / SR) * _env_decay(m, 55) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += stream + ring
    return out * 0.65


# ---------------------------------------------------------------- mine / forge
def coal_dust_fall(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # coal dust settling: soft granular fall
    x = lowpass(noise(n), 800) * 0.25 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    # occasional lumps
    for b in _rng.uniform(0.3, 1.7, 6):
        m = int(0.08 * SR)
        lump = lowpass(noise(m), 1200) * _env_decay(m, 70) * 0.2
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += lump
    return x * 0.6


def crucible_glow(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # crucible heating: rising thermal roar
    env = np.minimum(t / 1.5, 1.0) * np.exp(-np.maximum(t - 2.0, 0) * 3)
    x = lowpass(noise(n), 700) * 0.4 * env
    x += np.sin(2 * np.pi * 120 * t) * 0.1 * env
    return x * 0.7


# ---------------------------------------------------------------- kitchen / stable
def soup_simmer(dur=3.0):
    n = int(dur * SR)
    # gentle soup simmer: soft bubbling
    out = np.zeros(n)
    for b in _rng.uniform(0.1, 2.8, 25):
        m = int(_rng.uniform(0.05, 0.12) * SR)
        blub = lowpass(noise(m), 900) * _env_decay(m, _rng.uniform(40, 70)) * _rng.uniform(0.1, 0.25)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += blub
    return _seamless(out, fade_s=0.6) * 0.6


def horse_roll(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # horse rolling in dust: heavy body + dust
    body = lowpass(noise(n), 700) * 0.4 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    # hooves thumping
    for b in _rng.uniform(0.2, 1.3, 4):
        m = int(0.1 * SR)
        thump = lowpass(noise(m), 1000) * _env_decay(m, 60) * 0.3
        s = int(b * SR)
        if s + m < n:
            body[s:s + m] += thump
    return body * 0.7


# ---------------------------------------------------------------- ritual / combat
def censer_swing(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # censer swinging: chain + incense hiss
    chain = np.sin(2 * np.pi * 3.2 * t) * 0.15
    # chain rattle
    rattle = highpass(lowpass(noise(n), 5000), 3000) * 0.12 * np.abs(np.sin(2 * np.pi * 3.2 * t))
    hiss = highpass(noise(n), 7000) * 0.08
    return _seamless((chain + rattle + hiss) * 0.8, fade_s=0.5) * 0.6


def mace_swing():
    m = int(0.45 * SR)
    t = np.arange(m) / SR
    # mace swing: heavy whoosh
    whoosh = lowpass(noise(m), 700) * 0.5 * np.sin(np.pi * np.minimum(t / 0.45, 1.0))
    return whoosh * 0.7


# ---------------------------------------------------------------- foley / misc
def parchment_unroll():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # parchment unrolled: dry crackle
    x = highpass(lowpass(noise(m), 5000), 1500) * 0.35 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return x * 0.65


def abacus_click():
    out = np.zeros(int(0.8 * SR))
    # abacus beads: rapid precise clicks
    for i, off in enumerate(np.arange(0.05, 0.7, 0.12)):
        m = int(0.04 * SR)
        click = highpass(noise(m), 5000) * _env_decay(m, 140) * _rng.uniform(0.2, 0.3)
        s = int(off * SR)
        out[s:s + m] += click
    return out * 0.6


def satellite_beacon(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # satellite beacon: clean repeating tone
    out = np.zeros(n)
    for b in np.arange(0.2, dur - 0.2, 1.5):
        m = int(0.15 * SR)
        tone = np.sin(2 * np.pi * 880 * np.arange(m) / SR) * _env_decay(m, 35) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += tone
    return _seamless(out, fade_s=0.4) * 0.6


SFX22 = [
    ("naval/sail-snap", sail_snap, "sail catching wind"),
    ("animal/ermine-chitter", ermine_chitter, "ermine chittering"),
    ("weather/white-squall", white_squall, "white squall"),
    ("horror/morgue-door", morgue_door, "morgue door"),
    ("tavern/dice-cup", dice_cup, "dice shaken in cup"),
    ("farm/milk-pail", milk_pail, "milking into pail"),
    ("mine/coal-dust-fall", coal_dust_fall, "coal dust settling"),
    ("forge/crucible-glow", crucible_glow, "crucible heating"),
    ("kitchen/soup-simmer", soup_simmer, "soup simmering"),
    ("stable/horse-roll", horse_roll, "horse rolling"),
    ("ritual/censer-swing", censer_swing, "censer swinging"),
    ("combat/mace-swing", mace_swing, "mace swing"),
    ("foley/parchment-unroll", parchment_unroll, "parchment unrolled"),
    ("misc/abacus-click", abacus_click, "abacus beads"),
    ("modern/satellite-beacon", satellite_beacon, "satellite beacon"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX22:
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
    with open(os.path.join(OUT, "sfx22-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX22:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
