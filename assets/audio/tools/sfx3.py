"""Batch 3 SFX: UI motion, battle extras, siren, city bed. Pure numpy DSP.
Run: python3 sfx3.py"""
import os
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav, adsr, midi_to_freq

OUT = os.path.join(os.path.dirname(__file__), "out", "sfx")
os.makedirs(OUT, exist_ok=True)
_rng = np.random.default_rng(2026)


def _env(n, rate):
    t = np.arange(n) / SR
    return np.exp(-t * rate)


def panel_open():
    """Soft airy whoosh rising."""
    dur = 0.35
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = lowpass(noise(n), 3000) * (t / dur) ** 1.5
    x += highpass(noise(n), 6000) * (t / dur) ** 2 * 0.4
    return x * 0.5


def panel_close():
    """Soft airy whoosh falling."""
    dur = 0.3
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = lowpass(noise(n), 3000) * (1 - t / dur) ** 1.5
    return x * 0.45


def ui_warning():
    """Alert: two-tone square-ish warning."""
    n_total = int(0.9 * SR)
    out = np.zeros(n_total)
    for i, m in enumerate([81, 78, 81]):
        f = midi_to_freq(m)
        nn = int(0.22 * SR)
        t = np.arange(nn) / SR
        tone = (np.sign(np.sin(2 * np.pi * f * t)) * 0.35 +
                np.sin(2 * np.pi * f * t) * 0.5)
        tone *= adsr(nn, 0.01, 0.03, 0.8, 0.12)
        s = int(i * 0.26 * SR)
        out[s:s + nn] += tone * 0.5
    return out


def arrow_volley():
    """A dozen arrows: staggered airy whooshes."""
    n_total = int(1.8 * SR)
    out = np.zeros(n_total)
    for _ in range(12):
        dur = _rng.uniform(0.25, 0.45)
        nn = int(dur * SR)
        t = np.arange(nn) / SR
        w = noise(nn)
        w = lowpass(w, _rng.uniform(2500, 5000)) - lowpass(w, 500)
        w *= np.sin(np.pi * t / dur) ** 2
        s = int(_rng.uniform(0, 1.1) * SR)
        out[s:s + nn] += w * _rng.uniform(0.15, 0.35)
    return out


def distant_gunfire():
    """Muffled distant pops, like a far firefight."""
    n_total = int(4.0 * SR)
    out = np.zeros(n_total)
    for _ in range(14):
        nn = int(0.18 * SR)
        t = np.arange(nn) / SR
        pop = lowpass(noise(nn), 700) * _env(nn, 40.0)
        s = int(_rng.uniform(0, 3.6) * SR)
        out[s:s + nn] += pop * _rng.uniform(0.2, 0.5)
    return out


def siren(dur=4.0):
    """Emergency siren with slow doppler-ish sweep, loopable."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    # classic wail: 600 -> 1400 Hz triangle sweep, 4s period
    f = 1000 + 400 * np.sin(2 * np.pi * t / dur)
    ph = np.cumsum(2 * np.pi * f / SR)
    x = (np.sin(ph) * 0.6 + np.sin(2 * ph) * 0.2)
    x *= 0.55
    # seamless loop
    m = int(0.3 * SR)
    fade = np.linspace(0, 1, m)
    x[:m] = x[:m] * fade + x[-m:] * (1 - fade)
    return x[:n - m]


def knife_slash():
    """Sharp close swish with a metallic edge."""
    dur = 0.35
    n = int(dur * SR)
    t = np.arange(n) / SR
    w = noise(n)
    w = highpass(w, 3500) - highpass(w, 9000) * 0.5
    w *= np.sin(np.pi * np.minimum(t / dur, 1.0)) ** 3
    edge = np.sin(2 * np.pi * 5200 * t) * _env(n, 60.0) * 0.15
    return (w * 0.6 + edge) * 0.8


def city_day(dur=6.0):
    """Urban bed: traffic wash + distant horns, loopable."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    wash = lowpass(noise(n), 900) * 0.5
    wash *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.4 * t + 0.5)
    # distant car horns
    horns = np.zeros(n)
    for _ in range(3):
        f = _rng.choice([370, 415, 466])
        nn = int(0.5 * SR)
        tt = np.arange(nn) / SR
        h = (np.sin(2 * np.pi * f * tt) + np.sin(2 * np.pi * f * 1.25 * tt) * 0.4)
        h *= adsr(nn, 0.05, 0.1, 0.7, 0.25)
        s = int(_rng.uniform(0.5, dur - 1.0) * SR)
        horns[s:s + nn] += h * 0.06
    x = (wash * 0.35 + horns) * 0.8
    m = int(0.5 * SR)
    fade = np.linspace(0, 1, m)
    x[:m] = x[:m] * fade + x[-m:] * (1 - fade)
    return x[:n - m]


SFX3 = [
    ("ui/panel-open", panel_open, "panel open whoosh"),
    ("ui/panel-close", panel_close, "panel close whoosh"),
    ("ui/warning", ui_warning, "warning alert"),
    ("battle/arrow-volley", arrow_volley, "arrow volley whooshes"),
    ("battle/distant-gunfire", distant_gunfire, "distant firefight"),
    ("vehicle/siren", siren, "emergency siren, loopable"),
    ("weapon/knife-slash", knife_slash, "knife slash"),
    ("ambience/city-day", city_day, "city daytime bed, loopable"),
]


def main():
    import json
    mpath = os.path.join(OUT, "sfx-manifest.json")
    manifest = []
    if os.path.exists(mpath):
        with open(mpath) as f:
            manifest = json.load(f)
    existing = {m["name"] for m in manifest}
    for name, fn, desc in SFX3:
        if name in existing:
            print(f"{name:32s} already in manifest, skipping")
            continue
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
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"{len(manifest)} total sfx in manifest -> {mpath}")


if __name__ == "__main__":
    main()
