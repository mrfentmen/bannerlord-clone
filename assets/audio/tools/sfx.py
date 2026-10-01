"""Procedural SFX pipeline for the Bannerlord-clone.
Covers ART_AND_AUDIO.md 8.3: weapons by class/tier, vehicle engines by
class/load, UI, footsteps, ambience beds, radio cues.
All synthesized with numpy DSP - no samples. Run: python3 sfx.py"""
import os
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav, adsr

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx")
os.makedirs(OUT, exist_ok=True)
_rng = np.random.default_rng(4242)


def _env_decay(n, rate):
    t = np.arange(n) / SR
    return np.exp(-t * rate)


def gunshot(kind="rifle"):
    """Noise crack + low thump. kind: pistol/rifle/shotgun/smg."""
    cfg = {
        "pistol":  dict(dur=0.35, crack_hp=2500, crack_decay=60, thump_f=120, thump_decay=25, vel=0.9),
        "rifle":   dict(dur=0.55, crack_hp=1800, crack_decay=35, thump_f=95,  thump_decay=16, vel=1.0),
        "shotgun": dict(dur=0.70, crack_hp=1200, crack_decay=22, thump_f=70,  thump_decay=11, vel=1.0),
        "smg":     dict(dur=0.30, crack_hp=2800, crack_decay=70, thump_f=130, thump_decay=30, vel=0.85),
    }[kind]
    n = int(cfg["dur"] * SR)
    t = np.arange(n) / SR
    crack = highpass(noise(n), cfg["crack_hp"]) * _env_decay(n, cfg["crack_decay"])
    f = cfg["thump_f"] * 0.5 + cfg["thump_f"] * np.exp(-t * 30)
    ph = np.cumsum(2 * np.pi * f / SR)
    thump = np.sin(ph) * _env_decay(n, cfg["thump_decay"])
    body = lowpass(noise(n), 900) * _env_decay(n, cfg["crack_decay"] * 0.5) * 0.5
    return (crack * 0.8 + thump * 0.9 + body) * cfg["vel"] * 0.7


def smg_burst(n_rounds=3, gap=0.11):
    burst = gunshot("smg")
    total = int((gap * (n_rounds - 1) + 0.35) * SR)
    out = np.zeros(total)
    for i in range(n_rounds):
        s = int(i * gap * SR)
        out[s:s + len(burst)] += burst * (0.95 ** i)
    return out


def explosion(big=True):
    dur = 2.8 if big else 1.4
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 28 + 55 * np.exp(-t * 6)
    ph = np.cumsum(2 * np.pi * f / SR)
    sub = np.sin(ph) * _env_decay(n, 3.2)
    boom = lowpass(noise(n), 500) * _env_decay(n, 4.5)
    debris = highpass(noise(n), 3000) * _env_decay(n, 14) * 0.4
    return (sub + boom * 0.8 + debris) * 0.75


def reload():
    """Mag out, mag in, charge - three timed clicks."""
    seq = [(0.00, 900, 0.5), (0.28, 700, 0.7), (0.62, 1400, 0.9)]
    out = np.zeros(int(1.0 * SR))
    for off, cf, v in seq:
        m = int(0.09 * SR)
        click = lowpass(noise(m), cf) * _env_decay(m, 90) + \
            np.sin(2 * np.pi * cf * np.arange(m) / SR) * _env_decay(m, 120) * 0.5
        s = int(off * SR)
        out[s:s + m] += click * v * 0.8
    return out


def dry_fire():
    m = int(0.07 * SR)
    return lowpass(noise(m), 2500) * _env_decay(m, 110) * 0.6


def engine_loop(base_f=55.0, dur=2.0, load=0.5):
    """Seamless loopable engine. load 0..1 adds noise/harshness."""
    cycles = max(int(base_f * dur), 1)
    dur = cycles / base_f
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for k, a in enumerate((1.0, 0.5, 0.3, 0.18, 0.1), start=1):
        x += a * np.sin(2 * np.pi * base_f * k * t + 0.3 * k)
    x += lowpass(noise(n), 400 + 1200 * load) * (0.12 + 0.35 * load)
    x *= 1 + 0.18 * np.sin(2 * np.pi * (base_f / 2) * t)  # firing wobble
    # seamless crossfade: tail blends into a head shifted so y[-1] == y[0]
    M = int(0.12 * SR)
    fade = np.linspace(0, 1, M)
    head = np.empty(M)
    head[:-1] = x[1:M]
    head[-1] = x[0]
    x[-M:] = x[-M:] * (1 - fade) + head * fade
    return (x / (np.max(np.abs(x)) + 1e-9) * 0.8).astype(np.float64)


def ui(kind="click"):
    if kind == "click":
        m = int(0.06 * SR)
        t = np.arange(m) / SR
        return (np.sin(2 * np.pi * 2200 * t) * _env_decay(m, 120) * 0.5 +
                highpass(noise(m), 5000) * _env_decay(m, 200) * 0.25)
    if kind == "hover":
        m = int(0.04 * SR)
        t = np.arange(m) / SR
        return np.sin(2 * np.pi * 3200 * t) * _env_decay(m, 150) * 0.25
    if kind == "confirm":
        out = np.zeros(int(0.25 * SR))
        for i, f in enumerate((880, 1320)):
            m = int(0.09 * SR)
            t = np.arange(m) / SR
            s = int(i * 0.09 * SR)
            out[s:s + m] += np.sin(2 * np.pi * f * t) * _env_decay(m, 60) * 0.5
        return out
    if kind == "error":
        m = int(0.22 * SR)
        t = np.arange(m) / SR
        sq = np.sign(np.sin(2 * np.pi * 160 * t))
        return lowpass(sq, 900) * 0.4 * np.minimum(t / 0.01, 1.0)
    if kind == "toggle":
        out = np.zeros(int(0.12 * SR))
        m = int(0.05 * SR)
        t = np.arange(m) / SR
        out[:m] += np.sin(2 * np.pi * 1500 * t) * _env_decay(m, 140) * 0.4
        out[m:2 * m] += np.sin(2 * np.pi * 2000 * t) * _env_decay(m, 140) * 0.4
        return out
    raise ValueError(kind)


def footstep(surface="dirt"):
    cfg = {"concrete": (1400, 0.7, 70), "dirt": (550, 0.55, 45),
           "grass": (320, 0.4, 30)}[surface]
    cf, vel, decay = cfg
    m = int(0.11 * SR)
    t = np.arange(m) / SR
    thud = lowpass(noise(m), cf) * _env_decay(m, decay)
    tap = np.sin(2 * np.pi * 180 * t) * _env_decay(m, 90) * 0.4
    return (thud + tap) * vel


def _seamless(x, fade_s=0.5):
    """Crossfade the tail into the head so the loop point is continuous:
    y[-1] == y[0] exactly. The head is shifted by one sample under the
    fade (inaudible) so the final sample lands on x[0]."""
    M = int(fade_s * SR)
    fade = np.linspace(0, 1, M)
    y = x.copy()
    head = np.empty(M)
    head[:-1] = x[1:M]
    head[-1] = x[0]
    y[-M:] = y[-M:] * (1 - fade) + head * fade
    return y


def ambience(kind="town-day", dur=10.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    if kind == "wind":
        swell = 0.5 + 0.5 * np.sin(2 * np.pi * 0.09 * t)
        return _seamless(lowpass(noise(n), 500) * swell * 0.5)
    if kind == "rain":
        return _seamless(highpass(lowpass(noise(n), 6000), 1500) * 0.30)
    if kind == "town-day":
        base = lowpass(noise(n), 800) * 0.25
        murmur = lowpass(noise(n), 400) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.13 * t)) * 0.18
        # sparse bird chirps
        for b in _rng.uniform(0, dur, 7):
            m = int(0.18 * SR)
            bt = np.arange(m) / SR
            f = 2800 + 1200 * np.sin(2 * np.pi * 22 * bt)
            chirp = np.sin(np.cumsum(2 * np.pi * f / SR)) * _env_decay(m, 25) * 0.12
            s = int(b * SR)
            if s + m < n:
                base[s:s + m] += chirp
        return _seamless(base + murmur)
    if kind == "town-night":
        base = lowpass(noise(n), 300) * 0.15
        # crickets: 4.2kHz tone, AM gated
        gate = (np.sin(2 * np.pi * 18 * t) > 0.2).astype(float)
        gate = lowpass(gate, 60)
        crickets = np.sin(2 * np.pi * 4200 * t) * gate * 0.06
        return _seamless(base + crickets)
    if kind == "distant-battle":
        base = lowpass(noise(n), 150) * 0.35
        for b in _rng.uniform(0, dur, 5):
            th = int(0.8 * SR)
            tt = np.arange(th) / SR
            f = 30 + 40 * np.exp(-tt * 8)
            ph = np.cumsum(2 * np.pi * f / SR)
            boom = np.sin(ph) * np.exp(-tt * 5) * 0.5
            s = int(b * SR)
            if s + th < n:
                base[s:s + th] += boom
        return _seamless(base)
    raise ValueError(kind)


def radio(kind="squelch"):
    if kind == "squelch":
        m = int(0.25 * SR)
        x = highpass(noise(m), 1200)
        return x * _env_decay(m, 18) * 0.5
    if kind == "blip":
        m = int(0.12 * SR)
        t = np.arange(m) / SR
        return np.sin(2 * np.pi * 1000 * t) * _env_decay(m, 40) * 0.4
    if kind == "static":
        return highpass(noise(int(0.5 * SR)), 2000) * 0.18
    raise ValueError(kind)


SFX = [
    # weapons
    ("weapon/pistol", lambda: gunshot("pistol"), "9mm pistol shot"),
    ("weapon/rifle", lambda: gunshot("rifle"), "assault rifle shot"),
    ("weapon/shotgun", lambda: gunshot("shotgun"), "shotgun blast"),
    ("weapon/smg-burst", lambda: smg_burst(), "3-round SMG burst"),
    ("weapon/explosion", lambda: explosion(True), "large explosion"),
    ("weapon/explosion-small", lambda: explosion(False), "small explosion / grenade"),
    ("weapon/reload", reload, "magazine reload sequence"),
    ("weapon/dry-fire", dry_fire, "empty trigger click"),
    # engines (loopable)
    ("vehicle/engine-idle", lambda: engine_loop(42, 2.0, 0.25), "engine idle loop"),
    ("vehicle/engine-cruise", lambda: engine_loop(68, 2.0, 0.55), "engine cruise loop"),
    ("vehicle/engine-load", lambda: engine_loop(105, 2.0, 0.9), "engine under load loop"),
    # ui
    ("ui/click", lambda: ui("click"), "UI click"),
    ("ui/hover", lambda: ui("hover"), "UI hover tick"),
    ("ui/confirm", lambda: ui("confirm"), "UI confirm chime"),
    ("ui/error", lambda: ui("error"), "UI error buzz"),
    ("ui/toggle", lambda: ui("toggle"), "UI toggle"),
    # footsteps
    ("foley/footstep-concrete", lambda: footstep("concrete"), "footstep on concrete"),
    ("foley/footstep-dirt", lambda: footstep("dirt"), "footstep on dirt"),
    ("foley/footstep-grass", lambda: footstep("grass"), "footstep on grass"),
    # ambience beds (loopable)
    ("ambience/town-day", lambda: ambience("town-day"), "town daytime bed, loopable"),
    ("ambience/town-night", lambda: ambience("town-night"), "town nighttime bed with crickets, loopable"),
    ("ambience/rain", lambda: ambience("rain"), "rain bed, loopable"),
    ("ambience/wind", lambda: ambience("wind"), "wind bed, loopable"),
    ("ambience/distant-battle", lambda: ambience("distant-battle"), "distant battle rumble, loopable"),
    # radio
    ("radio/squelch", lambda: radio("squelch"), "radio squelch"),
    ("radio/blip", lambda: radio("blip"), "radio blip"),
    ("radio/static", lambda: radio("static"), "radio static burst"),
]

META = {name: desc for name, _, desc in SFX}


def main():
    import json
    manifest = []
    for name, fn, desc in SFX:
        x = fn()
        assert np.all(np.isfinite(x)), name
        x = limiter(x, ceiling=0.89)
        path = os.path.join(OUT, name + ".wav")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        write_wav(path, x)
        peak = float(np.max(np.abs(x)))
        print(f"{name:32s} {len(x)/SR:5.1f}s peak={peak:.2f}")
        manifest.append({"name": name, "description": desc,
                         "duration_s": round(len(x) / SR, 2), "peak": round(peak, 3)})
    with open(os.path.join(OUT, "sfx-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"{len(manifest)} sfx rendered -> {OUT}")


if __name__ == "__main__":
    main()
