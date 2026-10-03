"""Procedural SFX batch 10 for the Bannerlord-clone (round 9).

Prison, camp extras, naval extras, foley extras, combat extras, animals.
All numpy DSP - no samples. Run: python3 sfx10.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx10")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx10-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(101010)


def _env_decay(n, rate):
    t = np.arange(n) / SR
    return np.exp(-t * rate)


# ---------------------------------------------------------------- prison
def cell_door_slam():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # iron-barred door slam: metal clang + heavy thud
    clang = np.sin(2 * np.pi * 420 * t) * _env_decay(m, 45) * 0.5
    clang += np.sin(2 * np.pi * 630 * t) * _env_decay(m, 55) * 0.3
    thud = lowpass(noise(m), 400) * _env_decay(m, 35) * 0.6
    return (clang + thud) * 0.8


def manacle_rattle(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for b in _rng.uniform(0.05, dur - 0.15, 8):
        m = int(0.1 * SR)
        bt = np.arange(m) / SR
        clink = np.sin(2 * np.pi * _rng.uniform(2000, 3500) * bt) * _env_decay(m, 80) * 0.35
        clink += highpass(noise(m), 4000) * _env_decay(m, 90) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clink
    return out * 0.7


def old_key_turn():
    out = np.zeros(int(0.9 * SR))
    # insert + two heavy tumbler turns
    for i, off in enumerate((0.0, 0.3, 0.55)):
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        if i == 0:
            x = highpass(noise(m), 2500) * _env_decay(m, 70) * 0.35  # insert
        else:
            x = np.sin(2 * np.pi * (300 - 100 * t) * t) * _env_decay(m, 55) * 0.45
            x += lowpass(noise(m), 1200) * _env_decay(m, 60) * 0.3
        s = int(off * SR)
        out[s:s + m] += x
    return out * 0.7


# ---------------------------------------------------------------- camp extras
def cook_pot_clank():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # metal pot set down on fire ring
    clank = np.sin(2 * np.pi * 950 * t) * _env_decay(m, 60) * 0.4
    clank += np.sin(2 * np.pi * 1420 * t) * _env_decay(m, 75) * 0.25
    clank += lowpass(noise(m), 3000) * _env_decay(m, 80) * 0.3
    return clank * 0.7


def bedroll_unroll(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fabric unrolling: soft flaps
    x = lowpass(noise(n), 1400) * 0.4
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 2.5 * t)
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


def fire_poke():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # poking embers: wood knock + ember burst crackle
    knock = lowpass(noise(int(0.08 * SR)), 1200) * 0.5
    out = np.zeros(m)
    out[:len(knock)] += knock * _env_decay(len(knock), 60)
    for b in _rng.uniform(0.1, 0.6, 10):
        cm = int(0.05 * SR)
        crackle = highpass(noise(cm), 3500) * _env_decay(cm, 90) * _rng.uniform(0.1, 0.3)
        s = int(b * SR)
        if s + cm < m:
            out[s:s + cm] += crackle
    return out * 0.7


# ---------------------------------------------------------------- naval extras
def anchor_chain(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    # heavy chain links rattling through hawse
    for b in np.arange(0.1, dur - 0.2, 0.28):
        m = int(0.18 * SR)
        bt = np.arange(m) / SR
        clank = np.sin(2 * np.pi * _rng.uniform(700, 1100) * bt) * _env_decay(m, 50) * 0.4
        clank += lowpass(noise(m), 2500) * _env_decay(m, 55) * 0.35
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clank
    return out * 0.75


def sail_flap(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # heavy canvas sail flapping
    x = lowpass(noise(n), 1000) * 0.45
    x *= 0.3 + 0.7 * np.abs(np.sin(2 * np.pi * 1.8 * t))
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


# ---------------------------------------------------------------- foley extras
def barrel_roll(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wooden barrel rolling: rumble + periodic bumps
    x = lowpass(noise(n), 500) * 0.35
    x *= 0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 3.2 * t))
    for b in np.arange(0.2, dur - 0.2, 0.31):
        m = int(0.06 * SR)
        bump = lowpass(noise(m), 900) * _env_decay(m, 70) * 0.4
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += bump
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def crate_smash():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # wooden crate breaking: crash + splinters
    crash = lowpass(noise(m), 2200) * _env_decay(m, 30) * 0.7
    for b in _rng.uniform(0.05, 0.35, 8):
        pm = int(0.05 * SR)
        splinter = highpass(noise(pm), 2500) * _env_decay(pm, 100) * _rng.uniform(0.15, 0.35)
        s = int(b * SR)
        if s + pm < m:
            crash[s:s + pm] += splinter
    return crash * 0.75


def rope_coil():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # rope being coiled: soft thuds + fiber swish
    out = np.zeros(m)
    for b in np.arange(0.05, 0.5, 0.15):
        pm = int(0.1 * SR)
        thud = lowpass(noise(pm), 800) * _env_decay(pm, 55) * 0.4
        s = int(b * SR)
        if s + pm < m:
            out[s:s + pm] += thud
    return out * 0.65


# ---------------------------------------------------------------- combat extras
def shield_wall_bash():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # many shields slamming together
    out = np.zeros(m)
    for b in _rng.uniform(0.0, 0.15, 8):
        pm = int(0.2 * SR)
        pt = np.arange(pm) / SR
        bash = lowpass(noise(pm), 1000) * _env_decay(pm, 40) * _rng.uniform(0.3, 0.6)
        s = int(b * SR)
        if s + pm < m:
            out[s:s + pm] += bash
    return out * 0.8


def spear_plant():
    m = int(0.35 * SR)
    t = np.arange(m) / SR
    # spear butt planted in ground: wood knock + dirt
    knock = np.sin(2 * np.pi * 320 * t) * _env_decay(m, 65) * 0.5
    knock += lowpass(noise(m), 1500) * _env_decay(m, 70) * 0.4
    return knock * 0.7


# ---------------------------------------------------------------- animals
def bison_snort():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # heavy nostril blast
    x = lowpass(noise(m), 600) * 0.55
    x *= np.minimum(t / 0.05, 1.0) * _env_decay(m, 14)
    return x * 0.75


def beaver_tail_slap():
    m = int(0.3 * SR)
    t = np.arange(m) / SR
    # tail slap on water: sharp smack + splash
    smack = lowpass(noise(int(0.06 * SR)), 1800) * 0.7
    out = np.zeros(m)
    out[:len(smack)] += smack * _env_decay(len(smack), 80)
    wm = int(0.24 * SR)
    splash = highpass(lowpass(noise(wm), 5000), 1200) * 0.35 * _env_decay(wm, 25)
    s = int(0.06 * SR)
    out[s:s + wm] += splash
    return out * 0.7


SFX10 = [
    ("prison/cell-door-slam", cell_door_slam, "prison cell door slam"),
    ("prison/manacle-rattle", manacle_rattle, "manacles rattling"),
    ("prison/old-key-turn", old_key_turn, "old iron key turning"),
    ("camp/cook-pot-clank", cook_pot_clank, "cook pot on fire ring"),
    ("camp/bedroll-unroll", bedroll_unroll, "bedroll unrolling"),
    ("camp/fire-poke", fire_poke, "poking campfire embers"),
    ("naval/anchor-chain", anchor_chain, "anchor chain rattling"),
    ("naval/sail-flap", sail_flap, "sail flapping"),
    ("foley/barrel-roll", barrel_roll, "barrel rolling"),
    ("foley/crate-smash", crate_smash, "crate smashing"),
    ("foley/rope-coil", rope_coil, "rope coiling"),
    ("combat/shield-wall-bash", shield_wall_bash, "shield wall bash"),
    ("combat/spear-plant", spear_plant, "spear planted"),
    ("animal/bison-snort", bison_snort, "bison snort"),
    ("animal/beaver-tail-slap", beaver_tail_slap, "beaver tail slap"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX10:
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
    with open(os.path.join(OUT, "sfx10-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX10:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
