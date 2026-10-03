"""Procedural SFX batch 38 for the Bannerlord-clone (round 37).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx38.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx38")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx38-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(383838)


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
def careening(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # careening: hull scraped
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.6, 0.7):
        m = int(0.6 * SR)
        scrape = highpass(lowpass(noise(m), 3000), 700) * 0.32 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += scrape
    return out * 0.66


def beaver_tail():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # beaver: tail slap
    slap = lowpass(highpass(noise(m), 500), 2500) * _env_decay(m, 70) * 0.4
    return slap * 0.65


# ---------------------------------------------------------------- weather / horror
def sirocco_wind(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sirocco: hot saharan wind
    x = highpass(lowpass(noise(n), 4600), 650) * 0.36
    x *= 0.65 + 0.35 * np.sin(2 * np.pi * 0.36 * t)
    return _seamless(x, fade_s=0.6) * 0.66


def vampire_snaring(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # vampire: snarling
    f = 180 - 80 * np.sin(2 * np.pi * 1.2 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.26
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 5 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.66


# ---------------------------------------------------------------- tavern / farm
def dice_shaker(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # dice: cup shaken
    out = np.zeros(n)
    for b in np.arange(0.05, 0.7, 0.14):
        m = int(0.1 * SR)
        rattle = highpass(noise(m), 2500) * _env_decay(m, 80) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += rattle
    # throw
    tm = int(0.15 * SR)
    throw = highpass(noise(tm), 3000) * _env_decay(tm, 75) * 0.28
    s = int(0.8 * SR)
    out[s:s + tm] += throw
    return out * 0.65


def poult_chorus(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: young turkeys
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.08, 0.11):
        m = int(0.06 * SR)
        mt = np.arange(m) / SR
        f = 2800 + 650 * np.sin(2 * np.pi * 8 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16 * np.sin(np.pi * mt / 0.06)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def winze_sinking(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # winze: vertical shaft
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.7, 0.85):
        m = int(0.75 * SR)
        dig = lowpass(noise(m), 650) * 0.37 * np.sin(np.pi * np.arange(m) / m)
        echo = np.roll(dig, int(0.22 * SR)) * 0.32
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dig + echo[:m]
    return out * 0.68


def case_hardening(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # case hardening: quench + temper
    out = np.zeros(n)
    # heat
    hr = int(0.7 * SR)
    heat = lowpass(noise(hr), 950) * 0.34 * np.sin(np.pi * np.arange(hr) / hr)
    out[:hr] += heat
    # quench
    qm = int(0.35 * SR)
    quench = highpass(noise(qm), 2200) * _env_decay(qm, 42) * 0.38
    s = int(0.75 * SR)
    out[s:s + qm] += quench
    return out * 0.68


# ---------------------------------------------------------------- kitchen / stable
def marchpane():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # marchpane: almond paste worked
    out = np.zeros(m)
    for b in np.arange(0.05, 0.6, 0.18):
        sm = int(0.14 * SR)
        knead = lowpass(noise(sm), 1100) * 0.28 * np.sin(np.pi * np.arange(sm) / sm)
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += knead
    return out * 0.6


def feed_bin():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # feed bin: grain poured
    pour = highpass(lowpass(noise(m), 3800), 1400) * 0.3 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return pour * 0.62


# ---------------------------------------------------------------- ritual / combat
def penance(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # penance: murmured prayers
    out = np.zeros(n)
    for f in (92, 138, 184):
        out += np.sin(2 * np.pi * f * t) * 0.07
    out *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.8 * t)
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.65


def culverin_fire(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # culverin: early cannon
    out = np.zeros(n)
    # blast
    bm = int(0.25 * SR)
    blast = lowpass(noise(bm), 1400) * _env_decay(bm, 48) * 0.55
    out[:bm] += blast
    # echo
    em = int(0.5 * SR)
    echo = lowpass(noise(em), 800) * _env_decay(em, 28) * 0.3
    s = int(0.2 * SR)
    out[s:s + em] += echo
    return out * 0.72


# ---------------------------------------------------------------- foley / misc
def geta_clack(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # geta: wooden sandals
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.16, 0.31):
        m = int(0.12 * SR)
        clack = lowpass(highpass(noise(m), 850), 3600) * _env_decay(m, 72) * 0.28
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clack
    return out * 0.62


def sundial():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # sundial: stone gnomon tap
    tap = np.sin(2 * np.pi * 900 * t) * _env_decay(m, 55) * 0.2
    tap += np.sin(2 * np.pi * 1350 * t) * _env_decay(m, 70) * 0.1
    return tap * 0.6


def thermal_scan(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # thermal: scanning sweep
    f = 700 + 900 * np.sin(2 * np.pi * 0.5 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.13
    return _seamless(x, fade_s=0.5) * 0.6


SFX38 = [
    ("naval/careening", careening, "careening the hull"),
    ("animal/beaver-tail", beaver_tail, "beaver tail slap"),
    ("weather/sirocco-wind", sirocco_wind, "sirocco wind"),
    ("horror/vampire-snaring", vampire_snaring, "vampire snarling"),
    ("tavern/dice-shaker", dice_shaker, "dice shaken"),
    ("farm/poult-chorus", poult_chorus, "poult chorus"),
    ("mine/winze-sinking", winze_sinking, "winze sinking"),
    ("forge/case-hardening", case_hardening, "case hardening"),
    ("kitchen/marchpane", marchpane, "marchpane worked"),
    ("stable/feed-bin", feed_bin, "feed bin filled"),
    ("ritual/penance", penance, "penitent prayers"),
    ("combat/culverin-fire", culverin_fire, "culverin fired"),
    ("foley/geta-clack", geta_clack, "geta clacking"),
    ("misc/sundial", sundial, "sundial gnomon"),
    ("modern/thermal-scan", thermal_scan, "thermal scanning"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX38:
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
    with open(os.path.join(OUT, "sfx38-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX38:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
