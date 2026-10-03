"""Procedural SFX batch 71 for the Bannerlord-clone (round 70).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx71.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx71")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx71-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(717171)


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
def fore_sail3(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fore sail: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.23, 0.23):
        m = int(0.16 * SR)
        flap = highpass(lowpass(noise(m), 1950), 670) * _env_decay(m, 44) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.53


def pine_marten3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pine marten: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.034, 0.036):
        m = int(0.021 * SR)
        mt = np.arange(m) / SR
        f = 3100 + 920 * np.sin(2 * np.pi * 27 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.021)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.46


# ---------------------------------------------------------------- weather / horror
def khamsin3(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # khamsin: third variant
    x = highpass(lowpass(noise(n), 1980), 380) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.1 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def bean_nighe3(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: third variant
    out = np.zeros(n)
    # washing
    wm = int(1.15 * SR)
    wash = highpass(lowpass(noise(wm), 2750), 880) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 2.2 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(1.25, dur - 0.48, 0.68):
        m = int(0.38 * SR)
        mt = np.arange(m) / SR
        f = 860 - 360 * np.sin(2 * np.pi * 0.92 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.38)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.56


# ---------------------------------------------------------------- tavern / farm
def put3(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # put: third variant
    out = np.zeros(n)
    # deal
    dm = int(0.35 * SR)
    deal = highpass(lowpass(noise(dm), 3900), 1450) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.45, 1.1, 3):
        m = int(0.06 * SR)
        card = highpass(noise(m), 2350) * _env_decay(m, 73) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.5


def chick_peeps14(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: fourteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.016, 0.011):
        m = int(0.006 * SR)
        mt = np.arange(m) / SR
        f = 3500 + 880 * np.sin(2 * np.pi * 37 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.006)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.39


# ---------------------------------------------------------------- mine / forge
def longwall4(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # longwall: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.36, 0.41):
        m = int(0.29 * SR)
        cut = lowpass(noise(m), 660) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut
    return out * 0.57


def slitting5(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slitting: fifth variant
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.25, 0.3)):
        m = int(0.19 * SR)
        mt = np.arange(m) / SR
        cut = np.sin(2 * np.pi * 1180 * mt) * _env_decay(m, 65) * 0.22
        cut += lowpass(noise(m), 1280) * _env_decay(m, 72) * 0.14
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut * (1.0 - i * 0.04)
    return out * 0.61


# ---------------------------------------------------------------- kitchen / stable
def flummery_pot5():
    m = int(0.65 * SR)
    t = np.arange(m) / SR
    # flummery: fifth variant
    bubble = lowpass(noise(m), 1000) * 0.2 * np.sin(np.pi * np.minimum(t / 0.65, 1.0))
    bubble *= 0.68 + 0.32 * np.sin(2 * np.pi * 4.0 * t)
    return bubble * 0.54


def manger7():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # manger: seventh variant
    chew = lowpass(noise(m), 840) * 0.22 * np.sin(np.pi * np.minimum(t / 0.55, 1.0))
    chew *= 0.72 + 0.28 * np.sin(2 * np.pi * 4.1 * t)
    return chew * 0.56


# ---------------------------------------------------------------- ritual / combat
def compline6(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # compline: sixth variant
    out = np.zeros(n)
    for f in (106, 159, 212):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.51


def ribaudequin4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ribaudequin: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.22, 0.15):
        m = int(0.12 * SR)
        shot = lowpass(noise(m), 1550) * _env_decay(m, 58) * 0.33
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += shot
    return out * 0.63


# ---------------------------------------------------------------- foley / misc
def clog_step10(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: tenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.19):
        m = int(0.052 * SR)
        step = lowpass(highpass(noise(m), 300), 1300) * _env_decay(m, 87) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.46


def nocturnal6():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nocturnal: sixth variant
    nc = np.sin(2 * np.pi * 1980 * t) * _env_decay(m, 68) * 0.11
    nc += np.sin(2 * np.pi * 2970 * t) * _env_decay(m, 81) * 0.05
    return nc * 0.49


def comint_burst4(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # COMINT: fourth burst variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.26, 0.56):
        m = int(0.2 * SR)
        burst = highpass(lowpass(noise(m), 3000), 760) * _env_decay(m, 30) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += burst
    return out * 0.58


SFX71 = [
    ("naval/fore-sail3", fore_sail3, "fore sail"),
    ("animal/pine-marten3", pine_marten3, "pine marten"),
    ("weather/khamsin3", khamsin3, "khamsin wind"),
    ("horror/bean-nighe3", bean_nighe3, "bean nighe"),
    ("tavern/put3", put3, "put game"),
    ("farm/chick-peeps14", chick_peeps14, "chick peeps"),
    ("mine/longwall4", longwall4, "longwall cut"),
    ("forge/slitting5", slitting5, "slitting mill"),
    ("kitchen/flummery-pot5", flummery_pot5, "flummery pot"),
    ("stable/manger7", manger7, "manger chewing"),
    ("ritual/compline6", compline6, "compline prayer"),
    ("combat/ribaudequin4", ribaudequin4, "ribaudequin fired"),
    ("foley/clog-step10", clog_step10, "clogs stepping"),
    ("misc/nocturnal6", nocturnal6, "nocturnal dial"),
    ("modern/comint-burst4", comint_burst4, "COMINT burst"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX71:
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
    with open(os.path.join(OUT, "sfx71-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX71:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
