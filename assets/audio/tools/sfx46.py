"""Procedural SFX batch 46 for the Bannerlord-clone (round 45).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx46.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx46")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx46-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(464646)


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
def mizzenmast(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mizzen: rigging creak
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.3, 0.32):
        m = int(0.24 * SR)
        creak = np.sin(2 * np.pi * 165 * np.arange(m) / SR) * _env_decay(m, 31) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * 0.62


def weasel(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # weasel: chitter + hiss
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.09, 0.12):
        m = int(0.07 * SR)
        mt = np.arange(m) / SR
        f = 2600 + 900 * np.sin(2 * np.pi * 13 * mt)
        chit = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16 * np.sin(np.pi * mt / 0.07)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.56


# ---------------------------------------------------------------- weather / horror
def papagayo(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # papagayo: central american wind
    x = highpass(lowpass(noise(n), 3700), 570) * 0.37
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.29 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def nuckelavee(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # nuckelavee: sea demon
    out = np.zeros(n)
    # breath
    f = 70 + 25 * np.sin(2 * np.pi * 0.9 * t)
    breath = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.2
    breath *= 0.5 + 0.5 * np.sin(2 * np.pi * 2 * t)
    out += breath
    # wave crash
    for b in np.arange(0.2, dur - 0.6, 0.8):
        m = int(0.5 * SR)
        wave = lowpass(highpass(noise(m), 300), 1600) * 0.3 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wave
    return out * 0.64


# ---------------------------------------------------------------- tavern / farm
def dice_game(dur=1.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # dice: game in progress
    out = np.zeros(n)
    for b in np.arange(0.05, 1.0, 0.22):
        m = int(0.14 * SR)
        rattle = highpass(noise(m), 2600) * _env_decay(m, 75) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += rattle
    # final throw
    tm = int(0.16 * SR)
    throw = highpass(noise(tm), 3100) * _env_decay(tm, 72) * 0.26
    s = int(1.05 * SR)
    out[s:s + tm] += throw
    return out * 0.64


def poult_peeps3b(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: soft chorus
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.13):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2800 + 660 * np.sin(2 * np.pi * 8 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def stull_timber():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # stull: support timber
    out = np.zeros(m)
    for b in np.arange(0.05, 0.65, 0.25):
        sm = int(0.23 * SR)
        creak = np.sin(2 * np.pi * 138 * np.arange(sm) / SR) * _env_decay(sm, 26) * 0.22
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += creak
    return out * 0.64


def slitting_mill(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slitting mill: iron rods cut
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.4, 0.45):
        m = int(0.35 * SR)
        cut = highpass(lowpass(noise(m), 5200), 2100) * 0.26 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut
    return out * 0.64


# ---------------------------------------------------------------- kitchen / stable
def flummery_pot(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # flummery: simmering
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.14, 0.16):
        m = int(0.11 * SR)
        bubble = lowpass(noise(m), 920) * _env_decay(m, 71) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bubble
    return out * 0.6


def feed_rack():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # feed rack: hay loaded
    rustle = highpass(lowpass(noise(m), 4300), 1050) * 0.26 * np.sin(np.pi * np.minimum(t / 0.7, 1.0))
    return rustle * 0.62


# ---------------------------------------------------------------- ritual / combat
def confession(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # confession: whispered sins
    out = np.zeros(n)
    for f in (96, 144, 192):
        out += np.sin(2 * np.pi * f * t) * 0.06
    out *= 0.55 + 0.45 * np.sin(2 * np.pi * 0.7 * t)
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.62


def rabinet_fire(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # rabinet: small cannon
    out = np.zeros(n)
    # snap
    sm = int(0.15 * SR)
    snap = lowpass(noise(sm), 1950) * _env_decay(sm, 62) * 0.47
    out[:sm] += snap
    # tail
    tm = int(0.4 * SR)
    tail = lowpass(noise(tm), 980) * _env_decay(tm, 34) * 0.25
    s = int(0.13 * SR)
    out[s:s + tm] += tail
    return out * 0.68


# ---------------------------------------------------------------- foley / misc
def pattens_step2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: wooden pattens
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.17, 0.36):
        m = int(0.13 * SR)
        step = lowpass(highpass(noise(m), 710), 3620) * _env_decay(m, 69) * 0.28
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.62


def sundial_gnomon():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # gnomon: shadow caster
    tap = np.sin(2 * np.pi * 1050 * t) * _env_decay(m, 58) * 0.18
    tap += np.sin(2 * np.pi * 1575 * t) * _env_decay(m, 70) * 0.09
    return tap * 0.58


def lidar_pulse(dur=2.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # lidar: rotating pulse
    f = 950 + 1100 * np.sin(2 * np.pi * 0.65 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12
    return _seamless(x, fade_s=0.5) * 0.58


SFX46 = [
    ("naval/mizzenmast", mizzenmast, "mizzen rigging"),
    ("animal/weasel", weasel, "weasel chitter"),
    ("weather/papagayo", papagayo, "papagayo wind"),
    ("horror/nuckelavee", nuckelavee, "nuckelavee demon"),
    ("tavern/dice-game", dice_game, "dice game"),
    ("farm/poult-peeps3", poult_peeps3b, "poult peeps"),
    ("mine/stull-timber", stull_timber, "stull timber"),
    ("forge/slitting-mill", slitting_mill, "slitting mill"),
    ("kitchen/flummery-pot", flummery_pot, "flummery simmering"),
    ("stable/feed-rack", feed_rack, "feed rack loaded"),
    ("ritual/confession", confession, "confession whispered"),
    ("combat/rabinet-fire", rabinet_fire, "rabinet fired"),
    ("foley/pattens-step2", pattens_step2, "pattens stepping"),
    ("misc/sundial-gnomon", sundial_gnomon, "sundial gnomon"),
    ("modern/lidar-pulse", lidar_pulse, "lidar pulse"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX46:
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
    with open(os.path.join(OUT, "sfx46-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX46:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
