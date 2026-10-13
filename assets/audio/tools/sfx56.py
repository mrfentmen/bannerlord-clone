"""Procedural SFX batch 56 for the Bannerlord-clone (round 55).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx56.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx56")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx56-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(565656)


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
def flying_jib(dur=1.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # flying jib: outermost sail
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.24, 0.23):
        m = int(0.16 * SR)
        flap = highpass(lowpass(noise(m), 2500), 800) * _env_decay(m, 37) * 0.18
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += flap
    return out * 0.58


def sable(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # sable: soft chitter
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.06, 0.065):
        m = int(0.04 * SR)
        mt = np.arange(m) / SR
        f = 3500 + 840 * np.sin(2 * np.pi * 20 * mt)
        chit = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.12 * np.sin(np.pi * mt / 0.04)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += chit
    return out * 0.51


# ---------------------------------------------------------------- weather / horror
def etu(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # etu: pacific storm
    x = highpass(lowpass(noise(n), 2700), 470) * 0.46
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 0.19 * t)
    return _seamless(x, fade_s=0.6) * 0.64


def puca(dur=2.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # puca: shapeshifter
    out = np.zeros(n)
    for f in (200, 300, 400):
        fmod = f + 90 * np.sin(2 * np.pi * 0.55 * t)
        voice = np.sin(np.cumsum(2 * np.pi * fmod / SR)) * 0.1
        voice *= np.sin(np.pi * np.minimum(t / dur, 1.0))
        out += voice
    return out * 0.6


# ---------------------------------------------------------------- tavern / farm
def cribbage2(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # cribbage: second game
    out = np.zeros(n)
    # shuffle
    sm = int(0.4 * SR)
    shuffle = highpass(lowpass(noise(sm), 4200), 1600) * 0.18 * np.sin(np.pi * np.arange(sm) / sm)
    out[:sm] += shuffle
    # pegs
    for b in _rng.uniform(0.5, 1.1, 4):
        m = int(0.07 * SR)
        peg = np.sin(2 * np.pi * 2300 * np.arange(m) / SR) * _env_decay(m, 66) * 0.12
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peg
    return out * 0.57


def poult_peeps7(dur=0.9):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # poults: seventh variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.042, 0.028):
        m = int(0.022 * SR)
        mt = np.arange(m) / SR
        f = 4500 + 680 * np.sin(2 * np.pi * 23 * mt)
        peep = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.1 * np.sin(np.pi * mt / 0.022)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += peep
    return out * 0.49


# ---------------------------------------------------------------- mine / forge
def coyoting(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # coyoting: small tunnel digging
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.4, 0.45):
        m = int(0.32 * SR)
        dig = lowpass(noise(m), 850) * 0.33 * np.sin(np.pi * np.arange(m) / m)
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += dig
    return out * 0.6


def ball_furnace(dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ball furnace: cement kiln
    x = lowpass(noise(n), 540) * 0.44
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.36 * t)
    return _seamless(x, fade_s=0.6) * 0.64


# ---------------------------------------------------------------- kitchen / stable
def sack_posset3():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # sack posset: third variant
    pour = lowpass(noise(m), 1500) * 0.23 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    return pour * 0.57


def hay_rake():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # hay rake: gathering
    rake = highpass(lowpass(noise(m), 3000), 1100) * 0.23 * np.sin(np.pi * np.minimum(t / 0.6, 1.0))
    rake *= 0.65 + 0.35 * np.sin(2 * np.pi * 4.5 * t)
    return rake * 0.58


# ---------------------------------------------------------------- ritual / combat
def vespers2(dur=1.6):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # vespers: second variant
    out = np.zeros(n)
    for f in (115, 173, 230):
        out += np.sin(2 * np.pi * f * t) * 0.06
    out *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    return out * 0.59


def mortar_blast(dur=1.1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # mortar: high-angle blast
    out = np.zeros(n)
    # thump
    tm = int(0.18 * SR)
    thump = lowpass(noise(tm), 950) * _env_decay(tm, 50) * 0.5
    out[:tm] += thump
    # whistle
    wm = int(0.5 * SR)
    f = 1800 - 1200 * np.arange(wm) / wm
    whistle = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.08 * np.sin(np.pi * np.arange(wm) / wm)
    s = int(0.15 * SR)
    if s + wm < n:
        out[s:s + wm] += whistle
    return out * 0.66


# ---------------------------------------------------------------- foley / misc
def pattens_step5(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # pattens: fifth variant
    out = np.zeros(n)
    for b in np.arange(0.05, dur - 0.13, 0.29):
        m = int(0.09 * SR)
        step = lowpass(highpass(noise(m), 520), 2300) * _env_decay(m, 72) * 0.24
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += step
    return out * 0.57


def backstaff3():
    m = int(0.6 * SR)
    t = np.arange(m) / SR
    # backstaff: third variant
    bs = np.sin(2 * np.pi * 2150 * t) * _env_decay(m, 60) * 0.12
    bs += np.sin(2 * np.pi * 3225 * t) * _env_decay(m, 73) * 0.06
    return bs * 0.55


def elint_sweep(dur=2.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # ELINT: signal sweep
    f = 1700 + 900 * np.sin(2 * np.pi * 0.4 * t)
    x = np.sin(np.cumsum(2 * np.pi * f / SR)) * 0.1
    x *= 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 1.5 * t))
    return _seamless(x, fade_s=0.4) * 0.55


SFX56 = [
    ("naval/flying-jib", flying_jib, "flying jib"),
    ("animal/sable", sable, "sable chitter"),
    ("weather/etu", etu, "etu storm"),
    ("horror/puca", puca, "puca spirit"),
    ("tavern/cribbage2", cribbage2, "cribbage game"),
    ("farm/poult-peeps7", poult_peeps7, "poult peeps"),
    ("mine/coyoting", coyoting, "coyoting dig"),
    ("forge/ball-furnace", ball_furnace, "ball furnace"),
    ("kitchen/sack-posset3", sack_posset3, "sack posset"),
    ("stable/hay-rake", hay_rake, "hay rake"),
    ("ritual/vespers2", vespers2, "vespers prayer"),
    ("combat/mortar-blast", mortar_blast, "mortar blast"),
    ("foley/pattens-step5", pattens_step5, "pattens stepping"),
    ("misc/backstaff3", backstaff3, "backstaff sight"),
    ("modern/elint-sweep", elint_sweep, "ELINT sweep"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX56:
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
    with open(os.path.join(OUT, "sfx56-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX56:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
