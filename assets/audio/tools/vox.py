"""Procedural human vocalizations for the Bannerlord-clone (AUDIO_GAP_LIST.md C).

Screams, battle cries, grunts, cheers, groans - all synthesized with formant
DSP (sawtooth glottal source + formant bandpass filters + vibrato + breath
noise). No samples, no TTS. M/F pitch variants x 3 variants each.

Run: python3 vox.py
"""
import os
import subprocess
import numpy as np
from synth import SR, noise, lowpass, highpass, limiter, write_wav
from scipy import signal as _sig

OUT = os.path.join(os.path.dirname(__file__), "out", "vox")
MP3 = os.path.join(os.path.dirname(__file__), "out", "vox-mp3")
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
_rng = np.random.default_rng(31337)


def _bandpass(x, center, q=4.0):
    b, a = _sig.iirpeak(center / (SR / 2), q)
    return _sig.lfilter(b, a, x)


def _glottal(dur, f0_start, f0_end, vibrato_rate=6.0, vibrato_depth=0.06,
             breath=0.15, variant=0):
    """Sawtooth glottal source with pitch glide + vibrato + breath noise."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(1000 + variant * 77)
    # pitch contour with slight random wobble per variant
    wobble = 1.0 + 0.03 * np.sin(2 * np.pi * 1.7 * t + rng.uniform(0, 6.28))
    f0 = np.linspace(f0_start, f0_end, n) * wobble
    f0 *= 1.0 + vibrato_depth * np.sin(2 * np.pi * vibrato_rate * t)
    ph = np.cumsum(2 * np.pi * f0 / SR)
    src = _sig.sawtooth(ph) * 0.7
    src += rng.uniform(-1, 1, n) * breath
    return src, t


def _formant_filter(x, formants):
    """Apply vowel formants: list of (freq, q, gain)."""
    y = np.zeros_like(x)
    for f, q, g in formants:
        y += _bandpass(x, f, q) * g
    return y


# Vowel formants (Hz): F1, F2, F3 approx for open-mouth scream "AH"
SCREAM_AH = [(800, 3.0, 1.0), (1200, 4.0, 0.6), (2800, 5.0, 0.35)]
# "EH" for pain
PAIN_EH = [(600, 3.0, 1.0), (1900, 4.0, 0.55), (2600, 5.0, 0.3)]
# "OH" for battle cry
CRY_OH = [(500, 3.0, 1.0), (900, 4.0, 0.6), (2500, 5.0, 0.3)]


def _vocal(dur, f0s, f0e, formants, variant, attack=0.05, decay=2.0,
           vib_rate=6.0, vib_depth=0.06, breath=0.15):
    src, t = _glottal(dur, f0s, f0e, vib_rate, vib_depth, breath, variant)
    y = _formant_filter(src, formants)
    env = np.minimum(t / attack, 1.0) * np.exp(-np.maximum(t - dur + 0.4, 0) * decay)
    return y * env


def pain_scream(sex="m", variant=0):
    base = 320 if sex == "m" else 520
    return _vocal(0.9, base * 1.3, base * 0.8, PAIN_EH, variant,
                  attack=0.03, vib_rate=8.0, vib_depth=0.10) * 0.9


def death_scream(sex="m", variant=0):
    base = 280 if sex == "m" else 480
    # pitch collapses downward
    return _vocal(1.4, base * 1.5, base * 0.5, SCREAM_AH, variant,
                  attack=0.02, decay=1.6, vib_rate=5.0, vib_depth=0.12) * 0.95


def battle_cry(sex="m", variant=0):
    base = 200 if sex == "m" else 340
    return _vocal(1.1, base, base * 1.25, CRY_OH, variant,
                  attack=0.04, vib_rate=4.5, vib_depth=0.05, breath=0.20) * 0.9


def fear_scream(sex="m", variant=0):
    base = 380 if sex == "m" else 620
    return _vocal(0.8, base, base * 1.4, SCREAM_AH, variant,
                  attack=0.02, vib_rate=10.0, vib_depth=0.14) * 0.85


def grunt(sex="m", variant=0):
    base = 140 if sex == "m" else 230
    return _vocal(0.35, base * 1.2, base * 0.9, CRY_OH, variant,
                  attack=0.02, decay=6.0, vib_rate=7.0, vib_depth=0.08,
                  breath=0.25) * 0.8


def cheer(sex="m", variant=0):
    base = 220 if sex == "m" else 360
    # rising "hurrah" shape: two pulses
    y1 = _vocal(0.5, base, base * 1.3, SCREAM_AH, variant, attack=0.05, decay=4.0)
    y2 = _vocal(0.7, base * 1.1, base * 1.5, SCREAM_AH, variant + 10, attack=0.05, decay=3.0)
    out = np.zeros(int(1.3 * SR))
    out[:len(y1)] += y1
    s = int(0.45 * SR)
    out[s:s + len(y2)] += y2
    return out * 0.85


def groan(sex="m", variant=0):
    base = 110 if sex == "m" else 180
    return _vocal(1.0, base, base * 0.85, PAIN_EH, variant,
                  attack=0.08, decay=2.5, vib_rate=3.5, vib_depth=0.06,
                  breath=0.30) * 0.75


VOX = []
for _kind, _fn in [("pain-scream", pain_scream), ("death-scream", death_scream),
                   ("battle-cry", battle_cry), ("fear-scream", fear_scream),
                   ("grunt", grunt), ("cheer", cheer), ("groan", groan)]:
    for sex in ("m", "f"):
        for v in (1, 2, 3):
            VOX.append((f"vox/{_kind}-{sex}{v}", _fn, {"sex": sex, "variant": v},
                        f"{_kind} ({'male' if sex == 'm' else 'female'} v{v})"))


def to_mp3():
    for name, _, _, _ in VOX:
        src = os.path.join(OUT, name + ".wav")
        dst = os.path.join(MP3, name + ".mp3")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "128k", dst], check=True)
    print(f"encoded mp3s -> {MP3}")


def main():
    import json
    manifest = []
    for name, fn, kw, desc in VOX:
        x = fn(**kw)
        assert np.all(np.isfinite(x)), name
        assert len(x) > 0, name
        x = limiter(x, ceiling=0.89)
        path = os.path.join(OUT, name + ".wav")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        write_wav(path, x)
        peak = float(np.max(np.abs(x)))
        rms = float(np.sqrt(np.mean(x ** 2)))
        assert rms > 1e-4, f"{name}: silent"
        print(f"{name:28s} {len(x)/SR:4.1f}s peak={peak:.2f} rms={rms:.3f}")
        manifest.append({"name": name, "description": desc,
                         "duration_s": round(len(x) / SR, 2),
                         "peak": round(peak, 3), "rms": round(rms, 4)})
    with open(os.path.join(OUT, "vox-manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"{len(manifest)} vocalizations rendered -> {OUT}")
    to_mp3()


if __name__ == "__main__":
    main()
