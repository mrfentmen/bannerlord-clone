"""Thirty-first batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-30 moods already covered - do not duplicate):
  the-fading-light, drums-of-the-mountain-pass, the-golden-harvest,
  echoes-in-the-vault, the-crimson-banner, lullaby-of-the-steppe.
Render: python3 compose31.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
import compose27 as c27
from compose27 import VoiceTrack, Track, n

OUT = "/home/hatch/workspace/staging/music31/out"
MP3 = "/home/hatch/workspace/staging/music31/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ============================================================ THE-FADING-LIGHT
# Dusk settles on the campaign: banners lose their colour, one by one.
# D minor, 66 BPM. 16 bars. Arc: twilight -> last light -> nightfall.
# Dm Gm Bb A.
def the_fading_light():
    bpm = 66
    bars = 16
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    mist = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

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
            return 0.52 + i * 0.05     # the twilight
        if i < 11:
            return 0.72 + (i - 4) / 7 * 0.28  # the last light
        return 1.0 - (i - 11) * 0.14  # the nightfall

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the dark settling in: thin air under everything
        mist.mist(b, 4, vel=v * 0.28, seed=i)
        # voices thinning with the light
        for m in ch:
            choir.choir(b, m + 12, 4.4, vel=v * 0.30)
        # the day's last warmth in the low strings
        for m in ch:
            strings.strings(b, m - 12, 4.4, vel=v * 0.30)
        # the sinking pedal
        bass.bass(b, root - 12, 3.6, vel=v * 0.50, cutoff=380)

    # an original dusk-line: falling, never quite landing
    dusk = [
        (0, "A4", 4), (4, "F4", 3), (7, "D4", 1),
        (8, "C4", 4),
        (16, "D4", 3), (19, "C4", 1), (20, "Bb3", 4),
        (24, "A3", 8),
        (32, "C4", 3), (35, "D4", 1), (36, "F4", 4),
        (40, "E4", 8),
        (48, "D4", 2), (50, "C4", 2), (52, "Bb3", 4),
        (56, "A3", 8),
    ]
    for off, note, d in dusk:
        v = arc_vel(int(off // 4))
        strings.strings(off, n(note), d, vel=v * 0.40)

    stems = {"strings": strings, "choir": choir, "mist": mist, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-fading-light", stems,
            {"strings": 0.88, "choir": 0.85, "mist": 0.72,
             "bass": 0.9}, False)


# ================================================= DRUMS-OF-THE-MOUNTAIN-PASS
# An army climbs where the air is thin: drums echo off the cliffs.
# E minor, 132 BPM. 16 bars. Arc: the ascent -> the battle -> the descent.
# Em D C B.
def drums_of_the_mountain_pass():
    bpm = 132
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    warhorn = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    D = [n("D3"), n("F#3"), n("A3")]
    C = [n("C3"), n("E3"), n("G3")]
    B = [n("B2"), n("D#3"), n("F#3")]
    prog = [Em, D, C, B] * 4
    roots = [n("E2"), n("D2"), n("C2"), n("B1")] * 4

    def arc_vel(i):
        if i < 3:
            return 0.50 + i * 0.12    # the ascent
        if i < 11:
            return 1.0                # the battle
        return 1.0 - (i - 11) * 0.12  # the descent

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the mountain drums: bone on hide, echoing
        drums.taiko(b, vel=v * 0.62)
        drums.taiko(b + 1.5, vel=v * 0.55)
        drums.taiko(b + 2, vel=v * 0.62)
        drums.taiko(b + 3.5, vel=v * 0.55)
        drums.kick(b + 0.5, vel=v * 0.58)
        drums.kick(b + 2.5, vel=v * 0.58)
        drums.snare(b + 1, vel=v * 0.48)
        drums.snare(b + 3, vel=v * 0.48)
        drums.tom(b + 3.25, freq=95, vel=v * 0.50)
        if i >= 3 and i < 11:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.26)
        if i == 3:
            drums.crash(b, vel=0.70)
        # the cliff-horns sound the attack
        if i >= 2:
            warhorn.warhorn(b, ch[0] - 12, 3.0, vel=v * 0.42)
            if i % 2 == 0:
                warhorn.warhorn(b + 2, ch[2] - 12, 2.0, vel=v * 0.38)
        # the brazen advance: stabs on the off-beats
        if i >= 2 and i < 12:
            brass.brass(b + 0.5, ch[1], 0.5, vel=v * 0.44)
            brass.brass(b + 1.5, ch[2], 0.5, vel=v * 0.40)
            brass.brass(b + 2.5, ch[0], 0.5, vel=v * 0.44)
            brass.brass(b + 3.5, ch[1], 0.5, vel=v * 0.40)
        # the climb: driving 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.56,
                      cutoff=520)

    stems = {"drums": drums, "warhorn": warhorn, "brass": brass,
             "bass": bass}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-mountain-pass", stems,
            {"drums": 0.95, "warhorn": 0.88, "brass": 0.9,
             "bass": 0.9}, False)


# =========================================================== THE-GOLDEN-HARVEST
# Carts groan under the grain: the granaries are full, and so is the hall.
# G major, 88 BPM. 16 bars. Loop (sample-exact).
# G Em C D.
def the_golden_harvest():
    bpm = 88
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
    roots = [n("G2"), n("E2"), n("C2"), n("D2")] * 4

    v = 0.88
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the dance in the barn: bowing eighths
        bow = [0, 1, 2, 1, 0, 2, 1, 2]
        for k in range(8):
            strings.strings(b + k * 0.5, ch[bow[k]] + 12, 0.6,
                            vel=v * 0.36)
        # the harvest fiddles answer on the downbeats
        for m in ch:
            strings.strings(b, m + 24, 2.0, vel=v * 0.24)
        # the plenty-song on the pipes
        flute.flute(b, ch[2] + 12, 3.0, vel=v * 0.38)
        # lyre sparkle on the off-beats
        lyre.lyre(b + 1.5, ch[0] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 3.5, ch[2] + 36, 1, vel=v * 0.24)
        # the loaded carts: steady rolling
        bass.bass(b, root - 12, 1.8, vel=v * 0.52, cutoff=480)
        bass.bass(b + 2, root - 12, 1.8, vel=v * 0.48, cutoff=480)
        # the golden bells
        celesta.celesta(b + 2, ch[1] + 36, 1, vel=v * 0.26)

    # an original harvest-song: round, full, unhurried
    harvest = [
        (0, "G4", 2), (2, "A4", 2), (4, "B4", 2), (6, "D5", 2),
        (8, "B4", 4), (12, "A4", 2), (14, "G4", 2),
        (16, "A4", 2), (18, "B4", 2), (20, "C5", 2), (22, "B4", 2),
        (24, "A4", 4), (28, "G4", 2), (30, "F#4", 2),
        (32, "G4", 4), (36, "D5", 4),
        (40, "C5", 2), (42, "B4", 2), (44, "A4", 4),
        (48, "B4", 2), (50, "D5", 2), (52, "E5", 4),
        (56, "D5", 2), (58, "B4", 2), (60, "A4", 4),
    ]
    for off, note, d in harvest:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "flute": flute, "lyre": lyre,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("the-golden-harvest", stems,
            {"strings": 0.86, "flute": 0.9, "lyre": 0.82,
             "bass": 0.9, "celesta": 0.8}, True)


# ========================================================= ECHOES-IN-THE-VAULT
# Deep stone remembers: every oath ever sworn still rings here.
# A minor, 76 BPM. 16 bars. Loop (sample-exact).
# Am F Dm E.
def echoes_in_the_vault():
    bpm = 76
    bars = 16
    total = bars * 4
    mist = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    solo = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [Am, F, Dm, E] * 4
    roots = [n("A2"), n("F2"), n("D2"), n("E2")] * 4

    v = 0.85
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the vault's own breath: cold air, always
        mist.mist(b, 4, vel=v * 0.32, seed=i)
        # the sworn oaths: voices and their ghosts
        for m in ch:
            choir.choir(b, m + 12, 4.4, vel=v * 0.32)
            # the echo: a beat behind, fainter
            choir.choir(b + 2, m + 12, 3.4, vel=v * 0.18)
        # low strings holding the dark
        for m in ch:
            strings.strings(b, m - 12, 4.4, vel=v * 0.28)
        # the foundation stone
        bass.bass(b, root - 24, 3.6, vel=v * 0.52, cutoff=360)

    # an original memory-theme: a line and its own echo
    memory = [
        (0, "E4", 4), (8, "C4", 4),
        (16, "D4", 4), (24, "B3", 4),
        (32, "C4", 4), (40, "A3", 4),
        (48, "B3", 4), (56, "E4", 8),
    ]
    for off, note, d in memory:
        solo.solo(off, n(note), d, vel=v * 0.40)
        # the echo answers, softer, a beat later
        solo.solo(off + 2, n(note), max(d - 1, 2), vel=v * 0.20)

    stems = {"mist": mist, "choir": choir, "solo": solo,
             "bass": bass, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("echoes-in-the-vault", stems,
            {"mist": 0.85, "choir": 0.88, "solo": 0.9,
             "bass": 0.9, "strings": 0.82}, True)


# =========================================================== THE-CRIMSON-BANNER
# The war-flag is raised: no quarter asked, none given.
# C minor, 120 BPM. 16 bars. Arc: the muster -> unfurled -> flying.
# Cm Ab Eb Bb.
def the_crimson_banner():
    bpm = 120
    bars = 16
    total = bars * 4
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    prog = [Cm, Ab, Eb, Bb] * 4
    roots = [n("C2"), n("Ab2"), n("Eb2"), n("Bb1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.08    # the muster
        if i < 12:
            return 1.0                # unfurled
        return 1.0 - (i - 12) * 0.13  # flying

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the war drums: the heartbeat of the host
        drums.kick(b, vel=v * 0.62)
        drums.snare(b + 1, vel=v * 0.50)
        drums.kick(b + 2, vel=v * 0.62)
        drums.snare(b + 3, vel=v * 0.50)
        drums.taiko(b + 0.5, vel=v * 0.50)
        drums.taiko(b + 2.5, vel=v * 0.50)
        if i >= 4 and i < 12:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.28)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the banner's voice: brazen stabs
        if i >= 2:
            brass.brass(b, ch[0], 0.5, vel=v * 0.48)
            brass.brass(b + 1, ch[1], 0.5, vel=v * 0.44)
            brass.brass(b + 2, ch[2], 0.5, vel=v * 0.48)
            brass.brass(b + 3, ch[1], 0.5, vel=v * 0.44)
        # the defiant host: string ostinato
        if i >= 4 and i < 12:
            ost = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 24]
            for k in range(8):
                strings.strings(b + k * 0.5, ost[k % 4], 0.5,
                                vel=v * 0.38)
        else:
            for m in ch:
                strings.strings(b, m + 12, 4.4, vel=v * 0.30)
        # the oath of the host
        if i >= 4 and i < 12 and i % 2 == 0:
            for m in ch:
                choir.choir(b, m + 12, 3.4, vel=v * 0.32)
        # the march: driving 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.58,
                      cutoff=560)

    # the banner-call: an original rising defiance that holds
    call = [
        (16, "C4", 2), (18, "Eb4", 2), (20, "G4", 2), (22, "Ab4", 2),
        (24, "Bb4", 4), (28, "Ab4", 2), (30, "G4", 2),
        (32, "Eb4", 2), (34, "F4", 2), (36, "G4", 2), (38, "Bb4", 2),
        (40, "C5", 4), (44, "Bb4", 2), (46, "Ab4", 2),
        (48, "G4", 8),
    ]
    for off, note, d in call:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.52,
                   vibrato=5.5, vib_depth=7.0)

    stems = {"brass": brass, "drums": drums, "strings": strings,
             "choir": choir, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-crimson-banner", stems,
            {"brass": 0.92, "drums": 0.95, "strings": 0.86,
             "choir": 0.85, "bass": 0.9}, False)


# ======================================================= LULLABY-OF-THE-STEPPE
# The campfire burns low: horses shift in the dark, and the night is kind.
# F major, 72 BPM. 16 bars. Loop (sample-exact).
# F Bb Dm C.
def lullaby_of_the_steppe():
    bpm = 72
    bars = 16
    total = bars * 4
    flute = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    lyre = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    mist = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [F, Bb, Dm, C] * 4
    roots = [n("F2"), n("Bb1"), n("D2"), n("C2")] * 4

    v = 0.82
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the night air: soft, always
        mist.mist(b, 4, vel=v * 0.26, seed=i)
        # the cradle-rock: gentle half-note strings
        strings.strings(b, ch[0] + 12, 2.0, vel=v * 0.30)
        strings.strings(b + 2, ch[2] + 12, 2.0, vel=v * 0.26)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.22)
        # lyre like distant bells
        lyre.lyre(b + 1, ch[2] + 36, 2, vel=v * 0.24)
        lyre.lyre(b + 3, ch[0] + 36, 2, vel=v * 0.20)
        # the sleeping herd: low and slow
        bass.bass(b, root - 12, 3.6, vel=v * 0.48, cutoff=400)

    # an original steppe-lullaby: simple, rocking, endless
    lullaby = [
        (0, "F4", 3), (4, "G4", 3), (8, "A4", 3), (12, "G4", 3),
        (16, "F4", 4), (24, "D4", 4),
        (32, "F4", 3), (36, "A4", 3), (40, "G4", 4),
        (48, "F4", 3), (52, "E4", 3), (56, "D4", 4), (60, "C4", 4),
    ]
    for off, note, d in lullaby:
        flute.flute(off, n(note), d, vel=v * 0.38)

    stems = {"flute": flute, "strings": strings, "lyre": lyre,
             "bass": bass, "mist": mist}
    for s in stems.values():
        s.trim()
    return ("lullaby-of-the-steppe", stems,
            {"flute": 0.88, "strings": 0.85, "lyre": 0.8,
             "bass": 0.9, "mist": 0.75}, True)


# ============================================================ render
TRACKS = [
    (the_fading_light, 0.20),
    (drums_of_the_mountain_pass, 0.24),
    (the_golden_harvest, 0.16),
    (echoes_in_the_vault, 0.18),
    (the_crimson_banner, 0.22),
    (lullaby_of_the_steppe, 0.16),
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
