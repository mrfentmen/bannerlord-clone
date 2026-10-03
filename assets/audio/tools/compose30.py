"""Thirtieth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-29 moods already covered - do not duplicate):
  the-hollow-crown, drums-of-the-deep-earth, the-silver-lining,
  whispers-in-the-court, the-glass-throne, storm-of-arrows.
Render: python3 compose30.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
import compose27 as c27
from compose27 import VoiceTrack, Track, n

OUT = "/home/hatch/workspace/staging/music30/out"
MP3 = "/home/hatch/workspace/staging/music30/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ============================================================ THE-HOLLOW-CROWN
# The throne stands empty: courtiers bow to a chair of dust.
# A minor, 70 BPM. 16 bars. Arc: vacancy -> false coronation -> emptiness.
# Am Dm E Am / Am F C G / Am Dm E Am / F G Am Am.
def the_hollow_crown():
    bpm = 70
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    mist = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Am, Dm, E, Am, Am, F, C, G, Am, Dm, E, Am, F, G, Am, Am]
    roots = [n("A2"), n("D2"), n("E2"), n("A2"), n("A2"), n("F2"),
             n("C2"), n("G2"), n("A2"), n("D2"), n("E2"), n("A2"),
             n("F2"), n("G2"), n("A2"), n("A2")]

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.06     # the vacancy
        if i < 11:
            return 0.62 + (i - 4) / 7 * 0.28  # a false coronation
        return 1.0 - (i - 11) * 0.12  # emptiness again

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the absent king's hall: thin air, always present
        mist.mist(b, 4, vel=v * 0.28, seed=i)
        # the court sings to nobody
        for m in ch:
            choir.choir(b, m + 12, 4.4, vel=v * 0.30)
        # low throne-room drone
        for m in ch:
            strings.strings(b, m - 12, 4.4, vel=v * 0.30)
        # the hollow pedal
        bass.bass(b, root - 12, 3.6, vel=v * 0.50, cutoff=380)

    # the empty crown's theme: an original falling line, never answered
    theme = [
        (0, "A4", 4), (4, "G4", 3), (7, "F4", 1),
        (8, "E4", 4),
        (16, "B4", 3), (19, "A4", 1), (20, "G4", 4),
        (24, "A4", 8),
        (32, "C5", 3), (35, "B4", 1), (36, "A4", 4),
        (40, "G#4", 8),
        (48, "B4", 2), (50, "C5", 2), (52, "D5", 4),
        (56, "A4", 8),
    ]
    for off, note, d in theme:
        v = arc_vel(int(off // 4))
        strings.strings(off, n(note), d, vel=v * 0.40)

    stems = {"strings": strings, "choir": choir, "mist": mist, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-hollow-crown", stems,
            {"strings": 0.88, "choir": 0.85, "mist": 0.72,
             "bass": 0.9}, False)


# ==================================================== DRUMS-OF-THE-DEEP-EARTH
# Beneath the city: war-drums in the dark where the sun never reaches.
# D minor, 128 BPM. 16 bars. Arc: rumble -> fury -> dust.
# Dm Bb F C.
def drums_of_the_deep_earth():
    bpm = 128
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    thunder = VoiceTrack(bpm, total)
    warhorn = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [Dm, Bb, F, C] * 4
    roots = [n("D2"), n("Bb1"), n("F2"), n("C2")] * 4

    def arc_vel(i):
        if i < 3:
            return 0.50 + i * 0.12    # the rumble
        if i < 11:
            return 1.0                # the fury
        return 1.0 - (i - 11) * 0.12  # the dust

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the deep drums: bone on hide
        drums.taiko(b, vel=v * 0.62)
        drums.taiko(b + 1.5, vel=v * 0.55)
        drums.taiko(b + 2, vel=v * 0.62)
        drums.taiko(b + 3.5, vel=v * 0.55)
        drums.kick(b + 0.5, vel=v * 0.58)
        drums.kick(b + 2.5, vel=v * 0.58)
        drums.snare(b + 1, vel=v * 0.48)
        drums.snare(b + 3, vel=v * 0.48)
        drums.tom(b + 3.25, freq=90, vel=v * 0.50)
        if i >= 3 and i < 11:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.26)
        if i == 3:
            drums.crash(b, vel=0.70)
        # the earth itself groans
        thunder.thunder(b, 5, vel=v * 0.40, seed=i)
        # the deep horns warn of the coming war
        if i >= 2:
            warhorn.warhorn(b, ch[0] - 12, 3.0, vel=v * 0.42)
            if i % 2 == 0:
                warhorn.warhorn(b + 2, ch[2] - 12, 2.0, vel=v * 0.38)
        # the march below: driving 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.56,
                      cutoff=520)

    stems = {"drums": drums, "thunder": thunder, "warhorn": warhorn,
             "bass": bass}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-deep-earth", stems,
            {"drums": 0.95, "thunder": 0.85, "warhorn": 0.88,
             "bass": 0.9}, False)


# ============================================================ THE-SILVER-LINING
# First light on the field: the worst night ends, and someone still stands.
# F major, 92 BPM. 16 bars. Loop (sample-exact).
# F Dm Bb C.
def the_silver_lining():
    bpm = 92
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    celesta = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [F, Dm, Bb, C] * 4
    roots = [n("F2"), n("D2"), n("Bb1"), n("C2")] * 4

    v = 0.88
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the rising sun: arching strings, then held warmth
        if i % 2 == 0:
            arch = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[2] + 36,
                    ch[1] + 36, ch[0] + 36, ch[1] + 24, ch[0] + 24]
            for k, m in enumerate(arch):
                strings.strings(b + k * 0.5, m, 0.6, vel=v * 0.36)
        else:
            for m in ch:
                strings.strings(b, m + 12, 4.4, vel=v * 0.32)
        # the grateful voices
        for m in ch:
            choir.choir(b, m + 12, 3.8, vel=v * 0.32)
        # first light on the brass of the bells
        celesta.celesta(b + 1, ch[2] + 24, 1, vel=v * 0.28)
        celesta.celesta(b + 3, ch[0] + 36, 1, vel=v * 0.24)
        # the ground beneath: steady
        bass.bass(b, root - 12, 3.6, vel=v * 0.52, cutoff=480)

    # an original dawn-song: simple, open, ascending
    dawn = [
        (0, "F4", 2), (2, "G4", 2), (4, "A4", 2), (6, "C5", 2),
        (8, "A4", 4), (12, "G4", 2), (14, "F4", 2),
        (16, "G4", 2), (18, "A4", 2), (20, "Bb4", 2), (22, "A4", 2),
        (24, "G4", 4), (28, "F4", 2), (30, "E4", 2),
        (32, "F4", 4), (36, "C5", 4),
        (40, "Bb4", 2), (42, "A4", 2), (44, "G4", 4),
        (48, "A4", 2), (50, "C5", 2), (52, "D5", 4),
        (56, "C5", 2), (58, "Bb4", 2), (60, "A4", 4),
    ]
    for off, note, d in dawn:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "flute": flute, "choir": choir,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("the-silver-lining", stems,
            {"strings": 0.86, "flute": 0.9, "choir": 0.85,
             "bass": 0.9, "celesta": 0.8}, True)


# ========================================================= WHISPERS-IN-THE-COURT
# Behind every throne: letters passed in sleeves, knives named politely.
# G minor, 98 BPM. 16 bars. Loop (sample-exact).
# Gm Eb Bb D.
def whispers_in_the_court():
    bpm = 98
    bars = 16
    total = bars * 4
    mist = VoiceTrack(bpm, total)
    harpsi = VoiceTrack(bpm, total)
    solo = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Gm, Eb, Bb, D] * 4
    roots = [n("G2"), n("Eb2"), n("Bb2"), n("D2")] * 4

    v = 0.85
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the fog of court: nobody is ever quite alone
        mist.mist(b, 4, vel=v * 0.30, seed=i)
        # the intrigue: restless broken-chord figures, shifting each bar
        pat = [0, 1, 2, 1, 0, 2, 1, 2]
        for k in range(8):
            harpsi.harpsi(b + k * 0.5, ch[pat[k]] + 12, 0.5,
                          vel=v * 0.34)
        # the conspirators' bed: half-note pulses
        bass.bass(b, root - 12, 1.8, vel=v * 0.50, cutoff=420)
        bass.bass(b + 2, root - 12, 1.8, vel=v * 0.46, cutoff=420)
        # low, watchful strings
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.28)

    # an original whispered confession: fragments, never whole
    confession = [
        (2, "D5", 2), (6, "C5", 1), (10, "Bb4", 2), (14, "A4", 1),
        (18, "G4", 2), (22, "F#4", 2), (26, "G4", 4),
        (34, "Bb4", 2), (38, "A4", 2), (42, "G4", 2), (46, "F#4", 2),
        (50, "D5", 4), (54, "C5", 4),
        (58, "D5", 2), (60, "Eb5", 2), (62, "D5", 4),
    ]
    for off, note, d in confession:
        solo.solo(off, n(note), d, vel=v * 0.38)

    stems = {"mist": mist, "harpsi": harpsi, "solo": solo,
             "bass": bass, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("whispers-in-the-court", stems,
            {"mist": 0.85, "harpsi": 0.88, "solo": 0.9,
             "bass": 0.9, "strings": 0.82}, True)


# ============================================================ THE-GLASS-THRONE
# Power you can see through: beautiful, cold, one crack from ruin.
# C major, 86 BPM. 16 bars. Loop (sample-exact).
# C Am F G.
def the_glass_throne():
    bpm = 86
    bars = 16
    total = bars * 4
    celesta = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("E3"), n("G3")]
    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [C, Am, F, G] * 4
    roots = [n("C2"), n("A2"), n("F2"), n("G2")] * 4

    v = 0.85
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the glass itself: 8th arpeggios, light through facets
        arp = [0, 1, 2, 1, 2, 1, 0, 1]
        for k in range(8):
            celesta.celesta(b + k * 0.5, ch[arp[k]] + 24, 0.5,
                            vel=v * 0.30)
        # the fragile warmth beneath
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.30)
        # lyre sparkle on the off-beats
        lyre.lyre(b + 1.5, ch[2] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 3.5, ch[0] + 36, 1, vel=v * 0.24)
        # the hairline foundation
        bass.bass(b, root - 12, 3.6, vel=v * 0.50, cutoff=500)

    # an original fragile line: high, breath-held, never loud
    glassline = [
        (0, "G4", 3), (4, "A4", 3), (8, "B4", 3), (12, "C5", 3),
        (16, "D5", 4), (24, "E5", 4),
        (32, "D5", 3), (36, "C5", 3), (40, "B4", 4),
        (48, "A4", 3), (52, "G4", 3), (56, "E4", 4), (60, "D4", 4),
    ]
    for off, note, d in glassline:
        flute.flute(off, n(note), d, vel=v * 0.36)

    stems = {"celesta": celesta, "strings": strings, "flute": flute,
             "lyre": lyre, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-glass-throne", stems,
            {"celesta": 0.85, "strings": 0.85, "flute": 0.88,
             "lyre": 0.8, "bass": 0.9}, True)


# ============================================================ STORM-OF-ARROWS
# The sky goes black at noon: ten thousand shafts, one command.
# E minor, 144 BPM. 16 bars. Arc: the volley rises -> the storm -> silence.
# Em Bm C D.
def storm_of_arrows():
    bpm = 144
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)
    warhorn = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, Bm, C, D] * 4
    roots = [n("E2"), n("B2"), n("C2"), n("D2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.08    # the volley rises
        if i < 12:
            return 1.0                # the storm
        return 1.0 - (i - 12) * 0.13  # the silence after

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the volley drums: war march, relentless
        drums.kick(b, vel=v * 0.62)
        drums.snare(b + 1, vel=v * 0.50)
        drums.kick(b + 2, vel=v * 0.62)
        drums.snare(b + 3, vel=v * 0.50)
        drums.taiko(b + 0.5, vel=v * 0.50)
        drums.taiko(b + 2.5, vel=v * 0.50)
        if i >= 4 and i < 12:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.28)
            drums.snare(b + 1.5, vel=v * 0.44)
            drums.snare(b + 3.5, vel=v * 0.44)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the brazen volley: stabs on every beat
        if i >= 2:
            brass.brass(b, ch[0], 0.5, vel=v * 0.46)
            brass.brass(b + 1, ch[1], 0.5, vel=v * 0.42)
            brass.brass(b + 2, ch[2], 0.5, vel=v * 0.46)
            brass.brass(b + 3, ch[1], 0.5, vel=v * 0.42)
        # the storm itself: string ostinato
        if i >= 4 and i < 12:
            ost = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 24]
            for k in range(8):
                strings.strings(b + k * 0.5, ost[k % 4], 0.5,
                                vel=v * 0.38)
        else:
            for m in ch:
                strings.strings(b, m + 12, 4.4, vel=v * 0.30)
        # the sky-horns
        if i >= 2 and i % 2 == 0:
            warhorn.warhorn(b, ch[0] - 12, 2.5, vel=v * 0.42)
        # the advance: driving 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.58,
                      cutoff=560)

    # the arrow-song: an original rising call that never resolves
    arrow = [
        (16, "E4", 2), (18, "F#4", 2), (20, "G4", 2), (22, "A4", 2),
        (24, "B4", 4), (28, "A4", 2), (30, "G4", 2),
        (32, "A4", 2), (34, "B4", 2), (36, "C5", 2), (38, "D5", 2),
        (40, "E5", 4), (44, "D5", 2), (46, "C5", 2),
        (48, "B4", 2), (50, "A4", 2), (52, "G4", 2), (54, "F#4", 2),
        (56, "E4", 4),
    ]
    for off, note, d in arrow:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.52,
                   vibrato=5.5, vib_depth=7.0)

    stems = {"drums": drums, "brass": brass, "strings": strings,
             "warhorn": warhorn, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("storm-of-arrows", stems,
            {"drums": 0.95, "brass": 0.92, "strings": 0.86,
             "warhorn": 0.88, "bass": 0.9}, False)


# ============================================================ render
TRACKS = [
    (the_hollow_crown, 0.20),
    (drums_of_the_deep_earth, 0.24),
    (the_silver_lining, 0.16),
    (whispers_in_the_court, 0.16),
    (the_glass_throne, 0.16),
    (storm_of_arrows, 0.24),
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
