"""Procedural SFX batch 54 for the Bannerlord-clone (round 53).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx54.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx54")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx54-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(545454)


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
def staysail(dur=1.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # staysail: fore stays
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.26, 0.25):
        m = int(0.18 * SR)
        creak = np.sin(2 * np.pi * 193 * np.arange(m) / SR) * _env_decay(m, 35) * 0.21
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.6


def ferret(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ferret: dooking
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.07, 0.075):
        m = int(0.045 * SR)
        mt = np.arange(m) / SR
        f = 3300 + 880 * np.sin(2 * np.pi * 18 * mt)
        dook = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13 * np.sin(np.pi * mt / 0.045)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dook
    return out * 0.53


# ---------------------------------------------------------------- weather / horror
def sirocco2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sirocco: second variant
    x = highpass(lowpass(noise(n), 2900), 490) * 0.44
    x *= 0.52 + 0.48 * np.sin(2 * np.pi * 0.21 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def banshee_cry(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # banshee: crying variant
    f = 680 - 280 * np.sin(2 * np.pi * 0.38 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15
    x *= 0.55 + 0.45 * np.sin(2 * np.pi * 1.8 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.59


# ---------------------------------------------------------------- tavern / farm
def ale_round(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ale round: tankards passed
    out = np.zeros(n)
    for b in _rng.uniform(0.1, 1.0, 4):
        m = int(0.13 * SR)
        clunk = lowpass(noise(m), 1100) * _env_decay(m, 55) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clunk
    return out * 0.59


def chick_peeps9(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: ninth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.048, 0.032):
        m = int(0.026 * SR)
        mt = np.arange(m) / SR
        f = 4300 + 720 * np.sin(2 * np.pi * 21 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.026)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.51


# ---------------------------------------------------------------- mine / forge
def fire_blasting(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fire blasting: rock heated
    out = np.zeros(n)
    # heat
    hm = int(1.2 * SR)
    heat = lowpass(noise(hm), 550) * 0.35 * np.sin(np.pi * np.arange(hm) / hm)
    out[:hm] += heat
    # crack
    for b in _rng.uniform(1.2, 1.9, 4):
        m = int(0.1 * SR)
        crack = highpass(noise(m), 1800) * _env_decay(m, 60) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += crack
    return out * 0.63


def finery2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # finery: second variant
    x = lowpass(noise(n), 620) * 0.42
    x *= 0.64 + 0.36 * np.sin(2 * np.pi * 0.4 * t)
    return _seamless(x, fade_s=0.6) * 0.64


# ---------------------------------------------------------------- kitchen / stable
def posset_cup3():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # posset: third cup variant
    pour = lowpass(noise(m), 1550) * 0.25 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return pour * 0.59


def hay_loft():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # hay loft: bales dropped
    out = np.zeros(m)
    for b in [0.1, 0.35, 0.55]:
        mm = int(0.12 * SR)
        thud = lowpass(noise(mm), 700) * _env_decay(mm, 52) * 0.3
        s = int(b * SR)
        if s + mm < m:
            out[s:s + mm] += thud
    return out * 0.62


# ---------------------------------------------------------------- ritual / combat
def final_rites(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # final rites: solemn chant
    out = np.zeros(n)
    for f in (95, 143, 190):
        out += np.sin(2 * np.pi * f * t) * 0.065
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.61


def pedrero_blast(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pedrero: stone-throwing gun
    out = np.zeros(n)
    # blast
    bm = int(0.2 * SR)
    blast = lowpass(noise(bm), 1350) * _env_decay(bm, 52) * 0.5
    out[:bm] += blast
    # stones
    for b in _rng.uniform(0.25, 0.8, 5):
        m = int(0.08 * SR)
        stone = highpass(noise(m), 2200) * _env_decay(m, 65) * 0.14
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += stone
    return out * 0.66


# ---------------------------------------------------------------- foley / misc
def sabot_step4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.32):
        m = int(0.1 * SR)
        step = lowpass(highpass(noise(m), 540), 2500) * _env_decay(m, 70) * 0.26
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.58


def pelorus2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # pelorus: second variant
    pel = np.sin(2 * np.pi * 2050 * t) * _env_decay(m, 59) * 0.13
    pel += np.sin(2 * np.pi * 3075 * t) * _env_decay(m, 72) * 0.06
    return pel * 0.56


def sat_link(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sat link: satellite handshake
    f = 1200 + 800 * np.sin(2 * np.pi * 0.5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11
    # handshake pattern
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 1.8 * t))
    return _seamless(x, fade_s=0.4) * 0.56


SFX54 = [
    ("naval/staysail", staysail, "staysail rig"),
    ("animal/ferret", ferret, "ferret dook"),
    ("weather/sirocco2", sirocco2, "sirocco wind"),
    ("horror/banshee-cry", banshee_cry, "banshee cry"),
    ("tavern/ale-round", ale_round, "ale round"),
    ("farm/chick-peeps9", chick_peeps9, "chick peeps"),
    ("mine/fire-blasting", fire_blasting, "fire blasting"),
    ("forge/finery2", finery2, "finery fire"),
    ("kitchen/posset-cup3", posset_cup3, "posset poured"),
    ("stable/hay-loft", hay_loft, "hay loft"),
    ("ritual/final-rites", final_rites, "final rites"),
    ("combat/pedrero-blast", pedrero_blast, "pedrero blast"),
    ("foley/sabot-step4", sabot_step4, "sabots stepping"),
    ("misc/pelorus2", pelorus2, "pelorus sight"),
    ("modern/sat-link", sat_link, "satellite link"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX54:
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
    with open(os.path.join(OUT, "sfx54-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX54:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
