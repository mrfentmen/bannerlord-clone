"""Procedural SFX batch 76 for the Bannerlord-clone (round 75).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx76.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx76")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx76-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(767676)


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
def fore_sail4(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fore sail: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.23, 0.23):
        m = int(0.16 * SR)
        flap = highpass(lowpass(noise(m), 1960), 680) * _env_decay(m, 43) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.54


def pine_marten4(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pine marten: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.036, 0.038):
        m = int(0.023 * SR)
        mt = np.arange(m) / SR
        f = 3050 + 930 * np.sin(2 * np.pi * 29 * mt)
        chatter = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.023)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chatter
    return out * 0.47


# ---------------------------------------------------------------- weather / horror
def khamsin4(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # khamsin: fourth variant
    x = highpass(lowpass(noise(n), 2120), 405) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.125 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def bean_nighe7(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # bean nighe: seventh variant
    out = np.zeros(n)
    # washing
    wm = int(0.95 * SR)
    wash = highpass(lowpass(noise(wm), 2350), 720) * 0.175 * np.sin(np.pi * np.arange(wm) / wm)
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 3.0 * np.arange(wm) / SR)
    out[:wm] += wash
    # wail
    for b in np.arange(1.05, dur - 0.44, 0.6):
        m = int(0.34 * SR)
        mt = np.arange(m) / SR
        f = 780 - 320 * np.sin(2 * np.pi * 1.0 * mt)
        wail = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.125 * np.sin(np.pi * mt / 0.34)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += wail
    return out * 0.52


# ---------------------------------------------------------------- tavern / farm
def put4(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # put: fourth variant
    out = np.zeros(n)
    # deal
    dm = int(0.36 * SR)
    deal = highpass(lowpass(noise(dm), 3950), 1480) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # play
    for b in _rng.uniform(0.46, 1.1, 3):
        m = int(0.061 * SR)
        card = highpass(noise(m), 2400) * _env_decay(m, 72) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.51


def chick_peeps16(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: sixteenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.013, 0.008):
        m = int(0.004 * SR)
        mt = np.arange(m) / SR
        f = 3500 + 920 * np.sin(2 * np.pi * 40 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.004)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.37


# ---------------------------------------------------------------- mine / forge
def longwall6(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # longwall: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.39, 0.44):
        m = int(0.32 * SR)
        cut = lowpass(noise(m), 720) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut
    return out * 0.6


def slitting7(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slitting: seventh variant
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.23, 0.28)):
        m = int(0.17 * SR)
        mt = np.arange(m) / SR
        cut = np.sin(2 * np.pi * 1140 * mt) * _env_decay(m, 67) * 0.22
        cut += lowpass(noise(m), 1240) * _env_decay(m, 74) * 0.14
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut * (1.0 - i * 0.04)
    return out * 0.59


# ---------------------------------------------------------------- kitchen / stable
def flummery_pot6():
    m = int(0.67 * SR)
    t = np.arange(m) / SR
    # flummery: sixth variant
    bubble = lowpass(noise(m), 1020) * 0.2 * np.sin(np.pi * np.minimum(t / 0.67, 1.0))
    bubble *= 0.68 + 0.32 * np.sin(2 * np.pi * 4.1 * t)
    return bubble * 0.55


def manger9():
    m = int(0.57 * SR)
    t = np.arange(m) / SR
    # manger: ninth variant
    chew = lowpass(noise(m), 860) * 0.22 * np.sin(np.pi * np.minimum(t / 0.57, 1.0))
    chew *= 0.72 + 0.28 * np.sin(2 * np.pi * 4.3 * t)
    return chew * 0.58


# ---------------------------------------------------------------- ritual / combat
def compline8(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # compline: eighth variant
    out = np.zeros(n)
    for f in (108, 162, 216):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.53


def ribaudequin5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ribaudequin: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.21, 0.14):
        m = int(0.11 * SR)
        shot = lowpass(noise(m), 1500) * _env_decay(m, 59) * 0.33
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += shot
    return out * 0.62


# ---------------------------------------------------------------- foley / misc
def clog_step12(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: twelfth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.21):
        m = int(0.056 * SR)
        step = lowpass(highpass(noise(m), 320), 1400) * _env_decay(m, 84) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.48


def nocturnal7():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nocturnal: seventh variant
    nc = np.sin(2 * np.pi * 2000 * t) * _env_decay(m, 73) * 0.11
    nc += np.sin(2 * np.pi * 3000 * t) * _env_decay(m, 86) * 0.05
    return nc * 0.54


def comint_burst5(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # COMINT: fifth burst variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.28, 0.58):
        m = int(0.22 * SR)
        burst = highpass(lowpass(noise(m), 3200), 800) * _env_decay(m, 28) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += burst
    return out * 0.6


SFX76 = [
    ("naval/fore-sail4", fore_sail4, "fore sail"),
    ("animal/pine-marten4", pine_marten4, "pine marten"),
    ("weather/khamsin4", khamsin4, "khamsin wind"),
    ("horror/bean-nighe7", bean_nighe7, "bean nighe"),
    ("tavern/put4", put4, "put game"),
    ("farm/chick-peeps16", chick_peeps16, "chick peeps"),
    ("mine/longwall6", longwall6, "longwall cut"),
    ("forge/slitting7", slitting7, "slitting mill"),
    ("kitchen/flummery-pot6", flummery_pot6, "flummery pot"),
    ("stable/manger9", manger9, "manger chewing"),
    ("ritual/compline8", compline8, "compline prayer"),
    ("combat/ribaudequin5", ribaudequin5, "ribaudequin fired"),
    ("foley/clog-step12", clog_step12, "clogs stepping"),
    ("misc/nocturnal7", nocturnal7, "nocturnal dial"),
    ("modern/comint-burst5", comint_burst5, "COMINT burst"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX76:
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
    with open(os.path.join(OUT, "sfx76-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX76:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
