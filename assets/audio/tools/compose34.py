"""Thirty-fourth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-33 moods already covered - do not duplicate):
  the-winter-fair, drums-of-the-black-banner, the-homecoming-feast
  (renamed from the-harvest-home, which exists), laments-of-the-fallen,
  the-gilded-throne, ride-of-the-free-companies.
Render: python3 compose34.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
import compose27 as c27
from compose27 import VoiceTrack, Track, n

OUT = "/home/hatch/workspace/staging/music34/out"
MP3 = "/home/hatch/workspace/staging/music34/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ============================================================ THE-WINTER-FAIR
# Frost on the bunting, breath in the air: the town celebrates the deep of
# winter with music, mead, and a bonfire in the square.
# D major, 108 BPM. 16 bars. Loop (sample-exact).
# D G A Bm.
def the_winter_fair():
    bpm = 108
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    prog = [D, G, D, A, D, G, Bm, A] * 2
    roots = [n("D2"), n("G1"), n("D2"), n("A1"),
             n("D2"), n("G1"), n("B1"), n("A1")] * 2

    v = 0.88
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # skaters' feet: bright string eighths, crisp as frost
        fig = [0, 2, 1, 2, 0, 1, 2, 1]
        for k in range(8):
            strings.strings(b + k * 0.5, ch[fig[k]] + 12, 0.5,
                            vel=v * 0.34)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.24)
        # the ice-piper: a tune that steams in the cold
        flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.38)
        flute.flute(b + 2, ch[1] + 12, 2.0, vel=v * 0.34)
        # icicle glints: lyre on the off-beats
        lyre.lyre(b + 0.5, ch[0] + 36, 1, vel=v * 0.26)
        lyre.lyre(b + 1.5, ch[2] + 36, 1, vel=v * 0.24)
        lyre.lyre(b + 2.5, ch[1] + 36, 1, vel=v * 0.26)
        lyre.lyre(b + 3.5, ch[0] + 36, 1, vel=v * 0.24)
        # the bonfire's heartbeat: warm low pulse
        for k in range(4):
            bass.bass(b + k, root - 12, 0.8, vel=v * 0.54, cutoff=520)
        # hand-drums round the fire
        drums.taiko(b, vel=v * 0.44)
        drums.taiko(b + 2, vel=v * 0.44)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.20)

    # an original frost-song: it dances, and it does not slip
    frost = [
        (0, "A4", 1), (1, "B4", 1), (2, "D5", 2),
        (4, "C#5", 1), (5, "B4", 1), (6, "A4", 2),
        (8, "F#4", 2), (10, "A4", 2), (12, "B4", 4),
        (16, "D5", 2), (18, "E5", 2), (20, "F#5", 4),
        (24, "E5", 2), (26, "D5", 2), (28, "B4", 4),
        (32, "A4", 2), (34, "F#4", 2), (36, "A4", 4),
        (40, "B4", 2), (42, "D5", 2), (44, "C#5", 4),
        (48, "B4", 2), (50, "A4", 2), (52, "F#4", 2), (54, "E4", 2),
        (56, "D4", 4), (60, "A4", 4),
    ]
    for off, note, d in frost:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "flute": flute, "lyre": lyre,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-winter-fair", stems,
            {"strings": 0.88, "flute": 0.9, "lyre": 0.82,
             "bass": 0.9, "drums": 0.86}, True)


# ================================================== DRUMS-OF-THE-BLACK-BANNER
# No color but black on the field: the enemy comes without mercy and without
# quarter, and the drums say so.
# E minor, 140 BPM. 16 bars. Arc: the shadow -> the slaughter -> the silence.
# Em C G D.
def drums_of_the_black_banner():
    bpm = 140
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    warhorn = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, C, G, D] * 4
    roots = [n("E2"), n("C2"), n("G1"), n("D2")] * 4

    def arc_vel(i):
        if i < 3:
            return 0.50 + i * 0.14    # the shadow
        if i < 12:
            return 1.0                # the slaughter
        return 1.0 - (i - 12) * 0.16  # the silence

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the black heartbeat: war drums, relentless
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
        # the black cloth: brass like a closing door
        if i >= 2 and i < 12:
            brass.brass(b, ch[0], 0.5, vel=v * 0.46)
            brass.brass(b + 1, ch[2], 0.5, vel=v * 0.42)
            brass.brass(b + 2, ch[1], 0.5, vel=v * 0.46)
            brass.brass(b + 3, ch[0], 0.5, vel=v * 0.42)
        # the black horn: one dread note per bar
        if i >= 2:
            warhorn.warhorn(b, ch[0] - 24, 4.0, vel=v * 0.40)
        # the ground trembles: pounding roots
        for k in range(8):
            bass.bass(b + k * 0.5, root - 24, 0.4, vel=v * 0.56,
                      cutoff=380)

    # the black call: three notes, no mercy in them
    call = [
        (12, "E4", 2), (14, "G4", 2),
        (16, "B4", 4),
        (24, "A4", 2), (26, "G4", 2),
        (28, "F#4", 4),
        (36, "G4", 2), (38, "F#4", 2),
        (40, "E4", 8),
    ]
    for off, note, d in call:
        v = arc_vel(int(off // 4))
        warhorn.warhorn(off, n(note) - 12, d, vel=v * 0.42)

    stems = {"drums": drums, "brass": brass, "warhorn": warhorn,
             "bass": bass}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-black-banner", stems,
            {"drums": 0.95, "brass": 0.9, "warhorn": 0.88,
             "bass": 0.9}, False)


# ======================================================== THE-HOMECOMING-FEAST
# The wagons are in, the banners are down, and the tables are laid end to end:
# everyone who marched out has marched home.
# G major, 92 BPM. 16 bars. Loop (sample-exact).
# G Em C D.
def the_homecoming_feast():
    bpm = 92
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    celesta = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, Em, C, D] * 4
    roots = [n("G1"), n("E2"), n("C2"), n("D2")] * 4

    v = 0.88
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the long tables: warm string figures, generous and unhurried
        fig = [0, 1, 2, 1, 0, 2, 1, 2]
        for k in range(8):
            strings.strings(b + k * 0.5, ch[fig[k]] + 12, 0.6,
                            vel=v * 0.34)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.24)
        # the toast: the piper raises the cup in music
        flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.38)
        flute.flute(b + 2, ch[0] + 12, 2.0, vel=v * 0.34)
        # candlelight on the good silver: lyre sparkle
        lyre.lyre(b + 0.5, ch[0] + 36, 1, vel=v * 0.26)
        lyre.lyre(b + 1.5, ch[2] + 36, 1, vel=v * 0.24)
        lyre.lyre(b + 2.5, ch[1] + 36, 1, vel=v * 0.26)
        lyre.lyre(b + 3.5, ch[0] + 36, 1, vel=v * 0.24)
        # the full larder: deep contented bass
        for k in range(4):
            bass.bass(b + k, root - 12, 0.9, vel=v * 0.54, cutoff=500)
        # the blessing: celesta on every fourth bar
        if i % 4 == 0:
            celesta.celesta(b, ch[0] + 36, 1, vel=v * 0.22)
            celesta.celesta(b + 2, ch[2] + 36, 1, vel=v * 0.20)

    # an original home-song: the road was long, and the door is open
    home = [
        (0, "D4", 2), (2, "G4", 2), (4, "B4", 4),
        (8, "A4", 2), (10, "G4", 2), (12, "E4", 4),
        (16, "D4", 2), (18, "E4", 2), (20, "G4", 4),
        (24, "B4", 2), (26, "A4", 2), (28, "G4", 4),
        (32, "E4", 4), (36, "D4", 4),
        (40, "G4", 2), (42, "B4", 2), (44, "D5", 4),
        (48, "B4", 2), (50, "A4", 2), (52, "G4", 2), (54, "E4", 2),
        (56, "D4", 4), (60, "G4", 4),
    ]
    for off, note, d in home:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "flute": flute, "lyre": lyre,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("the-homecoming-feast", stems,
            {"strings": 0.88, "flute": 0.9, "lyre": 0.82,
             "bass": 0.9, "celesta": 0.78}, True)


# ======================================================= LAMENTS-OF-THE-FALLEN
# The names are read aloud, one by one, and the company stands in silence
# between each: this is what the victory cost.
# A minor, 64 BPM. 16 bars. Arc: the roll -> the grief -> the resolve.
# Am F C G.
def laments_of_the_fallen():
    bpm = 64
    bars = 16
    total = bars * 4
    choir = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    solo = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    mist = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Am, F, C, G] * 4
    roots = [n("A1"), n("F1"), n("C2"), n("G1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.05    # the roll
        if i < 12:
            return 0.95               # the grief
        return 0.95 - (i - 12) * 0.10  # the resolve

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the grey morning: mist over the field
        mist.wind(b, 4, vel=v * 0.26)
        mist.mist(b, 4, vel=v * 0.16, seed=i + 34)
        # the reading of the names: low voices, unhurried
        for m in ch:
            choir.choir(b, m - 12, 4.2, vel=v * 0.30)
        # the tears: strings in long descending lines
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.28)
        if i >= 4 and i < 12:
            weep = [ch[2] + 12, ch[1] + 12, ch[0] + 12, ch[0] + 12]
            for k, m in enumerate(weep):
                strings.strings(b + k, m, 1.0, vel=v * 0.36)
        # the earth takes them: deep slow roots
        bass.bass(b, root - 24, 3.6, vel=v * 0.52, cutoff=360)
        # one voice remembers each of them
        if i % 2 == 0:
            solo.solo(b + 1, ch[2], 2.5, vel=v * 0.34)

    # an original lament: it does not hurry, and it does not look away
    lament = [
        (0, "E4", 4), (8, "C4", 4),
        (16, "D4", 4), (24, "B3", 4),
        (32, "C4", 6), (40, "A3", 2),
        (48, "B3", 4), (56, "G3", 8),
    ]
    for off, note, d in lament:
        v = arc_vel(int(off // 4))
        solo.solo(off, n(note), d, vel=v * 0.40)

    stems = {"choir": choir, "strings": strings, "solo": solo,
             "bass": bass, "mist": mist}
    for s in stems.values():
        s.trim()
    return ("laments-of-the-fallen", stems,
            {"choir": 0.86, "strings": 0.86, "solo": 0.88,
             "bass": 0.9, "mist": 0.70}, False)


# =========================================================== THE-GILDED-THRONE
# Gold leaf, silk hangings, and a hundred candles: the court at its most
# splendid, and its most hollow.
# Bb major, 84 BPM. 16 bars. Loop (sample-exact).
# Bb Gm Eb F.
def the_gilded_throne():
    bpm = 84
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    harpsi = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    celesta = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Bb, Gm, Eb, F] * 4
    roots = [n("Bb1"), n("G1"), n("Eb2"), n("F1")] * 4

    v = 0.87
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the gilding: bright string figures, polished to a shine
        fig = [0, 2, 1, 2, 0, 1, 2, 1]
        for k in range(8):
            strings.strings(b + k * 0.5, ch[fig[k]] + 12, 0.5,
                            vel=v * 0.32)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.24)
        # the court's bright voice: flute over the gold
        flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.38)
        flute.flute(b + 2, ch[0] + 12, 2.0, vel=v * 0.34)
        # the old instrument in the corner: it has seen this before
        harpsi.harpsi(b, ch[0] + 12, 2, vel=v * 0.24)
        harpsi.harpsi(b + 2, ch[1] + 12, 2, vel=v * 0.22)
        # the weight beneath the shine: deep bass
        for k in range(4):
            bass.bass(b + k, root - 12, 0.9, vel=v * 0.54, cutoff=480)
        # candle-glint on gold: celesta
        if i % 2 == 0:
            celesta.celesta(b + 1, ch[2] + 36, 1, vel=v * 0.22)
            celesta.celesta(b + 3, ch[0] + 36, 1, vel=v * 0.20)

    # an original gilded tune: beautiful, and it knows it
    gilded = [
        (0, "F4", 2), (2, "G4", 2), (4, "Bb4", 4),
        (8, "A4", 2), (10, "G4", 2), (12, "F4", 4),
        (16, "D4", 2), (18, "F4", 2), (20, "G4", 4),
        (24, "Bb4", 2), (26, "A4", 2), (28, "G4", 4),
        (32, "F4", 4), (36, "D4", 4),
        (40, "Eb4", 2), (42, "F4", 2), (44, "G4", 4),
        (48, "F4", 2), (50, "D4", 2), (52, "Bb3", 2), (54, "C4", 2),
        (56, "D4", 4), (60, "F4", 4),
    ]
    for off, note, d in gilded:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "flute": flute, "harpsi": harpsi,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("the-gilded-throne", stems,
            {"strings": 0.88, "flute": 0.9, "harpsi": 0.82,
             "bass": 0.9, "celesta": 0.78}, True)


# ================================================== RIDE-OF-THE-FREE-COMPANIES
# They fight for coin, not for kings: the companies ride out at dawn with
# their own banners, their own songs, and no one's leave to ask.
# D major, 120 BPM. 16 bars. Arc: the muster -> the ride -> the pay-chest.
# D G A Bm.
def ride_of_the_free_companies():
    bpm = 120
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    flute = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    prog = [D, G, D, A, D, G, Bm, A] * 2
    roots = [n("D2"), n("G1"), n("D2"), n("A1"),
             n("D2"), n("G1"), n("B1"), n("A1")] * 2

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.06    # the muster
        if i < 12:
            return 1.0                # the ride
        return 1.0 - (i - 12) * 0.14  # the pay-chest

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the hoofbeat: the whole company moves as one
        for k in range(8):
            drums.taiko(b + k * 0.5, vel=v * (0.52 if k % 2 else 0.58))
        drums.snare(b + 1, vel=v * 0.40)
        drums.snare(b + 3, vel=v * 0.40)
        if i >= 4:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.22)
        # the companies' brass: bright, paid for, and proud of it
        if i >= 2 and i < 14:
            brass.brass(b, ch[0], 1.0, vel=v * 0.44)
            brass.brass(b + 2, ch[2], 1.0, vel=v * 0.40)
        # the fiddles keep the marching songs
        fig = [0, 1, 2, 1, 0, 2, 1, 2]
        for k in range(8):
            strings.strings(b + k * 0.5, ch[fig[k]] + 12, 0.5,
                            vel=v * (0.30 if i < 4 else 0.36))
        # the captain's pipe: it leads, the rest follow
        if i >= 2:
            flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.38)
        # the baggage train: rolling deep bass
        for k in range(4):
            bass.bass(b + k, root - 12, 0.9, vel=v * 0.56, cutoff=520)

    # an original company-song: they sing it on the march, and mean it
    company = [
        (8, "A4", 2), (10, "B4", 2), (12, "D5", 4),
        (16, "C#5", 2), (18, "B4", 2), (20, "A4", 4),
        (24, "F#4", 2), (26, "A4", 2), (28, "B4", 4),
        (32, "D5", 2), (34, "C#5", 2), (36, "B4", 4),
        (40, "A4", 2), (42, "F#4", 2), (44, "D4", 4),
        (48, "F#4", 4), (52, "A4", 4), (56, "D5", 8),
    ]
    for off, note, d in company:
        v = arc_vel(int(off // 4))
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "brass": brass, "drums": drums,
             "bass": bass, "flute": flute}
    for s in stems.values():
        s.trim()
    return ("ride-of-the-free-companies", stems,
            {"strings": 0.88, "brass": 0.88, "drums": 0.92,
             "bass": 0.9, "flute": 0.9}, False)


# ============================================================ render
TRACKS = [
    (the_winter_fair, 0.20),
    (drums_of_the_black_banner, 0.24),
    (the_homecoming_feast, 0.16),
    (laments_of_the_fallen, 0.20),
    (the_gilded_throne, 0.16),
    (ride_of_the_free_companies, 0.18),
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
