"""Thirty-third batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-32 moods already covered - do not duplicate):
  the-autumn-campaign, drums-of-the-red-sun, the-summer-fair,
  ballads-of-the-border, the-iron-crown, waltz-of-the-courtiers.
Render: python3 compose33.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
import compose27 as c27
from compose27 import VoiceTrack, Track, n

OUT = "/home/hatch/workspace/staging/music33/out"
MP3 = "/home/hatch/workspace/staging/music33/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ======================================================== THE-AUTUMN-CAMPAIGN
# The last campaign of the year: gold leaves, cold nights, and one more battle.
# G minor, 70 BPM. 16 bars. Arc: the muster -> the harvest of swords -> the long dusk.
# Gm Eb Bb F.
def the_autumn_campaign():
    bpm = 70
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    mist = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    warhorn = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Gm, Eb, Bb, F] * 4
    roots = [n("G1"), n("Eb2"), n("Bb1"), n("F1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.52 + i * 0.06    # the muster
        if i < 12:
            return 1.0                # the harvest of swords
        return 1.0 - (i - 12) * 0.15  # the long dusk

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the wind through the stubble: always there
        mist.wind(b, 4, vel=v * 0.28)
        mist.mist(b, 4, vel=v * 0.18, seed=i + 33)
        # falling leaves: strings in falling figures
        fall = [ch[2] + 12, ch[1] + 12, ch[0] + 12, ch[1] + 12,
                ch[2] + 12, ch[0] + 12, ch[1] + 12, ch[0] + 12]
        for k in range(8):
            strings.strings(b + k * 0.5, fall[k], 0.6, vel=v * 0.32)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.24)
        # the singing host
        if i >= 2:
            for m in ch:
                choir.choir(b, m - 12, 4.2, vel=v * 0.30)
        # the tramp of boots on the cold road
        for k in range(4):
            bass.bass(b + k, root - 12, 0.8, vel=v * 0.52, cutoff=400)
        # the horns call before the battle
        if i >= 4 and i < 12:
            warhorn.warhorn(b, ch[0] - 12, 3.0, vel=v * 0.38)
            if i % 2 == 0:
                warhorn.warhorn(b + 2, ch[2] - 12, 2.0, vel=v * 0.34)

    # an original autumn-line: the year turns, and so does the song
    autumn = [
        (0, "D4", 4), (4, "Eb4", 2), (6, "D4", 2),
        (8, "Bb3", 8),
        (16, "C4", 3), (19, "D4", 1), (20, "Eb4", 4),
        (24, "F4", 6), (30, "Eb4", 2),
        (32, "D4", 4), (36, "Bb3", 4),
        (40, "C4", 4), (44, "D4", 4),
        (48, "Eb4", 2), (50, "D4", 2), (52, "C4", 4),
        (56, "Bb3", 4), (60, "G3", 4),
    ]
    for off, note, d in autumn:
        v = arc_vel(int(off // 4))
        strings.strings(off, n(note), d, vel=v * 0.38)

    stems = {"strings": strings, "choir": choir, "mist": mist,
             "bass": bass, "warhorn": warhorn}
    for s in stems.values():
        s.trim()
    return ("the-autumn-campaign", stems,
            {"strings": 0.88, "choir": 0.85, "mist": 0.72,
             "bass": 0.9, "warhorn": 0.88}, False)


# ======================================================= DRUMS-OF-THE-RED-SUN
# The sun rises red over the field: today the army moves, and it does not stop.
# D minor, 136 BPM. 16 bars. Arc: dawn -> the assault -> embers.
# Dm Bb F C.
def drums_of_the_red_sun():
    bpm = 136
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    warhorn = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [Dm, Bb, F, C] * 4
    roots = [n("D2"), n("Bb1"), n("F1"), n("C2")] * 4

    def arc_vel(i):
        if i < 3:
            return 0.50 + i * 0.14    # dawn
        if i < 12:
            return 1.0                # the assault
        return 1.0 - (i - 12) * 0.16  # embers

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the red heartbeat: war drums, no rest
        drums.taiko(b, vel=v * 0.60)
        drums.taiko(b + 0.5, vel=v * 0.50)
        drums.taiko(b + 1, vel=v * 0.60)
        drums.taiko(b + 1.5, vel=v * 0.50)
        drums.taiko(b + 2, vel=v * 0.60)
        drums.taiko(b + 2.5, vel=v * 0.50)
        drums.taiko(b + 3, vel=v * 0.56)
        drums.taiko(b + 3.5, vel=v * 0.48)
        drums.kick(b + 0.25, vel=v * 0.52)
        drums.kick(b + 2.25, vel=v * 0.52)
        drums.snare(b + 1.25, vel=v * 0.44)
        drums.snare(b + 3.25, vel=v * 0.44)
        if i >= 3 and i < 12:
            for k in range(16):
                drums.hat(b + k * 0.25, vel=v * 0.22)
        if i == 3:
            drums.crash(b, vel=0.68)
        # the red banners: brass like a rising sun
        if i >= 2 and i < 12:
            brass.brass(b, ch[0], 0.5, vel=v * 0.46)
            brass.brass(b + 1, ch[2], 0.5, vel=v * 0.42)
            brass.brass(b + 2, ch[1], 0.5, vel=v * 0.46)
            brass.brass(b + 3, ch[0], 0.5, vel=v * 0.42)
        # the dawn-horn: one long note per bar
        if i >= 2:
            warhorn.warhorn(b, ch[0] - 24, 4.0, vel=v * 0.40)
        # the earth answers: pounding roots
        for k in range(8):
            bass.bass(b + k * 0.5, root - 24, 0.4, vel=v * 0.56,
                      cutoff=380)

    # the red call: four notes against the sunrise
    call = [
        (12, "D4", 2), (14, "F4", 2),
        (16, "A4", 4),
        (24, "G4", 2), (26, "F4", 2),
        (28, "E4", 4),
        (36, "F4", 2), (38, "E4", 2),
        (40, "D4", 8),
    ]
    for off, note, d in call:
        v = arc_vel(int(off // 4))
        warhorn.warhorn(off, n(note) - 12, d, vel=v * 0.42)

    stems = {"drums": drums, "brass": brass, "warhorn": warhorn,
             "bass": bass}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-red-sun", stems,
            {"drums": 0.95, "brass": 0.9, "warhorn": 0.88,
             "bass": 0.9}, False)


# ============================================================ THE-SUMMER-FAIR
# Bunting, barrels, buskers: the whole town is out and nobody is in a hurry.
# C major, 104 BPM. 16 bars. Loop (sample-exact).
# C G Am F.
def the_summer_fair():
    bpm = 104
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [C, G, Am, F] * 4
    roots = [n("C2"), n("G1"), n("A1"), n("F1")] * 4

    v = 0.88
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the crowd: bright string figures, always moving
        fig = [0, 1, 2, 1, 0, 2, 1, 2]
        for k in range(8):
            strings.strings(b + k * 0.5, ch[fig[k]] + 12, 0.5,
                            vel=v * 0.34)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.24)
        # the piper leads the children
        flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.38)
        flute.flute(b + 2, ch[0] + 12, 2.0, vel=v * 0.34)
        # coins in the fountain: lyre sparkle
        lyre.lyre(b + 0.5, ch[0] + 36, 1, vel=v * 0.26)
        lyre.lyre(b + 1.5, ch[2] + 36, 1, vel=v * 0.24)
        lyre.lyre(b + 2.5, ch[1] + 36, 1, vel=v * 0.26)
        lyre.lyre(b + 3.5, ch[0] + 36, 1, vel=v * 0.24)
        # the dance floor: bouncing bass
        for k in range(4):
            bass.bass(b + k, root - 12, 0.8, vel=v * 0.54, cutoff=540)
        # the drum circle keeps time
        drums.taiko(b, vel=v * 0.44)
        drums.taiko(b + 2, vel=v * 0.44)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.20)

    # an original fair-song: the tune every stall is humming
    fair = [
        (0, "G4", 1), (1, "A4", 1), (2, "C5", 2),
        (4, "B4", 1), (5, "A4", 1), (6, "G4", 2),
        (8, "E4", 2), (10, "G4", 2), (12, "A4", 4),
        (16, "C5", 2), (18, "D5", 2), (20, "E5", 4),
        (24, "D5", 2), (26, "C5", 2), (28, "A4", 4),
        (32, "G4", 2), (34, "E4", 2), (36, "G4", 4),
        (40, "A4", 2), (42, "C5", 2), (44, "B4", 4),
        (48, "A4", 2), (50, "G4", 2), (52, "E4", 2), (54, "D4", 2),
        (56, "C4", 4), (60, "G4", 4),
    ]
    for off, note, d in fair:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "flute": flute, "lyre": lyre,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-summer-fair", stems,
            {"strings": 0.88, "flute": 0.9, "lyre": 0.82,
             "bass": 0.9, "drums": 0.86}, True)


# ======================================================= BALLADS-OF-THE-BORDER
# A lone singer by the fire, and the whole company listening: the old songs
# of the marches, sung the way they were always sung.
# A major, 96 BPM. 16 bars. Loop (sample-exact).
# A F#m D E.
def ballads_of_the_border():
    bpm = 96
    bars = 16
    total = bars * 4
    flute = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    harpsi = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [A, Fsm, D, E] * 4
    roots = [n("A1"), n("F#1"), n("D2"), n("E2")] * 4

    v = 0.86
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the firelight: warm low pads
        for m in ch:
            strings.strings(b, m, 4.4, vel=v * 0.28)
            strings.strings(b, m + 12, 4.4, vel=v * 0.22)
        # the singer's voice: a flute where the words would be
        flute.flute(b, ch[2], 3.0, vel=v * 0.40)
        # the old harp answers between verses
        if i % 2 == 1:
            lyre.lyre(b + 1, ch[0] + 24, 2.0, vel=v * 0.30)
            lyre.lyre(b + 3, ch[2] + 24, 2.0, vel=v * 0.28)
        # the ground-bass of the old songs
        bass.bass(b, root - 12, 3.6, vel=v * 0.50, cutoff=420)
        # the inn's old keyboard keeps the changes
        harpsi.harpsi(b, ch[0] + 12, 2, vel=v * 0.24)
        harpsi.harpsi(b + 2, ch[1] + 12, 2, vel=v * 0.22)

    # an original border-ballad: plain, patient, and it stays with you
    ballad = [
        (0, "E4", 3), (4, "F#4", 1), (5, "E4", 2), (8, "C#4", 4),
        (12, "D4", 6), (20, "C#4", 2),
        (24, "B3", 4), (28, "C#4", 4),
        (32, "D4", 2), (34, "E4", 2), (36, "F#4", 4),
        (40, "E4", 6), (48, "D4", 2), (50, "C#4", 2),
        (52, "B3", 4), (56, "A3", 4), (60, "B3", 4),
    ]
    for off, note, d in ballad:
        flute.flute(off, n(note), d, vel=v * 0.44)

    stems = {"flute": flute, "strings": strings, "lyre": lyre,
             "bass": bass, "harpsi": harpsi}
    for s in stems.values():
        s.trim()
    return ("ballads-of-the-border", stems,
            {"flute": 0.9, "strings": 0.86, "lyre": 0.84,
             "bass": 0.9, "harpsi": 0.8}, True)


# ============================================================ THE-IRON-CROWN
# It is heavy, and it does not come off: the weight of the crown on one head,
# and on every head beneath it.
# E minor, 80 BPM. 16 bars. Arc: the coronation -> the iron years -> the fall.
# Em C G D.
def the_iron_crown():
    bpm = 80
    bars = 16
    total = bars * 4
    brass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, C, G, D] * 4
    roots = [n("E1"), n("C2"), n("G1"), n("D2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.06    # the coronation
        if i < 12:
            return 1.0                # the iron years
        return 1.0 - (i - 12) * 0.14  # the fall

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the weight itself: brass chords like iron bars
        brass.brass(b, ch[0], 2.0, vel=v * 0.44)
        brass.brass(b + 2, ch[1], 2.0, vel=v * 0.40)
        # the court's bright face: strings over the iron
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.26)
        if i >= 4 and i < 12:
            grind = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24]
            for k, m in enumerate(grind):
                strings.strings(b + k, m, 1.0, vel=v * 0.34)
        # the whispered prayers of the ruled
        if i >= 2:
            for m in ch:
                choir.choir(b, m - 12, 4.2, vel=v * 0.28)
        # the deep foundation: it does not move
        bass.bass(b, root - 24, 3.6, vel=v * 0.56, cutoff=360)
        # the slow drum of state
        drums.taiko(b, vel=v * 0.52)
        drums.taiko(b + 2, vel=v * 0.48)
        if i >= 4 and i < 12:
            drums.snare(b + 1, vel=v * 0.40)
            drums.snare(b + 3, vel=v * 0.40)

    # an original crown-theme: it rises, and it does not bend
    crown = [
        (0, "B3", 4), (8, "C4", 4),
        (16, "D4", 4), (24, "B3", 4),
        (32, "C4", 6), (40, "A3", 2),
        (48, "B3", 4), (56, "G3", 8),
    ]
    for off, note, d in crown:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.42)

    stems = {"brass": brass, "strings": strings, "choir": choir,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-iron-crown", stems,
            {"brass": 0.9, "strings": 0.86, "choir": 0.84,
             "bass": 0.9, "drums": 0.9}, False)


# ======================================================= WALTZ-OF-THE-COURTIERS
# Candlelight, polished floors, and a hundred practiced smiles: the court
# dances while the kingdom holds its breath.
# F major, 90 BPM, 3/4. 16 bars of 3 beats. Loop (sample-exact).
# F Dm Bb C.
def waltz_of_the_courtiers():
    bpm = 90
    bars = 16
    beats_per_bar = 3
    total = bars * beats_per_bar
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    harpsi = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    celesta = VoiceTrack(bpm, total)

    def bar(i):
        return i * beats_per_bar

    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [F, Dm, Bb, C] * 4
    roots = [n("F1"), n("D2"), n("Bb1"), n("C2")] * 4

    v = 0.87
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # oom-pah-pah: the whole court knows the step
        bass.bass(b, root - 12, 0.9, vel=v * 0.56, cutoff=480)
        for k, m in enumerate([ch[1] + 12, ch[2] + 12]):
            strings.strings(b + 1 + k, m, 0.9, vel=v * 0.30)
        # the violins sweep the dancers round
        for m in ch:
            strings.strings(b, m + 12, 3.2, vel=v * 0.26)
        sweep = [ch[0] + 12, ch[1] + 12, ch[2] + 12,
                 ch[2] + 12, ch[1] + 12, ch[0] + 12]
        for k in range(6):
            strings.strings(b + k * 0.5, sweep[k], 0.5, vel=v * 0.30)
        # the flute leads the first dancers
        flute.flute(b, ch[2] + 12, 1.5, vel=v * 0.38)
        flute.flute(b + 1.5, ch[0] + 12, 1.5, vel=v * 0.34)
        # the old harpsichord in the corner
        harpsi.harpsi(b + 1, ch[1] + 12, 1, vel=v * 0.24)
        harpsi.harpsi(b + 2, ch[2] + 12, 1, vel=v * 0.22)
        # candle-glint: celesta on the downbeat of every other bar
        if i % 2 == 0:
            celesta.celesta(b, ch[0] + 36, 1, vel=v * 0.22)

    # an original waltz-tune: three steps, turn, and three steps back
    waltz = [
        (0, "A4", 1), (1, "C5", 1), (2, "F5", 1),
        (3, "E5", 1.5), (4.5, "D5", 1.5),
        (6, "C5", 1), (7, "D5", 1), (8, "E5", 1),
        (9, "F5", 3),
        (12, "G5", 1), (13, "F5", 1), (14, "E5", 1),
        (15, "D5", 1.5), (16.5, "C5", 1.5),
        (18, "Bb4", 1), (19, "A4", 1), (20, "G4", 1),
        (21, "A4", 3),
        (24, "C5", 1), (25, "D5", 1), (26, "E5", 1),
        (27, "F5", 1.5), (28.5, "E5", 1.5),
        (30, "D5", 1), (31, "C5", 1), (32, "Bb4", 1),
        (33, "A4", 3),
        (36, "G4", 1), (37, "A4", 1), (38, "Bb4", 1),
        (39, "C5", 1.5), (40.5, "Bb4", 1.5),
        (42, "A4", 1), (43, "G4", 1), (44, "F4", 1),
        (45, "F4", 3),
    ]
    for off, note, d in waltz:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "flute": flute, "harpsi": harpsi,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("waltz-of-the-courtiers", stems,
            {"strings": 0.88, "flute": 0.9, "harpsi": 0.82,
             "bass": 0.9, "celesta": 0.78}, True)


# ============================================================ render
TRACKS = [
    (the_autumn_campaign, 0.20),
    (drums_of_the_red_sun, 0.24),
    (the_summer_fair, 0.16),
    (ballads_of_the_border, 0.16),
    (the_iron_crown, 0.20),
    (waltz_of_the_courtiers, 0.18),
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
