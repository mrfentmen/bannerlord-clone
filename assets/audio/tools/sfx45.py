"""Procedural SFX batch 45 for the Bannerlord-clone (round 44).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx45.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx45")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx45-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(454545)


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
def topsail(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # topsail: canvas unfurled
    out = np.zeros(n)
    # unfurl
    um = int(0.8 * SR)
    unfurl = highpass(lowpass(noise(um), 4200), 800) * 0.34 * np.sin(np.pi * np.arange(um) / um)
    out[:um] += unfurl
    # wind catch
    wc = int(0.5 * SR)
    catch = lowpass(noise(wc), 900) * 0.28 * np.sin(np.pi * np.arange(wc) / wc)
    s = int(0.9 * SR)
    out[s:s + wc] += catch
    return out * 0.66


def fox_bark(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fox: sharp barks
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.15, 0.22):
        m = int(0.12 * SR)
        mt = np.arange(m) / SR
        f = 1800 - 600 * (mt / 0.12)
        bark = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.22 * np.exp(-mt * 12)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bark
    return out * 0.6


# ---------------------------------------------------------------- weather / horror
def shamal(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # shamal: persian gulf wind
    x = highpass(lowpass(noise(n), 3900), 590) * 0.37
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.3 * t)
    grit = highpass(noise(n), 5500) * 0.05
    x += grit
    return _seamless(x, fade_s=0.6) * 0.64


def dullahan(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # dullahan: headless rider
    out = np.zeros(n)
    # hooves
    for b in np.arange(0.05, dur - 0.2, 0.3):
        m = int(0.14 * SR)
        hoof = lowpass(highpass(noise(m), 400), 2200) * _env_decay(m, 62) * 0.26
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += hoof
    # whisper
    f = 320 - 140 * np.sin(2 * np.pi * 0.7 * t)
    whisper = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.1
    whisper *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    out += whisper
    return out * 0.64


# ---------------------------------------------------------------- tavern / farm
def kayles(dur=1.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # kayles: pins knocked
    out = np.zeros(n)
    # bowl roll
    rm = int(0.5 * SR)
    roll = lowpass(noise(rm), 600) * 0.3 * np.sin(np.pi * np.arange(rm) / rm)
    out[:rm] += roll
    # pins
    for b in _rng.uniform(0.55, 1.2, 6):
        m = int(0.12 * SR)
        pin = np.sin(2 * np.pi * 920 * np.arange(m) / SR) * _env_decay(m, 54) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pin
    return out * 0.66


def chick_peeps4(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: lively peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.07, 0.07):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 3500 + 750 * np.sin(2 * np.pi * 12 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.14 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def rise_timber():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # rise timber: upward shaft
    out = np.zeros(m)
    for b in np.arange(0.05, 0.65, 0.24):
        sm = int(0.22 * SR)
        creak = np.sin(2 * np.pi * 142 * np.arange(sm) / SR) * _env_decay(sm, 27) * 0.23
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += creak
    return out * 0.65


def shingling(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # shingling: squeezing bloom
    out = np.zeros(n)
    for i, b in enumerate(np.arange(0.1, dur - 0.32, 0.36)):
        m = int(0.28 * SR)
        squeeze = lowpass(noise(m), 750) * 0.34 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += squeeze * (1.0 - i * 0.05)
    return out * 0.66


# ---------------------------------------------------------------- kitchen / stable
def sack_posset():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # sack posset: wine-based
    pour = lowpass(noise(m), 1550) * 0.27 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    wine = highpass(noise(m), 4200) * 0.06
    return (pour + wine) * 0.6


def corn_bin():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # corn: grain bin
    pour = highpass(lowpass(noise(m), 3700), 1450) * 0.28 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return pour * 0.62


# ---------------------------------------------------------------- ritual / combat
def ordination(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ordination: sacred vows
    out = np.zeros(n)
    for f in (104, 156, 208):
        out += np.sin(2 * np.pi * f * t) * 0.07
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # bell
    for b in (0.7, 1.5):
        m = int(0.35 * SR)
        bell = np.sin(2 * np.pi * 620 * np.arange(m) / SR) * _env_decay(m, 34) * 0.15
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bell
    return out * 0.66


def minion_fire(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # minion: small cannon
    out = np.zeros(n)
    # pop
    pm = int(0.16 * SR)
    pop = lowpass(noise(pm), 1900) * _env_decay(pm, 60) * 0.48
    out[:pm] += pop
    # tail
    tm = int(0.42 * SR)
    tail = lowpass(noise(tm), 950) * _env_decay(tm, 33) * 0.26
    s = int(0.14 * SR)
    out[s:s + tm] += tail
    return out * 0.68


# ---------------------------------------------------------------- foley / misc
def sabot_clack2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sabots: alternate clack
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.16, 0.31):
        m = int(0.12 * SR)
        clack = lowpass(highpass(noise(m), 790), 3680) * _env_decay(m, 71) * 0.28
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clack
    return out * 0.62


def astrolabe_ring():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # astrolabe: ring adjusted
    ring = np.sin(2 * np.pi * 1700 * t) * _env_decay(m, 55) * 0.18
    ring += np.sin(2 * np.pi * 2550 * t) * _env_decay(m, 68) * 0.09
    return ring * 0.58


def radar_pulse(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # radar: pulse sweep
    out = np.zeros(n)
    for b in np.arange(0.25, dur - 0.3, 0.75):
        m = int(0.22 * SR)
        pulse = np.sin(2 * np.pi * 1600 * np.arange(m) / SR) * _env_decay(m, 38) * 0.22
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += pulse
    return out * 0.62


SFX45 = [
    ("naval/topsail", topsail, "topsail unfurled"),
    ("animal/fox-bark", fox_bark, "fox barking"),
    ("weather/shamal", shamal, "shamal wind"),
    ("horror/dullahan", dullahan, "dullahan riding"),
    ("tavern/kayles", kayles, "kayles game"),
    ("farm/chick-peeps4", chick_peeps4, "chick peeps"),
    ("mine/rise-timber", rise_timber, "rise timber"),
    ("forge/shingling", shingling, "shingling bloom"),
    ("kitchen/sack-posset", sack_posset, "sack posset"),
    ("stable/corn-bin", corn_bin, "corn bin filled"),
    ("ritual/ordination", ordination, "ordination rite"),
    ("combat/minion-fire", minion_fire, "minion fired"),
    ("foley/sabot-clack2", sabot_clack2, "sabots clacking"),
    ("misc/astrolabe-ring", astrolabe_ring, "astrolabe ring"),
    ("modern/radar-pulse", radar_pulse, "radar pulse"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX45:
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
    with open(os.path.join(OUT, "sfx45-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX45:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
