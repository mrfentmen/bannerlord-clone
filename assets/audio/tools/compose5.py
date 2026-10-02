"""Batch 5 compositions for the Bannerlord-clone web game.
New situational music: tavern rest, siege assault, night patrol, pursuit.
Render: python3 compose5.py -> wav stems + mixes in out/
Then: ffmpeg to mp3."""
import os
import numpy as np
from synth import Track, reverb_stereo, limiter, write_wav, SR, wind

OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def n(name):
    """'D3' / 'F#4' / 'Bb2' -> midi number."""
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
    """Sum stems -> stereo mix with reverb + limiter. Saves mix + stems."""
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


# ============================================================ TAVERN REST
# Warm and weary, G major 3/4 waltz, 84 BPM. 24 bars of 3.
# Plucked melody over soft pads, like a tired guitar in a roadhouse.
def tavern_rest():
    bpm = 84
    bars = 24
    total = bars * 3
    pads = Track(bpm, total)
    pluck = Track(bpm, total)
    bass = Track(bpm, total)
    brush = Track(bpm, total)  # soft hats as brush

    G = [n("G2"), n("B2"), n("D3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3"), n("C4"), n("E4")]
    D = [n("D3"), n("F#3"), n("A3"), n("D4"), n("F#4")]
    Em = [n("E2"), n("G2"), n("B2"), n("E3"), n("G3")]

    def bar(i):
        return i * 3

    prog = [G, C, G, D, G, C, G, D, G, Em, C, D] * 2
    for i, ch in enumerate(prog):
        b = bar(i)
        pads.pad(b, ch, 3, vel=0.55, attack=1.0, cutoff=1800)
        bass.bass(b, ch[0] - 12, 2.8, vel=0.6, cutoff=420)
        brush.hat(b, vel=0.25)
        brush.hat(b + 1, vel=0.18)
        brush.hat(b + 2, vel=0.22)

    # lilting waltz melody, phrases of 4 bars
    melody = [
        (0, "B4", 1.2), (1, "A4", 1.0), (2, "G4", 1.6),
        (3, "E4", 1.2), (4, "G4", 1.0), (5, "A4", 1.6),
        (6, "B4", 2.0), (9, "D5", 1.2), (10, "B4", 1.0), (11, "A4", 1.6),
        (12, "G4", 2.6),
        (15, "A4", 1.2), (16, "B4", 1.0), (17, "C5", 1.6),
        (18, "B4", 1.2), (19, "A4", 1.0), (20, "G4", 2.6),
        (24, "B4", 1.2), (25, "A4", 1.0), (26, "G4", 1.6),
        (27, "E4", 1.2), (28, "G4", 1.0), (29, "B4", 1.6),
        (30, "A4", 2.6),
        (36, "G4", 1.2), (37, "F#4", 1.0), (38, "E4", 1.6),
        (39, "D4", 2.0), (42, "E4", 1.0), (43, "F#4", 1.0), (44, "G4", 2.6),
        (48, "B4", 1.2), (49, "D5", 1.0), (50, "B4", 1.6),
        (51, "A4", 1.2), (52, "G4", 1.0), (53, "E4", 1.6),
        (54, "D4", 1.2), (55, "E4", 1.0), (56, "G4", 2.8),
        (60, "G4", 2.8), (66, "D4", 2.8),
    ]
    for b, note, d in melody:
        pluck.pluck(b, n(note), d, vel=0.75)

    stems = {"pads": pads, "pluck": pluck, "bass": bass, "brush": brush}
    for s in stems.values():
        s.trim()
    return "tavern-rest", stems, {"pads": 0.85, "pluck": 1.0, "bass": 0.8, "brush": 0.5}


# ============================================================ SIEGE ASSAULT
# Relentless, D minor, 100 BPM. 20 bars. War drums + brass stabs + low pulse.
def siege_assault():
    bpm = 100
    bars = 20
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    strings = Track(bpm, total)

    Dm = [n("D3"), n("A3"), n("D4"), n("F4")]
    Bb = [n("Bb2"), n("F3"), n("Bb3"), n("D4")]
    Gm = [n("G2"), n("D3"), n("G3"), n("Bb3")]
    A = [n("A2"), n("E3"), n("A3"), n("C#4")]

    def bar(i):
        return i * 4

    # intro: 4 bars of drums building
    for i in range(4):
        b = bar(i)
        drums.taiko(b, vel=0.5 + 0.12 * i)
        drums.taiko(b + 2, vel=0.4 + 0.1 * i)
        if i >= 2:
            drums.snare(b + 1, vel=0.5)
            drums.snare(b + 3, vel=0.5)

    prog = [Dm, Dm, Bb, Gm, Dm, Dm, Bb, A, Dm, Dm, Gm, Bb, Dm, A, Dm, Dm]
    for i, ch in enumerate(prog):
        b = bar(4 + i)
        # driving double-kick pulse
        for k in range(4):
            drums.taiko(b + k, vel=0.85)
            drums.snare(b + k + 0.5, vel=0.55)
        drums.crash(b, vel=0.4 if i % 4 else 0.7)
        # brass stabs on the off-beats
        brass.brass(b + 0.5, ch[2] + 12, 0.4, vel=0.7)
        brass.brass(b + 2.5, ch[3] + 12, 0.4, vel=0.7)
        # low driving root
        for k in range(4):
            bass.bass(b + k, ch[0] - 24, 0.9, vel=0.85, cutoff=600)
        strings.pad(b, ch, 4, vel=0.5, attack=0.2, cutoff=2000)

    # final slam
    b = bar(19)
    for mnote in Dm:
        brass.brass(b, mnote + 24, 3.6, vel=0.9)
    drums.crash(b, vel=0.9)
    drums.taiko(b, vel=1.0)
    drums.taiko(b + 2, vel=0.8)

    stems = {"drums": drums, "brass": brass, "bass": bass, "strings": strings}
    for s in stems.values():
        s.trim()
    return "siege-assault", stems, {"drums": 1.0, "brass": 0.95, "bass": 0.9, "strings": 0.7}


# ============================================================ NIGHT PATROL
# Sparse and tense, A minor, 72 BPM. 64 beats. Low pads, lone pluck, wind.
def night_patrol():
    bpm = 72
    total = 64
    pads = Track(bpm, total)
    pluck = Track(bpm, total)
    bass = Track(bpm, total)
    air = Track(bpm, total)

    Am = [n("A2"), n("E3"), n("A3"), n("C4"), n("E4")]
    F = [n("F2"), n("C3"), n("F3"), n("A3"), n("C4")]
    Dm = [n("D3"), n("A3"), n("D4"), n("F4")]
    E = [n("E2"), n("B2"), n("E3"), n("G#3")]

    air.wind(0, total, vel=0.9)
    pads.pad(0, Am, 20, vel=0.6, attack=4.0, cutoff=1400)
    pads.pad(20, F, 16, vel=0.55, attack=4.0, cutoff=1400)
    pads.pad(36, Dm, 16, vel=0.55, attack=4.0, cutoff=1400)
    pads.pad(52, E, 12, vel=0.6, attack=3.0, cutoff=1400)

    bass.bass(0, n("A1"), 20, vel=0.5, cutoff=220)
    bass.bass(20, n("F1"), 16, vel=0.45, cutoff=220)
    bass.bass(36, n("D2"), 16, vel=0.45, cutoff=220)
    bass.bass(52, n("E1"), 12, vel=0.55, cutoff=220)

    # sparse distant signals, like radio blips across the dark
    signals = [
        (6, "E5", 2.5), (14, "C5", 2.0),
        (26, "A4", 3.0), (33, "G4", 2.0),
        (42, "F4", 3.0), (47, "E4", 2.5),
        (56, "B4", 2.0), (60, "A4", 3.5),
    ]
    for b, note, d in signals:
        pluck.pluck(b, n(note), d, vel=0.55)

    # heartbeat pulse in the dark second half
    for b in range(32, 64, 4):
        bass.bass(b, n("A1"), 0.5, vel=0.35, cutoff=180)

    stems = {"pads": pads, "pluck": pluck, "bass": bass, "air": air}
    for s in stems.values():
        s.trim()
    return "night-patrol", stems, {"pads": 0.9, "pluck": 0.85, "bass": 0.8, "air": 0.7}


# ============================================================ PURSUIT
# High-speed chase, E minor, 140 BPM. 24 bars. Driving hats, bass ostinato.
def pursuit():
    bpm = 140
    bars = 24
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    fx = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = n("E2")
    # relentless 16th hats + backbeat
    for i in range(bars):
        b = bar(i)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.5 if k % 2 == 0 else 0.32)
        drums.snare(b + 1, vel=0.75)
        drums.snare(b + 3, vel=0.75)
        drums.kick(b, vel=0.9)
        drums.kick(b + 2.5, vel=0.7)

    # bass ostinato: E E G E A E G F#
    ost = [0, 0, 3, 0, 5, 0, 3, 2]
    for i in range(bars):
        b = bar(i)
        root = Em - 12 if i < 16 else n("A1") - 12 if i < 20 else n("B1") - 12
        for k, step in enumerate(ost):
            bass.bass(b + k * 0.5, root + 12 + step, 0.45, vel=0.8, cutoff=900)

    # siren-like lead wail, bars 8-24
    for i in range(8, bars):
        b = bar(i)
        if i % 2 == 0:
            lead.lead(b, n("E5"), 1.5, vel=0.5, vibrato=7.0, vib_depth=25.0)
            lead.lead(b + 2, n("D5"), 1.5, vel=0.5, vibrato=7.0, vib_depth=25.0)
    fx.wind(0, total, vel=0.5)
    fx.crash(bar(0), vel=0.7)
    fx.crash(bar(16), vel=0.6)

    stems = {"drums": drums, "bass": bass, "lead": lead, "fx": fx}
    for s in stems.values():
        s.trim()
    return "pursuit", stems, {"drums": 1.0, "bass": 0.95, "lead": 0.7, "fx": 0.55}


def main():
    for fn, wet in ((tavern_rest, 0.24), (siege_assault, 0.14),
                    (night_patrol, 0.34), (pursuit, 0.12)):
        name, stems, gains = fn()
        mix_track(name, stems, gains, reverb_wet=wet)


if __name__ == "__main__":
    main()
