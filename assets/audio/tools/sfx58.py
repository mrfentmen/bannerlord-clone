"""Procedural SFX batch 58 for the Bannerlord-clone (round 57).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx58.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx58")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx58-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(585858)


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
def gaff_sail(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gaff sail: four-sided
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.24):
        m = int(0.17 * SR)
        flap = highpass(lowpass(noise(m), 2300), 850) * _env_decay(m, 37) * 0.17
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.57


def beaver2(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # beaver: second variant
    out = np.zeros(n)
    # gnaw
    for b in np.arange(0.05, dur - 0.15, 0.2):
        m = int(0.1 * SR)
        gnaw = highpass(lowpass(noise(m), 2800), 1300) * 0.16 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += gnaw
    return out * 0.55


# ---------------------------------------------------------------- weather / horror
def santa_ana2(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # santa ana: second variant
    x = highpass(lowpass(noise(n), 2500), 450) * 0.48
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.17 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def sluagh_host(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sluagh host: gathered dead
    out = np.zeros(n)
    for f in (160, 240, 320, 400):
        fmod = f + 70 * np.sin(2 * np.pi * 0.42 * t)
        voice = np.sin(np.cumsum(2 * np.pi * fmod / SR)) * 0.08
        voice *= np.sin(np.pi * np.minimum(t / dur, 1.0))
        out += voice
    return out * 0.6


# ---------------------------------------------------------------- tavern / farm
def whist2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # whist: second card game
    out = np.zeros(n)
    # deal
    dm = int(0.45 * SR)
    deal = highpass(lowpass(noise(dm), 4400), 1700) * 0.16 * np.sin(np.pi * np.arange(dm) / dm)
    out[:dm] += deal
    # cards played
    for b in _rng.uniform(0.55, 1.1, 3):
        m = int(0.06 * SR)
        card = highpass(noise(m), 2800) * _env_decay(m, 70) * 0.1
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += card
    return out * 0.55


def chick_peeps10(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: tenth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.04, 0.026):
        m = int(0.02 * SR)
        mt = np.arange(m) / SR
        f = 4600 + 660 * np.sin(2 * np.pi * 24 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.02)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.48


# ---------------------------------------------------------------- mine / forge
def drift_mining(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # drift: horizontal tunnel
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.36, 0.4):
        m = int(0.28 * SR)
        work = lowpass(noise(m), 800) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += work
    return out * 0.59


def slitting2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slitting: second variant
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.28, 0.33)):
        m = int(0.22 * SR)
        mt = np.arange(m) / SR
        cut = np.sin(2 * np.pi * 1120 * mt) * _env_decay(m, 62) * 0.24
        cut += lowpass(noise(m), 1350) * _env_decay(m, 69) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += cut * (1.0 - i * 0.04)
    return out * 0.64


# ---------------------------------------------------------------- kitchen / stable
def posset_stir2():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # posset: second stir variant
    stir = lowpass(noise(m), 1200) * 0.23 * np.sin(np.pi * np.minimum(t / 0.7, 1.0))
    stir *= 0.68 + 0.32 * np.sin(2 * np.pi * 3.2 * t)
    return stir * 0.58


def straw_tick2():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # straw tick: second variant
    rustle = highpass(lowpass(noise(m), 3300), 1250) * 0.24 * np.sin(np.pi * np.minimum(t / 0.5, 1.0))
    return rustle * 0.6


# ---------------------------------------------------------------- ritual / combat
def benediction2(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # benediction: second variant
    out = np.zeros(n)
    for f in (125, 188, 250):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.57


def ribaudequin(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ribaudequin: organ gun
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.18):
        m = int(0.15 * SR)
        shot = lowpass(noise(m), 1700) * _env_decay(m, 55) * 0.36
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += shot
    return out * 0.66


# ---------------------------------------------------------------- foley / misc
def clog_step6(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # clogs: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.12, 0.37):
        m = int(0.085 * SR)
        step = lowpass(highpass(noise(m), 720), 3700) * _env_decay(m, 74) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.56


def cross_staff2():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # cross-staff: second variant
    cs = np.sin(2 * np.pi * 2250 * t) * _env_decay(m, 62) * 0.11
    cs += np.sin(2 * np.pi * 3375 * t) * _env_decay(m, 75) * 0.05
    return cs * 0.54


def sigint_scan(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # SIGINT: scanning
    f = 1500 + 1000 * np.sin(2 * np.pi * 0.35 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.1
    # scan pattern
    x *= 0.4 + 0.6 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.9 * t))
    return _seamless(x, fade_s=0.4) * 0.54


SFX58 = [
    ("naval/gaff-sail", gaff_sail, "gaff sail"),
    ("animal/beaver2", beaver2, "beaver gnaw"),
    ("weather/santa-ana2", santa_ana2, "santa ana wind"),
    ("horror/sluagh-host", sluagh_host, "sluagh host"),
    ("tavern/whist2", whist2, "whist game"),
    ("farm/chick-peeps10", chick_peeps10, "chick peeps"),
    ("mine/drift-mining", drift_mining, "drift mining"),
    ("forge/slitting2", slitting2, "slitting mill"),
    ("kitchen/posset-stir2", posset_stir2, "posset stirred"),
    ("stable/straw-tick2", straw_tick2, "straw tick"),
    ("ritual/benediction2", benediction2, "benediction prayer"),
    ("combat/ribaudequin", ribaudequin, "ribaudequin fired"),
    ("foley/clog-step6", clog_step6, "clogs stepping"),
    ("misc/cross-staff2", cross_staff2, "cross-staff sight"),
    ("modern/sigint-scan", sigint_scan, "SIGINT scan"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX58:
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
    with open(os.path.join(OUT, "sfx58-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX58:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
