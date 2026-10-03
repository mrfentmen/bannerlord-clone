"""Twenty-eighth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-27 moods already covered - do not duplicate):
  the-ashen-field, drums-of-the-west, the-golden-mean,
  whispers-of-treason, the-crystal-palace, ride-of-the-valkyries.
Render: python3 compose28.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch (ride-of-the-valkyries
is an original mythic-charge theme, NOT Wagner)."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
import compose27 as c27
from compose27 import VoiceTrack, Track, n

OUT = "/home/hatch/workspace/staging/music28/out"
MP3 = "/home/hatch/workspace/staging/music28/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ============================================================ THE-ASHEN-FIELD
# Battlefield aftermath: the crows have the field now.
# F minor, 66 BPM. 16 bars. Arc: aftermath -> the frost settles -> quiet barn.
# Fm Db Ab Eb.
def the_ashen_field():
    bpm = 66
    bars = 16
    total = bars * 4
    ash = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    warhorn = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Fm = [n("F3"), n("Ab3"), n("C4")]
    Db = [n("Db3"), n("F3"), n("Ab3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    prog = [Fm, Db, Ab, Eb] * 4
    roots = [n("F2"), n("Db2"), n("Ab2"), n("Eb2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.05    # the aftermath: numb, grey
        if i < 10:
            return 0.75               # the frost settles
        return 0.75 - (i - 10) * 0.09  # the quiet barn

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # grey sky over grey field: the ash never lifts
        ash.mist(b, 4, seed=i, vel=v * 0.55)
        # the fallen sleep: deep root drones
        bass.bass(b, root - 24, 3.8, vel=v * 0.50, cutoff=220)
        # the wind moves the banners no one will lower
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.34)
        # a distant horn: someone still calling the roll
        if 4 <= i < 11 and i % 3 == 0:
            warhorn.warhorn(b + 1, ch[0] - 12, 3.0, vel=v * 0.30)
        # the last light: thin, high, alone
        if 6 <= i < 13 and i % 2 == 1:
            strings.strings(b + 2, ch[2] + 36, 2.0, vel=v * 0.16)

    # the widow's walk: a lament for no one left to hear
    lament = [
        (16, "F4", 2), (18, "G4", 2),
        (20, "Ab4", 4),
        (24, "G4", 4),
        (28, "F4", 2), (30, "Eb4", 2),
        (32, "F4", 6),
        (40, "Ab4", 2), (42, "Bb4", 2),
        (44, "C5", 4),
        (48, "Bb4", 2), (50, "Ab4", 2),
        (52, "G4", 4),
        (56, "F4", 6),
    ]
    for off, note, d in lament:
        v = arc_vel(int(off // 4))
        flute.flute(off, n(note), d, vel=v * 0.44)

    stems = {"ash": ash, "strings": strings, "flute": flute,
             "warhorn": warhorn, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-ashen-field", stems,
            {"ash": 0.9, "strings": 0.88, "flute": 0.9,
             "warhorn": 0.8, "bass": 0.9}, False)


# ============================================================ DRUMS-OF-THE-WEST
# Frontier war drums: the column marches at first light.
# G minor, 130 BPM. 16 bars. Arc: the march -> the charge -> dust settles.
# Gm Eb Bb F.
def drums_of_the_west():
    bpm = 130
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Gm, Eb, Bb, F] * 4
    roots = [n("G2"), n("Eb2"), n("Bb2"), n("F2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.08    # the march
        if i < 12:
            return 1.0                # the charge
        return 1.0 - (i - 12) * 0.15  # dust settles

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # boot leather and hoofbeats: the column on the move
        drums.kick(b, vel=v * 0.62)
        drums.kick(b + 1, vel=v * 0.55)
        drums.snare(b + 2, vel=v * 0.50)
        drums.kick(b + 3, vel=v * 0.55)
        drums.taiko(b + 0.5, vel=v * 0.52)
        drums.taiko(b + 2.5, vel=v * 0.52)
        drums.tom(b + 1.5, freq=110, vel=v * 0.48)
        drums.tom(b + 3.5, freq=90, vel=v * 0.48)
        if i >= 4 and i < 12:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.30)
            drums.snare(b + 0.5, vel=v * 0.42)
            drums.snare(b + 1.5, vel=v * 0.42)
            drums.snare(b + 2.5, vel=v * 0.42)
            drums.snare(b + 3.5, vel=v * 0.42)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the ground gives the rhythm: rolling 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 24, 0.4, vel=v * 0.56,
                      cutoff=420)
        # the bugles: bold, brassy, unafraid
        if i >= 2:
            brass.brass(b, ch[0], 1.2, vel=v * 0.44)
            brass.brass(b + 2, ch[2], 1.2, vel=v * 0.44)
        # the riders: galloping strings
        if i >= 4 and i < 12:
            ost = [ch[0] + 24, ch[0] + 24, ch[2] + 24, ch[0] + 24,
                   ch[1] + 24, ch[2] + 24, ch[0] + 24, ch[1] + 24]
            for k, m in enumerate(ost):
                strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.40)
        else:
            for m in ch:
                strings.strings(b, m + 12, 4.2, vel=v * 0.32)
        # the war song: full-throated
        if i >= 4 and i < 11:
            for m in ch:
                choir.choir(b, m - 12, 3.6, vel=v * 0.36)

    # the guidon: carried high, never dropped
    theme = [
        (16, "G4", 2), (18, "Bb4", 2),
        (20, "D5", 4),
        (24, "C5", 2), (26, "Bb4", 2),
        (28, "A4", 4),
        (32, "Bb4", 2), (34, "D5", 2),
        (36, "G5", 4),
        (40, "F5", 4),
        (44, "Eb5", 2), (46, "D5", 2),
        (48, "C5", 4),
        (52, "Bb4", 6),
    ]
    for off, note, d in theme:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.54,
                   vibrato=5.5, vib_depth=6.5)

    stems = {"drums": drums, "bass": bass, "brass": brass,
             "strings": strings, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-west", stems,
            {"drums": 0.95, "bass": 0.9, "brass": 0.9,
             "strings": 0.85, "choir": 0.85}, False)


# ============================================================ THE-GOLDEN-MEAN
# Philosophy: neither excess nor deficiency - the measured life.
# C major, 86 BPM. 12 bars. Loop.
# C G Am F.
def the_golden_mean():
    bpm = 86
    bars = 12
    total = bars * 4
    lyre = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    celesta = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [C, G, Am, F] * 3
    roots = [n("C2"), n("G2"), n("A2"), n("F2")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the lyre of the sage: even, unhurried figures
        fig = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[2] + 24, ch[0] + 36, ch[1] + 24, ch[2] + 24]
        for k, m in enumerate(fig):
            lyre.lyre(b + k * 0.5, m, dur_beats=2.0, vel=0.40)
        # the middle path: warm string pads, never loud
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.30)
        # the measured step: walking bass
        bass.bass(b, root - 24, 1.5, vel=0.46, cutoff=200)
        bass.bass(b + 1.5, ch[1] - 24, 1.5, vel=0.42, cutoff=200)
        bass.bass(b + 3, ch[2] - 24, 1.0, vel=0.40, cutoff=200)
        # starlight on the theorem: gentle celesta
        celesta.celesta(b, ch[2] + 36, 1.6, vel=0.15)
        if i % 2 == 1:
            celesta.celesta(b + 2, ch[0] + 36, 1.6, vel=0.13)

    # the discourse: patient, reasoned, serene
    discourse = [
        (0, "E4", 2), (2, "G4", 2),
        (4, "C5", 4),
        (8, "B4", 2), (10, "A4", 2),
        (12, "G4", 4),
        (16, "A4", 6),
        (24, "G4", 2), (26, "F4", 2),
        (28, "E4", 4),
        (32, "D4", 4),
        (36, "E4", 2), (38, "G4", 2),
        (40, "A4", 4),
        (44, "G4", 4),
    ]
    for off, note, d in discourse:
        flute.flute(off, n(note), d, vel=0.44)

    stems = {"lyre": lyre, "flute": flute, "strings": strings,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("the-golden-mean", stems,
            {"lyre": 0.9, "flute": 0.9, "strings": 0.88,
             "bass": 0.9, "celesta": 0.8}, True)


# ============================================================ WHISPERS-OF-TREASON
# The knives are out, but no one has drawn them yet.
# E minor, 96 BPM. 12 bars. Loop.
# Em Bm C D.
def whispers_of_treason():
    bpm = 96
    bars = 12
    total = bars * 4
    mist = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    harpsi = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    celesta = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, Bm, C, D] * 3
    roots = [n("E2"), n("B2"), n("C3"), n("D3")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the corridors hold their breath
        mist.mist(b, 4, seed=i + 100, vel=0.42)
        # the pulse of a guilty heart: low, insistent
        for k in range(4):
            bass.bass(b + k, root - 24, 0.7, vel=0.52, cutoff=260)
        # sidelong glances: short string stabs
        strings.strings(b + 0.5, ch[0] + 12, 0.6, vel=0.34)
        strings.strings(b + 2.5, ch[2] + 12, 0.6, vel=0.32)
        if i % 2 == 1:
            strings.strings(b + 1.5, ch[1] + 12, 0.6, vel=0.30)
        # the plot thickens: harpsichord, never at rest
        arp = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 36,
               ch[2] + 24, ch[1] + 24, ch[0] + 24, ch[2] + 24]
        for k, m in enumerate(arp):
            harpsi.harpsi(b + k * 0.5, m, dur_beats=1.0, vel=0.36)
        # a cold ping: someone is listening at the door
        if i % 3 == 0:
            celesta.celesta(b + 3, ch[2] + 36, 1.2, vel=0.14)
        if i % 3 == 1:
            celesta.celesta(b + 1, ch[0] + 36, 1.2, vel=0.12)

    stems = {"mist": mist, "strings": strings, "harpsi": harpsi,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("whispers-of-treason", stems,
            {"mist": 0.9, "strings": 0.88, "harpsi": 0.9,
             "bass": 0.9, "celesta": 0.8}, True)


# ============================================================ THE-CRYSTAL-PALACE
# Opulence: a thousand candles behind cut glass.
# D major, 82 BPM. 12 bars. Loop.
# D Bm G A.
def the_crystal_palace():
    bpm = 82
    bars = 12
    total = bars * 4
    celesta = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [D, Bm, G, A] * 3
    roots = [n("D2"), n("B2"), n("G2"), n("A2")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the chandeliers: sparkling celesta cascades
        casc = [ch[0] + 36, ch[1] + 36, ch[2] + 36, ch[0] + 48,
                ch[2] + 36, ch[1] + 36, ch[0] + 36, ch[2] + 36]
        for k, m in enumerate(casc):
            celesta.celesta(b + k * 0.5, m, dur_beats=1.4, vel=0.20)
        # the dancers: bright lyre figures
        fig = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[2] + 24,
               ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[0] + 24]
        for k, m in enumerate(fig):
            lyre.lyre(b + k * 0.5, m, dur_beats=2.0, vel=0.36)
        # the marble hall: luminous string pads
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.30)
        # the soft tread of silk: gentle bass
        bass.bass(b, root - 24, 1.8, vel=0.44, cutoff=200)
        bass.bass(b + 2, ch[2] - 24, 1.8, vel=0.40, cutoff=200)

    # the toast: raised glasses, raised voices
    toast = [
        (0, "F#4", 2), (2, "A4", 2),
        (4, "D5", 4),
        (8, "C#5", 2), (10, "B4", 2),
        (12, "A4", 4),
        (16, "B4", 6),
        (24, "A4", 2), (26, "G4", 2),
        (28, "F#4", 4),
        (32, "E4", 4),
        (36, "F#4", 2), (38, "A4", 2),
        (40, "B4", 4),
        (44, "A4", 4),
    ]
    for off, note, d in toast:
        flute.flute(off, n(note), d, vel=0.44)

    stems = {"celesta": celesta, "lyre": lyre, "strings": strings,
             "flute": flute, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-crystal-palace", stems,
            {"celesta": 0.85, "lyre": 0.9, "strings": 0.88,
             "flute": 0.9, "bass": 0.9}, True)


# ============================================================ RIDE-OF-THE-VALKYRIES
# The shield-maidens take the sky: an ORIGINAL mythic charge theme
# (not Wagner). A minor, 146 BPM. 16 bars.
# Arc: the muster -> the ride -> the triumph.
# Am F C G.
def ride_of_the_valkyries():
    bpm = 146
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

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Am, F, C, G] * 4
    roots = [n("A2"), n("F2"), n("C3"), n("G2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.08    # the muster
        if i < 12:
            return 1.0                # the ride
        return 1.0 - (i - 12) * 0.13  # the triumph

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the sky-horns: the call to the brave
        if i % 2 == 0:
            warhorn.warhorn(b, ch[0] - 12, 3.0, vel=v * 0.44)
        if i >= 4 and i % 4 == 1:
            warhorn.warhorn(b + 2, ch[2] - 12, 2.0, vel=v * 0.38)
        # the thunder of wings: relentless drums
        drums.kick(b, vel=v * 0.62)
        drums.snare(b + 1, vel=v * 0.50)
        drums.kick(b + 2, vel=v * 0.62)
        drums.snare(b + 3, vel=v * 0.50)
        drums.taiko(b + 0.5, vel=v * 0.52)
        drums.taiko(b + 2.5, vel=v * 0.52)
        if i >= 4 and i < 12:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.28)
        if i == 4:
            drums.crash(b, vel=0.72)
        # the storm beneath: driving 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.58,
                      cutoff=560)
        # the brazen host: fanfare stabs
        if i >= 2:
            brass.brass(b, ch[0], 1.5, vel=v * 0.46)
            brass.brass(b + 2, ch[2], 1.5, vel=v * 0.42)
        # the ride itself: soaring string runs
        if i >= 4 and i < 12:
            run = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[0] + 36,
                   ch[1] + 36, ch[2] + 36, ch[0] + 36, ch[2] + 36]
            for k, m in enumerate(run):
                strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.40)
        else:
            for m in ch:
                strings.strings(b, m + 12, 4.4, vel=v * 0.34)
        # the choosers of the slain sing
        if i >= 4:
            for m in ch:
                choir.choir(b, m - 12, 3.6, vel=v * 0.38)

    # the sky-road: an original soaring call (not Wagner)
    skyroad = [
        (16, "A4", 2), (18, "C5", 2),
        (20, "E5", 4),
        (24, "D5", 2), (26, "C5", 2),
        (28, "B4", 4),
        (32, "C5", 4),
        (36, "E5", 2), (38, "D5", 2),
        (40, "C5", 4),
        (44, "A4", 4),
        (48, "G4", 2), (50, "A4", 2),
        (52, "B4", 4),
        (56, "C5", 4),
        (60, "A4", 4),
    ]
    for off, note, d in skyroad:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.56,
                   vibrato=6.0, vib_depth=7.0)

    stems = {"warhorn": warhorn, "brass": brass, "strings": strings,
             "drums": drums, "choir": choir, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("ride-of-the-valkyries", stems,
            {"warhorn": 0.9, "brass": 0.92, "strings": 0.85,
             "drums": 0.95, "choir": 0.88, "bass": 0.9}, False)


# ============================================================ render
TRACKS = [
    (the_ashen_field, 0.20),
    (drums_of_the_west, 0.24),
    (the_golden_mean, 0.16),
    (whispers_of_treason, 0.18),
    (the_crystal_palace, 0.16),
    (ride_of_the_valkyries, 0.24),
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
