"""Ninth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-8 moods already covered - do not duplicate):
  ironhold, plague-wind, river-run, last-candle, thunder-court, new-horizon.
Render: python3 compose9.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it). Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import Track, reverb_stereo, limiter, write_wav, SR

OUT = "/home/hatch/workspace/staging/music9/out"
MP3 = "/home/hatch/workspace/staging/music9/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

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


def _seamless(x, fade_s=0.5):
    """Crossfade the tail into the head so the loop point is continuous:
    y[-1] == y[0] exactly (sample-exact loop)."""
    M = int(fade_s * SR)
    fade = np.linspace(0, 1, M)
    y = x.copy()
    head = np.empty(M)
    head[:-1] = x[1:M]
    head[-1] = x[0]
    y[-M:] = y[-M:] * (1 - fade) + head * fade
    return y


# ============================================================ IRONHOLD
# Fortress stronghold: immovable and proud. D major, 90 BPM. 16 bars. Loop.
# D major: D E F# G A B C# - a war-anthem progression under stone walls.
def ironhold():
    bpm = 90
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D2"), n("F#2"), n("A2")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    prog = [D, G, D, A, D, Bm, G, A,
            D, G, D, A, Bm, G, A, D]

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # iron march: weighty kick on every beat, taiko at bar starts
        for beat in range(4):
            drums.kick(b + beat, vel=0.85)
        drums.taiko(b, vel=0.9)
        if i in (0, 8):
            drums.crash(b, vel=0.5)
        if i >= 4:
            drums.snare(b + 1, vel=0.6)
            drums.snare(b + 3, vel=0.6)
        # proud brass chords on 1 and 3
        for m in ch:
            brass.brass(b, m + 12, 1.8, vel=0.7)
            brass.brass(b + 2, m + 12, 1.8, vel=0.55)
        # stone foundation roots
        bass.bass(b, root - 12, 2.0, vel=0.8, cutoff=350)
        bass.bass(b + 2, root - 12 + 7, 2.0, vel=0.7, cutoff=350)
        # banner pads across the wall
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.55, attack=1.0)

    # original stronghold fanfare: proud leaps of a fifth, stepwise answer
    fanfare = [
        (0, "D4", 1), (1, "E4", 1), (2, "F#4", 2),
        (4, "G4", 2), (6, "A4", 2),
        (8, "B4", 1.5), (9.5, "A4", 1), (10.5, "G4", 1.5),
        (12, "F#4", 4),
        (16, "G4", 1), (17, "A4", 1), (18, "B4", 2),
        (20, "A4", 2), (22, "G4", 2),
        (24, "F#4", 2), (26, "E4", 2),
        (28, "D4", 4),
        (32, "D5", 2), (34, "B4", 2),
        (36, "A4", 2), (38, "G4", 2),
        (40, "F#4", 2), (42, "E4", 2),
        (44, "D4", 4),
        (48, "E4", 1), (49, "F#4", 1), (50, "G4", 1), (51, "A4", 1),
        (52, "B4", 2), (54, "A4", 2),
        (56, "G4", 2), (58, "F#4", 2),
        (60, "D4", 4),
    ]
    for off, note, d in fanfare:
        lead.lead(off, n(note), d, vel=0.75, vibrato=5.0, vib_depth=5.0)

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "pads": pads, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("ironhold", stems,
            {"drums": 0.9, "brass": 0.9, "bass": 0.85,
             "pads": 0.6, "lead": 0.85}, True)


# ============================================================ PLAGUE-WIND
# Diseased lands: sickly unease. B diminished (B-D-F), 70 BPM. 12 bars. Arc.
# B diminished: B D F - the tritone and semitone rubs (C against B) fester.
def plague_wind():
    bpm = 70
    bars = 12
    total = bars * 4
    windt = Track(bpm, total)
    pads = Track(bpm, total)
    pluck = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    # sickly cluster pads: semitone rubs inside the diminished core
    clusters = [
        [n("B2"), n("C3"), n("D3")],
        [n("B2"), n("C3"), n("D3")],
        [n("F2"), n("Gb2"), n("A2")],
        [n("F2"), n("Gb2"), n("A2")],
        [n("B2"), n("C3"), n("D3"), n("D4")],
        [n("B2"), n("C3"), n("D3"), n("F3")],
        [n("B2"), n("C3"), n("D3"), n("D4")],
        [n("F2"), n("Gb2"), n("A2"), n("Bb2")],
        [n("C2"), n("B2"), n("F2")],
        [n("C2"), n("B2"), n("F2")],
        [n("B1"), n("C2")],
        [n("B1"), n("C2")],
    ]

    def arc_vel(i):
        if i < 4:
            return 0.35 + i * 0.06
        if i < 8:
            return 0.75 + (i - 4) * 0.05
        return 0.85 - (i - 8) * 0.18

    for i, ch in enumerate(clusters):
        b = bar(i)
        v = arc_vel(i)
        windt.wind(b, 4, vel=v * 0.9)
        pads.pad(b, ch, 4, vel=v * 0.7, attack=1.6, cutoff=900)
        bass.bass(b, ch[0] - 12, 3.6, vel=v * 0.8, cutoff=220)
        # irregular fever-thud: heartbeat-like taiko, skipping some bars
        if i % 2 == 0 and i < 10:
            windt.taiko(b + 1.5, vel=v * 0.5)
        if i % 3 == 1:
            windt.taiko(b + 2.75, vel=v * 0.35)

    # sparse contagion plucks: dissonant notes, coughing rhythm
    coughs = [
        (1, "C4", 2, 0.5), (5, "B3", 2.5, 0.45),
        (9, "F3", 2, 0.5), (13, "Db4", 3, 0.55),
        (17, "C4", 1.5, 0.65), (21, "F4", 2.5, 0.7),
        (25, "Gb3", 2, 0.75), (29, "B3", 2, 0.7),
        (33, "C4", 2.5, 0.6), (37, "A3", 2, 0.5),
        (41, "B3", 3, 0.4),
    ]
    for off, note, d, v in coughs:
        pluck.pluck(off, n(note), d, vel=v)

    stems = {"wind": windt, "pads": pads, "pluck": pluck, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("plague-wind", stems,
            {"wind": 0.95, "pads": 0.8, "pluck": 0.85,
             "bass": 0.85}, False)


# ============================================================ RIVER-RUN
# River journey: flowing and bright. A major, 105 BPM. 16 bars. Loop.
# A major: A B C# D E F# G# - running water over bright stones.
def river_run():
    bpm = 105
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    Fsm = [n("F#2"), n("A2"), n("C#3")]
    prog = [A, D, E, A, Fsm, D, E, A] * 2

    # flowing arpeggio figures per chord (8th notes)
    def arp_fig(b, ch):
        root, third, fifth = ch
        notes = [root + 12, third + 12, fifth + 12, root + 24,
                 fifth + 12, third + 12, root + 12, third + 12]
        for k, m in enumerate(notes):
            pluck.pluck(b + k * 0.5, m, 0.9, vel=0.55)

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        arp_fig(b, ch)
        # rolling bass: root-fifth 8ths
        for k in range(8):
            m = root - 12 if k % 2 == 0 else root - 12 + 7
            bass.bass(b + k * 0.5, m, 0.45, vel=0.7, cutoff=500)
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.5, attack=0.8)
        # bright current sparkle
        windt.wind(b, 4, vel=0.14)

    # original bright melody: rising like sun on water
    melody = [
        (0, "E4", 1), (1, "A4", 1), (2, "B4", 1), (3, "C#5", 1),
        (4, "D5", 2), (6, "C#5", 2),
        (8, "B4", 1), (9, "C#5", 1), (10, "D5", 1), (11, "E5", 1),
        (12, "A4", 4),
        (16, "C#5", 1), (17, "B4", 1), (18, "A4", 1), (19, "G#4", 1),
        (20, "F#4", 2), (22, "E4", 2),
        (24, "D4", 1), (25, "E4", 1), (26, "F#4", 1), (27, "G#4", 1),
        (28, "A4", 4),
        (32, "E4", 1), (33, "A4", 1), (34, "C#5", 1), (35, "E5", 1),
        (36, "D5", 2), (38, "B4", 2),
        (40, "C#5", 1), (41, "D5", 1), (42, "E5", 1), (43, "F#5", 1),
        (44, "E5", 4),
        (48, "D5", 1), (49, "C#5", 1), (50, "B4", 1), (51, "A4", 1),
        (52, "G#4", 2), (54, "F#4", 2),
        (56, "E4", 1), (57, "F#4", 1), (58, "G#4", 1), (59, "A4", 1),
        (60, "A4", 4),
    ]
    for off, note, d in melody:
        lead.lead(off, n(note), d, vel=0.7, vibrato=6.0, vib_depth=5.0)

    stems = {"pluck": pluck, "bass": bass, "pads": pads,
             "lead": lead, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("river-run", stems,
            {"pluck": 0.9, "bass": 0.8, "pads": 0.6,
             "lead": 0.85, "wind": 0.8}, True)


# ============================================================ LAST-CANDLE
# Final night before battle: quiet dread. E minor, 65 BPM. 12 bars. Arc.
# E minor: E F# G A B C D - one candle against the dark.
def last_candle():
    bpm = 65
    bars = 12
    total = bars * 4
    pluck = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C2"), n("E2"), n("G2")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D2"), n("F#2"), n("A2")]
    Am = [n("A2"), n("C3"), n("E3")]
    B7 = [n("B2"), n("D#3"), n("F#3")]
    prog = [Em, Em, C, G, Am, Em, D, G, C, Am, B7, Em]

    def arc_vel(i):
        if i < 3:
            return 0.3 + i * 0.05
        if i < 8:
            return 0.45 + (i - 3) * 0.1
        return 0.85 - (i - 8) * 0.2

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.8,
                 attack=1.8, cutoff=1500)
        windt.wind(b, 4, vel=v * 0.5)
        if i in (2, 5, 8):
            bass.bass(b, ch[0] - 12, 3.5, vel=v * 0.7, cutoff=260)
        if i in (5, 7):
            pads.taiko(b + 2, vel=v * 0.25)

    # delicate candle melody, ending as a single flickering note
    candle = [
        (0, "E4", 2, 0.5), (4, "G4", 2, 0.5),
        (8, "A4", 3, 0.55),
        (12, "B4", 2, 0.6), (16, "C5", 3, 0.65),
        (20, "B4", 2, 0.6),
        (24, "A4", 3, 0.65),
        (28, "G4", 2, 0.6),
        (32, "F#4", 2, 0.7), (36, "G4", 3, 0.7),
        (40, "E4", 4, 0.65),
        (44, "B3", 3.5, 0.45),
    ]
    for off, note, d, v in candle:
        pluck.pluck(off, n(note), d, vel=v)

    stems = {"pluck": pluck, "pads": pads, "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("last-candle", stems,
            {"pluck": 0.95, "pads": 0.85, "bass": 0.85,
             "wind": 0.85}, False)


# ============================================================ THUNDER-COURT
# War tribunal: judgment and weight. G minor, 95 BPM. 16 bars. Loop.
# G minor: G A Bb C D Eb F - the gavel falls, the verdict lands.
def thunder_court():
    bpm = 95
    bars = 16
    total = bars * 4
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    pads = Track(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Cm = [n("C3"), n("Eb3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Gm, Eb, Cm, D, Gm, Eb, D, Gm,
            Gm, Cm, Eb, D, Cm, D, Gm, Gm]

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # gavel thunder: taiko on 1, crash on section starts
        drums.taiko(b, vel=0.95)
        drums.taiko(b + 2.5, vel=0.5)
        if i in (0, 8):
            drums.crash(b, vel=0.55)
        if i % 4 == 3:
            drums.snare(b + 3.5, vel=0.6)
        # judgment brass stabs: beat 1 and the off-beat of 3
        for m in ch:
            brass.brass(b, m + 12, 1.6, vel=0.75)
            brass.brass(b + 3.5, m + 12, 1.2, vel=0.5)
        # doom ostinato: root root, flat-sixth, dominant
        bass.bass(b, root - 12, 0.9, vel=0.8, cutoff=380)
        bass.bass(b + 1, root - 12, 0.9, vel=0.7, cutoff=380)
        bass.bass(b + 2, root - 12 - 4, 0.9, vel=0.75, cutoff=380)
        bass.bass(b + 3, root - 12 - 2, 0.9, vel=0.8, cutoff=380)
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.5, attack=1.2)

    # original declamatory verdict: solemn, unhurried, final
    verdict = [
        (0, "G4", 2), (2, "Bb4", 2),
        (4, "D5", 3), (7, "C5", 1),
        (8, "Bb4", 2), (10, "A4", 2),
        (12, "G4", 4),
        (16, "Eb4", 2), (18, "F4", 2),
        (20, "G4", 3), (23, "A4", 1),
        (24, "Bb4", 2), (26, "D5", 2),
        (28, "C5", 4),
        (32, "Bb4", 2), (34, "A4", 2),
        (36, "G4", 2), (38, "F4", 2),
        (40, "Eb4", 2), (42, "D4", 2),
        (44, "G4", 4),
        (48, "D5", 2), (50, "Eb5", 2),
        (52, "D5", 2), (54, "C5", 2),
        (56, "Bb4", 2), (58, "A4", 2),
        (60, "G4", 4),
    ]
    for off, note, d in verdict:
        lead.lead(off, n(note), d, vel=0.75, vibrato=4.5, vib_depth=5.0)

    stems = {"brass": brass, "drums": drums, "bass": bass,
             "lead": lead, "pads": pads}
    for s in stems.values():
        s.trim()
    return ("thunder-court", stems,
            {"brass": 0.9, "drums": 0.9, "bass": 0.85,
             "lead": 0.85, "pads": 0.6}, True)


# ============================================================ NEW-HORIZON
# Expansion/settlement: open optimism. C major, 110 BPM. 16 bars. Arc.
# C major: C D E F G A B - dawn over unclaimed land.
def new_horizon():
    bpm = 110
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [C, G, Am, F] * 4

    def arc_vel(i):
        if i < 4:
            return 0.4 + i * 0.08
        if i < 8:
            return 0.7 + (i - 4) * 0.06
        if i < 12:
            return 0.95
        return 0.95 - (i - 12) * 0.1

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # the march builds: kick first, full kit by the middle
        for beat in range(4):
            drums.kick(b + beat, vel=v * 0.8)
        if i >= 2:
            drums.snare(b + 1, vel=v * 0.6)
            drums.snare(b + 3, vel=v * 0.6)
        if i >= 4:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.4)
        if i in (8, 12):
            drums.crash(b, vel=v * 0.5)
        # driving roots
        for k in range(4):
            bass.bass(b + k, root - 12, 0.9, vel=v * 0.8, cutoff=450)
        # open sky pads
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.7, attack=0.9)
        # brass enters at the rise, swelling to the vision
        if i >= 8:
            for m in ch:
                brass.brass(b, m + 12, 3.6, vel=v * 0.6)

    # original ascending settler's song: hope, stride, arrival
    song = [
        (0, "C4", 1), (1, "D4", 1), (2, "E4", 1), (3, "G4", 1),
        (4, "A4", 2), (6, "G4", 2),
        (8, "E4", 1), (9, "F4", 1), (10, "G4", 1), (11, "A4", 1),
        (12, "G4", 2), (14, "E4", 2),
        (16, "F4", 1), (17, "G4", 1), (18, "A4", 1), (19, "C5", 1),
        (20, "B4", 2), (22, "A4", 2),
        (24, "G4", 1), (25, "A4", 1), (26, "B4", 1), (27, "D5", 1),
        (28, "C5", 4),
        (32, "D5", 1), (33, "E5", 1), (34, "G5", 1), (35, "A5", 1),
        (36, "G5", 2), (38, "E5", 2),
        (40, "D5", 1), (41, "E5", 1), (42, "F5", 1), (43, "G5", 1),
        (44, "A5", 4),
        (48, "G5", 2), (50, "E5", 2),
        (52, "D5", 2), (54, "C5", 2),
        (56, "B4", 2), (58, "D5", 2),
        (60, "C5", 4),
    ]
    for off, note, d in song:
        lead.lead(off, n(note), d, vel=0.8, vibrato=5.5, vib_depth=5.0)

    stems = {"drums": drums, "bass": bass, "pads": pads,
             "brass": brass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("new-horizon", stems,
            {"drums": 0.85, "bass": 0.8, "pads": 0.65,
             "brass": 0.85, "lead": 0.9}, False)


# ============================================================ render
def mix_track9(name, stems, gains, reverb_wet=0.18, loop=False):
    """Sum stems -> stereo mix with reverb + limiter. Saves mix + stems.
    loop=True crossfades each stem's tail into its head AND the reverbed
    mix's tail into its head (sample-exact loop). Returns (dur, peak, rms)."""
    bufs = {}
    for sname, trk in stems.items():
        b = trk.buf.astype(np.float64) * gains.get(sname, 1.0)
        if loop:
            b = _seamless(b)
        bufs[sname] = b
        write_wav(os.path.join(OUT, f"{name}-stem-{sname}.wav"),
                  limiter(b, ceiling=0.89))
    mix = sum(bufs.values())
    stereo = reverb_stereo(mix, wet=reverb_wet if not loop else 0.12,
                           decay=2.2)
    stereo = limiter(stereo, ceiling=0.89)
    if loop:  # reverb breaks the loop point; crossfade the mix itself too
        stereo = np.stack([_seamless(stereo[:, 0]),
                           _seamless(stereo[:, 1])], axis=1)
    path = os.path.join(OUT, f"{name}-mix.wav")
    write_wav(path, stereo)
    peak = float(np.max(np.abs(stereo)))
    rms = float(np.sqrt(np.mean(stereo ** 2)))
    dur = len(stereo) / SR
    loop_err = 0.0
    if loop:
        loop_err = float(max(np.max(np.abs(stereo[-1] - stereo[0])), 0.0))
        assert loop_err == 0.0, f"{name}: loop not sample-exact ({loop_err})"
    # no silence gaps: fraction of 100ms windows below 0.01 peak
    win = int(0.1 * SR)
    nw = len(stereo) // win
    silent = sum(
        1 for i in range(nw)
        if np.max(np.abs(stereo[i * win:(i + 1) * win])) < 0.01
    )
    sil_frac = silent / max(nw, 1)
    assert 0.1 <= rms <= 0.3, f"{name}: rms {rms:.3f} out of range"
    assert peak <= 0.95, f"{name}: peak {peak:.3f} over budget"
    print(f"{name}: {dur:.1f}s peak={peak:.3f} rms={rms:.3f} "
          f"sil={sil_frac:.2%} {'loop' if loop else 'arc'} "
          f"loop_err={loop_err:.1e} -> {path}")
    return dur, peak, rms


def to_mp3():
    """Encode every wav in out/ to mp3 (mixes + stems)."""
    for fname in sorted(os.listdir(OUT)):
        if not fname.endswith(".wav"):
            continue
        src = os.path.join(OUT, fname)
        base = fname[:-4]
        if base.endswith("-mix"):
            base = base[:-4]
        dst = os.path.join(MP3, base + ".mp3")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "192k", dst],
                       check=True)
    n = len([f for f in os.listdir(MP3) if f.endswith(".mp3")])
    print(f"encoded {n} mp3s -> {MP3}")


TRACKS = [
    (ironhold, 0.16),
    (plague_wind, 0.24),
    (river_run, 0.18),
    (last_candle, 0.26),
    (thunder_court, 0.15),
    (new_horizon, 0.17),
]


def main():
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        mix_track9(name, stems, gains, reverb_wet=wet, loop=loop)
    to_mp3()


if __name__ == "__main__":
    main()
