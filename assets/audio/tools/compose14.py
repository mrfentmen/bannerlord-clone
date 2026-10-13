"""Fourteenth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-13 moods already covered - do not duplicate):
  ashfall, the-great-library, border-raiders,
  the-siege-tower, homeward, eclipse.
Render: python3 compose14.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import (Track, reverb_stereo, limiter, write_wav, SR,
                   midi_to_freq, adsr, lowpass, highpass, noise)

OUT = "/home/hatch/workspace/staging/music14/out"
MP3 = "/home/hatch/workspace/staging/music14/out/mp3"
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


def glass_note(midi, dur, vel=1.0):
    """Icy glass bell: brittle high partials, long frozen decay."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (0.60 * np.sin(2 * np.pi * f * t)
         + 0.25 * np.sin(2 * np.pi * f * 2.76 * t)
         + 0.15 * np.sin(2 * np.pi * f * 5.40 * t))
    x *= np.exp(-t * 1.8)
    return x * vel * 0.5


def gong_note(dur=4.0, vel=1.0):
    """Deep ceremonial gong: low swell + metallic bloom."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = 65.0
    x = (np.sin(2 * np.pi * f * t) * 0.5
         + np.sin(2 * np.pi * f * 1.51 * t) * 0.25
         + np.sin(2 * np.pi * f * 2.02 * t) * 0.15)
    swell = np.minimum(t / 0.4, 1.0) * np.exp(-t * 1.1)
    hit = lowpass(noise(n_), 800) * np.exp(-t * 25) * 0.4
    return (x * swell + hit) * vel * 0.6


def choir_note(midi, dur, vel=1.0, solo=False):
    """Massed-voice 'ooh': detuned harmonic stack, slow bloom, soft vibrato.
    solo=True raises the formant for a soprano-like lead voice."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = np.zeros(n_)
    for det in (-6, 5):
        fr = f * (2.0 ** (det / 1200.0))
        vib = 4.5 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(t / 0.4, 1.0)
        inst = np.cumsum(2 * np.pi * (fr + vib) / SR)
        x += (0.45 * np.sin(inst) + 0.22 * np.sin(2 * inst)
              + 0.12 * np.sin(3 * inst) + 0.06 * np.sin(4 * inst))
    x = lowpass(x, 2400.0 if solo else 1400.0)
    if not solo:
        x = highpass(x, 120.0)
    env = adsr(n_, 0.7 if not solo else 0.25, 0.4, 0.85,
               min(1.5, dur * 0.3))
    return x * env * vel * 0.35


def blast_note(dur=2.5, vel=1.0):
    """Wall-breaching explosion: crack, sub thump, stone rumble."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = lowpass(noise(n_), 400) * np.exp(-t * 3.0)
    sub = np.sin(2 * np.pi * 40 * t) * np.exp(-t * 4.0)
    crack = highpass(noise(n_), 1500) * np.exp(-t * 30) * 0.7
    return (x * 0.8 + sub * 0.7 + crack) * vel * 0.9


def rumble_note(dur=4.0, vel=1.0):
    """Volcanic rumble: sub-bass churn with grit."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    churn = lowpass(noise(n_), 90) * 0.7
    sub = np.sin(2 * np.pi * 33 * t) * 0.5
    grit = lowpass(noise(n_), 500) * 0.18 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.4 * t))
    env = np.minimum(t / 1.2, 1.0) * np.exp(-np.maximum(t - dur + 1.0, 0) * 2.0)
    return (churn + sub + grit) * env * vel * 0.6


class VoiceTrack(Track):
    def choir(self, b, midi, dur_beats, **kw):
        self._place(choir_note(midi, self._b2s(dur_beats), **kw), b)

    def solo(self, b, midi, dur_beats, **kw):
        kw = dict(kw)
        kw["solo"] = True
        self._place(choir_note(midi, self._b2s(dur_beats), **kw), b)

    def blast(self, b, dur_beats=4, **kw):
        self._place(blast_note(self._b2s(dur_beats), **kw), b)

    def gong(self, b, dur_beats=4, **kw):
        self._place(gong_note(self._b2s(dur_beats), **kw), b)

    def glass(self, b, midi, dur_beats=4, **kw):
        self._place(glass_note(midi, self._b2s(dur_beats), **kw), b)

    def rumble(self, b, dur_beats=4, **kw):
        self._place(rumble_note(self._b2s(dur_beats), **kw), b)


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


# ============================================================ ASHFALL
# Volcanic eruption aftermath: grey and heavy. C# minor, 68 BPM.
# 16 bars. Loop.
# C# minor: C# D# E F# G# A B - the sky is the colour of old iron.
def ashfall():
    bpm = 68
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)
    rumble = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Csm = [n("C#3"), n("E3"), n("G#3")]
    A = [n("A2"), n("C#3"), n("E3")]
    E = [n("E2"), n("G#2"), n("B2")]
    B = [n("B2"), n("D#3"), n("F#3")]
    prog = [Csm, A, E, B] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # the earth's heartbeat: two deep taiko a bar apart, never hurrying
        drums.taiko(b, vel=0.9)
        drums.taiko(b + 2, vel=0.6)
        if i % 4 == 3:
            drums.taiko(b + 3, vel=0.75)
            drums.taiko(b + 3.5, vel=0.75)
        # low brass chords, muted by the ash
        for m in ch:
            brass.brass(b, m, 3.6, vel=0.5)
        # sub-bass roots
        bass.bass(b, root - 24, 3.6, vel=0.75, cutoff=200)
        # ash on the wind
        windt.wind(b, 4, vel=0.35)
        # volcanic rumble under every fourth bar
        if i % 4 == 0:
            rumble.rumble(b, 8, vel=0.5)

    # a single horn, calling through the grey
    caller = [
        (0, "G#4", 3), (4, "E4", 2), (6, "C#4", 3),
        (16, "A4", 2), (18, "G#4", 2), (20, "E4", 4),
        (32, "B4", 3), (36, "A4", 2), (38, "G#4", 3),
        (48, "E4", 2), (50, "D#4", 2), (52, "C#4", 4),
    ]
    for off, note, d in caller:
        brass.brass(off, n(note), d, vel=0.55)

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "wind": windt, "rumble": rumble}
    for s in stems.values():
        s.trim()
    return ("ashfall", stems,
            {"drums": 0.9, "brass": 0.8, "bass": 0.9,
             "wind": 0.8, "rumble": 0.85}, True)


# ============================================================ THE-GREAT-LIBRARY
# Knowledge and secrets: hushed wonder. D major, 74 BPM. 16 bars. Loop.
# D major: D E F# G A B C# - ten thousand candles, and not one raised voice.
def the_great_library():
    bpm = 74
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    pads = Track(bpm, total)
    glass = VoiceTrack(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [D, Bm, G, A] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # hushed pads: the room itself breathing
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.5, attack=2.0,
                 cutoff=1300)
        # soft plucked arpeggios, like turning pages
        arp = [12, 15, 19, 24, 19, 15]
        for k, st in enumerate(arp):
            pluck.pluck(b + k * (2 / 3), root + 12 + st, 0.9, vel=0.34)
        # glass bells: knowledge chiming in the dark stacks
        if i % 2 == 0:
            glass.glass(b + 1, root + 36, 2.5, vel=0.4)
            glass.glass(b + 3, root + 43, 2.5, vel=0.32)
        # barely-there bass
        bass.bass(b, root - 24, 3.4, vel=0.5, cutoff=260)
        # dust in the sunbeams
        pads.wind(b, 4, vel=0.18)

    # the secret melody: a flute in the far gallery
    secret = [
        (0, "D5", 2), (2, "E5", 2), (4, "F#5", 3),
        (8, "E5", 2), (10, "D5", 4),
        (16, "B4", 2), (18, "D5", 2), (20, "G5", 3),
        (24, "F#5", 2), (26, "E5", 4),
        (32, "A4", 2), (34, "B4", 2), (36, "D5", 2), (38, "E5", 2),
        (40, "F#5", 4), (44, "E5", 4),
        (48, "D5", 3), (52, "C#5", 2), (54, "B4", 2), (56, "A4", 4),
    ]
    for off, note, d in secret:
        lead.lead(off, n(note), d, vel=0.52, vibrato=6.0, vib_depth=5.0)

    stems = {"pluck": pluck, "pads": pads, "glass": glass,
             "lead": lead, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-great-library", stems,
            {"pluck": 0.9, "pads": 0.8, "glass": 0.85,
             "lead": 0.9, "bass": 0.8}, True)


# ============================================================ BORDER-RAIDERS
# Fast hit-and-run attacks. A minor, 132 BPM. 12 bars. Arc.
# A minor: A B C D E F G - they strike at dawn and are gone by noon.
def border_raiders():
    bpm = 132
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    E = [n("E2"), n("G#2"), n("B2")]
    prog = [Am, Am, F, Dm, Am, E, Am, F, Dm, E, Am, Am]

    def arc_vel(i):
        if i < 4:
            return 0.45 + i * 0.12   # the approach
        if i < 8:
            return 0.95              # the raid
        return 0.95 - (i - 8) * 0.18  # the getaway

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # galloping drums: the hoofbeat pattern
        for beat in range(4):
            drums.kick(b + beat, vel=v * 0.8)
            if beat % 2:
                drums.kick(b + beat + 0.25, vel=v * 0.5)
        drums.snare(b + 1, vel=v * 0.7)
        drums.snare(b + 3, vel=v * 0.7)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.4)
        if i in (0, 7):
            drums.crash(b, vel=v * 0.6)
        # driving bass: root pumping eighths
        for k in range(8):
            st = 0 if k % 4 < 2 else 7
            bass.bass(b + k * 0.5, root - 12 + st, 0.42,
                      vel=v * 0.7, cutoff=600)
        # brass stabs on the offbeats during the raid
        if 4 <= i < 8:
            for m in ch:
                brass.brass(b + 0.5, m + 12, 0.4, vel=v * 0.6)
                brass.brass(b + 2.5, m + 12, 0.4, vel=v * 0.55)
        # dust kicked up
        windt.wind(b, 4, vel=v * 0.25)

    # the raiders' signal: a horn that means run
    signal = [
        (8, "A4", 0.5), (8.5, "A4", 0.5), (9, "C5", 1),
        (16, "E5", 0.5), (16.5, "D5", 0.5), (17, "C5", 0.5), (17.5, "B4", 1),
        (20, "A4", 2),
        (28, "C5", 0.5), (28.5, "D5", 0.5), (29, "E5", 1),
        (32, "A5", 1), (33, "G5", 1), (34, "E5", 1), (35, "D5", 1),
        (36, "C5", 2), (38, "B4", 2),
        (40, "A4", 4),
    ]
    for off, note, d in signal:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.65, vibrato=6.5, vib_depth=4.0)

    stems = {"drums": drums, "bass": bass, "brass": brass,
             "lead": lead, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("border-raiders", stems,
            {"drums": 0.9, "bass": 0.9, "brass": 0.85,
             "lead": 0.85, "wind": 0.8}, False)


# ============================================================ THE-SIEGE-TOWER
# Slow inexorable advance. F minor, 64 BPM. 12 bars. Arc.
# F minor: F G Ab Bb C Db Eb - it does not stop. It has never stopped.
def the_siege_tower():
    bpm = 64
    bars = 12
    total = bars * 4
    drums = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Fm = [n("F2"), n("Ab2"), n("C3")]
    Db = [n("Db3"), n("F3"), n("Ab3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("Eb3"), n("G3")]

    # --- bars 0-5: the tower rolls forward
    for i in range(6):
        b = bar(i)
        v = 0.40 + i * 0.08
        # massive taiko, one per bar, getting closer
        drums.taiko(b, vel=v)
        drums.taiko(b + 2, vel=v * 0.5)
        # low brass swells: the creak of ten thousand timbers
        ch = [Fm, Db, Fm, Bb, Fm, C][i]
        for m in ch:
            brass.brass(b, m, 3.8, vel=v * 0.55)
        # sub-bass pedal
        bass.bass(b, ch[0] - 24, 3.8, vel=v * 0.8, cutoff=200)
        # rope and wood groaning
        windt.wind(b, 4, vel=v * 0.25)
    # gongs mark the tower's shadow crossing the wall
    drums.gong(bar(2), 6, vel=0.5)
    drums.gong(bar(4), 6, vel=0.6)

    # --- bars 6-8: the bridge drops
    for i in (6, 7, 8):
        b = bar(i)
        v = 0.95 - (i - 6) * 0.08
        drums.taiko(b, vel=v)
        drums.taiko(b + 1, vel=v * 0.8)
        drums.taiko(b + 2, vel=v * 0.8)
        drums.taiko(b + 3, vel=v * 0.9)
        drums.crash(b, vel=v * 0.6)
        ch = [C, Db, Fm][i - 6]
        for m in ch:
            brass.brass(b, m + 12, 1.6, vel=v * 0.7)
            brass.brass(b + 2, m + 12, 1.4, vel=v * 0.6)
        bass.bass(b, ch[0] - 24, 3.4, vel=v * 0.85, cutoff=350)
    drums.blast(bar(8), 4, vel=0.8)  # the bridge slams down

    # --- bars 9-11: the wall is breached
    for i in (9, 10, 11):
        b = bar(i)
        v = 0.85 - (i - 9) * 0.15
        drums.taiko(b, vel=v * 0.8)
        drums.taiko(b + 2.5, vel=v * 0.5)
        for m in Fm:
            brass.brass(b, m + 12, 2.5, vel=v * 0.6)
        bass.bass(b, n("F1"), 3.6, vel=v * 0.75, cutoff=220)
        windt.wind(b, 4, vel=v * 0.3)

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "wind": windt}
    for s in stems.values():
        s.trim()
    return ("the-siege-tower", stems,
            {"drums": 0.95, "brass": 0.85, "bass": 0.9,
             "wind": 0.8}, False)


# ============================================================ HOMEWARD
# The road back after war: weary warmth. C major, 80 BPM. 16 bars. Loop.
# C major: C D E F G A B - the smoke is behind them now.
def homeward():
    bpm = 80
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("E3"), n("G3")]
    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [C, Am, F, G] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # warm pads, like a fire seen through a window
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.55, attack=1.6,
                 cutoff=1600)
        # tired but hopeful arpeggios
        arp = [12, 15, 19, 24, 19, 15]
        for k, st in enumerate(arp):
            pluck.pluck(b + k * (2 / 3), root + 12 + st, 1.0, vel=0.44)
        # walking bass, slower than the war demanded
        bass.bass(b, root - 24, 1.6, vel=0.62, cutoff=320)
        bass.bass(b + 2, root - 24 + 7, 1.6, vel=0.58, cutoff=320)
        # soft frame-drum, like a footfall
        drums.taiko(b, vel=0.35)
        drums.hat(b + 2, vel=0.18)

    # the way home: a melody that keeps looking back
    way = [
        (0, "E4", 2), (2, "G4", 2), (4, "A4", 2), (6, "G4", 2),
        (8, "E4", 3), (12, "D4", 3),
        (16, "C4", 2), (18, "D4", 2), (20, "E4", 3), (24, "G4", 3),
        (28, "A4", 4),
        (32, "G4", 2), (34, "E4", 2), (36, "D4", 2), (38, "E4", 2),
        (40, "C4", 4), (44, "D4", 4),
        (48, "E4", 2), (50, "G4", 2), (52, "A4", 3),
        (56, "G4", 2), (58, "E4", 2), (60, "D4", 4),
    ]
    for off, note, d in way:
        lead.lead(off, n(note), d, vel=0.60, vibrato=4.5, vib_depth=4.5)

    stems = {"pluck": pluck, "pads": pads, "lead": lead,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("homeward", stems,
            {"pluck": 0.9, "pads": 0.8, "lead": 0.9,
             "bass": 0.8, "drums": 0.8}, True)


# ============================================================ ECLIPSE
# Ominous celestial event. B diminished, 58 BPM. 12 bars. Arc.
# B diminished: B D F - the sun goes out at noon and nobody ordered it.
def eclipse():
    bpm = 58
    bars = 12
    total = bars * 4
    gongt = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    pads = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Bdim = [n("B2"), n("D3"), n("F3")]
    # --- bars 0-4: the shadow falls
    for i in range(5):
        b = bar(i)
        v = 0.35 + i * 0.10
        # the dark choir, low and wordless
        for m in Bdim:
            choir.choir(b, m, 3.8, vel=v * 0.7)
        # dissonant pads: the sky is wrong
        pads.pad(b, [n("B2"), n("C3"), n("F3")], 4, vel=v * 0.5,
                 attack=2.8, cutoff=900)
        # slow drums, like a dying pulse
        drums.taiko(b, vel=v * 0.7)
        drums.taiko(b + 2, vel=v * 0.4)
    gongt.gong(bar(0), 8, vel=0.55)  # the first shadow

    # --- bars 5-8: totality
    b5 = bar(5)
    gongt.blast(b5, 6, vel=0.9)  # the corona flares
    gongt.gong(b5, 10, vel=0.7)
    for i in (5, 6, 7, 8):
        b = bar(i)
        v = 0.95 - (i - 5) * 0.08
        for m in Bdim:
            choir.choir(b, m - 12, 3.8, vel=v * 0.8)
            choir.choir(b, m + 12, 3.8, vel=v * 0.4)
        pads.pad(b, [n("B1"), n("D2"), n("F2")], 4, vel=v * 0.6,
                 attack=1.5, cutoff=700)
        drums.taiko(b, vel=v * 0.9)
        drums.taiko(b + 1, vel=v * 0.7)
        drums.taiko(b + 2, vel=v * 0.7)
        drums.taiko(b + 3, vel=v * 0.8)

    # --- bars 9-11: the light returns, changed
    for i in (9, 10, 11):
        b = bar(i)
        v = 0.60 - (i - 9) * 0.15
        for m in Bdim:
            choir.choir(b, m, 3.8, vel=v * 0.6)
        pads.pad(b, [n("B2"), n("D3"), n("G3")], 4, vel=v * 0.45,
                 attack=2.5, cutoff=1100)  # G major peeking through
        drums.taiko(b, vel=v * 0.6)
    gongt.gong(bar(11), 6, vel=0.4)  # one last bell

    stems = {"gong": gongt, "choir": choir, "pads": pads,
             "drums": drums}
    for s in stems.values():
        s.trim()
    return ("eclipse", stems,
            {"gong": 0.95, "choir": 0.9, "pads": 0.85,
             "drums": 0.85}, False)


# ============================================================ render
def mix_track14(name, stems, gains, reverb_wet=0.18, loop=False):
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
    assert sil_frac == 0.0, f"{name}: silence gaps {sil_frac:.2%}"
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
    (ashfall, 0.22),
    (the_great_library, 0.20),
    (border_raiders, 0.16),
    (the_siege_tower, 0.20),
    (homeward, 0.22),
    (eclipse, 0.24),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track14(name, stems, gains, reverb_wet=wet,
                                     loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
