"""Batch 6 compositions for the Bannerlord-clone web game.
oath-ceremony, last-stand, homestead.
Render: python3 compose6.py -> wav stems + mixes in out/"""
import os
import numpy as np
from synth import Track, reverb_stereo, limiter, write_wav, SR

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


def mix_track(name, stems, gains, reverb_wet=0.18):
    bufs = {}
    for sname, trk in stems.items():
        b = trk.buf.astype(np.float64) * gains.get(sname, 1.0)
        bufs[sname] = b
        write_wav(os.path.join(OUT, f"{name}-stem-{sname}.wav"),
                  limiter(b, ceiling=0.89))
    mix = sum(bufs.values())
    stereo = reverb_stereo(mix, wet=reverb_wet, decay=2.2)
    stereo = limiter(stereo, ceiling=0.89)
    path = os.path.join(OUT, f"{name}-mix.wav")
    write_wav(path, stereo)
    peak = float(np.max(np.abs(stereo)))
    rms = float(np.sqrt(np.mean(stereo ** 2)))
    dur = len(stereo) / SR
    print(f"{name}: {dur:.1f}s peak={peak:.3f} rms={rms:.3f} -> {path}")
    return path


# ============================================================ OATH CEREMONY
# Solemn, D major, 76 BPM. 16 bars. Brass chorale + tolling bell-ish lead.
def oath_ceremony():
    bpm = 76
    bars = 16
    total = bars * 4
    brass = Track(bpm, total)
    strings = Track(bpm, total)
    bass = Track(bpm, total)
    bell = Track(bpm, total)

    D = [n("D3"), n("F#3"), n("A3"), n("D4"), n("F#4")]
    G = [n("G2"), n("B2"), n("D3"), n("G3"), n("B3")]
    A = [n("A2"), n("C#3"), n("E3"), n("A3"), n("C#4")]
    Bm = [n("B2"), n("D3"), n("F#3"), n("B3"), n("D4")]

    def bar(i):
        return i * 4

    prog = [D, G, D, A, D, G, Bm, A, D, G, D, A, D, Bm, G, A]
    for i, ch in enumerate(prog):
        b = bar(i)
        # slow brass chorale, one chord per bar
        for j, mnote in enumerate(ch[1:4]):
            brass.brass(b + j * 0.02, mnote + 12, 3.9, vel=0.55)
        strings.pad(b, ch, 4, vel=0.6, attack=1.6, cutoff=2000)
        bass.bass(b, ch[0] - 12, 3.9, vel=0.65, cutoff=400)

    # tolling bell on the downbeat every 4 bars
    for i in (0, 4, 8, 12):
        b = bar(i)
        bell.lead(b, n("D6"), 3.0, vel=0.4, vibrato=0.0, vib_depth=0.0)
        bell.lead(b, n("A5"), 3.0, vel=0.3, vibrato=0.0, vib_depth=0.0)

    # final affirmation
    b = bar(15)
    for mnote in D:
        brass.brass(b, mnote + 12, 3.8, vel=0.7)

    stems = {"brass": brass, "strings": strings, "bass": bass, "bell": bell}
    for s in stems.values():
        s.trim()
    return "oath-ceremony", stems, {"brass": 0.95, "strings": 0.85, "bass": 0.8, "bell": 0.6}


# ============================================================ LAST STAND
# Desperate, C# minor, 132 BPM. 20 bars. Relentless drums, screaming lead.
def last_stand():
    bpm = 132
    bars = 20
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    strings = Track(bpm, total)

    def bar(i):
        return i * 4

    roots = [n("C#2"), n("C#2"), n("A1"), n("B1")] * 5
    for i in range(bars):
        b = bar(i)
        # gallop drums
        drums.kick(b, vel=0.95)
        drums.kick(b + 0.75, vel=0.7)
        drums.kick(b + 1.5, vel=0.85)
        drums.snare(b + 1, vel=0.8)
        drums.snare(b + 3, vel=0.8)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.45 if k % 2 == 0 else 0.3)
        if i % 4 == 0:
            drums.crash(b, vel=0.6)
        # grinding bass
        for k in range(4):
            bass.bass(b + k, roots[i] + 12, 0.9, vel=0.9, cutoff=1100)
        strings.pad(b, [roots[i] + 12, roots[i] + 15, roots[i] + 19], 4,
                    vel=0.45, attack=0.15, cutoff=2200)

    # screaming lead, bars 4-20
    line = [
        (16, "E5", 1.5), (18, "D#5", 1.0), (20, "C#5", 2.0),
        (24, "B4", 1.5), (26, "C#5", 2.5),
        (32, "E5", 1.5), (34, "F#5", 1.0), (36, "G#5", 2.0),
        (40, "F#5", 1.5), (42, "E5", 2.5),
        (48, "G#5", 2.0), (52, "A5", 1.5), (54, "G#5", 1.0), (56, "F#5", 2.5),
        (64, "E5", 3.0), (68, "D#5", 2.0), (72, "C#5", 4.0),
    ]
    for b, note, d in line:
        lead.lead(b, n(note), d, vel=0.62, vibrato=6.5, vib_depth=9.0)

    stems = {"drums": drums, "bass": bass, "lead": lead, "strings": strings}
    for s in stems.values():
        s.trim()
    return "last-stand", stems, {"drums": 1.0, "bass": 0.95, "lead": 0.85, "strings": 0.6}


# ============================================================ HOMESTEAD
# Peaceful, C major, 72 BPM. 20 bars. Warm pads, gentle pluck, soft bass.
def homestead():
    bpm = 72
    bars = 20
    total = bars * 4
    pads = Track(bpm, total)
    pluck = Track(bpm, total)
    bass = Track(bpm, total)
    air = Track(bpm, total)

    C = [n("C3"), n("E3"), n("G3"), n("C4"), n("E4")]
    F = [n("F2"), n("A2"), n("C3"), n("F3"), n("A3")]
    G = [n("G2"), n("B2"), n("D3"), n("G3"), n("B3")]
    Am = [n("A2"), n("C3"), n("E3"), n("A3"), n("C4")]

    def bar(i):
        return i * 4

    air.wind(0, total, vel=0.5)
    prog = [C, F, C, G, C, F, Am, G, C, F, C, G, Am, F, G, C, F, C, G, C]
    for i, ch in enumerate(prog):
        b = bar(i)
        pads.pad(b, ch, 4, vel=0.6, attack=1.4, cutoff=1900)
        bass.bass(b, ch[0] - 12, 3.8, vel=0.55, cutoff=380)
        bass.bass(b + 2, ch[2] - 12, 1.8, vel=0.45, cutoff=380)

    melody = [
        (0, "E5", 2.0), (2, "D5", 1.5), (4, "C5", 2.5),
        (8, "D5", 2.0), (10, "E5", 1.5), (12, "G5", 2.5),
        (16, "E5", 2.0), (18, "C5", 1.5), (20, "D5", 2.5),
        (24, "E5", 3.0), (28, "D5", 2.0), (30, "C5", 2.0),
        (32, "A4", 2.0), (34, "C5", 1.5), (36, "D5", 2.5),
        (40, "E5", 2.0), (42, "G5", 1.5), (44, "E5", 2.5),
        (48, "D5", 2.0), (50, "C5", 3.0),
        (56, "C5", 2.0), (58, "D5", 1.5), (60, "E5", 1.5), (62, "G5", 1.0),
        (64, "E5", 2.5), (68, "D5", 2.0), (72, "C5", 4.0),
    ]
    for b, note, d in melody:
        pluck.pluck(b, n(note), d, vel=0.7)

    stems = {"pads": pads, "pluck": pluck, "bass": bass, "air": air}
    for s in stems.values():
        s.trim()
    return "homestead", stems, {"pads": 0.9, "pluck": 1.0, "bass": 0.75, "air": 0.55}


def main():
    for fn, wet in ((oath_ceremony, 0.26), (last_stand, 0.12), (homestead, 0.28)):
        name, stems, gains = fn()
        mix_track(name, stems, gains, reverb_wet=wet)


if __name__ == "__main__":
    main()
