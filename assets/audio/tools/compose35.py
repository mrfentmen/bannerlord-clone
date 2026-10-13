"""Thirty-fifth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-34 moods already covered - do not duplicate):
  the-spring-campaign, drums-of-the-storm-lord, the-midsummer-feast,
  elegy-for-the-brave, the-obsidian-throne, march-of-the-iron-legion.
Render: python3 compose35.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
import compose27 as c27
from compose27 import VoiceTrack, Track, n

OUT = "/home/hatch/workspace/staging/music35/out"
MP3 = "/home/hatch/workspace/staging/music35/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ======================================================== THE-SPRING-CAMPAIGN
# The thaw is over and the roads are dry: banners out, the army marches.
# A major, 96 BPM. 16 bars. Loop (sample-exact).
# A F#m D E.
def the_spring_campaign():
    bpm = 96
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [A, Fsm, D, E] * 4
    roots = [n("A1"), n("F#1"), n("D1"), n("E1")] * 4

    v = 0.87
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the marching column: strings in bright eighths
        step = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12,
                ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[0] + 12]
        for k in range(8):
            strings.strings(b + k * 0.5, step[k], 0.6, vel=v * 0.34)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.25)
        # the larks: flute answers each bar
        flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.38)
        flute.flute(b + 2, ch[0] + 12, 2.0, vel=v * 0.34)
        # new grass: lyre sparkle on the off-beats
        lyre.lyre(b + 0.5, ch[0] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 1.5, ch[2] + 36, 1, vel=v * 0.26)
        lyre.lyre(b + 2.5, ch[1] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 3.5, ch[0] + 36, 1, vel=v * 0.26)
        # the baggage train: rolling bass
        bass.bass(b, root, 1.8, vel=v * 0.52, cutoff=500)
        bass.bass(b + 2, root, 1.8, vel=v * 0.48, cutoff=500)
        # the drums of the vanguard
        drums.taiko(b, vel=v * 0.46)
        drums.taiko(b + 2, vel=v * 0.42)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.20)

    # an original spring-song: bright, forward, unhurried
    spring = [
        (0, "E4", 2), (2, "F#4", 2), (4, "A4", 4),
        (8, "B4", 2), (10, "A4", 2), (12, "F#4", 4),
        (16, "D4", 2), (18, "E4", 2), (20, "F#4", 4),
        (24, "E4", 2), (26, "D4", 2), (28, "C#4", 4),
        (32, "D4", 4), (36, "E4", 4),
        (40, "F#4", 2), (42, "A4", 2), (44, "B4", 4),
        (48, "A4", 2), (50, "F#4", 2), (52, "E4", 2), (54, "D4", 2),
        (56, "C#4", 4), (60, "D4", 4),
    ]
    for off, note, d in spring:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "flute": flute, "lyre": lyre,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-spring-campaign", stems,
            {"strings": 0.86, "flute": 0.9, "lyre": 0.82,
             "bass": 0.9, "drums": 0.88}, True)


# =================================================== DRUMS-OF-THE-STORM-LORD
# Black clouds over the battlefield: the storm-lord drums the war himself.
# D minor, 142 BPM. 16 bars. Arc: the gathering -> the tempest -> the calm.
# Dm Bb Gm A.
def drums_of_the_storm_lord():
    bpm = 142
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    thunder = VoiceTrack(bpm, total)
    warhorn = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Bb, Gm, A] * 4
    roots = [n("D1"), n("Bb1"), n("G1"), n("A1")] * 4

    def arc_vel(i):
        if i < 3:
            return 0.55 + i * 0.11    # the gathering
        if i < 12:
            return 1.0                # the tempest
        return 1.0 - (i - 12) * 0.17  # the calm

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the storm-lord's drums: relentless
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
        # thunder answers the drums
        if i >= 2:
            thunder.thunder(b, 4, seed=i + 35)
        # lightning brass: jagged stabs
        if i >= 2 and i < 12:
            brass.brass(b, ch[2], 0.5, vel=v * 0.48)
            brass.brass(b + 1, ch[0], 0.5, vel=v * 0.44)
            brass.brass(b + 2, ch[1], 0.5, vel=v * 0.48)
            brass.brass(b + 3, ch[2], 0.5, vel=v * 0.44)
        # the storm-lord's horn: one long dreadful note per bar
        if i >= 2:
            warhorn.warhorn(b, ch[0] - 24, 4.0, vel=v * 0.42)
        # the ground shakes: pounding roots
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.4, vel=v * 0.58, cutoff=400)

    # the storm-call: three notes, no ornament, no mercy
    call = [
        (12, "D4", 2), (14, "D4", 2),
        (16, "F4", 4),
        (24, "E4", 2), (26, "F4", 2),
        (28, "G4", 4),
        (36, "F4", 2), (38, "E4", 2),
        (40, "D4", 8),
    ]
    for off, note, d in call:
        v = arc_vel(int(off // 4))
        warhorn.warhorn(off, n(note) - 12, d, vel=v * 0.44)

    stems = {"drums": drums, "thunder": thunder, "warhorn": warhorn,
             "brass": brass, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-storm-lord", stems,
            {"drums": 0.95, "thunder": 0.88, "warhorn": 0.88,
             "brass": 0.9, "bass": 0.9}, False)


# ======================================================= THE-MIDSUMMER-FEAST
# Longest day, longest table: roast meat, spilled wine, and dancing till dawn.
# F major, 110 BPM. 16 bars. Loop (sample-exact).
# F Dm Bb C.
def the_midsummer_feast():
    bpm = 110
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [F, Dm, Bb, C] * 4
    roots = [n("F1"), n("D1"), n("Bb1"), n("C1")] * 4

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
        # the pipes lead the dance
        flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.40)
        flute.flute(b + 2, ch[0] + 12, 2.0, vel=v * 0.36)
        # the feast bells: lyre on the off-beats
        lyre.lyre(b + 0.5, ch[0] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 1.5, ch[2] + 36, 1, vel=v * 0.26)
        lyre.lyre(b + 2.5, ch[1] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 3.5, ch[0] + 36, 1, vel=v * 0.26)
        # the stamping bass: the whole hall shakes
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.4, vel=v * 0.56, cutoff=560)

    # an original feast-tune: a tune the feet already know
    feast = [
        (0, "C4", 1), (1, "D4", 1), (2, "F4", 2),
        (4, "G4", 1), (5, "F4", 1), (6, "D4", 2),
        (8, "C4", 2), (10, "D4", 2), (12, "F4", 4),
        (16, "G4", 1), (17, "A4", 1), (18, "C5", 2),
        (20, "A4", 1), (21, "G4", 1), (22, "F4", 2),
        (24, "D4", 2), (26, "C4", 2), (28, "A3", 4),
        (32, "C4", 2), (34, "F4", 2), (36, "G4", 4),
        (40, "F4", 2), (42, "D4", 2), (44, "C4", 4),
        (48, "D4", 2), (50, "F4", 2), (52, "A4", 4),
        (56, "G4", 2), (58, "F4", 2), (60, "C4", 4),
    ]
    for off, note, d in feast:
        flute.flute(off, n(note), d, vel=v * 0.44)

    stems = {"strings": strings, "flute": flute, "lyre": lyre,
             "drums": drums, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-midsummer-feast", stems,
            {"strings": 0.88, "flute": 0.9, "lyre": 0.82,
             "drums": 0.92, "bass": 0.9}, True)


# ======================================================== ELEGY-FOR-THE-BRAVE
# The field is quiet now: names read aloud, banners lowered, the dead honored.
# E minor, 66 BPM. 16 bars. Arc: the roll -> the grief -> the resolve.
# Em C G D.
def elegy_for_the_brave():
    bpm = 66
    bars = 16
    total = bars * 4
    choir = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    solo = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    mist = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, C, G, D] * 4
    roots = [n("E1"), n("C1"), n("G1"), n("D1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.07    # the roll
        if i < 12:
            return 1.0                # the grief
        return 1.0 - (i - 12) * 0.14  # the resolve

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the morning mist over the field: always there
        mist.wind(b, 4, vel=v * 0.22)
        mist.mist(b, 4, vel=v * 0.16, seed=i + 35)
        # the names read aloud: the mourning choir
        for m in ch:
            choir.choir(b, m - 12, 4.4, vel=v * 0.34)
        # bowed heads: slow strings
        for m in ch:
            strings.strings(b, m + 12, 4.6, vel=v * 0.30)
        if i >= 4 and i < 12:
            cry = [ch[2] + 24, ch[1] + 24, ch[0] + 24, ch[1] + 24]
            for k, m in enumerate(cry):
                strings.strings(b + k, m, 1.0, vel=v * 0.34)
        # the earth receives them: deep slow roots
        bass.bass(b, root - 12, 3.6, vel=v * 0.52, cutoff=380)

    # an original lament: sung low, ending lifted
    lament = [
        (0, "B3", 4), (8, "A3", 4),
        (16, "G3", 4), (24, "F#3", 4),
        (32, "G3", 6), (40, "A3", 2),
        (48, "B3", 4), (56, "G3", 8),
    ]
    for off, note, d in lament:
        v = arc_vel(int(off // 4))
        solo.solo(off, n(note), d, vel=v * 0.44)

    stems = {"choir": choir, "strings": strings, "solo": solo,
             "bass": bass, "mist": mist}
    for s in stems.values():
        s.trim()
    return ("elegy-for-the-brave", stems,
            {"choir": 0.88, "strings": 0.86, "solo": 0.9,
             "bass": 0.9, "mist": 0.8}, False)


# ======================================================== THE-OBSIDIAN-THRONE
# Black stone, black crown: power that answers to no one and fears nothing.
# C minor, 78 BPM. 16 bars. Arc: the coronation -> the iron years -> the fall.
# Cm Ab Eb Bb.
def the_obsidian_throne():
    bpm = 78
    bars = 16
    total = bars * 4
    brass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    prog = [Cm, Ab, Eb, Bb] * 4
    roots = [n("C1"), n("Ab1"), n("Eb1"), n("Bb1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.54 + i * 0.06    # the coronation
        if i < 12:
            return 1.0                # the iron years
        return 1.0 - (i - 12) * 0.16  # the fall

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the black fanfare: brass like a slammed door
        brass.brass(b, ch[0], 1.5, vel=v * 0.52)
        brass.brass(b + 2, ch[2], 1.5, vel=v * 0.48)
        if i >= 4 and i < 12:
            brass.brass(b + 1, ch[1], 1.0, vel=v * 0.44)
            brass.brass(b + 3, ch[0], 1.0, vel=v * 0.44)
        # the court holds its breath: hushed strings
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.26)
        if i >= 4 and i < 12:
            dread = [ch[0] + 24, ch[0] + 24, ch[2] + 24, ch[1] + 24,
                     ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 24]
            for k, m in enumerate(dread):
                strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.36)
        # the chanting courtiers
        if i >= 2:
            for m in ch:
                choir.choir(b, m - 12, 4.2, vel=v * 0.30)
        # the throne's foundations: slow sinking roots
        bass.bass(b, root - 12, 3.6, vel=v * 0.54, cutoff=380)
        # the iron tread: measured drums
        drums.taiko(b, vel=v * 0.50)
        drums.taiko(b + 2, vel=v * 0.46)
        if i >= 4 and i < 12:
            drums.snare(b + 1, vel=v * 0.40)
            drums.snare(b + 3, vel=v * 0.40)

    # an original throne-theme: crowned high, fallen low
    throne = [
        (0, "G4", 4), (8, "Eb4", 4),
        (16, "F4", 4), (24, "D4", 4),
        (32, "Eb4", 6), (40, "C4", 2),
        (48, "D4", 4), (56, "C4", 8),
    ]
    for off, note, d in throne:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.5,
                   vibrato=5.5, vib_depth=6.0)

    stems = {"brass": brass, "strings": strings, "choir": choir,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-obsidian-throne", stems,
            {"brass": 0.92, "strings": 0.86, "choir": 0.88,
             "bass": 0.9, "drums": 0.9}, False)


# ================================================== MARCH-OF-THE-IRON-LEGION
# Row on row, shield on shield: the legion does not hurry and does not stop.
# G minor, 118 BPM. 16 bars. Loop (sample-exact).
# Gm Eb Cm D.
def march_of_the_iron_legion():
    bpm = 118
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    warhorn = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Cm = [n("C3"), n("Eb3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Gm, Eb, Cm, D] * 4
    roots = [n("G1"), n("Eb1"), n("C1"), n("D1")] * 4

    v = 0.9
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the iron tread: kick and snare, never wavering
        drums.kick(b, vel=v * 0.60)
        drums.snare(b + 1, vel=v * 0.50)
        drums.kick(b + 2, vel=v * 0.60)
        drums.snare(b + 3, vel=v * 0.50)
        drums.taiko(b + 0.5, vel=v * 0.44)
        drums.taiko(b + 2.5, vel=v * 0.44)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.24)
        # the standards: brass chords on the beat
        brass.brass(b, ch[0], 1.0, vel=v * 0.50)
        brass.brass(b + 2, ch[2], 1.0, vel=v * 0.46)
        # the tramp of ten thousand boots: strings ostinato
        ost = [ch[0] + 12, ch[0] + 12, ch[2] + 12, ch[1] + 12,
               ch[0] + 12, ch[0] + 12, ch[2] + 12, ch[1] + 12]
        for k in range(8):
            strings.strings(b + k * 0.5, ost[k], 0.5, vel=v * 0.36)
        # the locked shields: walking bass
        walk = [root, ch[1] - 12, ch[2] - 12, ch[0] - 12]
        for k, m in enumerate(walk):
            bass.bass(b + k, m, 0.8, vel=v * 0.54, cutoff=520)
        # the legion's horn: the call every four bars
        if i % 4 == 0:
            warhorn.warhorn(b, ch[0] - 12, 4.0, vel=v * 0.42)

    # an original legion-march: short, square, unstoppable
    legion = [
        (0, "D4", 1), (1, "Eb4", 1), (2, "G4", 2),
        (4, "F4", 1), (5, "Eb4", 1), (6, "D4", 2),
        (8, "Bb3", 2), (10, "C4", 2), (12, "D4", 4),
        (16, "G4", 2), (18, "F4", 2), (20, "Eb4", 2), (22, "D4", 2),
        (24, "C4", 4), (28, "Bb3", 4),
        (32, "D4", 2), (34, "Eb4", 2), (36, "G4", 4),
        (40, "F4", 2), (42, "Eb4", 2), (44, "D4", 4),
        (48, "Eb4", 2), (50, "D4", 2), (52, "C4", 2), (54, "Bb3", 2),
        (56, "A3", 4), (60, "G3", 4),
    ]
    for off, note, d in legion:
        warhorn.warhorn(off, n(note), d, vel=v * 0.44)

    stems = {"drums": drums, "brass": brass, "strings": strings,
             "bass": bass, "warhorn": warhorn}
    for s in stems.values():
        s.trim()
    return ("march-of-the-iron-legion", stems,
            {"drums": 0.92, "brass": 0.9, "strings": 0.86,
             "bass": 0.9, "warhorn": 0.88}, True)


# ============================================================ render
TRACKS = [
    (the_spring_campaign, 0.16),
    (drums_of_the_storm_lord, 0.24),
    (the_midsummer_feast, 0.18),
    (elegy_for_the_brave, 0.20),
    (the_obsidian_throne, 0.22),
    (march_of_the_iron_legion, 0.18),
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
