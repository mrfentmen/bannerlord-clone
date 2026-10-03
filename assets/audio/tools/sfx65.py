"""Procedural SFX batch 65 for the Bannerlord-clone (round 64).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx65.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx65")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx65-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(656565)


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
def spanker_sail2(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # spanker: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.25, 0.25):
        m = int(0.18 * SR)
        flap = highpass(lowpass(noise(m), 2030), 730) * _env_decay(m, 39) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.56


def otter3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # otter: third variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.045, 0.048):
        m = int(0.027 * SR)
        mt = np.arange(m) / SR
        f = 3000 + 940 * np.sin(2 * np.pi * 28 * mt)
        chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.11 * np.sin(np.pi * mt / 0.027)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chirp
    return out * 0.49


# ---------------------------------------------------------------- weather / horror
def chinook3(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chinook: third variant
    x = highpass(lowpass(noise(n), 2100), 380) * 0.49
    x *= 0.48 + 0.52 * np.sin(2 * np.pi * 0.1 * t)
    return _seamless(x, fade_s=0.6) * 0.63


def sluagh_host2(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sluagh host: second variant
    out = np.zeros(n)
    for f in (155, 235, 315, 395):
        fmod = f + 68 * np.sin(2 * np.pi * 0.4 * t)
        voice = np.sin(np.cumsum(2 * np.pi * fmod / SR)) * 0.078
        voice *= np.sin(np.pi * np.minimum(t / dur, 1.0))
        out += voice
    return out * 0.59


# ---------------------------------------------------------------- tavern / farm
def dice_cup3(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # dice cup: third variant
    out = np.zeros(n)
    # shake
    sm = int(0.35 * SR)
    shake = highpass(lowpass(noise(sm), 4800), 1900) * 0.17 * np.sin(np.pi * np.arange(sm) / sm)
    out[:sm] += shake
    # roll
    for b in _rng.uniform(0.42, 0.9, 4):
        m = int(0.045 * SR)
        die = np.sin(2 * np.pi * 2700 * np.arange(m) / SR) * _env_decay(m, 82) * 0.09
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += die
    return out * 0.55


def gosling_calls4(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # goslings: fourth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.028, 0.018):
        m = int(0.012 * SR)
        mt = np.arange(m) / SR
        f = 4100 + 760 * np.sin(2 * np.pi * 31 * mt)
        call = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.09 * np.sin(np.pi * mt / 0.012)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += call
    return out * 0.45


# ---------------------------------------------------------------- mine / forge
def gophering2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gophering: second variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.33, 0.38):
        m = int(0.26 * SR)
        dig = lowpass(noise(m), 820) * 0.32 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dig
    return out * 0.58


def faggot_furnace2(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # faggot furnace: second variant
    x = lowpass(noise(n), 500) * 0.44
    x *= 0.58 + 0.42 * np.sin(2 * np.pi * 0.29 * t)
    return _seamless(x, fade_s=0.6) * 0.62


# ---------------------------------------------------------------- kitchen / stable
def flummery_pot4():
    m = int(0.65 * SR)
    t = np.arange(m) / SR
    # flummery: fourth variant
    bubble = lowpass(noise(m), 1020) * 0.21 * np.sin(np.pi * np.minimum(t / 0.65, 1.0))
    bubble *= 0.68 + 0.32 * np.sin(2 * np.pi * 3.8 * t)
    return bubble * 0.55


def manger6():
    m = int(0.55 * SR)
    t = np.arange(m) / SR
    # manger: sixth variant
    chew = lowpass(noise(m), 860) * 0.23 * np.sin(np.pi * np.minimum(t / 0.55, 1.0))
    chew *= 0.72 + 0.28 * np.sin(2 * np.pi * 3.9 * t)
    return chew * 0.57


# ---------------------------------------------------------------- ritual / combat
def compline5(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # compline: fifth variant
    out = np.zeros(n)
    for f in (114, 171, 228):
        out += np.sin(2 * np.pi * f * t) * 0.055
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.54


def cannonade2(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cannonade: second variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.35, 0.4):
        m = int(0.28 * SR)
        boom = lowpass(noise(m), 1600) * _env_decay(m, 42) * 0.42
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += boom
    return out * 0.64


# ---------------------------------------------------------------- foley / misc
def buskin_step6(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # buskins: sixth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.1, 0.25):
        m = int(0.07 * SR)
        step = lowpass(highpass(noise(m), 420), 1900) * _env_decay(m, 81) * 0.23
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.52


def nocturnal5():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # nocturnal: fifth variant
    nc = np.sin(2 * np.pi * 2020 * t) * _env_decay(m, 67) * 0.11
    nc += np.sin(2 * np.pi * 3030 * t) * _env_decay(m, 80) * 0.05
    return nc * 0.5


def comint_burst3(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # COMINT: third burst variant
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.28, 0.58):
        m = int(0.22 * SR)
        burst = highpass(lowpass(noise(m), 3100), 780) * _env_decay(m, 29) * 0.25
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += burst
    return out * 0.59


SFX65 = [
    ("naval/spanker-sail2", spanker_sail2, "spanker sail"),
    ("animal/otter3", otter3, "otter chirp"),
    ("weather/chinook3", chinook3, "chinook wind"),
    ("horror/sluagh-host2", sluagh_host2, "sluagh host"),
    ("tavern/dice-cup3", dice_cup3, "dice cup"),
    ("farm/gosling-calls4", gosling_calls4, "gosling calls"),
    ("mine/gophering2", gophering2, "gophering dig"),
    ("forge/faggot-furnace2", faggot_furnace2, "faggot furnace"),
    ("kitchen/flummery-pot4", flummery_pot4, "flummery pot"),
    ("stable/manger6", manger6, "manger chewing"),
    ("ritual/compline5", compline5, "compline prayer"),
    ("combat/cannonade2", cannonade2, "cannonade"),
    ("foley/buskin-step6", buskin_step6, "buskins stepping"),
    ("misc/nocturnal5", nocturnal5, "nocturnal dial"),
    ("modern/comint-burst3", comint_burst3, "COMINT burst"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX65:
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
    with open(os.path.join(OUT, "sfx65-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX65:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
