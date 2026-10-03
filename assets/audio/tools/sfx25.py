"""Procedural SFX batch 25 for the Bannerlord-clone (round 24).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx25.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx25")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx25-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(252525)


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
def sea_chest(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sea chest opened: wood + metal
    out = np.zeros(n)
    # lid creak
    m = int(0.3 * SR)
    creak = np.sin(2 * np.pi * 160 * np.arange(m) / SR) * _env_decay(m, 45) * 0.25
    out[:m] += creak
    # latch clank
    lm = int(0.1 * SR)
    clank = np.sin(2 * np.pi * 1400 * np.arange(lm) / SR) * _env_decay(lm, 80) * 0.25
    s = int(0.35 * SR)
    out[s:s + lm] += clank
    return out * 0.65


def badger_snuffle(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # badger snuffling: low grunts + sniffing
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.2, 0.25):
        m = int(0.18 * SR)
        snuffle = lowpass(noise(m), 800) * 0.35 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += snuffle
    return out * 0.65


# ---------------------------------------------------------------- weather / horror
def thundersnow(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # thundersnow: muffled thunder + snow hiss
    env = np.minimum(t / 0.3, 1.0) * np.exp(-np.maximum(t - 2.0, 0) * 2.5)
    thunder = lowpass(noise(n), 200) * 0.4 * env
    hiss = highpass(noise(n), 6000) * 0.1 * env
    return (thunder + hiss) * 0.7


def coffin_nails():
    out = np.zeros(int(1.0 * SR))
    # coffin being nailed shut: ominous hammering
    for i, off in enumerate((0.0, 0.3, 0.6)):
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        nail = lowpass(noise(m), 1500) * _env_decay(m, 65) * 0.5
        nail += np.sin(2 * np.pi * 400 * t) * _env_decay(m, 75) * 0.2
        s = int(off * SR)
        out[s:s + m] += nail * (1.0 - i * 0.1)
    return out * 0.7


# ---------------------------------------------------------------- tavern / farm
def tavern_piano(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # honky-tonk piano: jaunty ragtime-ish
    out = np.zeros(n)
    # simple I-V-vi-IV in C
    chords = [(261.6, 329.6, 392.0), (196.0, 246.9, 293.7),
              (220.0, 261.6, 329.6), (196.0, 246.9, 293.7)]
    for i, chord in enumerate(chords):
        m = int(0.6 * SR)
        mt = np.arange(m) / SR
        for f in chord:
            out[i * m:i * m + m] += np.sin(2 * np.pi * f * mt) * _env_decay(m, 6) * 0.15
    return out * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


def egg_collect(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # eggs collected: gentle clinks in basket
    out = np.zeros(n)
    for b in _rng.uniform(0.05, 0.9, 8):
        m = int(0.06 * SR)
        clink = np.sin(2 * np.pi * _rng.uniform(2200, 2800) * np.arange(m) / SR) * _env_decay(m, 100) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += clink
    return out * 0.6


# ---------------------------------------------------------------- mine / forge
def gas_lamp(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # miner's lamp: soft hiss + flame
    x = highpass(noise(n), 4000) * 0.12
    x += np.sin(2 * np.pi * 100 * t) * 0.05
    return _seamless(x, fade_s=0.5) * 0.6


def slag_dump(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # slag dumped: hot debris cascade
    out = np.zeros(n)
    for b in _rng.uniform(0.05, 1.3, 12):
        m = int(_rng.uniform(0.08, 0.15) * SR)
        debris = lowpass(noise(m), 2000) * _env_decay(m, _rng.uniform(40, 60)) * _rng.uniform(0.2, 0.35)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += debris
    return out * 0.7


# ---------------------------------------------------------------- kitchen / stable
def flour_dust(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # flour sifted: soft powder fall
    x = highpass(lowpass(noise(n), 3000), 1200) * 0.25 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.6


def hoof_pick():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # hoof picked clean: scraping + tap
    scrape = highpass(lowpass(noise(m), 4000), 1500) * 0.3 * np.sin(np.pi * np.minimum(t / 0.4, 1.0))
    tap = lowpass(noise(int(0.08 * SR)), 1200) * _env_decay(int(0.08 * SR), 70) * 0.25
    out = scrape
    s = int(0.3 * SR)
    out[s:s + len(tap)] += tap
    return out * 0.65


# ---------------------------------------------------------------- ritual / combat
def funeral_pyre(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # funeral pyre: solemn fire + wind
    fire = lowpass(noise(n), 800) * 0.35 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    # low chant
    chant = np.sin(2 * np.pi * 110 * t) * 0.1 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    return (fire + chant) * 0.7


def sling_whirl(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sling whirled: rising whoosh
    x = lowpass(noise(n), 1000) * 0.4
    x *= np.minimum(t / dur, 1.0)  # builds up
    # release snap
    m = int(0.1 * SR)
    snap = highpass(noise(m), 3000) * _env_decay(m, 90) * 0.4
    s = int(1.1 * SR)
    x[s:s + m] += snap
    return x * 0.7


# ---------------------------------------------------------------- foley / misc
def rope_coil():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # rope coiled: heavy loops
    out = np.zeros(m)
    for b in np.arange(0.05, 0.55, 0.12):
        rm = int(0.1 * SR)
        loop = lowpass(noise(rm), 900) * _env_decay(rm, 65) * 0.3
        s = int(b * SR)
        if s + rm < m:
            out[s:s + rm] += loop
    return out * 0.65


def wax_seal():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # wax seal pressed: soft stamp
    stamp = lowpass(noise(m), 800) * _env_decay(m, 55) * 0.4
    return stamp * 0.6


def gps_lock():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # GPS acquiring: electronic beeps
    out = np.zeros(m)
    for i, (off, f) in enumerate([(0.05, 880), (0.25, 1100), (0.45, 1320)]):
        bm = int(0.12 * SR)
        beep = np.sin(2 * np.pi * f * np.arange(bm) / SR) * _env_decay(bm, 45) * 0.25
        s = int(off * SR)
        out[s:s + bm] += beep
    return out * 0.6


SFX25 = [
    ("naval/sea-chest", sea_chest, "sea chest opened"),
    ("animal/badger-snuffle", badger_snuffle, "badger snuffling"),
    ("weather/thundersnow", thundersnow, "thundersnow"),
    ("horror/coffin-nails", coffin_nails, "coffin nailed shut"),
    ("tavern/tavern-piano", tavern_piano, "tavern piano"),
    ("farm/egg-collect", egg_collect, "eggs collected"),
    ("mine/gas-lamp", gas_lamp, "miner's lamp"),
    ("forge/slag-dump", slag_dump, "slag dumped"),
    ("kitchen/flour-dust", flour_dust, "flour sifted"),
    ("stable/hoof-pick", hoof_pick, "hoof picked"),
    ("ritual/funeral-pyre", funeral_pyre, "funeral pyre"),
    ("combat/sling-whirl", sling_whirl, "sling whirled"),
    ("foley/rope-coil", rope_coil, "rope coiled"),
    ("misc/wax-seal", wax_seal, "wax seal pressed"),
    ("modern/gps-lock", gps_lock, "GPS acquiring"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX25:
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
    with open(os.path.join(OUT, "sfx25-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX25:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
