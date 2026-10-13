"""Thirty-seventh batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-36 moods already covered - do not duplicate):
  the-winter-march (renamed from the-winter-campaign: taken on live main),
  drums-of-the-night-watch, the-ploughmans-tale, elegy-for-the-fallen-king,
  the-gilded-standard, fury-of-the-northern-host.
Render: python3 compose37.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np
from scipy import signal as _sig

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
sys.path.insert(0, "/home/hatch/workspace/staging/music36")
import compose27 as c27
from compose36 import Voice36, n
from synth import (SR, midi_to_freq, adsr, lowpass, highpass, noise)

OUT = "/home/hatch/workspace/staging/music37/out"
MP3 = "/home/hatch/workspace/staging/music37/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ------------------------------------------------- new batch-37 instruments
def fife_note(midi, dur, vel=1.0):
    """Military fife: piercing, bright, fast vibrato, breathy edge."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    vib = 7.0 * np.sin(2 * np.pi * 7.2 * t) * np.minimum(t / 0.15, 1.0)
    inst = np.cumsum(2 * np.pi * (f + vib) / SR)
    x = (0.60 * np.sin(inst) + 0.28 * np.sin(2 * inst)
         + 0.14 * np.sin(3 * inst))
    breath = highpass(noise(n_), 6000) * 0.05
    x = lowpass(x, 6500)
    return (x + breath) * adsr(n_, 0.04, 0.10, 0.85,
                               min(0.20, dur * 0.25)) * vel * 0.50


def bagpipe_drone_note(midi, dur, vel=1.0):
    """Bagpipe drone: constant detuned saw stack, low and reedy."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = np.zeros(n_)
    for mult, amp in ((1.0, 0.40), (1.5, 0.25), (2.0, 0.12)):
        wob = 3.0 * np.sin(2 * np.pi * 4.7 * t)
        inst = np.cumsum(2 * np.pi * (f * mult + wob) / SR)
        x += amp * _sig.sawtooth(inst)
    x = lowpass(x, 1600)
    env = adsr(n_, min(2.0, dur * 0.10), 0.5, 0.90,
               min(3.0, dur * 0.15))
    return x * env * vel * 0.35


def chanter_note(midi, dur, vel=1.0):
    """Bagpipe chanter: loud reedy melody voice, constant tone."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    wob = 8.0 * np.sin(2 * np.pi * 6.3 * t) * np.minimum(t / 0.10, 1.0)
    inst = np.cumsum(2 * np.pi * (f + wob) / SR)
    x = (0.55 * _sig.sawtooth(inst) + 0.30 * _sig.square(inst)
         + 0.15 * np.sin(inst))
    x = lowpass(x, 3800)
    x = highpass(x, 300)
    return x * adsr(n_, 0.03, 0.05, 0.90,
                    min(0.10, dur * 0.20)) * vel * 0.42


def harp_note(midi, dur, vel=1.0, seed=3700):
    """Village harp: bright Karplus-Strong pluck, lively ring."""
    rng = np.random.default_rng(seed + midi)
    f = midi_to_freq(midi)
    N = max(int(SR / f), 2)
    n_ = int(dur * SR)
    buf = highpass(rng.standard_normal(N), 2000)
    y = np.zeros(n_)
    idx = 0
    for i in range(n_):
        cur = buf[idx]
        y[i] = cur
        buf[idx] = 0.9982 * 0.5 * (cur + buf[(idx + 1) % N])
        idx = (idx + 1) % N
    y *= np.exp(-np.arange(n_) / SR * 0.9)
    return y * vel * 0.55


def chime_note(midi, dur, vel=1.0):
    """Ice chime: struck metal with inharmonic partials, crystalline."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (0.55 * np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2)
         + 0.30 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 3.2)
         + 0.15 * np.sin(2 * np.pi * f * 5.40 * t) * np.exp(-t * 4.5)
         + 0.06 * np.sin(2 * np.pi * f * 8.93 * t) * np.exp(-t * 6.0))
    strike = highpass(noise(n_), 7000) * np.exp(-t * 180) * 0.18
    return (x + strike) * vel * 0.50


class Voice37(Voice36):
    def fife(self, b, midi, dur_beats=2, **kw):
        self._place(fife_note(midi, self._b2s(dur_beats), **kw), b)

    def chanter(self, b, midi, dur_beats=2, **kw):
        self._place(chanter_note(midi, self._b2s(dur_beats), **kw), b)

    def drones(self, b, midi, dur_beats=8, **kw):
        self._place(bagpipe_drone_note(midi, self._b2s(dur_beats),
                                       **kw), b)

    def harp(self, b, midi, dur_beats=2, **kw):
        self._place(harp_note(midi, self._b2s(dur_beats), **kw), b)

    def chime(self, b, midi, dur_beats=4, **kw):
        self._place(chime_note(midi, self._b2s(dur_beats), **kw), b)


# ============================================================ THE-WINTER-MARCH
# Snow under the boots, breath in the air: the column keeps its step.
# D minor, 94 BPM. 16 bars. Arc: first light -> the advance -> campfires.
# Dm Bb Gm A.
def the_winter_march():
    bpm = 94
    bars = 16
    total = bars * 4
    strings = Voice37(bpm, total)
    fife = Voice37(bpm, total)
    chime = Voice37(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Bb, Gm, A] * 4
    roots = [n("D1"), n("Bb1"), n("G1"), n("A1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.52 + i * 0.10    # first light on snow
        if i < 12:
            return 1.0                # the advance
        return 1.0 - (i - 12) * 0.15  # campfires at dusk

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the tramp of the column: string eighths
        step = [ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 12,
                ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 12]
        for k, m in enumerate(step):
            strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.34)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.22)
        # the cold air carries the tune
        # (melody placed below)
        # ice bells on the harness: chimes mark the beats
        chime.chime(b, ch[0] + 24, 4, vel=v * 0.30)
        chime.chime(b + 2, ch[2] + 24, 4, vel=v * 0.26)
        # measured steps
        for k in range(4):
            bass.bass(b + k, root, 0.8, vel=v * 0.55, cutoff=420)
        # the march drum: muffled taiko, snow-soft snare
        drums.taiko(b, vel=v * 0.50)
        drums.taiko(b + 2, vel=v * 0.46)
        drums.snare(b + 1, vel=v * 0.36)
        drums.snare(b + 3, vel=v * 0.36)
        if 4 <= i < 12:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.20)

    # an original winter tune: steady, patient, unhurried
    winter = [
        (0, "A3", 2), (2, "Bb3", 2), (4, "A3", 4),
        (8, "G3", 2), (10, "A3", 2), (12, "F3", 4),
        (16, "G3", 2), (18, "A3", 2), (20, "D4", 4),
        (24, "C4", 2), (26, "Bb3", 2), (28, "A3", 8),
        (32, "A3", 2), (34, "Bb3", 2), (36, "C4", 4),
        (40, "D4", 4), (44, "A3", 4),
        (48, "Bb3", 2), (50, "A3", 2), (52, "G3", 2), (54, "F3", 2),
        (56, "E3", 4), (60, "D3", 4),
    ]
    for off, note, d in winter:
        v = arc_vel(int(off // 4))
        fife.fife(off, n(note), d, vel=v * 0.44)

    stems = {"strings": strings, "fife": fife, "chime": chime,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-winter-march", stems,
            {"strings": 0.86, "fife": 0.90, "chime": 0.82,
             "bass": 0.90, "drums": 0.88}, False)


# ================================================= DRUMS-OF-THE-NIGHT-WATCH
# Lanterns in the dark streets: the watch makes its rounds, then dawn.
# A minor, 128 BPM. 16 bars. Arc: hushed -> torchlit -> the dawn relief.
# Am F Dm E.
def drums_of_the_night_watch():
    bpm = 128
    bars = 16
    total = bars * 4
    drums = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    fife = Voice37(bpm, total)
    strings = Voice37(bpm, total)
    air = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    E = [n("E2"), n("G#2"), n("B2")]
    prog = [Am, F, Dm, E] * 4
    roots = [n("A1"), n("F1"), n("D1"), n("E1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.08    # hushed rounds
        if i < 12:
            return 1.0                # torchlit streets
        return 1.0 - (i - 12) * 0.17  # the dawn relief

    # the night air: a long low bed under everything
    air.wind(0, total, vel=0.55)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the watchman's step: patrol toms
        drums.taiko(b, vel=v * 0.55)
        drums.tom(b + 1.5, freq=90, vel=v * 0.40)
        drums.taiko(b + 2, vel=v * 0.55)
        drums.tom(b + 3, freq=75, vel=v * 0.45)
        drums.kick(b + 0.75, vel=v * 0.48)
        for k in range(4):
            drums.hat(b + k, vel=v * 0.20)
        if 4 <= i < 12:
            drums.snare(b + 1, vel=v * 0.42)
            drums.snare(b + 3, vel=v * 0.42)
        if i == 4:
            drums.crash(b, vel=0.60)
        # the prowling bass: half notes in the dark
        bass.bass(b, root, 1.8, vel=v * 0.55, cutoff=380)
        bass.bass(b + 2, root, 1.8, vel=v * 0.50, cutoff=380)
        # dark strings hold the night
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.28)

    # the watchman's call: sparse, modal, answered by the dark
    night = [
        (0, "E4", 4),
        (8, "D4", 2), (10, "C4", 2), (12, "B3", 4),
        (16, "A3", 4), (20, "B3", 4),
        (24, "C4", 2), (26, "D4", 2), (28, "E4", 8),
        (32, "E4", 2), (34, "D4", 2), (36, "B3", 4),
        (40, "A3", 8),
        (48, "C4", 4), (52, "B3", 4),
        (56, "A3", 8),
    ]
    for off, note, d in night:
        v = arc_vel(int(off // 4))
        fife.fife(off, n(note), d, vel=v * 0.42)

    stems = {"drums": drums, "bass": bass, "fife": fife,
             "strings": strings, "wind": air}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-night-watch", stems,
            {"drums": 0.95, "bass": 0.90, "fife": 0.88,
             "strings": 0.86, "wind": 0.90}, False)


# ==================================================== THE-PLOUGHMANS-TALE
# The furrow turns, the seed goes in: a village sings at its work.
# C major, 100 BPM. 16 bars. Loop (sample-exact).
# C G Am F.
def the_ploughmans_tale():
    bpm = 100
    bars = 16
    total = bars * 4
    harp = Voice37(bpm, total)
    flute = Voice37(bpm, total)
    strings = Voice37(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

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
        # the turning soil: harp arpeggios in eighths
        arp = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[0] + 36, ch[2] + 24, ch[1] + 24, ch[0] + 24]
        for k, m in enumerate(arp):
            harp.harp(b + k * 0.5, m, 1, vel=v * 0.42)
        # the warm field: strings hold the sun
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.26)
        # the work-song rises (melody placed below)
        # the ploughman's tread: walking bass
        walk = [root, ch[1] - 12, ch[2] - 12, ch[0] - 12]
        for k, m in enumerate(walk):
            bass.bass(b + k, m, 0.8, vel=v * 0.52, cutoff=500)
        # light hand-drums keep the rhythm
        drums.taiko(b, vel=v * 0.50)
        drums.taiko(b + 2, vel=v * 0.46)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.22)

    # an original field-song: cheerful, honest, unhurried
    plough = [
        (0, "E4", 2), (2, "G4", 2), (4, "A4", 4),
        (8, "G4", 2), (10, "E4", 2), (12, "D4", 4),
        (16, "E4", 2), (18, "G4", 2), (20, "C5", 4),
        (24, "B4", 2), (26, "G4", 2), (28, "A4", 4),
        (32, "G4", 4), (36, "E4", 4),
        (40, "D4", 2), (42, "E4", 2), (44, "F4", 4),
        (48, "E4", 2), (50, "D4", 2), (52, "C4", 4),
        (56, "D4", 2), (58, "E4", 2), (60, "G4", 4),
    ]
    for off, note, d in plough:
        flute.flute(off, n(note), d, vel=v * 0.44)

    stems = {"harp": harp, "flute": flute, "strings": strings,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-ploughmans-tale", stems,
            {"harp": 0.90, "flute": 0.90, "strings": 0.86,
             "bass": 0.90, "drums": 0.88}, True)


# ============================================ ELEGY-FOR-THE-FALLEN-KING
# The crown is lowered: a kingdom mourns the last of its line.
# G minor, 64 BPM. 16 bars. Arc: the procession -> the grief ->
# the farewell.
# Gm Eb Cm D.
def elegy_for_the_fallen_king():
    bpm = 64
    bars = 16
    total = bars * 4
    choir = Voice37(bpm, total)
    strings = Voice37(bpm, total)
    solo = Voice37(bpm, total)
    bell = Voice37(bpm, total)
    bass = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Cm = [n("C3"), n("Eb3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Gm, Eb, Cm, D] * 4
    roots = [n("G1"), n("Eb2"), n("C2"), n("D2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.08    # the procession
        if i < 12:
            return 1.0                # the grief
        return 1.0 - (i - 12) * 0.16  # the farewell

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the mourners: low choir holds the chords
        for m in ch:
            choir.choir(b, m, 4.4, vel=v * 0.34)
        # the counter-line: strings answer in half notes
        strings.strings(b, ch[2] + 12, 2.0, vel=v * 0.32)
        strings.strings(b + 2, ch[1] + 12, 2.0, vel=v * 0.30)
        # the great bell tolls the king's name
        bell.bell(b, ch[0] + 12, 8, vel=v * 0.36)
        # the deep foundation: patient bass
        bass.bass(b, root, 3.5, vel=v * 0.50, cutoff=220)

    # an original lament: one voice against the silence
    elegy = [
        (0, "D4", 8),
        (8, "Eb4", 4), (12, "D4", 4),
        (16, "C4", 8),
        (24, "Bb3", 4), (28, "A3", 4),
        (32, "Bb3", 8),
        (40, "C4", 4), (44, "D4", 4),
        (48, "Eb4", 8),
        (56, "D4", 8),
    ]
    for off, note, d in elegy:
        v = arc_vel(int(off // 4))
        solo.solo(off, n(note), d, vel=v * 0.46)

    stems = {"choir": choir, "strings": strings, "solo": solo,
             "bell": bell, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("elegy-for-the-fallen-king", stems,
            {"choir": 0.88, "strings": 0.86, "solo": 0.90,
             "bell": 0.85, "bass": 0.90}, False)


# ==================================================== THE-GILDED-STANDARD
# The banner goes up and the host takes heart: pride made audible.
# Bb major, 112 BPM. 16 bars. Loop (sample-exact).
# Bb Gm Eb F.
def the_gilded_standard():
    bpm = 112
    bars = 16
    total = bars * 4
    brass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)
    strings = Voice37(bpm, total)
    fife = Voice37(bpm, total)
    bass = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb2"), n("G2"), n("Bb2")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Bb, Gm, Eb, F] * 4
    roots = [n("Bb1"), n("G1"), n("Eb2"), n("F1")] * 4

    v = 0.90
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the fanfare: brass on every beat
        brass.brass(b, ch[0], 1.0, vel=v * 0.50)
        brass.brass(b + 1, ch[2], 1.0, vel=v * 0.46)
        brass.brass(b + 2, ch[1], 1.0, vel=v * 0.50)
        brass.brass(b + 3, ch[0], 1.0, vel=v * 0.46)
        # the parade drum: taiko and snare
        drums.taiko(b, vel=v * 0.55)
        drums.snare(b + 1, vel=v * 0.45)
        drums.taiko(b + 2, vel=v * 0.55)
        drums.snare(b + 3, vel=v * 0.45)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.24)
        if i == 0:
            drums.crash(b, vel=0.70)
        # the standard-bearer's step: string eighths
        ost = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12,
               ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12]
        for k, m in enumerate(ost):
            strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.34)
        # the colors: quarter-note roots
        for k in range(4):
            bass.bass(b + k, root, 0.8, vel=v * 0.55, cutoff=480)

    # an original standard-air: bright, open, unashamed
    gilded = [
        (0, "F4", 2), (2, "F4", 2), (4, "Bb4", 4),
        (8, "A4", 2), (10, "G4", 2), (12, "F4", 4),
        (16, "Eb4", 2), (18, "F4", 2), (20, "G4", 4),
        (24, "F4", 8),
        (32, "F4", 2), (34, "G4", 2), (36, "A4", 4),
        (40, "Bb4", 4), (44, "A4", 4),
        (48, "G4", 2), (50, "F4", 2), (52, "Eb4", 2), (54, "D4", 2),
        (56, "Eb4", 4), (60, "F4", 4),
    ]
    for off, note, d in gilded:
        fife.fife(off, n(note), d, vel=v * 0.44)

    stems = {"brass": brass, "drums": drums, "strings": strings,
             "fife": fife, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-gilded-standard", stems,
            {"brass": 0.90, "drums": 0.92, "strings": 0.86,
             "fife": 0.90, "bass": 0.90}, True)


# ============================================= FURY-OF-THE-NORTHERN-HOST
# Longships on the shore: the north comes screaming out of the mist.
# E minor, 136 BPM. 16 bars. Arc: landfall -> the shield wall breaks ->
# the rout.
# Em C G D.
def fury_of_the_northern_host():
    bpm = 136
    bars = 16
    total = bars * 4
    pipes = Voice37(bpm, total)
    drums = c27.Track(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    choir = Voice37(bpm, total)

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
            return 0.50 + i * 0.12    # the longships land
        if i < 12:
            return 1.0                # the shield wall breaks
        return 1.0 - (i - 12) * 0.16  # the rout

    # the pipes never stop: drones under the whole track
    pipes.drones(0, n("E2"), total, vel=0.60)
    pipes.drones(0, n("B2"), total, vel=0.50)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the war-drums: relentless taiko eighths
        for k in range(8):
            drums.taiko(b + k * 0.5, vel=v * 0.55)
        drums.kick(b + 0.25, vel=v * 0.50)
        drums.kick(b + 2.25, vel=v * 0.50)
        if 4 <= i < 12:
            drums.snare(b + 1, vel=v * 0.45)
            drums.snare(b + 3, vel=v * 0.45)
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.24)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the axe-blows: brass stabs in the fury
        if 4 <= i < 12:
            brass.brass(b, ch[0], 0.5, vel=v * 0.48)
            brass.brass(b + 1, ch[1], 0.5, vel=v * 0.44)
            brass.brass(b + 2, ch[2], 0.5, vel=v * 0.48)
            brass.brass(b + 3, ch[0], 0.5, vel=v * 0.44)
        # the charge: driving eighth roots
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.4, vel=v * 0.56,
                       cutoff=430)
        # the war-chant: voices rise with the fury
        if 4 <= i < 12:
            for m in ch:
                choir.choir(b, m - 12, 3.6, vel=v * 0.32)

    # an original war-pipe tune: no retreat in it
    fury = [
        (0, "E4", 1), (1, "E4", 1), (2, "G4", 2),
        (4, "A4", 2), (6, "G4", 2),
        (8, "F#4", 1), (9, "G4", 1), (10, "A4", 2),
        (12, "B4", 4),
        (16, "A4", 2), (18, "G4", 2), (20, "F#4", 4),
        (24, "G4", 2), (26, "A4", 2), (28, "B4", 4),
        (32, "A4", 4), (36, "G4", 4),
        (40, "F#4", 2), (42, "E4", 2), (44, "D4", 4),
        (48, "E4", 8),
        (56, "E4", 4), (60, "D4", 4),
    ]
    for off, note, d in fury:
        v = arc_vel(int(off // 4))
        pipes.chanter(off, n(note), d, vel=v * 0.46)

    stems = {"bagpipes": pipes, "drums": drums, "brass": brass,
             "bass": bass, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("fury-of-the-northern-host", stems,
            {"bagpipes": 0.90, "drums": 0.95, "brass": 0.90,
             "bass": 0.90, "choir": 0.88}, False)


# ============================================================ render
TRACKS = [
    (the_winter_march, 0.20),
    (drums_of_the_night_watch, 0.22),
    (the_ploughmans_tale, 0.16),
    (elegy_for_the_fallen_king, 0.20),
    (the_gilded_standard, 0.18),
    (fury_of_the_northern_host, 0.24),
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
