"""Procedural SFX batch 59 for the Bannerlord-clone (round 58).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx59.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx59")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx59-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(595959)


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
def course_sail(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # course sail: lowest square
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.28, 0.27):
        m = int(0.2 * SR)
        belly = lowpass(noise(m), 650) * 0.28 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += belly
    return out * 0.6


def water_vole(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # water vole: squeaks
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.055, 0.06):
        m = int(0.035 * SR)
        mt = np.arange(m) / SR
        f = 3600 + 820 * np.sin(2 * np.pi * 22 * mt)
        squeak = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.035)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += squeak
    return out * 0.5


# ---------------------------------------------------------------- weather / horror
def bise2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bise: second variant
    x = highpass(lowpass(noise(n), 2400), 440) * 0.49
    x *= 0.47 + 0.53 * np.sin(2 * np.pi * 0.16 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def cu_sith(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cu sith: fairy dog
    out = np.zeros(n)
    # baying
    for b in np.arange(0.1, dur - 0.4, 0.6):
        m = int(0.35 * SR)
        mt = np.arange(m) / SR
        f = 420 - 180 * np.sin(2 * np.pi * 0.8 * mt)
        bay = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.18 * np.sin(np.pi * mt / 0.35)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bay
    return out * 0.62


# ---------------------------------------------------------------- tavern / farm
def put_and_take(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # put and take: teetotum
    out = np.zeros(n)
    # spin
    sm = int(0.5 * SR)
    spin = highpass(lowpass(noise(sm), 3600), 1300) * 0.16 * np.sin(np.pi * np.arange(sm) / sm)
    spin *= 0.7 + 0.3 * np.sin(2 * np.pi * 8 * np.arange(sm) / SR)
    out[:sm] += spin
    # settle
    for b in _rng.uniform(0.6, 1.1, 3):
        m = int(0.06 * SR)
        tick = np.sin(2 * np.pi * 2600 * np.arange(m) / SR) * _env_decay(m, 72) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += tick
    return out * 0.55


def poult_peeps8(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: eighth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.038, 0.024):
        m = int(0.018 * SR)
        mt = np.arange(m) / SR
        f = 4700 + 640 * np.sin(2 * np.pi * 25 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.018)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.47


# ---------------------------------------------------------------- mine / forge
def longwall(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # longwall: coal face
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.45, 0.5):
        m = int(0.38 * SR)
        cut = lowpass(noise(m), 750) * 0.35 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut
    return out * 0.61


def cementation(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cementation: steel making
    x = lowpass(noise(n), 520) * 0.45
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.34 * t)
    return _seamless(x, fade_s=0.6) * 0.64


# ---------------------------------------------------------------- kitchen / stable
def syllabub3():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # syllabub: third variant
    whip = highpass(lowpass(noise(m), 3000), 1000) * 0.19 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    whip *= 0.68 + 0.32 * np.sin(2 * np.pi * 4.2 * t)
    return whip * 0.56


def hay_fork2():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # hay fork: second variant
    toss = highpass(lowpass(noise(m), 3500), 1200) * 0.24 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return toss * 0.6


# ---------------------------------------------------------------- ritual / combat
def office_dead(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # office of the dead: solemn
    out = np.zeros(n)
    for f in (100, 150, 200):
        out += np.sin(2 * np.pi * f * t) * 0.06
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.58


def wall_gun(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wall gun: large musket
    out = np.zeros(n)
    # crack
    cm = int(0.16 * SR)
    crack = lowpass(noise(cm), 2100) * _env_decay(cm, 60) * 0.47
    out[:cm] += crack
    # echo
    em = int(0.42 * SR)
    echo = lowpass(noise(em), 750) * _env_decay(em, 32) * 0.24
    s = int(0.14 * SR)
    out[s:s + em] += echo
    return out * 0.66


# ---------------------------------------------------------------- foley / misc
def sabot_step5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.11, 0.31):
        m = int(0.08 * SR)
        step = lowpass(highpass(noise(m), 560), 2600) * _env_decay(m, 75) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.55


def pelorus3():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # pelorus: third variant
    pel = np.sin(2 * np.pi * 2150 * t) * _env_decay(m, 63) * 0.11
    pel += np.sin(2 * np.pi * 3225 * t) * _env_decay(m, 76) * 0.05
    return pel * 0.53


def masint_ping(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # MASINT: measurement ping
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.7):
        m = int(0.3 * SR)
        mt = np.arange(m) / SR
        ping = np.sin(2 * np.pi * 1450 * mt) * _env_decay(m, 22) * 0.26
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += ping
    return out * 0.6


SFX59 = [
    ("naval/course-sail", course_sail, "course sail"),
    ("animal/water-vole", water_vole, "water vole"),
    ("weather/bise2", bise2, "bise wind"),
    ("horror/cu-sith", cu_sith, "cu sith hound"),
    ("tavern/put-and-take", put_and_take, "put and take"),
    ("farm/poult-peeps8", poult_peeps8, "poult peeps"),
    ("mine/longwall", longwall, "longwall cut"),
    ("forge/cementation", cementation, "cementation fire"),
    ("kitchen/syllabub3", syllabub3, "syllabub whipped"),
    ("stable/hay-fork2", hay_fork2, "hay fork"),
    ("ritual/office-dead", office_dead, "office of the dead"),
    ("combat/wall-gun", wall_gun, "wall gun fired"),
    ("foley/sabot-step5", sabot_step5, "sabots stepping"),
    ("misc/pelorus3", pelorus3, "pelorus sight"),
    ("modern/masint-ping", masint_ping, "MASINT ping"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX59:
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
    with open(os.path.join(OUT, "sfx59-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX59:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
