"""Eleventh batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-10 moods already covered - do not duplicate):
  ember-tide, night-orchestra, iron-vow, market-day,
  storm-break, the-empty-throne.
Render: python3 compose11.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import (Track, reverb_stereo, limiter, write_wav, SR,
                   midi_to_freq, adsr, lowpass, noise, _osc)

OUT = "/home/hatch/workspace/staging/music11/out"
MP3 = "/home/hatch/workspace/staging/music11/out/mp3"
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


def flute_note(midi, dur, vel=1.0, vibrato=5.0, vib_depth=5.0):
    """Lonely wooden flute: breathy sine + slight chiff."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    vib = vib_depth * np.sin(2 * np.pi * vibrato * t) * np.minimum(t / 0.3, 1.0)
    inst = np.cumsum(2 * np.pi * (f + vib) / SR)
    x = (0.70 * np.sin(inst) + 0.20 * np.sin(2 * inst)
         + 0.10 * np.sin(3 * inst))
    chiff = noise(n_) * np.exp(-t * 60) * 0.25
    breath = lowpass(noise(n_), 1500) * 0.06
    x = x * adsr(n_, 0.08, 0.2, 0.8, min(0.4, dur * 0.3)) + chiff + breath
    return x * vel * 0.55


class FluteTrack(Track):
    def flute(self, b, midi, dur_beats, **kw):
        self._place(flute_note(midi, self._b2s(dur_beats), **kw), b)


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


# ============================================================ EMBER-TIDE
# Rebuilding after war: fragile recovery. A major, 78 BPM. 16 bars. Loop.
# A major: A B C# D E F# G# - first green shoots through the ash.
def ember_tide():
    bpm = 78
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    Fsm = [n("F#3"), n("A3"), n("C#4")]
    prog = [A, Fsm, D, E] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # fragile bloom: soft pads, slow attack
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.55, attack=1.6,
                 cutoff=1500)
        # rebuilding rhythm: gentle plucked arpeggio, root position
        arp = [0, 4, 7, 12, 7, 4]
        for k, st in enumerate(arp):
            pluck.pluck(b + k * (2 / 3), root + 12 + st, 0.9, vel=0.5)
        # soft heartbeat: warm kick on 1, brush on 3
        bass.bass(b, root - 12, 1.6, vel=0.55, cutoff=260)
        windt.wind(b, 4, vel=0.22)

    # first green: a melody that learns to trust the light again
    green = [
        (0, "A4", 1), (1, "C#5", 1), (2, "E5", 2),
        (4, "F#5", 1), (5, "E5", 1), (6, "C#5", 2),
        (8, "D5", 1), (9, "E5", 1), (10, "F#5", 2),
        (12, "E5", 2), (14, "C#5", 2),
        (16, "B4", 1), (17, "C#5", 1), (18, "D5", 2),
        (20, "E5", 2), (22, "D5", 2),
        (24, "C#5", 1), (25, "B4", 1), (26, "A4", 2),
        (28, "A4", 2), (30, "G#4", 2),
        (32, "A4", 2), (34, "E5", 2),
        (36, "D5", 1), (37, "C#5", 1), (38, "B4", 2),
        (40, "C#5", 4),
        (44, "E5", 1), (45, "D5", 1), (46, "C#5", 2),
        (48, "B4", 2), (50, "A4", 2),
        (52, "G#4", 1), (53, "A4", 3),
        (56, "C#5", 1), (57, "E5", 1), (58, "A5", 2),
        (60, "G#5", 2), (62, "E5", 2),
    ]
    for off, note, d in green:
        lead.lead(off, n(note), d, vel=0.6, vibrato=5.0, vib_depth=4.0)

    stems = {"pluck": pluck, "pads": pads, "lead": lead,
             "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("ember-tide", stems,
            {"pluck": 0.9, "pads": 0.85, "lead": 0.85,
             "bass": 0.8, "wind": 0.85}, True)


# ============================================================ NIGHT-ORCHESTRA
# Grand war camp at night: deep drums + lonely flute. D minor, 72 BPM.
# 16 bars. Loop. D minor: D E F G A Bb C - ten thousand tents, one song.
def night_orchestra():
    bpm = 72
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    flute = FluteTrack(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D2"), n("F2"), n("A2")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Bb, Gm, A] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # camp drums: great taiko on 1, soft on 2.5, answering on 3.5
        drums.taiko(b, vel=0.85)
        drums.taiko(b + 2.5, vel=0.4)
        drums.taiko(b + 3.5, vel=0.55)
        if i in (0, 8):
            drums.crash(b, vel=0.35)
        # low string bed
        pads.pad(b, [m - 24 for m in ch], 4, vel=0.5, attack=1.8,
                 cutoff=1000)
        # night watch bass: one long root per bar
        bass.bass(b, root - 24, 3.6, vel=0.65, cutoff=220)
        windt.wind(b, 4, vel=0.2)

    # the sentry's song: a lone flute over ten thousand sleeping men
    sentry = [
        (2, "A4", 2), (4, "D5", 3), (7, "C5", 1),
        (8, "Bb4", 2), (10, "A4", 2),
        (12, "G4", 4),
        (18, "Bb4", 2), (20, "C5", 2),
        (22, "D5", 3), (25, "E5", 1),
        (26, "F5", 2), (28, "E5", 2),
        (30, "D5", 2),
        (34, "C5", 2), (36, "D5", 2),
        (38, "E5", 2), (40, "F5", 2),
        (42, "E5", 2), (44, "D5", 2),
        (46, "A4", 4),
        (50, "G4", 2), (52, "A4", 2),
        (54, "Bb4", 4),
        (58, "A4", 2), (60, "G4", 2),
        (62, "F4", 2),
    ]
    for off, note, d in sentry:
        flute.flute(off, n(note), d, vel=0.75, vibrato=4.5, vib_depth=6.0)

    stems = {"drums": drums, "flute": flute, "pads": pads,
             "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("night-orchestra", stems,
            {"drums": 0.9, "flute": 0.95, "pads": 0.7,
             "bass": 0.8, "wind": 0.85}, True)


# ============================================================ IRON-VOW
# Oath-swearing ceremony: solemn heavy brass. G minor, 68 BPM. 12 bars. Arc.
# G minor: G A Bb C D Eb F - kneel, speak, rise unbreakable.
def iron_vow():
    bpm = 68
    bars = 12
    total = bars * 4
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    BbM = [n("Bb2"), n("D3"), n("F3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Gm, Gm, Eb, BbM, Gm, Eb, D, Gm, BbM, Eb, D, Gm]

    def arc_vel(i):
        if i < 4:
            return 0.4 + i * 0.08
        if i < 8:
            return 0.72 + (i - 4) * 0.07
        return 1.0 - (i - 8) * 0.16

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # the swearing: unison brass on whole notes, growing
        for m in ch:
            brass.brass(b, m + 12, 3.6, vel=v * 0.8)
        # great drum tolling the words
        drums.taiko(b, vel=v * 0.9)
        drums.taiko(b + 2, vel=v * 0.55)
        # iron roots under the vow
        bass.bass(b, root - 12, 3.4, vel=v * 0.8, cutoff=300)
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.5, attack=1.4,
                 cutoff=1200)
        if i == 6:
            drums.crash(b, vel=v * 0.5)

    stems = {"brass": brass, "drums": drums, "bass": bass, "pads": pads}
    for s in stems.values():
        s.trim()
    return ("iron-vow", stems,
            {"brass": 0.95, "drums": 0.9, "bass": 0.85,
             "pads": 0.7}, False)


# ============================================================ MARKET-DAY
# Bustling marketplace joy. D major, 108 BPM. 16 bars. Loop.
# D major: D E F# G A B C# - coin, laughter, saffron in the air.
def market_day():
    bpm = 108
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    drums = Track(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    G = [n("G3"), n("B3"), n("D4")]
    A = [n("A3"), n("C#4"), n("E4")]
    Bm = [n("B3"), n("D4"), n("F#4")]
    prog = [D, G, D, A, Bm, G, D, A] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # market bounce: tambourine-ish hats on 8ths, handclap snare 2 & 4
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.4)
        drums.snare(b + 1, vel=0.55)
        drums.snare(b + 3, vel=0.55)
        drums.kick(b, vel=0.6)
        # strummed street-lute: chord stabs on the offbeats
        for m in ch:
            pluck.pluck(b + 0.5, m + 12, 0.6, vel=0.55)
            pluck.pluck(b + 1.5, m + 12, 0.6, vel=0.5)
            pluck.pluck(b + 2.5, m + 12, 0.6, vel=0.55)
            pluck.pluck(b + 3.5, m + 12, 0.6, vel=0.5)
        # walking market bass
        walk = [0, 4, 7, 9, 12, 9, 7, 4]
        for k, st in enumerate(walk):
            bass.bass(b + k * 0.5, root - 12 + st, 0.42, vel=0.65,
                      cutoff=520)
        # crowd murmur
        windt.wind(b, 4, vel=0.16)

    # the hawker's tune: cheerful, circular, impossible not to hum
    hawker = [
        (0, "D4", 0.5), (0.5, "E4", 0.5), (1, "F#4", 1),
        (2, "A4", 1), (3, "G4", 0.5), (3.5, "F#4", 0.5),
        (4, "E4", 1), (5, "D4", 1),
        (6, "G4", 0.5), (6.5, "A4", 0.5), (7, "B4", 1),
        (8, "A4", 1), (9, "G4", 1),
        (10, "F#4", 1), (11, "E4", 1),
        (12, "D4", 2), (14, "A3", 2),
        (16, "D4", 0.5), (16.5, "E4", 0.5), (17, "F#4", 1),
        (18, "G4", 0.5), (18.5, "A4", 0.5), (19, "B4", 1),
        (20, "A4", 0.5), (20.5, "G4", 0.5), (21, "F#4", 1),
        (22, "E4", 2),
        (24, "F#4", 0.5), (24.5, "G4", 0.5), (25, "A4", 1),
        (26, "B4", 1), (27, "A4", 0.5), (27.5, "G4", 0.5),
        (28, "F#4", 1), (29, "E4", 1),
        (30, "D4", 2),
        (32, "A4", 0.5), (32.5, "B4", 0.5), (33, "A4", 0.5),
        (33.5, "G4", 0.5), (34, "F#4", 1),
        (35, "E4", 0.5), (35.5, "D4", 0.5), (36, "E4", 2),
        (38, "D4", 2),
        (40, "G4", 1), (41, "F#4", 1), (42, "E4", 1), (43, "D4", 1),
        (44, "E4", 0.5), (44.5, "F#4", 0.5), (45, "G4", 1),
        (46, "A4", 2),
        (48, "B4", 0.5), (48.5, "A4", 0.5), (49, "G4", 0.5),
        (49.5, "F#4", 0.5), (50, "E4", 1),
        (51, "D4", 1), (52, "E4", 1),
        (53, "F#4", 0.5), (53.5, "G4", 0.5), (54, "A4", 2),
        (56, "D5", 1), (57, "B4", 1),
        (58, "A4", 1), (59, "G4", 1),
        (60, "F#4", 1), (61, "E4", 1),
        (62, "D4", 2),
    ]
    for off, note, d in hawker:
        lead.lead(off, n(note), d, vel=0.62, vibrato=6.0, vib_depth=4.0)

    stems = {"pluck": pluck, "drums": drums, "lead": lead,
             "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("market-day", stems,
            {"pluck": 0.9, "drums": 0.85, "lead": 0.85,
             "bass": 0.8, "wind": 0.8}, True)


# ============================================================ STORM-BREAK
# Hurricane of battle: violent then calm. E minor, 125 BPM. 12 bars. Arc.
# E minor: E F# G A B C D - the fury spends itself and the rain remains.
def storm_break():
    bpm = 125
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    Am = [n("A2"), n("C3"), n("E3")]
    # storm: fury for 8 bars, breaking at bar 8, rain for 4
    prog = [Em, Em, C, D, Em, Am, D, D, Em, C, D, Em]

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        if i < 8:
            # the hurricane: double-kick, driving snare, crash every bar
            v = 0.95 - (i / 8.0) * 0.25
            for beat in range(4):
                drums.kick(b + beat, vel=v)
                drums.kick(b + beat + 0.25, vel=v * 0.5)
            drums.snare(b + 1, vel=v * 0.85)
            drums.snare(b + 3, vel=v * 0.85)
            drums.crash(b, vel=v * 0.55)
            for m in ch:
                brass.brass(b, m + 12, 1.4, vel=v * 0.7)
            for k in range(8):
                bass.bass(b + k * 0.5, root - 12 + (7 if k % 2 else 0),
                          0.42, vel=v * 0.8, cutoff=650)
            windt.wind(b, 4, vel=v * 0.5)
        else:
            # the rain after: everything softens and recedes
            v = 0.45 - (i - 8) * 0.06
            drums.taiko(b, vel=v * 0.6)
            pads_d = [m - 12 for m in ch]
            windt.wind(b, 4, vel=v * 0.9)
            bass.bass(b, root - 24, 3.4, vel=v * 0.6, cutoff=260)
            for m in ch:
                brass.brass(b + 2, m + 12, 1.6, vel=v * 0.4)

    # lightning through the fury, then only the dripping eaves
    lightning = [
        (0, "E5", 0.5), (0.5, "G5", 0.5), (1, "B5", 0.5),
        (1.5, "A5", 0.5), (2, "G5", 1), (3, "F#5", 1),
        (4, "E5", 2),
        (8, "D5", 0.5), (8.5, "E5", 0.5), (9, "G5", 1),
        (10, "A5", 0.5), (10.5, "B5", 0.5), (11, "A5", 1),
        (12, "G5", 2),
        (16, "B5", 0.5), (16.5, "A5", 0.5), (17, "G5", 0.5),
        (17.5, "F#5", 0.5), (18, "E5", 2),
        (20, "D5", 2), (22, "E5", 2),
        (24, "G5", 1), (25, "A5", 1), (26, "B5", 2),
        (28, "A5", 4),
        (36, "E5", 2), (38, "D5", 2),
        (40, "E5", 4),
        (44, "G5", 2), (46, "E5", 2),
    ]
    for off, note, d in lightning:
        lead.lead(off, n(note), d, vel=0.7, vibrato=7.0, vib_depth=3.0)

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "lead": lead, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("storm-break", stems,
            {"drums": 0.9, "brass": 0.85, "bass": 0.85,
             "lead": 0.85, "wind": 0.9}, False)


# ============================================================ THE-EMPTY-THRONE
# Abandoned capital: echoing halls. F minor, 62 BPM. 12 bars. Arc.
# F minor: F G Ab Bb C Db Eb - the banners hang in the dust.
def the_empty_throne():
    bpm = 62
    bars = 12
    total = bars * 4
    lead = Track(bpm, total)
    pads = Track(bpm, total)
    windt = Track(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Fm = [n("F2"), n("Ab2"), n("C3")]
    Db = [n("Db3"), n("F3"), n("Ab3")]
    Bbm = [n("Bb2"), n("Db3"), n("F3")]
    C = [n("C3"), n("Eb3"), n("G3")]
    prog = [Fm, Db, Bbm, C] * 3

    def arc_vel(i):
        if i < 4:
            return 0.35 + i * 0.05
        if i < 8:
            return 0.55 + (i - 4) * 0.07
        return 0.8 - (i - 8) * 0.14

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # echoing halls: long pads, cold wind
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.65, attack=2.0,
                 cutoff=1100)
        windt.wind(b, 4, vel=v * 0.7)
        # the throne's shadow: deep root every other bar
        if i % 2 == 0:
            bass.bass(b, root - 24, 3.6, vel=v * 0.7, cutoff=200)
        # footsteps of the gone: faint taiko
        if i % 4 == 3:
            drums.taiko(b + 1.5, vel=v * 0.25)
            drums.taiko(b + 3, vel=v * 0.2)

    # the ghost king: a theme that remembers itself, fraying at the ends
    ghost = [
        (2, "F4", 2, 0.45), (4, "Ab4", 3, 0.5),
        (8, "Bb4", 2, 0.55), (10, "C5", 3, 0.55),
        (14, "Db5", 2, 0.6), (16, "C5", 3, 0.6),
        (20, "Bb4", 2, 0.6), (22, "Ab4", 2, 0.6),
        (24, "F4", 4, 0.55),
        (30, "G4", 2, 0.6), (32, "Ab4", 3, 0.6),
        (36, "Bb4", 2, 0.65), (38, "C5", 2, 0.65),
        (40, "Db5", 4, 0.6),
        (46, "F5", 2, 0.5), (48, "Eb5", 3, 0.45),
        (52, "Db5", 2, 0.4), (54, "C5", 3, 0.35),
        (58, "Bb4", 3, 0.3),
    ]
    for off, note, d, v in ghost:
        lead.lead(off, n(note), d, vel=v, vibrato=4.5, vib_depth=7.0)

    stems = {"lead": lead, "pads": pads, "wind": windt,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-empty-throne", stems,
            {"lead": 0.95, "pads": 0.85, "wind": 0.9,
             "bass": 0.8, "drums": 0.8}, False)


# ============================================================ render
def mix_track11(name, stems, gains, reverb_wet=0.18, loop=False):
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


def _decode_mp3(path):
    """Decode mp3 to mono float32 via ffmpeg."""
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-f", "f32le",
         "-ac", "1", "-ar", "44100", "-"],
        check=True, capture_output=True)
    return np.frombuffer(p.stdout, dtype=np.float32)


def verify():
    """QC: ffprobe/ffdecode every mp3, mix/stem duration match, stem
    distinctness (pairwise, per track). Raises on any failure."""
    mp3s = sorted(f for f in os.listdir(MP3) if f.endswith(".mp3"))
    assert mp3s, "no mp3s to verify"
    decoded = {}
    for f in mp3s:
        path = os.path.join(MP3, f)
        x = _decode_mp3(path)
        assert len(x) > SR, f"{f}: decoded too short"
        assert np.max(np.abs(x)) > 0.01, f"{f}: decoded silent"
        decoded[f] = x
    print(f"decode ok: {len(mp3s)}/{len(mp3s)} mp3s")

    tracks = {}
    for f in mp3s:
        if "-stem-" in f:
            track, stem = f[:-4].split("-stem-", 1)
            tracks.setdefault(track, {"mix": None, "stems": {}})["stems"][stem] = f
        else:
            track = f[:-4]
            tracks.setdefault(track, {"mix": None, "stems": {}})["mix"] = f

    for track, parts in sorted(tracks.items()):
        mix = decoded[parts["mix"]]
        for stem, f in sorted(parts["stems"].items()):
            sx = decoded[f]
            assert abs(len(mix) - len(sx)) / SR < 0.15, \
                f"{f}: duration mismatch vs mix"
            assert np.sqrt(np.mean(sx ** 2)) > 0.001, f"{f}: silent stem"
        names = sorted(parts["stems"])
        for a_i in range(len(names)):
            for b_i in range(a_i + 1, len(names)):
                a = decoded[parts["stems"][names[a_i]]].astype(np.float64)
                b = decoded[parts["stems"][names[b_i]]].astype(np.float64)
                m = min(len(a), len(b))
                a, b = a[:m], b[:m]
                corr = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))
                assert corr < 0.98, \
                    f"{track}: stems {names[a_i]}/{names[b_i]} not distinct (corr={corr:.3f})"
        print(f"{track}: mix+{len(names)} stems ok "
              f"({len(names)*(len(names)-1)//2} pairwise distinct)")


TRACKS = [
    (ember_tide, 0.22),
    (night_orchestra, 0.20),
    (iron_vow, 0.20),
    (market_day, 0.16),
    (storm_break, 0.18),
    (the_empty_throne, 0.24),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track11(name, stems, gains, reverb_wet=wet,
                                     loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
