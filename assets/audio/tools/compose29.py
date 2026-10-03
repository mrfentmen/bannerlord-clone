"""Twenty-ninth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-28 moods already covered - do not duplicate):
  the-silent-choir, drums-of-the-ash, the-gilded-lily,
  shadows-of-the-past, the-marble-halls, flight-of-the-eagles.
Render: python3 compose29.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
import compose27 as c27
from compose27 import VoiceTrack, Track, n

OUT = "/home/hatch/workspace/staging/music29/out"
MP3 = "/home/hatch/workspace/staging/music29/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ============================================================ THE-SILENT-CHOIR
# The brothers keep the hours: candles, stone, and hushed voices.
# D minor, 64 BPM. 16 bars. Arc: hushed -> swelling -> rest.
# Dm Gm Bb A.
def the_silent_choir():
    bpm = 64
    bars = 16
    total = bars * 4
    solo = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    mist = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Gm = [n("G3"), n("Bb3"), n("D4")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Gm, Bb, A] * 4
    roots = [n("D2"), n("G2"), n("Bb2"), n("A2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.45 + i * 0.05     # hushed
        if i < 12:
            return 0.65 + (i - 4) / 8 * 0.35  # swelling
        return 0.65 - (i - 12) * 0.08  # rest

    # the chant: an original hushed office (2-bar phrases)
    chant = [
        (0, "D4", 2), (2, "F4", 2), (4, "A4", 3), (7, "G4", 1),
        (8, "F4", 2), (10, "E4", 2), (12, "D4", 4),
        (16, "G4", 2), (18, "Bb4", 2), (20, "A4", 3), (23, "G4", 1),
        (24, "F4", 2), (26, "E4", 2), (28, "D4", 4),
    ]
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the brothers sing the chord long and low
        for m in ch:
            choir.choir(b, m, 4.2, vel=v * 0.40)
        # the cantor's line: first half of the office
        if i % 4 < 2:
            for off, note, d in chant:
                if off < 16:
                    solo.solo(b + off / 4 * 2, n(note), d / 2, vel=v * 0.46)
        # cold stone air: the monastery breathes
        mist.mist(b, 4, vel=v * 0.30, seed=i)
        # low drones hold the room
        for m in ch:
            strings.strings(b, m - 12, 4.4, vel=v * 0.32)
        # the root beneath
        bass.bass(b, root - 12, 3.6, vel=v * 0.50, cutoff=420)

    stems = {"solo": solo, "choir": choir, "mist": mist,
             "strings": strings, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-silent-choir", stems,
            {"solo": 0.92, "choir": 0.9, "mist": 0.75,
             "strings": 0.85, "bass": 0.9}, False)


# ============================================================ DRUMS-OF-THE-ASH
# The mountain wakes: ember-drums under a black sky.
# F# minor, 134 BPM. 16 bars. Arc: rumble -> fury -> embers.
# F#m D A E.
def drums_of_the_ash():
    bpm = 134
    bars = 16
    total = bars * 4
    taiko = Track(bpm, total)
    thunder = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D2"), n("F#2"), n("A2")]
    A = [n("A2"), n("C#3"), n("E3")]
    E = [n("E2"), n("G#2"), n("B2")]
    prog = [Fsm, D, A, E] * 4
    roots = [n("F#2"), n("D2"), n("A2"), n("E2")] * 4

    def arc_vel(i):
        if i < 3:
            return 0.50 + i * 0.10     # rumble
        if i < 11:
            return 1.0                 # fury
        return 1.0 - (i - 11) * 0.14   # embers

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the ember-drums: relentless
        taiko.taiko(b, vel=v * 0.62)
        taiko.taiko(b + 1.5, vel=v * 0.55)
        taiko.taiko(b + 2, vel=v * 0.62)
        taiko.taiko(b + 3.5, vel=v * 0.55)
        taiko.kick(b + 0.5, vel=v * 0.58)
        taiko.kick(b + 2.5, vel=v * 0.58)
        taiko.snare(b + 1, vel=v * 0.50)
        taiko.snare(b + 3, vel=v * 0.50)
        if i >= 3 and i < 11:
            for k in range(8):
                taiko.hat(b + k * 0.5, vel=v * 0.26)
        if i == 3:
            taiko.crash(b, vel=0.70)
        # the mountain itself: volcanic bed
        thunder.thunder(b, 5, vel=v * 0.42, seed=i)
        # brazen warnings
        if i >= 2:
            brass.brass(b, ch[0], 1.5, vel=v * 0.44)
            brass.brass(b + 2, ch[2], 1.5, vel=v * 0.40)
        # driving 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.56,
                      cutoff=560)
        # the ash-choir moans
        if i >= 3 and i < 11:
            for m in ch:
                choir.choir(b, m - 12, 3.8, vel=v * 0.36)

    stems = {"taiko": taiko, "thunder": thunder, "brass": brass,
             "bass": bass, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-ash", stems,
            {"taiko": 0.95, "thunder": 0.85, "brass": 0.9,
             "bass": 0.9, "choir": 0.85}, False)


# ============================================================ THE-GILDED-LILY
# The court at its most splendid: silk, wine, and beautiful lies.
# Eb major, 90 BPM. 16 bars. Loop (sample-exact).
# Eb Cm Ab Bb.
def the_gilded_lily():
    bpm = 90
    bars = 16
    total = bars * 4
    harpsi = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    celesta = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    prog = [Eb, Cm, Ab, Bb] * 4
    roots = [n("Eb2"), n("C2"), n("Ab2"), n("Bb2")] * 4

    # the flatterer's song: an original decadent air (2-bar phrases)
    air = [
        (0, "Eb5", 1), (1, "G5", 1), (2, "Bb5", 2),
        (4, "Ab5", 1), (5, "G5", 1), (6, "F5", 2),
        (8, "G5", 2), (10, "Eb5", 2),
        (12, "D5", 1), (13, "Eb5", 1), (14, "F5", 2),
    ]
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = 0.92
        # the gilded keys: chord stabs twice a bar
        for m in ch:
            harpsi.harpsi(b, m, 1.6, vel=v * 0.40)
            harpsi.harpsi(b + 2, m, 1.6, vel=v * 0.36)
        # the air itself
        if i % 2 == 0:
            for off, note, d in air:
                flute.flute(b + off / 2, n(note), d / 2, vel=v * 0.46)
        # silk pads
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.34)
        # candle-sparkle
        celesta.celesta(b + 1, ch[2] + 12, 1, vel=v * 0.32)
        celesta.celesta(b + 3, ch[0] + 24, 1, vel=v * 0.30)
        # the root beneath
        bass.bass(b, root - 12, 3.6, vel=v * 0.52, cutoff=480)

    stems = {"harpsi": harpsi, "flute": flute, "strings": strings,
             "celesta": celesta, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-gilded-lily", stems,
            {"harpsi": 0.88, "flute": 0.92, "strings": 0.85,
             "celesta": 0.85, "bass": 0.9}, True)


# ============================================================ SHADOWS-OF-THE-PAST
# Old letters, old losses: the past walks the halls at night.
# C minor, 74 BPM. 16 bars. Loop (sample-exact).
# Cm Ab Eb Bb.
def shadows_of_the_past():
    bpm = 74
    bars = 16
    total = bars * 4
    mist = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    solo = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    prog = [Cm, Ab, Eb, Bb] * 4
    roots = [n("C2"), n("Ab2"), n("Eb2"), n("Bb2")] * 4

    # the remembered voice: an original haunting fragment
    fragment = [
        (0, "C5", 2), (2, "Bb4", 2),
        (4, "Ab4", 3), (7, "G4", 1),
        (8, "Eb4", 4),
    ]
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = 0.90
        # the night air of memory
        mist.mist(b, 4, vel=v * 0.32, seed=i)
        # long tones that will not leave
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.36)
        # the voice, half-heard
        if i % 2 == 1:
            for off, note, d in fragment:
                solo.solo(b + off / 2, n(note), d / 2, vel=v * 0.42)
        # an echo answers
        if i % 4 == 2:
            flute.flute(b + 2, ch[1] + 24, 2.0, vel=v * 0.36)
        # the root beneath
        bass.bass(b, root - 12, 3.6, vel=v * 0.50, cutoff=420)

    stems = {"mist": mist, "strings": strings, "solo": solo,
             "flute": flute, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("shadows-of-the-past", stems,
            {"mist": 0.8, "strings": 0.88, "solo": 0.9,
             "flute": 0.88, "bass": 0.9}, True)


# ============================================================ THE-MARBLE-HALLS
# The empire at noon: columns, banners, and absolute certainty.
# Bb major, 84 BPM. 16 bars. Loop (sample-exact).
# Bb Gm Eb F.
def the_marble_halls():
    bpm = 84
    bars = 16
    total = bars * 4
    brass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    celesta = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Bb, Gm, Eb, F] * 4
    roots = [n("Bb2"), n("G2"), n("Eb2"), n("F2")] * 4

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = 0.92
        # the brazen empire: full chords
        for m in ch:
            brass.brass(b, m, 3.8, vel=v * 0.44)
        # the arch of strings
        if i % 2 == 0:
            arch = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[2] + 36,
                    ch[1] + 36, ch[0] + 36, ch[1] + 24, ch[0] + 24]
            for k, m in enumerate(arch):
                strings.strings(b + k * 0.5, m, 0.6, vel=v * 0.36)
        else:
            for m in ch:
                strings.strings(b, m + 12, 4.4, vel=v * 0.32)
        # the imperial choir
        for m in ch:
            choir.choir(b, m, 3.8, vel=v * 0.38)
        # marble sparkle
        celesta.celesta(b + 1.5, ch[2] + 24, 1, vel=v * 0.30)
        # the foundation
        bass.bass(b, root - 12, 3.6, vel=v * 0.54, cutoff=500)

    stems = {"brass": brass, "strings": strings, "choir": choir,
             "celesta": celesta, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-marble-halls", stems,
            {"brass": 0.9, "strings": 0.86, "choir": 0.88,
             "celesta": 0.82, "bass": 0.9}, True)


# ============================================================ FLIGHT-OF-THE-EAGLES
# The legions take the sky: standards high, the sun behind them.
# G major, 140 BPM. 16 bars. Arc: take flight -> soar -> landing.
# G Em C D.
def flight_of_the_eagles():
    bpm = 140
    bars = 16
    total = bars * 4
    warhorn = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, Em, C, D] * 4
    roots = [n("G2"), n("E2"), n("C3"), n("D2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.08     # take flight
        if i < 12:
            return 1.0                 # soar
        return 1.0 - (i - 12) * 0.13   # landing

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the sky-horns: the call to rise
        if i % 2 == 0:
            warhorn.warhorn(b, ch[0] - 12, 3.0, vel=v * 0.44)
        if i >= 4 and i % 4 == 1:
            warhorn.warhorn(b + 2, ch[2] - 12, 2.0, vel=v * 0.38)
        # the wingbeat: relentless drums
        drums.kick(b, vel=v * 0.60)
        drums.snare(b + 1, vel=v * 0.48)
        drums.kick(b + 2, vel=v * 0.60)
        drums.snare(b + 3, vel=v * 0.48)
        drums.taiko(b + 0.5, vel=v * 0.50)
        drums.taiko(b + 2.5, vel=v * 0.50)
        if i >= 4 and i < 12:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.26)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the updraft: driving 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.56,
                      cutoff=560)
        # the brazen host
        if i >= 2:
            brass.brass(b, ch[0], 1.5, vel=v * 0.44)
            brass.brass(b + 2, ch[2], 1.5, vel=v * 0.40)
        # the flight itself: soaring runs
        if i >= 4 and i < 12:
            run = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[0] + 36,
                   ch[1] + 36, ch[2] + 36, ch[0] + 36, ch[2] + 36]
            for k, m in enumerate(run):
                strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.38)
        else:
            for m in ch:
                strings.strings(b, m + 12, 4.4, vel=v * 0.32)
        # the eagles sing
        if i >= 4:
            for m in ch:
                choir.choir(b, m - 12, 3.6, vel=v * 0.36)

    # the high call: an original soaring phrase
    highcall = [
        (16, "G4", 2), (18, "B4", 2),
        (20, "D5", 4),
        (24, "C5", 2), (26, "B4", 2),
        (28, "A4", 4),
        (32, "B4", 4),
        (36, "D5", 2), (38, "C5", 2),
        (40, "B4", 4),
        (44, "G4", 4),
        (48, "A4", 2), (50, "B4", 2),
        (52, "D5", 4),
        (56, "G5", 4),
        (60, "D5", 4),
    ]
    for off, note, d in highcall:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.54,
                   vibrato=6.0, vib_depth=7.0)

    stems = {"warhorn": warhorn, "brass": brass, "strings": strings,
             "drums": drums, "choir": choir, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("flight-of-the-eagles", stems,
            {"warhorn": 0.9, "brass": 0.92, "strings": 0.85,
             "drums": 0.95, "choir": 0.88, "bass": 0.9}, False)


# ============================================================ render
TRACKS = [
    (the_silent_choir, 0.20),
    (drums_of_the_ash, 0.24),
    (the_gilded_lily, 0.16),
    (shadows_of_the_past, 0.18),
    (the_marble_halls, 0.16),
    (flight_of_the_eagles, 0.24),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (c27.mix_track27(name, stems, gains,
                                         reverb_wet=wet, loop=loop), loop)
    c27.to_mp3()
    c27.verify()
    return results


if __name__ == "__main__":
    main()
