"""Procedural SFX batch 20 for the Bannerlord-clone (round 19).

Naval, animals, weather, horror, tavern, farm, mine, forge, kitchen, stable, ritual, combat, foley, misc.
All numpy DSP - no samples. Run: python3 sfx20.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx20")
MP3 = os.path.join(os.path.dirname(__file__), "out", "sfx20-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(202020)


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
def gangplank_thud():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # gangplank dropped: wood crash + bounce
    crash = lowpass(noise(m), 1500) * _env_decay(m, 40) * 0.7
    crash += np.sin(2 * np.pi * 180 * t) * _env_decay(m, 50) * 0.3
    return crash * 0.75


def antelope_snort():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # sharp alert snort
    x = lowpass(noise(m), 1200) * 0.5 * np.minimum(t / 0.03, 1.0) * _env_decay(m, 22)
    return x * 0.7


# ---------------------------------------------------------------- weather / horror
def lightning_crack():
    m = int(1.2 * SR)
    t = np.arange(m) / SR
    # close lightning: violent crack + rolling thunder
    crack = highpass(noise(int(0.15 * SR)), 800) * 0.9
    out = np.zeros(m)
    out[:len(crack)] += crack * _env_decay(len(crack), 55)
    # thunder roll
    rm = int(1.0 * SR)
    roll = lowpass(noise(rm), 250) * 0.6 * np.sin(np.pi * np.arange(rm) / rm)
    s = int(0.15 * SR)
    out[s:s + rm] += roll
    return out * 0.85


def attic_stairs_creak(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # old attic stairs: slow creaks
    out = np.zeros(n)
    for b in np.arange(0.2, dur - 0.3, 0.5):
        m = int(0.3 * SR)
        bt = np.arange(m) / SR
        f = 110 + 50 * np.sin(2 * np.pi * 1.2 * bt)
        creak = np.sin(np.cumsum(2 * np.pi * f / SR)) * (0.35 + 0.25 * np.sin(2 * np.pi * 2.5 * bt)) * 0.4
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += creak
    return out * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


# ---------------------------------------------------------------- tavern / farm
def barrel_tap():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # barrel tapped: wooden knock + slosh
    knock = lowpass(noise(int(0.08 * SR)), 1200) * 0.5
    out = np.zeros(m)
    out[:len(knock)] += knock * _env_decay(len(knock), 65)
    # ale slosh
    sm = int(0.25 * SR)
    slosh = lowpass(noise(sm), 1000) * 0.3 * np.sin(np.pi * np.arange(sm) / sm)
    s = int(0.1 * SR)
    out[s:s + sm] += slosh
    return out * 0.7


def hay_bale_thump():
    m = int(0.4 * SR)
    t = np.arange(m) / SR
    # hay bale dropped: soft heavy thump + rustle
    thump = lowpass(noise(m), 600) * _env_decay(m, 45) * 0.6
    rustle = highpass(lowpass(noise(m), 4000), 1500) * _env_decay(m, 55) * 0.25
    return (thump + rustle) * 0.7


# ---------------------------------------------------------------- mine / forge
def gold_pan_swish(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # gold panning: water swish + gravel
    out = np.zeros(n)
    for b in np.arange(0.1, dur - 0.3, 0.4):
        m = int(0.3 * SR)
        swish = lowpass(noise(m), 1500) * 0.35 * np.sin(np.pi * np.arange(m) / m)
        # gravel rattle
        for g in _rng.uniform(0.05, 0.2, 4):
            gm = int(0.03 * SR)
            gravel = highpass(noise(gm), 3000) * _env_decay(gm, 120) * 0.15
            gs = int(g * SR)
            if gs + gm < m:
                swish[gs:gs + gm] += gravel
        s = int(b * SR)
        if s + m < n:
            out[s:s + m] += swish
    return out * 0.7


def wire_draw(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # wire drawn through die: metallic scrape
    x = highpass(lowpass(noise(n), 6000), 2500) * 0.3
    x *= np.sin(np.pi * np.minimum(t / dur, 1.0))
    # tension ping at end
    pm = int(0.15 * SR)
    ping = np.sin(2 * np.pi * 3200 * np.arange(pm) / SR) * _env_decay(pm, 70) * 0.25
    s = int(0.85 * SR)
    x[s:s + pm] += ping
    return x * 0.65


# ---------------------------------------------------------------- kitchen / stable
def mortar_pestle_grind(dur=1.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # grinding spices: rhythmic stone grind
    x = lowpass(highpass(noise(n), 800), 3000) * 0.35
    x *= 0.5 + 0.5 * np.sin(2 * np.pi * 1.5 * t)
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.7


def saddle_blanket_shake(dur=0.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # blanket shaken out: heavy fabric flaps
    x = lowpass(noise(n), 1100) * 0.4
    x *= 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 3 * t))
    return x * np.sin(np.pi * np.minimum(t / dur, 1.0)) * 0.65


# ---------------------------------------------------------------- ritual / combat
def offering_bowl_clink():
    m = int(0.5 * SR)
    t = np.arange(m) / SR
    # coins dropped in offering bowl: metallic cascade
    out = np.zeros(m)
    for b in _rng.uniform(0.05, 0.35, 6):
        cm = int(0.1 * SR)
        ct = np.arange(cm) / SR
        clink = np.sin(2 * np.pi * _rng.uniform(2400, 3600) * ct) * _env_decay(cm, 80) * _rng.uniform(0.2, 0.35)
        s = int(b * SR)
        if s + cm < m:
            out[s:s + cm] += clink
    return out * 0.65


def spear_butt_stamp():
    out = np.zeros(int(0.6 * SR))
    # rhythmic spear-butt ground stamps (drill)
    for i, off in enumerate((0.0, 0.3)):
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        stamp = lowpass(noise(m), 800) * _env_decay(m, 55) * 0.55
        stamp += np.sin(2 * np.pi * 150 * t) * _env_decay(m, 65) * 0.25
        s = int(off * SR)
        out[s:s + m] += stamp * (1.0 - i * 0.15)
    return out * 0.75


# ---------------------------------------------------------------- foley / misc
def tent_peg_hammer():
    out = np.zeros(int(1.0 * SR))
    # tent pegs hammered: wood-on-wood
    for i, off in enumerate((0.0, 0.3, 0.6)):
        m = int(0.1 * SR)
        t = np.arange(m) / SR
        hit = lowpass(noise(m), 1800) * _env_decay(m, 70) * 0.5
        hit += np.sin(2 * np.pi * 500 * t) * _env_decay(m, 80) * 0.25
        s = int(off * SR)
        out[s:s + m] += hit * (1.0 - i * 0.12)
    return out * 0.7


def beehive_hum(dur=3.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # beehive: dense bee hum
    x = np.zeros(n)
    for _ in range(20):
        f = _rng.uniform(180, 260)
        x += np.sin(np.cumsum(np.full(n, 2 * np.pi * f / SR))) * _rng.uniform(0.02, 0.05)
    x *= 0.8 + 0.2 * np.sin(2 * np.pi * 0.7 * t)
    return _seamless(x * 0.7, fade_s=0.7) * 0.65


def fishing_net_splash(dur=1.2):
    n = int(dur * SR)
    t = np.arange(n) / SR
    # fishing net hauled: water + rope
    splash = highpass(lowpass(noise(n), 4000), 1000) * 0.4 * np.sin(np.pi * np.minimum(t / dur, 1.0))
    rope = lowpass(noise(n), 900) * 0.2
    return (splash + rope) * 0.7


SFX20 = [
    ("naval/gangplank-thud", gangplank_thud, "gangplank dropped"),
    ("animal/antelope-snort", antelope_snort, "antelope alert snort"),
    ("weather/lightning-crack", lightning_crack, "close lightning strike"),
    ("horror/attic-stairs-creak", attic_stairs_creak, "attic stairs creaking"),
    ("tavern/barrel-tap", barrel_tap, "barrel tapped"),
    ("farm/hay-bale-thump", hay_bale_thump, "hay bale dropped"),
    ("mine/gold-pan-swish", gold_pan_swish, "gold panning"),
    ("forge/wire-draw", wire_draw, "wire drawn"),
    ("kitchen/mortar-pestle-grind", mortar_pestle_grind, "grinding spices"),
    ("stable/saddle-blanket-shake", saddle_blanket_shake, "blanket shaken"),
    ("ritual/offering-bowl-clink", offering_bowl_clink, "coins in offering bowl"),
    ("combat/spear-butt-stamp", spear_butt_stamp, "spear-butt drill stamps"),
    ("foley/tent-peg-hammer", tent_peg_hammer, "tent pegs hammered"),
    ("misc/beehive-hum", beehive_hum, "beehive humming"),
    ("misc/fishing-net-splash", fishing_net_splash, "fishing net hauled"),
]


def main():
    import json
    manifest = []
    for name, fn, desc in SFX20:
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
    with open(os.path.join(OUT, "sfx20-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    for name, _, _ in SFX20:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"{len(manifest)} sfx rendered + encoded")


if __name__ == "__main__":
    main()
