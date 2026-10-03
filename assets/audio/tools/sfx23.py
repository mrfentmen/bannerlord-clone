"""Procedural SFX batch 23 for the Bannerlord-clone (round 22).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx23.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx23")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx23-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(232323)


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
def hull_creak_deep(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # deep hull groaning in heavy seas
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.5, 0.7):
        m = int(0.5 * SR)
        bt = np.arange(m) / SR
        f = 55 + 20 * np.sin(2 * np.pi * 0.6 * bt)
        groan = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.35 * np.sin(np.pi * bt / 0.5)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += groan
    return out * 0.75


def marmot_whistle(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # marmot alarm whistle: sharp descending
    f = 3500 - 1500 * (t / dur)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.3
    x *= np.minimum(t / 0.05, 1.0) * np.exp(-np.maximum(t - dur + 0.2, 0) * 8)
    return x * 0.65


# ---------------------------------------------------------------- weather / horror
def drizzle(dur=3.0):
    n = int(dur * SR)
    # light drizzle: fine patter
    x = highpass(lowpass(noise(n), 6000), 3000) * 0.15
    return _seamless(x, fade_s=0.6) * 0.6


def seance_knock():
    out = np.zeros(int(1.0 * SR))
    # spirit rapping: three hollow knocks
    for i, off in enumerate((0.0, 0.35, 0.7)):
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        knock = lowpass(noise(m), 900) * _env_decay(m, 60) * 0.5
        knock += np.sin(2 * np.pi * 220 * t) * _env_decay(m, 70) * 0.25
        s = int(off * SR)
        out[s:s + m] += knock * (1.0 - i * 0.1)
    return out * 0.7


# ---------------------------------------------------------------- tavern / farm
def coin_purse():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # coin purse: leather + coins
    leather = lowpass(noise(m), 1000) * _env_decay(m, 35) * 0.3
    out = leather
    for b in _rng.uniform(0.05, 0.3, 5):
        cm = int(0.06 * SR)
        ct = np.arange(cm) / SR
        coin = np.sin(2 * np.pi * _rng.uniform(2800, 3600) * ct) * _env_decay(cm, 90) * 0.2
        s = int(b * SR)
        if s + cm < m:
            out[s:s + cm] += coin
    return out * 0.65


def scarecrow_flap(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # scarecrow in wind: straw rustle + wood creak
    rustle = highpass(lowpass(noise(n), 4000), 1500) * 0.25
    rustle *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.8 * t)
    creak = np.sin(2 * np.pi * 140 * t) * 0.08 * np.sin(2 * np.pi * 0.5 * t)
    return _seamless(rustle + creak, fade_s=0.4) * 0.65


# ---------------------------------------------------------------- mine / forge
def canary_chirp(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # canary in mine: bright chirps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.2, 0.2):
        m = int(0.12 * SR)
        mt = np.arange(m) / SR
        f = 4000 + 1000 * np.sin(2 * np.pi * 8 * mt)
        chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.25 * np.sin(np.pi * mt / 0.12)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chirp
    return out * 0.6


def bellows_blast(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # forge bellows: powerful air blast
    x = lowpass(noise(n), 600) * 0.5
    x *= np.minimum(t / 0.2, 1.0) * np.exp(-np.maximum(t - dur + 0.5, 0) * 3)
    return x * 0.75


# ---------------------------------------------------------------- kitchen / stable
def knife_steel():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # knife honed on steel: metallic slides
    out = np.zeros(m)
    for b in np.arange(0.05, 0.7, 0.18):
        sm = int(0.15 * SR)
        slide = highpass(lowpass(noise(sm), 7000), 3500) * 0.25 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += slide
    return out * 0.65


def hay_fork(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pitchfork into hay: stab + rustle
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.4):
        m = int(0.25 * SR)
        stab = lowpass(noise(m), 1500) * 0.4 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += stab
    return out * 0.7


# ---------------------------------------------------------------- ritual / combat
def holy_water():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # holy water sprinkled: droplets
    out = np.zeros(m)
    for b in _rng.uniform(0.05, 0.4, 12):
        dm = int(0.03 * SR)
        drop = highpass(noise(dm), 5000) * _env_decay(dm, 150) * _rng.uniform(0.1, 0.2)
        s = int(b * SR)
        if s + dm < m:
            out[s:s + dm] += drop
    return out * 0.6


def war_paint():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # war paint applied: rhythmic hand drums (pre-battle ritual)
    out = np.zeros(m)
    for i, off in enumerate((0.0, 0.15, 0.3, 0.45)):
        dm = int(0.1 * SR)
        dt = np.arange(dm) / SR
        drum = lowpass(noise(dm), 600) * _env_decay(dm, 55) * 0.45
        drum += np.sin(2 * np.pi * 120 * dt) * _env_decay(dm, 65) * 0.2
        s = int(off * SR)
        out[s:s + dm] += drum * (1.0 - i * 0.08)
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def leather_strap():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # leather strap pulled tight: creak
    x = lowpass(noise(m), 900) * 0.35 * np.sin(np.pi * np.minimum(t / 0.4, 1.0))
    x += np.sin(2 * np.pi * 180 * t) * 0.12 * np.sin(np.pi * np.minimum(t / 0.4, 1.0))
    return x * 0.65


def pocket_watch():
    m = int(1.0 * SR)
    t = np.arange(m) / SR
    # pocket watch: delicate ticking
    out = np.zeros(m)
    for b in np.arange(0.05, 0.95, 0.12):
        tm = int(0.03 * SR)
        tick = highpass(noise(tm), 6000) * _env_decay(tm, 160) * 0.2
        s = int(b * SR)
        if s + tm < m:
            out[s:s + tm] += tick
    return out * 0.6


def drone_hover(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # surveillance drone: high whine
    x = np.sin(2 * np.pi * 2400 * t) * 0.12
    x += np.sin(2 * np.pi * 4800 * t) * 0.06
    x *= 0.8 + 0.2 * np.sin(2 * np.pi * 1.2 * t)
    return _seamless(x, fade_s=0.5) * 0.6


SFX23 = [
    ("naval/hull-creak-deep", hull_creak_deep, "deep hull groaning"),
    ("animal/marmot-whistle", marmot_whistle, "marmot alarm"),
    ("weather/drizzle", drizzle, "light drizzle"),
    ("horror/seance-knock", seance_knock, "spirit rapping"),
    ("tavern/coin-purse", coin_purse, "coin purse"),
    ("farm/scarecrow-flap", scarecrow_flap, "scarecrow flapping"),
    ("mine/canary-chirp", canary_chirp, "mine canary"),
    ("forge/bellows-blast", bellows_blast, "forge bellows"),
    ("kitchen/knife-steel", knife_steel, "knife honed"),
    ("stable/hay-fork", hay_fork, "pitchfork in hay"),
    ("ritual/holy-water", holy_water, "holy water sprinkled"),
    ("combat/war-paint", war_paint, "war drums (ritual)"),
    ("foley/leather-strap", leather_strap, "leather strap"),
    ("misc/pocket-watch", pocket_watch, "pocket watch ticking"),
    ("modern/drone-hover", drone_hover, "drone hovering"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX23:
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
    with open(os.path.join(OUT, "sfx23-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX23:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
