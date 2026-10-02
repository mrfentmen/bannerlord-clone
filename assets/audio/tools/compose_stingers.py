"""Victory/defeat stingers: one-shot assets for future battle-outcome hooks.
The sim does not publish battle outcomes to the client yet (verified
2026-10-02: battle.go/siege.go emit no notifications), so these ship as
named SFX ready to wire, not as fake scene mappings.
Render: python3 compose_stingers.py -> out/"""
import os
import numpy as np
from synth import Track, reverb_stereo, limiter, write_wav, SR, crash

OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def n(name):
    note = name[0].upper()
    i = 1
    acc = 0
    if i < len(name) and name[i] == "#":
        acc = 1
        i += 1
    elif i < len(name) and name[i] in ("b", "B"):
        acc = -1
        i += 1
    octave = int(name[i:])
    return 12 * (octave + 1) + NAMES[note] + acc


def render(name, build, beats):
    trk = Track(100, beats)
    build(trk)
    buf = trk.trim().buf.astype(np.float64)
    stereo = reverb_stereo(buf, wet=0.2, decay=2.0)
    stereo = limiter(stereo, ceiling=0.89)
    path = os.path.join(OUT, f"{name}-mix.wav")
    write_wav(path, stereo)
    peak = float(np.max(np.abs(stereo)))
    rms = float(np.sqrt(np.mean(stereo ** 2)))
    print(f"{name}: {len(stereo)/SR:.1f}s peak={peak:.3f} rms={rms:.3f} -> {path}")


def victory(t):
    # D major fanfare: brass hits climbing D-F#-A-D, cymbal wash
    t.brass(0, n("D4"), 2, vel=0.8)
    t.brass(0, n("F#4"), 2, vel=0.8)
    t.brass(2, n("A4"), 2, vel=0.85)
    t.brass(2, n("D5"), 2, vel=0.85)
    t.brass(4, n("D4"), 4, vel=0.9)
    t.brass(4, n("F#4"), 4, vel=0.9)
    t.brass(4, n("A4"), 4, vel=0.9)
    t.brass(4, n("D5"), 4, vel=0.9)
    t.crash(4, vel=0.5)
    t.taiko(4, vel=0.9)


def defeat(t):
    # D minor descent: low brass D-C-Bb-A, muted drum
    for i, note in enumerate(["D3", "C3", "Bb2", "A2"]):
        t.brass(i * 2, n(note), 2.5, vel=0.7)
    t.taiko(0, vel=0.6)
    t.taiko(6, vel=0.5)
    t.wind(6, 4, vel=0.25)


if __name__ == "__main__":
    render("victory-sting", victory, 10)
    render("defeat-sting", defeat, 12)
