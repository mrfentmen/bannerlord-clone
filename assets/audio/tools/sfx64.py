"""Procedural SFX batch 64 for the Bannerlord-clone (round 63).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx64.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx64")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx64-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(646464)


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
def fore_sail2(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fore sail: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.25):
        m = int(0.18 * SR)
        flap = highpass(lowpass(noise(m), 2040), 740) * _env_decay(m, 38) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.56


def pine_marten2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pine marten: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.046, 0.05):
        m = int(0.028 * SR)
        mt = np.arange(m) / SR
        f = 3100 + 920 * np.sin(2 * np.pi * 27 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.028)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.49


# ---------------------------------------------------------------- weather / horror
def khamsin2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # khamsin: second variant
    x = highpass(lowpass(noise(n), 2150), 390) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.11 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def bean_nighe2(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: second variant
    out = np.zeros(n)
    # washing
    wm = int(1.2 * SR)
    wash = highpass(lowpass(noise(wm), 2800), 900) * 0.18 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 2.1 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(1.3, dur - 0.5, 0.7):
        m = int(0.4 * SR)
        mt = np.arange(m) / SR
        f = 880 - 380 * np.sin(2 * np.pi * 0.9 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13 * np.sin(np.pi * mt / 0.4)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.57


# ---------------------------------------------------------------- tavern / farm
def put2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # put: second card game variant
    out = np.zeros(n)
    # deal
    dm = int(0.4 * SR)
    deal = highpass(lowpass(noise(dm), 4100), 1550) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.5, 1.1, 3):
        m = int(0.06 * SR)
        card = highpass(noise(m), 2500) * _env_decay(m, 70) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.53


def chick_peeps12(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: twelfth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.032, 0.02):
        m = int(0.014 * SR)
        mt = np.arange(m) / SR
        f = 4200 + 740 * np.sin(2 * np.pi * 30 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.014)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.45


# ---------------------------------------------------------------- mine / forge
def longwall2(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # longwall: second variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.41, 0.46):
        m = int(0.34 * SR)
        cut = lowpass(noise(m), 710) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut
    return out * 0.59


def slitting3(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slitting: third variant
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.27, 0.32)):
        m = int(0.21 * SR)
        mt = np.arange(m) / SR
        cut = np.sin(2 * np.pi * 1140 * mt) * _env_decay(m, 63) * 0.23
        cut += lowpass(noise(m), 1320) * _env_decay(m, 70) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut * (1.0 - i * 0.04)
    return out * 0.63


# ---------------------------------------------------------------- kitchen / stable
def flummery_pot3():
    m = int(0.65 * SR)
    t = np.arange(m) / SR
    # flummery: third variant
    bubble = lowpass(noise(m), 1050) * 0.21 * np.sin(np.pi * np.minimum(t / 0.65, 1.0))
    bubble *= 0.68 + 0.32 * np.sin(2 * np.pi * 3.6 * t)
    return bubble * 0.56


def manger5():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # manger: fifth variant
    chew = lowpass(noise(m), 880) * 0.23 * np.sin(np.pi * np.minimum(t / 0.55, 1.0))
    chew *= 0.72 + 0.28 * np.sin(2 * np.pi * 3.7 * t)
    return chew * 0.58


# ---------------------------------------------------------------- ritual / combat
def compline4(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # compline: fourth variant
    out = np.zeros(n)
    for f in (116, 174, 232):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.55


def ribaudequin2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ribaudequin: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.17):
        m = int(0.14 * SR)
        shot = lowpass(noise(m), 1650) * _env_decay(m, 56) * 0.35
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += shot
    return out * 0.65


# ---------------------------------------------------------------- foley / misc
def clog_step8(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: eighth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.26):
        m = int(0.07 * SR)
        step = lowpass(highpass(noise(m), 440), 2000) * _env_decay(m, 80) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.52


def nocturnal4():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nocturnal: fourth variant
    nc = np.sin(2 * np.pi * 2080 * t) * _env_decay(m, 66) * 0.11
    nc += np.sin(2 * np.pi * 3120 * t) * _env_decay(m, 79) * 0.05
    return nc * 0.51


def comint_burst2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # COMINT: second burst variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.6):
        m = int(0.24 * SR)
        burst = highpass(lowpass(noise(m), 3200), 800) * _env_decay(m, 28) * 0.26
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += burst
    return out * 0.6


SFX64 = [
    ("naval/fore-sail2", fore_sail2, "fore sail"),
    ("animal/pine-marten2", pine_marten2, "pine marten"),
    ("weather/khamsin2", khamsin2, "khamsin wind"),
    ("horror/bean-nighe2", bean_nighe2, "bean nighe"),
    ("tavern/put2", put2, "put game"),
    ("farm/chick-peeps12", chick_peeps12, "chick peeps"),
    ("mine/longwall2", longwall2, "longwall cut"),
    ("forge/slitting3", slitting3, "slitting mill"),
    ("kitchen/flummery-pot3", flummery_pot3, "flummery pot"),
    ("stable/manger5", manger5, "manger chewing"),
    ("ritual/compline4", compline4, "compline prayer"),
    ("combat/ribaudequin2", ribaudequin2, "ribaudequin fired"),
    ("foley/clog-step8", clog_step8, "clogs stepping"),
    ("misc/nocturnal4", nocturnal4, "nocturnal dial"),
    ("modern/comint-burst2", comint_burst2, "COMINT burst"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX64:
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
    with open(os.path.join(OUT, "sfx64-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX64:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
