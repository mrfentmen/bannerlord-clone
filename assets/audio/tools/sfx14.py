"""Procedural SFX batch 14 for the Bannerlord-clone (round 13).

Ritual, naval, animals, weather, modern, combat, foley, siege, misc.
All numpy DSP - no samples. Run: python3 sfx14.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx14")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx14-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(141414)


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


# ---------------------------------------------------------------- ritual
def drum_circle_loop(dur=4.0):
    n = int(dur * SR)
    out = np.zeros(n)
    # polyrhythmic hand drums
    for pattern, f, v in [((0.0, 0.5, 1.0, 1.5), 140, 0.6),
                          ((0.25, 0.75, 1.25, 1.75), 180, 0.4),
                          ((0.0, 0.75, 1.5), 100, 0.5)]:
        for start in np.arange(0, dur, 2.0):
            for off in pattern:
                m = int(0.25 * SR)
                t = np.arange(m) / SR
                hit = np.sin(2 * np.pi * f * t) * _env_decay(m, 30) * v
                hit += lowpass(noise(m), 700) * _env_decay(m, 35) * v * 0.6
                s = int((start + off) * SR)
                if s + m < n:
                    out[s:s + m] += hit
    return _seamless(out, fade_s=0.5) * 0.75


def chant_loop(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # deep male chanting on one note
    out = np.zeros(n)
    for _ in range(8):
        f = _rng.uniform(75, 110)
        v = np.sin(np.cumsum(np.full(n, 2 * np.pi * f / SR))) * _rng.uniform(0.06, 0.12)
        v *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.5 * t + _rng.uniform(0, 6))
        out += v
    out = np.sign(out) * 0.06 + out * 0.5
    return _seamless(out, fade_s=0.8) * 0.7


# ---------------------------------------------------------------- naval / animals
def submarine_dive(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # dive alarm + rushing water
    alarm = np.sin(2 * np.pi * 600 * t) * 0.25 * np.minimum(t / 0.1, 1.0) * np.exp(-np.maximum(t - 1.0, 0) * 4)
    rush = lowpass(noise(n), 800) * 0.4 * np.minimum(t / 1.5, 1.0)
    return (alarm + rush) * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def cougar_growl(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # big cat growl: low sawtooth rumble
    f = 70 + 20 * np.sin(2 * np.pi * 2 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.35
    x = np.sign(x) * 0.2 + x * 0.3
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 7 * t)
    env = np.minimum(t / 0.2, 1.0) * np.exp(-np.maximum(t - dur + 0.5, 0) * 4)
    return x * env * 0.7


def prairie_dog(dur=0.8):
    n = int(dur * SR)
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.18):
        m = int(0.1 * SR)
        t = np.arange(m) / SR
        yip = np.sin(2 * np.pi * _rng.uniform(1800, 2400) * t) * _env_decay(m, 75) * 0.3
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += yip
    return out * 0.6


# ---------------------------------------------------------------- weather / modern
def frost_crack(dur=1.0):
    n = int(dur * SR)
    out = np.zeros(n)
    # ice cracking: sharp reports
    for b in _rng.uniform(0.1, 0.8, 5):
        m = int(0.15 * SR)
        crack = highpass(noise(m), 1500) * _env_decay(m, 45) * _rng.uniform(0.25, 0.5)
        crack += np.sin(2 * np.pi * _rng.uniform(800, 1500) * np.arange(m) / SR) * _env_decay(m, 55) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += crack
    return out * 0.7


def tank_fire():
    m = int(1.0 * SR)
    t = np.arange(m) / SR
    # tank main gun: massive crack + shell whizz
    crack = lowpass(noise(int(0.12 * SR)), 3000) * 0.9
    out = np.zeros(m)
    out[:len(crack)] += crack * _env_decay(len(crack), 60)
    # shell whizz
    wm = int(0.5 * SR)
    whizz = np.sin(np.cumsum(2 * np.pi * (2500 - 1500 * np.arange(wm) / wm / SR) / SR)) * 0.2 * _env_decay(wm, 12)
    s = int(0.12 * SR)
    out[s:s + wm] += whizz
    # deep boom
    boom = np.sin(2 * np.pi * 55 * t) * _env_decay(m, 10) * 0.6
    out += boom
    return out * 0.85


# ---------------------------------------------------------------- combat / foley
def cavalry_gallop_loop(dur=3.0):
    n = int(dur * SR)
    out = np.zeros(n)
    # many hooves: rolling thunder of gallop
    for b in np.arange(0.05, dur - 0.15, 0.28):
        m = int(0.18 * SR)
        t = np.arange(m) / SR
        hoof = lowpass(noise(m), 900) * _env_decay(m, 45) * _rng.uniform(0.25, 0.45)
        # 4-beat gallop
        for sub in (0.0, 0.09):
            sm = int(0.08 * SR)
            thud = lowpass(noise(sm), 800) * _env_decay(sm, 60) * 0.3
            ss = int(sub * SR)
            if ss + sm < m:
                hoof[ss:ss + sm] += thud
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += hoof
    return _seamless(out, fade_s=0.5) * 0.75


def chainmail_rustle(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # metal rings shifting
    x = highpass(lowpass(noise(n), 7000), 2500) * 0.3
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 3.5 * t)
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


def leather_strap():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # leather strap pulled tight + buckle
    pull = lowpass(noise(m), 1200) * 0.3 * np.sin(np.pi * np.minimum(t / 0.4, 1.0))
    buckle = np.sin(2 * np.pi * 1800 * np.arange(int(0.05 * SR)) / SR) * 0.25
    out = pull
    s = int(0.32 * SR)
    out[s:s + len(buckle)] += buckle * _env_decay(len(buckle), 90)
    return out * 0.65


# ---------------------------------------------------------------- siege / misc / ambience / camp / naval
def ladder_thud():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # siege ladder hitting wall: wood crash
    crash = lowpass(noise(m), 1800) * _env_decay(m, 40) * 0.7
    crash += np.sin(2 * np.pi * 220 * t) * _env_decay(m, 50) * 0.3
    return crash * 0.75


def wind_chime(dur=2.5):
    n = int(dur * SR)
    out = np.zeros(n)
    # gentle wind chimes
    for b in _rng.uniform(0.2, dur - 0.5, 8):
        m = int(0.4 * SR)
        t = np.arange(m) / SR
        f = _rng.uniform(1800, 3200)
        chime = np.sin(2 * np.pi * f * t) * _env_decay(m, 25) * _rng.uniform(0.15, 0.3)
        chime += np.sin(2 * np.pi * f * 2.76 * t) * _env_decay(m, 35) * 0.08
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chime
    return out * 0.65


def meadow_day(dur=4.0):
    n = int(dur * SR)
    # peaceful meadow: breeze + insects + distant birds
    x = lowpass(noise(n), 800) * 0.2
    x += highpass(noise(n), 5000) * 0.06  # insects
    for b in _rng.uniform(0.5, dur - 0.5, 6):
        m = int(0.3 * SR)
        t = np.arange(m) / SR
        f = _rng.uniform(2500, 4000)
        bird = np.sin(np.cumsum(2 * np.pi * (f + 500 * np.sin(2 * np.pi * 6 * t)) / SR)) * 0.12 * np.sin(np.pi * t / 0.3)
        s = int(b * SR)
        if s + m < n:
            x[s:s + m] += bird
    return _seamless(x, fade_s=0.8) * 0.7


def sleep_breathing(dur=4.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slow sleeping breaths
    x = lowpass(noise(n), 400) * 0.25
    x *= 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 0.22 * t))
    return _seamless(x, fade_s=0.8) * 0.6


def buoy_bell(dur=3.0):
    n = int(dur * SR)
    out = np.zeros(n)
    # buoy bell clanging on waves
    for b in np.arange(0.3, dur - 0.5, 1.1):
        m = int(0.4 * SR)
        t = np.arange(m) / SR
        bell = np.sin(2 * np.pi * _rng.uniform(700, 900) * t) * _env_decay(m, 30) * 0.35
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bell
    # water lapping
    out += lowpass(noise(n), 900) * 0.15
    return _seamless(out, fade_s=0.6) * 0.7


SFX14 = [
    ("ritual/drum-circle-loop", drum_circle_loop, "ritual drum circle loop"),
    ("ritual/chant-loop", chant_loop, "deep chant loop"),
    ("naval/submarine-dive", submarine_dive, "submarine diving"),
    ("animal/cougar-growl", cougar_growl, "cougar growl"),
    ("animal/prairie-dog", prairie_dog, "prairie dog barks"),
    ("weather/frost-crack", frost_crack, "ice cracking"),
    ("modern/tank-fire", tank_fire, "tank main gun firing"),
    ("combat/cavalry-gallop-loop", cavalry_gallop_loop, "cavalry gallop loop"),
    ("foley/chainmail-rustle", chainmail_rustle, "chainmail rustling"),
    ("foley/leather-strap", leather_strap, "leather strap + buckle"),
    ("siege/ladder-thud", ladder_thud, "siege ladder hits wall"),
    ("misc/wind-chime", wind_chime, "wind chimes"),
    ("ambience/meadow-day", meadow_day, "peaceful meadow"),
    ("camp/sleep-breathing", sleep_breathing, "sleeping breaths"),
    ("naval/buoy-bell", buoy_bell, "buoy bell on waves"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX14:
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
    with open(os.path.join(OUT, "sfx14-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX14:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
