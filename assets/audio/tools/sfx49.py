"""Procedural SFX batch 49 for the Bannerlord-clone (round 48).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx49.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx49")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx49-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(494949)


def _env_decay(n, rate):
    t = np.arange(n) / SR
    return np.exp(-t * rate)


def _seamless(x, fade_s=0.5):
    M = int(fade_s * SR)
    fade = np.linspace(0, 1, M)
    fade = fade[:, None] if x.ndim > 1 else fade
    y = x.copy()
    head = np.empty(M)
    head[:-1] = x[1:M]
    head[-1] = x[0]
    y[-M:] = y[-M:] * (1 - fade) + head * fade
    return y


# ---------------------------------------------------------------- naval / animals
def topmast(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # topmast: upper rigging
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.3, 0.29):
        m = int(0.22 * SR)
        creak = np.sin(2 * np.pi * 178 * np.arange(m) / SR) * _env_decay(m, 33) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.62


def ermine(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ermine: quick squeaks
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.09):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 2900 + 980 * np.sin(2 * np.pi * 15 * mt)
        squeak = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += squeak
    return out * 0.56


# ---------------------------------------------------------------- weather / horror
def vendaval(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # vendaval: strong southwester
    x = highpass(lowpass(noise(n), 3400), 540) * 0.39
    x *= 0.57 + 0.43 * np.sin(2 * np.pi * 0.26 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def sluagh(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sluagh: host of the dead
    out = np.zeros(n)
    for f in (220, 330, 440):
        fmod = f + 80 * np.sin(2 * np.pi * 0.4 * t)
        voice = np.sin(np.cumsum(2 * np.pi * fmod / SR)) * 0.11
        voice *= np.sin(np.pi * np.minimum(t / dur, 1.0))
        out += voice
    return out * 0.64


# ---------------------------------------------------------------- tavern / farm
def shove_ha_penny(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # shove-ha'penny: coin slide
    out = np.zeros(n)
    # shove
    sm = int(0.35 * SR)
    shove = highpass(lowpass(noise(sm), 3200), 1100) * 0.24 * np.sin(np.pi * np.arange(sm) / sm)
    out[:sm] += shove
    # penny drop
    for b in _rng.uniform(0.5, 1.2, 3):
        m = int(0.08 * SR)
        drop = np.sin(2 * np.pi * 2100 * np.arange(m) / SR) * _env_decay(m, 68) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += drop
    return out * 0.63


def chick_peeps7(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: lively peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.06, 0.04):
        m = int(0.03 * SR)
        mt = np.arange(m) / SR
        f = 3800 + 820 * np.sin(2 * np.pi * 16 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13 * np.sin(np.pi * mt / 0.03)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def timber_set(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # timber set: support frame
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.55, 0.65):
        m = int(0.5 * SR)
        set_ = lowpass(noise(m), 750) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += set_
    return out * 0.64


def stamp_mill(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # stamp mill: ore crushing
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.25, 0.4):
        m = int(0.2 * SR)
        stamp = lowpass(noise(m), 1450) * _env_decay(m, 55) * 0.4
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += stamp
    return out * 0.68


# ---------------------------------------------------------------- kitchen / stable
def posset_bowl():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # posset: bowl placed
    bowl = lowpass(noise(m), 1350) * 0.25 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    clink = np.sin(2 * np.pi * 1900 * t) * _env_decay(m, 58) * 0.11
    return (bowl + clink) * 0.6


def pitchfork():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # pitchfork: hay tossed
    toss = highpass(lowpass(noise(m), 3600), 1250) * 0.26 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return toss * 0.62


# ---------------------------------------------------------------- ritual / combat
def holy_water2(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # holy water: second variant
    sprinkle = highpass(noise(n), 4900) * 0.16 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return sprinkle * 0.6


def serpentine_fire(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # serpentine: early gun
    out = np.zeros(n)
    # crack
    cm = int(0.15 * SR)
    crack = lowpass(noise(cm), 2200) * _env_decay(cm, 62) * 0.46
    out[:cm] += crack
    # smoke
    sm = int(0.4 * SR)
    smoke = lowpass(noise(sm), 800) * _env_decay(sm, 34) * 0.24
    s = int(0.13 * SR)
    out[s:s + sm] += smoke
    return out * 0.67


# ---------------------------------------------------------------- foley / misc
def sabot_step3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.18, 0.33):
        m = int(0.12 * SR)
        step = lowpass(highpass(noise(m), 520), 2400) * _env_decay(m, 68) * 0.27
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.6


def chamberlain_key():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # chamberlain: key presented
    key = np.sin(2 * np.pi * 2600 * t) * _env_decay(m, 62) * 0.14
    key += np.sin(2 * np.pi * 3900 * t) * _env_decay(m, 75) * 0.07
    return key * 0.6


def cyber_pulse(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cyber: digital pulse
    f = 900 + 700 * np.sin(2 * np.pi * 1.1 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 3.2 * t))
    return _seamless(x, fade_s=0.4) * 0.58


SFX49 = [
    ("naval/topmast", topmast, "topmast rigging"),
    ("animal/ermine", ermine, "ermine squeak"),
    ("weather/vendaval", vendaval, "vendaval wind"),
    ("horror/sluagh", sluagh, "sluagh host"),
    ("tavern/shove-ha-penny", shove_ha_penny, "shove-ha'penny"),
    ("farm/chick-peeps7", chick_peeps7, "chick peeps"),
    ("mine/timber-set", timber_set, "timber set"),
    ("forge/stamp-mill", stamp_mill, "stamp mill"),
    ("kitchen/posset-ladle", posset_bowl, "posset ladled"),
    ("stable/hay-tines", pitchfork, "hay tines"),
    ("ritual/holy-water2", holy_water2, "holy water"),
    ("combat/serpentine-blast", serpentine_fire, "serpentine blast"),
    ("foley/sabot-step3", sabot_step3, "sabots stepping"),
    ("misc/chamberlain-key", chamberlain_key, "chamberlain key"),
    ("modern/cyber-pulse", cyber_pulse, "cyber pulse"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX49:
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
    with open(os.path.join(OUT, "sfx49-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX49:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
