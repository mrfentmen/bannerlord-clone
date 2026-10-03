"""Thirty-second batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-31 moods already covered - do not duplicate):
  the-winter-campaign, drums-of-the-iron-horde, the-spring-thaw,
  songs-of-the-caravan, the-shattered-oath, dance-of-the-harvest-moon.
Render: python3 compose32.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
import compose27 as c27
from compose27 import VoiceTrack, Track, n

OUT = "/home/hatch/workspace/staging/music32/out"
MP3 = "/home/hatch/workspace/staging/music32/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ======================================================== THE-WINTER-CAMPAIGN
# An army marches through the snow: banners stiff with frost, breath white.
# D minor, 68 BPM. 16 bars. Arc: the frozen march -> the battle -> the frozen aftermath.
# Dm Gm Bb A.
def the_winter_campaign():
    bpm = 68
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    mist = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    warhorn = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Gm = [n("G3"), n("Bb3"), n("D4")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Gm, Bb, A] * 4
    roots = [n("D2"), n("G2"), n("Bb1"), n("A1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.06    # the frozen march
        if i < 12:
            return 1.0                # the battle
        return 1.0 - (i - 12) * 0.15  # the frozen aftermath

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the cold itself: wind over the field, always
        mist.wind(b, 4, vel=v * 0.30)
        mist.mist(b, 4, vel=v * 0.20, seed=i)
        # the trudging host: low strings in half notes
        strings.strings(b, ch[0] - 12, 2.0, vel=v * 0.30)
        strings.strings(b + 2, ch[2] - 12, 2.0, vel=v * 0.28)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.26)
        # the frost-bitten choir
        if i >= 2:
            for m in ch:
                choir.choir(b, m - 12, 4.2, vel=v * 0.32)
        # the deep roots: the march of boots
        for k in range(4):
            bass.bass(b + k, root - 12, 0.8, vel=v * 0.54,
                      cutoff=420)
        # the horns of winter sound in the battle
        if i >= 4 and i < 12:
            warhorn.warhorn(b, ch[0] - 12, 3.0, vel=v * 0.40)
            if i % 2 == 1:
                warhorn.warhorn(b + 2, ch[1] - 12, 2.0, vel=v * 0.36)

    # an original winter-line: high, thin, alone against the cold
    winter = [
        (0, "A4", 4), (4, "G4", 2), (6, "F4", 2),
        (8, "D4", 8),
        (16, "F4", 3), (19, "G4", 1), (20, "A4", 4),
        (24, "Bb4", 6), (30, "A4", 2),
        (32, "G4", 4), (36, "F4", 4),
        (40, "E4", 4), (44, "D4", 4),
        (48, "F4", 2), (50, "E4", 2), (52, "D4", 4),
        (56, "C4", 4), (60, "D4", 4),
    ]
    for off, note, d in winter:
        v = arc_vel(int(off // 4))
        strings.strings(off, n(note), d, vel=v * 0.40)

    stems = {"strings": strings, "choir": choir, "mist": mist,
             "bass": bass, "warhorn": warhorn}
    for s in stems.values():
        s.trim()
    return ("the-winter-campaign", stems,
            {"strings": 0.88, "choir": 0.85, "mist": 0.72,
             "bass": 0.9, "warhorn": 0.88}, False)


# =================================================== DRUMS-OF-THE-IRON-HORDE
# The iron horde comes: no mercy, no parley, no survivors.
# F# minor, 138 BPM. 16 bars. Arc: the march -> the slaughter -> the silence.
# F#m D A E.
def drums_of_the_iron_horde():
    bpm = 138
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    warhorn = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Fsm = [n("F#3"), n("A3"), n("C#4")]
    D = [n("D3"), n("F#3"), n("A3")]
    A = [n("A2"), n("C#3"), n("E3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [Fsm, D, A, E] * 4
    roots = [n("F#2"), n("D2"), n("A2"), n("E2")] * 4

    def arc_vel(i):
        if i < 3:
            return 0.52 + i * 0.12    # the march
        if i < 12:
            return 1.0                # the slaughter
        return 1.0 - (i - 12) * 0.16  # the silence

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the iron tread: relentless taiko
        drums.taiko(b, vel=v * 0.62)
        drums.taiko(b + 0.5, vel=v * 0.52)
        drums.taiko(b + 1, vel=v * 0.62)
        drums.taiko(b + 1.5, vel=v * 0.52)
        drums.taiko(b + 2, vel=v * 0.62)
        drums.taiko(b + 2.5, vel=v * 0.52)
        drums.taiko(b + 3, vel=v * 0.58)
        drums.taiko(b + 3.5, vel=v * 0.50)
        drums.kick(b + 0.25, vel=v * 0.55)
        drums.kick(b + 2.25, vel=v * 0.55)
        drums.snare(b + 1.25, vel=v * 0.46)
        drums.snare(b + 3.25, vel=v * 0.46)
        if i >= 3 and i < 12:
            for k in range(16):
                drums.hat(b + k * 0.25, vel=v * 0.24)
        if i == 3:
            drums.crash(b, vel=0.70)
        # the iron will: brass stabs like hammer blows
        if i >= 2 and i < 12:
            brass.brass(b, ch[0], 0.5, vel=v * 0.48)
            brass.brass(b + 1, ch[2], 0.5, vel=v * 0.44)
            brass.brass(b + 2, ch[1], 0.5, vel=v * 0.48)
            brass.brass(b + 3, ch[0], 0.5, vel=v * 0.44)
        # the horde's horns: one long dreadful note per bar
        if i >= 2:
            warhorn.warhorn(b, ch[0] - 24, 4.0, vel=v * 0.42)
        # the ground shakes: pounding roots
        for k in range(8):
            bass.bass(b + k * 0.5, root - 24, 0.4, vel=v * 0.58,
                      cutoff=400)

    # the iron call: three notes, no ornament, no mercy
    call = [
        (12, "F#3", 2), (14, "F#3", 2),
        (16, "A3", 4),
        (24, "G#3", 2), (26, "A3", 2),
        (28, "B3", 4),
        (36, "A3", 2), (38, "G#3", 2),
        (40, "F#3", 8),
    ]
    for off, note, d in call:
        v = arc_vel(int(off // 4))
        warhorn.warhorn(off, n(note) - 12, d, vel=v * 0.44)

    stems = {"drums": drums, "brass": brass, "warhorn": warhorn,
             "bass": bass}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-iron-horde", stems,
            {"drums": 0.95, "brass": 0.9, "warhorn": 0.88,
             "bass": 0.9}, False)


# =========================================================== THE-SPRING-THAW
# The ice breaks: rivers run, buds open, the land breathes again.
# A major, 90 BPM. 16 bars. Loop (sample-exact).
# A F#m D E.
def the_spring_thaw():
    bpm = 90
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    celesta = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [A, Fsm, D, E] * 4
    roots = [n("A2"), n("F#2"), n("D2"), n("E2")] * 4

    v = 0.86
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the meltwater: flowing string eighths
        flow = [0, 1, 2, 1, 0, 2, 1, 2]
        for k in range(8):
            strings.strings(b + k * 0.5, ch[flow[k]] + 12, 0.6,
                            vel=v * 0.34)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.26)
        # the first birds: flute calls
        flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.38)
        flute.flute(b + 2, ch[1] + 12, 2.0, vel=v * 0.34)
        # new shoots: lyre sparkle
        lyre.lyre(b + 1, ch[0] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 3, ch[2] + 36, 1, vel=v * 0.24)
        # the river rising: rolling bass
        bass.bass(b, root - 12, 1.8, vel=v * 0.50, cutoff=480)
        bass.bass(b + 2, root - 12, 1.8, vel=v * 0.46, cutoff=480)
        # drips of light: celesta
        celesta.celesta(b + 2.5, ch[2] + 36, 1, vel=v * 0.24)

    # an original thaw-song: rising, open, unhurried
    thaw = [
        (0, "E4", 2), (2, "F#4", 2), (4, "A4", 2), (6, "B4", 2),
        (8, "C#5", 4), (12, "B4", 2), (14, "A4", 2),
        (16, "B4", 2), (18, "C#5", 2), (20, "D5", 2), (22, "C#5", 2),
        (24, "B4", 4), (28, "A4", 2), (30, "F#4", 2),
        (32, "E4", 4), (36, "F#4", 4),
        (40, "A4", 2), (42, "B4", 2), (44, "C#5", 4),
        (48, "D5", 2), (50, "C#5", 2), (52, "B4", 2), (54, "A4", 2),
        (56, "F#4", 4), (60, "E4", 4),
    ]
    for off, note, d in thaw:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "flute": flute, "lyre": lyre,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("the-spring-thaw", stems,
            {"strings": 0.86, "flute": 0.9, "lyre": 0.82,
             "bass": 0.9, "celesta": 0.8}, True)


# ======================================================= SONGS-OF-THE-CARAVAN
# Bells on the lead camel: dust, distance, and the promise of the market.
# E major, 100 BPM. 16 bars. Loop (sample-exact).
# E C#m A B.
def songs_of_the_caravan():
    bpm = 100
    bars = 16
    total = bars * 4
    lyre = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    E = [n("E2"), n("G#2"), n("B2")]
    Csm = [n("C#3"), n("E3"), n("G#3")]
    A = [n("A2"), n("C#3"), n("E3")]
    B = [n("B2"), n("D#3"), n("F#3")]
    prog = [E, Csm, A, B] * 4
    roots = [n("E2"), n("C#3"), n("A2"), n("B2")] * 4

    v = 0.87
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the caravan's step: lyre ostinato, steady as feet
        ost = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 24,
               ch[2] + 24, ch[1] + 24, ch[0] + 24, ch[2] + 24]
        for k, m in enumerate(ost):
            lyre.lyre(b + k * 0.5, m, dur_beats=2.0, vel=v * 0.40)
        # the camel bells: the drummer's hand
        drums.taiko(b, vel=v * 0.50)
        drums.taiko(b + 1.5, vel=v * 0.44)
        drums.taiko(b + 2, vel=v * 0.50)
        drums.taiko(b + 3.5, vel=v * 0.44)
        drums.hat(b + 0.5, vel=v * 0.22)
        drums.hat(b + 1, vel=v * 0.22)
        drums.hat(b + 2.5, vel=v * 0.22)
        drums.hat(b + 3, vel=v * 0.22)
        # the road: walking bass
        walk = [root - 12, ch[1] - 12, ch[2] - 12, ch[0]]
        for k, m in enumerate(walk):
            bass.bass(b + k, m, 0.8, vel=v * 0.52, cutoff=520)
        # the wide sky: warm pads
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.26)
        # the traders sing on the long road
        if i % 2 == 0:
            flute.flute(b, ch[2] + 12, 3.0, vel=v * 0.36)

    # an original road-song: long-legged, patient, always moving
    road = [
        (0, "B3", 2), (2, "C#4", 2), (4, "E4", 4),
        (8, "F#4", 2), (10, "E4", 2), (12, "D#4", 4),
        (16, "E4", 6), (24, "C#4", 2),
        (32, "A3", 2), (34, "B3", 2), (36, "C#4", 4),
        (40, "E4", 2), (42, "F#4", 2), (44, "G#4", 4),
        (48, "F#4", 2), (50, "E4", 2), (52, "D#4", 2), (54, "C#4", 2),
        (56, "B3", 4), (60, "A3", 4),
    ]
    for off, note, d in road:
        flute.flute(off, n(note), d, vel=v * 0.40)

    stems = {"lyre": lyre, "flute": flute, "drums": drums,
             "bass": bass, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("songs-of-the-caravan", stems,
            {"lyre": 0.9, "flute": 0.9, "drums": 0.88,
             "bass": 0.9, "strings": 0.85}, True)


# ========================================================= THE-SHATTERED-OATH
# The words were sworn on steel: now the steel is broken and so is the word.
# C minor, 74 BPM. 16 bars. Arc: the vow -> the betrayal -> the reckoning.
# Cm Ab Eb Bb.
def the_shattered_oath():
    bpm = 74
    bars = 16
    total = bars * 4
    choir = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    solo = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    prog = [Cm, Ab, Eb, Bb] * 4
    roots = [n("C2"), n("Ab1"), n("Eb2"), n("Bb1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.52 + i * 0.06    # the vow
        if i < 12:
            return 1.0                # the betrayal
        return 1.0 - (i - 12) * 0.15  # the reckoning

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the sworn words: voices in the dark
        for m in ch:
            choir.choir(b, m - 12, 4.4, vel=v * 0.32)
        # the breaking: strings tear at the seams
        if i >= 4 and i < 12:
            tear = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 24,
                    ch[2] + 24, ch[0] + 24, ch[1] + 24, ch[2] + 24]
            for k, m in enumerate(tear):
                strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.40)
        else:
            for m in ch:
                strings.strings(b, m + 12, 4.4, vel=v * 0.30)
        # the foundation cracks: slow sinking roots
        bass.bass(b, root - 24, 3.6, vel=v * 0.52, cutoff=380)
        # the judgement: brass like a slammed door
        if i >= 4 and i < 12 and i % 2 == 0:
            brass.brass(b, ch[0], 1.0, vel=v * 0.46)
            brass.brass(b + 2, ch[2], 1.0, vel=v * 0.42)

    # an original oath-theme: sworn high, broken low
    oath = [
        (0, "G4", 4), (8, "Eb4", 4),
        (16, "F4", 4), (24, "D4", 4),
        (32, "Eb4", 6), (40, "C4", 2),
        (48, "D4", 4), (56, "C4", 8),
    ]
    for off, note, d in oath:
        v = arc_vel(int(off // 4))
        solo.solo(off, n(note), d, vel=v * 0.42)

    stems = {"choir": choir, "strings": strings, "solo": solo,
             "bass": bass, "brass": brass}
    for s in stems.values():
        s.trim()
    return ("the-shattered-oath", stems,
            {"choir": 0.88, "strings": 0.86, "solo": 0.9,
             "bass": 0.9, "brass": 0.9}, False)


# ================================================== DANCE-OF-THE-HARVEST-MOON
# The full moon rises over the stubble fields: fiddles, drums, and no sleep till dawn.
# G major, 112 BPM. 16 bars. Loop (sample-exact).
# G Em C D.
def dance_of_the_harvest_moon():
    bpm = 112
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, Em, C, D] * 4
    roots = [n("G2"), n("E2"), n("C2"), n("D2")] * 4

    v = 0.9
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the reel: fiddles sawing eighths, no stopping
        bow = [0, 2, 1, 2, 0, 1, 2, 1]
        for k in range(8):
            strings.strings(b + k * 0.5, ch[bow[k]] + 12, 0.5,
                            vel=v * 0.38)
        # the dancers' feet: kick and snare backbeat
        drums.kick(b, vel=v * 0.58)
        drums.snare(b + 1, vel=v * 0.48)
        drums.kick(b + 2, vel=v * 0.58)
        drums.snare(b + 3, vel=v * 0.48)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.26)
        if i % 4 == 0:
            drums.taiko(b + 3.5, vel=v * 0.44)
        # the moonlit pipes lead the dance
        flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.40)
        # the harvest bells: lyre on the off-beats
        lyre.lyre(b + 0.5, ch[0] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 1.5, ch[2] + 36, 1, vel=v * 0.26)
        lyre.lyre(b + 2.5, ch[1] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 3.5, ch[0] + 36, 1, vel=v * 0.26)
        # the stamping bass: the whole barn shakes
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.56,
                      cutoff=560)

    # an original moon-dance: a tune the feet already know
    moon = [
        (0, "D4", 1), (1, "E4", 1), (2, "G4", 2),
        (4, "A4", 1), (5, "G4", 1), (6, "E4", 2),
        (8, "D4", 2), (10, "E4", 2), (12, "G4", 4),
        (16, "A4", 1), (17, "B4", 1), (18, "D5", 2),
        (20, "B4", 1), (21, "A4", 1), (22, "G4", 2),
        (24, "E4", 2), (26, "D4", 2), (28, "B3", 4),
        (32, "D4", 2), (34, "G4", 2), (36, "A4", 4),
        (40, "G4", 2), (42, "E4", 2), (44, "D4", 4),
        (48, "E4", 2), (50, "G4", 2), (52, "B4", 4),
        (56, "A4", 2), (58, "G4", 2), (60, "D4", 4),
    ]
    for off, note, d in moon:
        flute.flute(off, n(note), d, vel=v * 0.44)

    stems = {"strings": strings, "flute": flute, "lyre": lyre,
             "drums": drums, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("dance-of-the-harvest-moon", stems,
            {"strings": 0.88, "flute": 0.9, "lyre": 0.82,
             "drums": 0.92, "bass": 0.9}, True)


# ============================================================ render
TRACKS = [
    (the_winter_campaign, 0.20),
    (drums_of_the_iron_horde, 0.24),
    (the_spring_thaw, 0.16),
    (songs_of_the_caravan, 0.16),
    (the_shattered_oath, 0.20),
    (dance_of_the_harvest_moon, 0.18),
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
