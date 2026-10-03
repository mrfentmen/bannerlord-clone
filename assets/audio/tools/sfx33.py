"""Procedural SFX batch 33 for the Bannerlord-clone (round 32).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx33.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx33")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx33-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(333333)


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
def capstan(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # capstan turning: rhythmic creaking
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.5, 0.6):
        m = int(0.5 * SR)
        creak = np.sin(2 * np.pi * 140 * np.arange(m) / SR) * _env_decay(m, 28) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.7


def marmot_pup(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # marmot pup: tiny chirps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.13):
        m = int(0.08 * SR)
        mt = np.arange(m) / SR
        f = 3800 + 1000 * np.sin(2 * np.pi * 10 * mt)
        chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.18 * np.sin(np.pi * mt / 0.08)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chirp
    return out * 0.55


# ---------------------------------------------------------------- weather / horror
def santa_ana(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # santa ana: hot dry wind
    x = highpass(lowpass(noise(n), 4500), 800) * 0.32
    x *= 0.65 + 0.35 * np.sin(2 * np.pi * 0.35 * t)
    return _seamless(x, fade_s=0.6) * 0.65


def lich_whisper(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lich: cold arcane whisper
    x = highpass(noise(n), 3500) * 0.22
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # undertone
    tone = np.sin(2 * np.pi * 65 * t) * 0.1 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return (x + tone) * 0.65


# ---------------------------------------------------------------- tavern / farm
def mead_horn():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # drinking horn: hollow pour
    pour = lowpass(noise(m), 1200) * 0.35 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    horn = np.sin(2 * np.pi * 180 * t) * 0.1 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return (pour + horn) * 0.6


def poult_peep(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # turkey poults: peeping
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.09):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 3200 + 700 * np.sin(2 * np.pi * 9 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.17 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def fire_setting(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fire-setting: heating rock then quench
    out = np.zeros(n)
    # fire roar
    fm = int(1.2 * SR)
    fire = lowpass(noise(fm), 700) * 0.4 * np.sin(np.pi * np.arange(fm) / fm)
    out[:fm] += fire
    # quench crack
    qm = int(0.4 * SR)
    quench = highpass(noise(qm), 2000) * _env_decay(qm, 40) * 0.4
    s = int(1.3 * SR)
    out[s:s + qm] += quench
    return out * 0.7


def swage_block():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # swage block: shaped hammering
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.22)):
        hm = int(0.12 * SR)
        hit = np.sin(2 * np.pi * 1400 * np.arange(hm) / SR) * _env_decay(hm, 65) * (0.3 - i * 0.05)
        s = int(off * SR)
        out[s:s + hm] += hit
    return out * 0.6


# ---------------------------------------------------------------- kitchen / stable
def dripping_pan(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # roast dripping: sizzling fat
    out = highpass(lowpass(noise(n), 4000), 1500) * 0.28 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    for b in _rng.uniform(0.1, 1.4, 10):
        m = int(0.06 * SR)
        pop = highpass(noise(m), 4500) * _env_decay(m, 110) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pop
    return out * 0.65


def stall_muck(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stall mucked: shovel + straw
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.5):
        m = int(0.4 * SR)
        shovel = lowpass(highpass(noise(m), 500), 2000) * 0.38 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += shovel
    return out * 0.65


# ---------------------------------------------------------------- ritual / combat
def exorcism_rite(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # exorcism: chant + bell + wind
    out = np.zeros(n)
    for f in (110, 138.6, 164.8):
        out += np.sin(2 * np.pi * f * t) * 0.09
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # bell strikes
    for b in (0.5, 1.5):
        m = int(0.4 * SR)
        bell = np.sin(2 * np.pi * 740 * np.arange(m) / SR) * _env_decay(m, 35) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bell
    return out * 0.7


def onager_throw(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # onager: torsion snap + stone
    out = np.zeros(n)
    # arm snap
    sm = int(0.15 * SR)
    snap = lowpass(noise(sm), 1800) * _env_decay(sm, 70) * 0.5
    out[:sm] += snap
    # stone whizz
    wm = int(0.7 * SR)
    whizz = highpass(lowpass(noise(wm), 5000), 1800) * 0.28 * np.exp(-np.arange(wm) / SR * 2.5)
    s = int(0.12 * SR)
    out[s:s + wm] += whizz
    return out * 0.72


# ---------------------------------------------------------------- foley / misc
def spur_jingle_walk(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # spurs while walking: rhythmic jingle
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.2, 0.4):
        m = int(0.15 * SR)
        jingle = highpass(noise(m), 5000) * _env_decay(m, 85) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += jingle
    return out * 0.6


def traverse_board():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # traverse board: wooden navigation
    out = np.zeros(m)
    for i, off in enumerate((0.05, 0.3)):
        sm = int(0.18 * SR)
        peg = lowpass(noise(sm), 1400) * _env_decay(sm, 75) * (0.28 - i * 0.04)
        s = int(off * SR)
        out[s:s + sm] += peg
    return out * 0.6


def counter_uav(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # counter-UAV: jamming pulse
    f = 2400 + 800 * np.sin(2 * np.pi * 2 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 4 * t))
    return _seamless(x, fade_s=0.4) * 0.6


SFX33 = [
    ("naval/capstan", capstan, "capstan turning"),
    ("animal/marmot-pup", marmot_pup, "marmot pup"),
    ("weather/santa-ana", santa_ana, "santa ana wind"),
    ("horror/lich-whisper", lich_whisper, "lich whispering"),
    ("tavern/mead-horn", mead_horn, "mead horn poured"),
    ("farm/poult-peep", poult_peep, "turkey poults"),
    ("mine/fire-setting", fire_setting, "fire-setting"),
    ("forge/swage-block", swage_block, "swage block work"),
    ("kitchen/dripping-pan", dripping_pan, "dripping pan"),
    ("stable/stall-muck", stall_muck, "stall mucked"),
    ("ritual/exorcism-rite", exorcism_rite, "exorcism rite"),
    ("combat/onager-throw", onager_throw, "onager fired"),
    ("foley/spur-jingle-walk", spur_jingle_walk, "spurs jingling"),
    ("misc/traverse-board", traverse_board, "traverse board"),
    ("modern/counter-uav", counter_uav, "counter-UAV jam"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX33:
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
    with open(os.path.join(OUT, "sfx33-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX33:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
