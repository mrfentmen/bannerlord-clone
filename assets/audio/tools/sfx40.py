"""Procedural SFX batch 40 for the Bannerlord-clone (round 39).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx40.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx40")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx40-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(404040)


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
def binnacle_stand():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # binnacle: compass housing tap
    tap = np.sin(2 * np.pi * 1100 * t) * _env_decay(m, 58) * 0.2
    tap += np.sin(2 * np.pi * 1650 * t) * _env_decay(m, 72) * 0.1
    return tap * 0.6


def porcupine(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # porcupine: quill rattle
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.12, 0.16):
        m = int(0.1 * SR)
        rattle = highpass(noise(m), 3800) * _env_decay(m, 85) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += rattle
    return out * 0.58


# ---------------------------------------------------------------- weather / horror
def levanter(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # levanter: easterly mediterranean wind
    x = highpass(lowpass(noise(n), 4400), 640) * 0.36
    x *= 0.62 + 0.38 * np.sin(2 * np.pi * 0.37 * t)
    return _seamless(x, fade_s=0.6) * 0.66


def banshee_wail(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # banshee: mournful wail
    f = 700 - 300 * np.sin(2 * np.pi * 0.4 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.22
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 1.5 * t)
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return x * 0.66


# ---------------------------------------------------------------- tavern / farm
def ale_stake():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # ale-stake: tavern sign hung
    out = np.zeros(m)
    # wood knock
    km = int(0.15 * SR)
    knock = lowpass(highpass(noise(km), 600), 2800) * _env_decay(km, 65) * 0.3
    out[:km] += knock
    # creak
    cm = int(0.3 * SR)
    creak = np.sin(2 * np.pi * 170 * np.arange(cm) / SR) * _env_decay(cm, 32) * 0.2
    s = int(0.2 * SR)
    out[s:s + cm] += creak
    return out * 0.62


def chick_peeps(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # chicks: bright peeps
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.07, 0.09):
        m = int(0.05 * SR)
        mt = np.arange(m) / SR
        f = 3300 + 700 * np.sin(2 * np.pi * 10 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.15 * np.sin(np.pi * mt / 0.05)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.55


# ---------------------------------------------------------------- mine / forge
def level_timber():
    m = int(0.8 * SR)
    t = np.arange(m) / SR
    # level timber: horizontal drift
    out = np.zeros(m)
    for b in np.arange(0.05, 0.65, 0.21):
        sm = int(0.19 * SR)
        creak = np.sin(2 * np.pi * 155 * np.arange(sm) / SR) * _env_decay(sm, 29) * 0.24
        s = int(b * SR)
        if s + sm < m:
            out[s:s + sm] += creak
    return out * 0.65


def blast_furnace(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # blast furnace: roaring heat
    x = lowpass(noise(n), 700) * 0.42
    x *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.5 * t)
    return _seamless(x, fade_s=0.7) * 0.68


# ---------------------------------------------------------------- kitchen / stable
def caudle_pot(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # caudle: spiced wine simmer
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.13, 0.16):
        m = int(0.1 * SR)
        bubble = lowpass(noise(m), 1000) * _env_decay(m, 70) * 0.2
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bubble
    return out * 0.6


def tack_room():
    m = int(0.7 * SR)
    t = np.arange(m) / SR
    # tack room: leather + metal
    out = np.zeros(m)
    # leather rustle
    rm = int(0.3 * SR)
    rustle = highpass(lowpass(noise(rm), 3500), 900) * 0.24 * np.sin(np.pi * np.arange(rm) / rm)
    out[:rm] += rustle
    # bit jingle
    jm = int(0.2 * SR)
    jingle = highpass(noise(jm), 4800) * _env_decay(jm, 78) * 0.18
    s = int(0.4 * SR)
    out[s:s + jm] += jingle
    return out * 0.6


# ---------------------------------------------------------------- ritual / combat
def last_rites(dur=2.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # last rites: solemn chant
    out = np.zeros(n)
    for f in (87, 130.5, 174):
        out += np.sin(2 * np.pi * f * t) * 0.08
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # bell toll
    for b in (0.6, 1.5):
        m = int(0.4 * SR)
        bell = np.sin(2 * np.pi * 520 * np.arange(m) / SR) * _env_decay(m, 30) * 0.16
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += bell
    return out * 0.68


def mortar_fire(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mortar: high-angle fire
    out = np.zeros(n)
    # thump
    tm = int(0.2 * SR)
    thump = lowpass(noise(tm), 900) * _env_decay(tm, 52) * 0.52
    out[:tm] += thump
    # shell whistle
    wm = int(0.7 * SR)
    f = 1800 - 1200 * (np.arange(wm) / wm)
    whistle = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.18 * np.exp(-np.arange(wm) / SR * 2)
    s = int(0.18 * SR)
    out[s:s + wm] += whistle
    return out * 0.7


# ---------------------------------------------------------------- foley / misc
def pattens_step(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: raised wooden soles
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.17, 0.34):
        m = int(0.13 * SR)
        step = lowpass(highpass(noise(m), 700), 3600) * _env_decay(m, 68) * 0.29
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.62


def brass_quadrant():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # quadrant: brass angle measure
    out = np.zeros(m)
    for i, off in enumerate((0.08, 0.3)):
        sm = int(0.15 * SR)
        click = np.sin(2 * np.pi * 1900 * np.arange(sm) / SR) * _env_decay(sm, 72) * (0.19 - i * 0.02)
        s = int(off * SR)
        out[s:s + sm] += click
    return out * 0.6


def drone_recon(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # recon drone: quiet hover
    f = 240 + 40 * np.sin(2 * np.pi * 0.8 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.16
    x += np.sin(np.cumsum(2 * np.pi * f * 2 / SR)) * 0.06
    return _seamless(x, fade_s=0.5) * 0.62


SFX40 = [
    ("naval/binnacle-stand", binnacle_stand, "binnacle compass"),
    ("animal/porcupine", porcupine, "porcupine quills"),
    ("weather/levanter", levanter, "levanter wind"),
    ("horror/banshee-wail", banshee_wail, "banshee wailing"),
    ("tavern/ale-stake", ale_stake, "ale-stake hung"),
    ("farm/chick-peeps", chick_peeps, "chick peeps"),
    ("mine/level-timber", level_timber, "level timber"),
    ("forge/blast-furnace", blast_furnace, "blast furnace"),
    ("kitchen/caudle-pot", caudle_pot, "caudle simmering"),
    ("stable/tack-room", tack_room, "tack room"),
    ("ritual/last-rites", last_rites, "last rites"),
    ("combat/mortar-fire", mortar_fire, "mortar fired"),
    ("foley/pattens-step", pattens_step, "pattens stepping"),
    ("misc/brass-quadrant", brass_quadrant, "brass quadrant"),
    ("modern/drone-recon", drone_recon, "recon drone"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX40:
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
    with open(os.path.join(OUT, "sfx40-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX40:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
