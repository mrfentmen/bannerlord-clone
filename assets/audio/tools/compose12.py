"""Twelfth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-11 moods already covered - do not duplicate):
  frozen-steel, lantern-festival, the-admiral, dust-devils,
  coronation-eve, last-harvest.
Render: python3 compose12.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import (Track, reverb_stereo, limiter, write_wav, SR,
                   midi_to_freq, adsr, lowpass, noise)

OUT = "/home/hatch/workspace/staging/music12/out"
MP3 = "/home/hatch/workspace/staging/music12/out/mp3"
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


class ExtraTrack(Track):
    def glass(self, b, midi, dur_beats, **kw):
        self._place(glass_note(midi, self._b2s(dur_beats), **kw), b)

    def gong(self, b, dur_beats=4, **kw):
        self._place(gong_note(self._b2s(dur_beats), **kw), b)


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


# ============================================================ FROZEN-STEEL
# Arctic warfare: brittle and vast. F# minor, 76 BPM. 16 bars. Loop.
# F# minor: F# G# A B C# D E - the wind has teeth and the steel sings cold.
def frozen_steel():
    bpm = 76
    bars = 16
    total = bars * 4
    glass = ExtraTrack(bpm, total)
    pads = Track(bpm, total)
    pluck = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D3"), n("F#3"), n("A3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    Csm = [n("C#3"), n("E3"), n("G#3")]
    prog = [Fsm, D, Bm, Csm] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # frozen air: cold pads, slow bloom
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.5, attack=2.2,
                 cutoff=900)
        # brittle crystals: sparse high glass plucks on the offbeats
        for k, st in enumerate((12, 19, 24, 19)):
            pluck.pluck(b + 0.5 + k * 1.0, root + 12 + st, 0.8, vel=0.35)
        # deep ice: sub-bass roots
        bass.bass(b, root - 24, 3.4, vel=0.7, cutoff=200)
        # the wind has teeth
        windt.wind(b, 4, vel=0.45)
        # distant war drums through the blizzard
        if i % 2 == 0:
            windt.taiko(b, vel=0.55)
            windt.taiko(b + 2.5, vel=0.3)

    # steel singing cold: a sparse glass theme across the tundra
    tundra = [
        (0, "F#5", 3), (4, "A5", 3),
        (8, "E5", 4), (12, "C#5", 4),
        (16, "D5", 3), (20, "B4", 3),
        (24, "A4", 4), (28, "F#4", 4),
        (32, "G#4", 2), (34, "A4", 2),
        (36, "B4", 4), (40, "C#5", 4),
        (44, "D5", 2), (46, "E5", 2),
        (48, "F#5", 6), (56, "E5", 2),
        (58, "D5", 2), (60, "C#5", 4),
    ]
    for off, note, d in tundra:
        glass.glass(off, n(note), d, vel=0.7)

    stems = {"glass": glass, "pads": pads, "pluck": pluck,
             "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("frozen-steel", stems,
            {"glass": 0.95, "pads": 0.8, "pluck": 0.8,
             "bass": 0.85, "wind": 0.85}, True)


# ============================================================ LANTERN-FESTIVAL
# Peacetime celebration: lanterns and drums. G major, 104 BPM. 16 bars. Loop.
# G major: G A B C D E F# - coin, laughter, paper lanterns rising.
def lantern_festival():
    bpm = 104
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    drums = ExtraTrack(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    Em = [n("E3"), n("G3"), n("B3")]
    prog = [G, C, G, D, G, C, Em, D] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # festival drums: kick 1 & 3, handclap 2 & 4, bright hats
        drums.kick(b, vel=0.7)
        drums.kick(b + 2, vel=0.6)
        drums.snare(b + 1, vel=0.6)
        drums.snare(b + 3, vel=0.6)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.35)
        if i in (0, 8):
            drums.gong(b, 4, vel=0.5)
        if i in (7, 15):
            drums.tom(b + 3.5, freq=150, vel=0.6)
        # strummed street-lute on the offbeats
        for m in ch:
            pluck.pluck(b + 0.5, m + 12, 0.6, vel=0.55)
            pluck.pluck(b + 1.5, m + 12, 0.6, vel=0.5)
            pluck.pluck(b + 2.5, m + 12, 0.6, vel=0.55)
            pluck.pluck(b + 3.5, m + 12, 0.6, vel=0.5)
        # dancing bass
        walk = [0, 4, 7, 9, 12, 9, 7, 4]
        for k, st in enumerate(walk):
            bass.bass(b + k * 0.5, root - 12 + st, 0.42, vel=0.65,
                      cutoff=520)
        # crowd of the festival
        windt.wind(b, 4, vel=0.14)

    # the lanterns' dance: a pentatonic tune that refuses to sit still
    lanterns = [
        (0, "D4", 0.5), (0.5, "E4", 0.5), (1, "G4", 1),
        (2, "A4", 0.5), (2.5, "B4", 0.5), (3, "D5", 1),
        (4, "B4", 1), (5, "A4", 1), (6, "G4", 2),
        (8, "A4", 0.5), (8.5, "B4", 0.5), (9, "D5", 1),
        (10, "E5", 0.5), (10.5, "D5", 0.5), (11, "B4", 1),
        (12, "A4", 1), (13, "G4", 2),
        (16, "E4", 0.5), (16.5, "G4", 0.5), (17, "A4", 1),
        (18, "B4", 0.5), (18.5, "D5", 0.5), (19, "E5", 1),
        (20, "D5", 1), (21, "B4", 1), (22, "A4", 2),
        (24, "G4", 1), (25, "A4", 1), (26, "B4", 1), (27, "A4", 1),
        (28, "G4", 2), (30, "D4", 2),
        (32, "D5", 0.5), (32.5, "E5", 0.5), (33, "D5", 0.5),
        (33.5, "B4", 0.5), (34, "A4", 1), (35, "B4", 1), (36, "G4", 2),
        (40, "A4", 1), (41, "B4", 1), (42, "D5", 1), (43, "B4", 1),
        (44, "A4", 1), (45, "G4", 1), (46, "E4", 2),
        (48, "G4", 0.5), (48.5, "A4", 0.5), (49, "B4", 1),
        (50, "D5", 1), (51, "E5", 0.5), (51.5, "D5", 0.5),
        (52, "B4", 1), (53, "A4", 1), (54, "G4", 2),
        (56, "D4", 1), (57, "E4", 1), (58, "G4", 1), (59, "A4", 1),
        (60, "B4", 1), (61, "A4", 1), (62, "G4", 2),
    ]
    for off, note, d in lanterns:
        lead.lead(off, n(note), d, vel=0.62, vibrato=6.0, vib_depth=4.0)

    stems = {"pluck": pluck, "drums": drums, "lead": lead,
             "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("lantern-festival", stems,
            {"pluck": 0.9, "drums": 0.85, "lead": 0.85,
             "bass": 0.8, "wind": 0.8}, True)


# ============================================================ THE-ADMIRAL
# Naval legend: rolling and proud. C minor, 88 BPM, 12 bars of 6/8. Arc.
# C minor: C D Eb F G Ab Bb - a sea-shanty that became a legend.
# Note: 6/8 here - each Track "beat" is one eighth note, 6 per bar.
def the_admiral():
    bpm = 88
    bars = 12
    total = bars * 6
    brass = Track(bpm, total)
    drums = ExtraTrack(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 6

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    BbM = [n("Bb2"), n("D3"), n("F3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Cm, Cm, Ab, BbM, Cm, Ab, G, Cm, BbM, Ab, G, Cm]

    def arc_vel(i):
        if i < 3:
            return 0.40 + i * 0.06
        if i < 8:
            return 0.58 + (i - 3) * 0.08
        if i < 10:
            return 0.98
        return 0.90 - (i - 10) * 0.25

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # the rolling sea: great drum on 1, answering on 4
        drums.taiko(b, vel=v * 0.9)
        drums.tom(b + 3, freq=130, vel=v * 0.5)
        if i >= 7:
            drums.snare(b + 3, vel=v * 0.8)
            for m in ch:
                brass.brass(b, m + 12, 2.2, vel=v * 0.65)
                brass.brass(b + 3, m + 12, 2.2, vel=v * 0.55)
        if i == 8:
            drums.crash(b, vel=v * 0.5)
        # below decks: dotted-half roots
        bass.bass(b, root - 12, 2.6, vel=v * 0.75, cutoff=280)
        bass.bass(b + 3, root - 12, 2.4, vel=v * 0.65, cutoff=280)
        # salt spray
        windt.wind(b, 6, vel=v * 0.5)

    # the admiral's theme: sung in every tavern from here to the far shore
    shanty = [
        (0, "G4", 2), (2, "C5", 2), (4, "Eb5", 2),
        (6, "D5", 2), (8, "C5", 2), (10, "Bb4", 2),
        (12, "Ab4", 2), (14, "Bb4", 2), (16, "C5", 4),
        (20, "G4", 2), (22, "Ab4", 2),
        (24, "Bb4", 2), (26, "C5", 2), (28, "D5", 2),
        (30, "Eb5", 2), (32, "D5", 2), (34, "C5", 2),
        (36, "Bb4", 4), (40, "Ab4", 2),
        (42, "G4", 1), (43, "Ab4", 1), (44, "Bb4", 1),
        (45, "C5", 1), (46, "D5", 1), (47, "Eb5", 1),
        (48, "D5", 2), (50, "C5", 2), (52, "Bb4", 2),
        (54, "C5", 2), (56, "D5", 2), (58, "Eb5", 2),
        (60, "G5", 2), (62, "F5", 2), (64, "Eb5", 2),
        (66, "D5", 2), (68, "C5", 4),
    ]
    for off, note, d in shanty:
        lead.lead(off, n(note), d, vel=0.7, vibrato=5.0, vib_depth=4.0)

    stems = {"brass": brass, "drums": drums, "bass": bass,
             "lead": lead, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("the-admiral", stems,
            {"brass": 0.85, "drums": 0.9, "bass": 0.85,
             "lead": 0.9, "wind": 0.85}, False)


# ============================================================ DUST-DEVILS
# Desert skirmish: swirling and hot. E phrygian, 118 BPM. 16 bars. Loop.
# E phrygian: E F G A B C D - the b2 bites like wind-driven sand.
def dust_devils():
    bpm = 118
    bars = 16
    total = bars * 4
    lead = Track(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pluck = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E2"), n("G2"), n("B2")]
    F = [n("F2"), n("A2"), n("C3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Em, F, Em, G] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # the charge: four-on-the-floor, driving snare
        for beat in range(4):
            drums.kick(b + beat, vel=0.7)
        drums.snare(b + 1, vel=0.75)
        drums.snare(b + 3, vel=0.75)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.4)
        if i % 4 == 3:
            drums.tom(b + 3.5, freq=140, vel=0.65)
        # galloping bass: root root octave
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12 + (7 if k % 2 else 0),
                      0.42, vel=0.75, cutoff=650)
        # swirling sand-guitar: bright arpeggio
        arp = [12, 15, 19, 24, 19, 15]
        for k, st in enumerate(arp):
            pluck.pluck(b + k * (2 / 3), root + 12 + st, 0.7, vel=0.42)
        # the wind carries sand
        windt.wind(b, 4, vel=0.35)

    # the snake-charmer's war cry: sinuous, venomous, proud
    charmer = [
        (0, "E5", 0.5), (0.5, "F5", 0.5), (1, "E5", 0.5),
        (1.5, "D5", 0.5), (2, "C5", 1), (3, "B4", 1),
        (4, "A4", 0.5), (4.5, "B4", 0.5), (5, "C5", 1),
        (6, "D5", 0.5), (6.5, "E5", 0.5), (7, "F5", 1),
        (8, "G5", 1), (9, "F5", 0.5), (9.5, "E5", 0.5),
        (10, "D5", 1), (11, "C5", 1),
        (12, "B4", 0.5), (12.5, "C5", 0.5), (13, "D5", 1), (14, "E5", 2),
        (16, "F5", 0.5), (16.5, "G5", 0.5), (17, "F5", 0.5),
        (17.5, "E5", 0.5), (18, "D5", 1), (19, "C5", 1),
        (20, "B4", 1), (21, "A4", 1), (22, "G4", 1), (23, "F4", 1),
        (24, "E4", 2), (26, "F4", 2), (28, "E4", 2), (30, "D4", 2),
        (32, "E5", 1), (33, "D5", 1), (34, "C5", 1), (35, "B4", 1),
        (36, "A4", 1), (37, "G4", 1), (38, "F4", 1), (39, "E4", 1),
        (40, "F4", 0.5), (40.5, "E4", 0.5), (41, "D4", 0.5),
        (41.5, "C4", 0.5), (42, "B3", 2), (44, "E4", 2),
        (48, "G5", 0.5), (48.5, "F5", 0.5), (49, "E5", 1),
        (50, "F5", 0.5), (50.5, "E5", 0.5), (51, "D5", 1), (52, "C5", 2),
        (54, "D5", 0.5), (54.5, "E5", 0.5), (55, "F5", 1),
        (56, "E5", 1), (57, "D5", 1), (58, "C5", 1), (59, "B4", 1),
        (60, "A4", 1), (61, "B4", 1), (62, "C5", 2),
    ]
    for off, note, d in charmer:
        lead.lead(off, n(note), d, vel=0.68, vibrato=7.0, vib_depth=3.0)

    stems = {"lead": lead, "drums": drums, "bass": bass,
             "pluck": pluck, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("dust-devils", stems,
            {"lead": 0.9, "drums": 0.85, "bass": 0.85,
             "pluck": 0.85, "wind": 0.8}, True)


# ============================================================ CORONATION-EVE
# Quiet before power: tense hope. Bb major, 70 BPM. 12 bars. Arc.
# Bb major: Bb C D Eb F G A - the crown waits in its velvet box.
def coronation_eve():
    bpm = 70
    bars = 12
    total = bars * 4
    brass = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)
    drums = ExtraTrack(bpm, total)

    def bar(i):
        return i * 4

    BbM = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [BbM, Gm, Eb, F] * 3

    def arc_vel(i):
        if i < 4:
            return 0.35 + i * 0.05
        if i < 8:
            return 0.55 + (i - 4) * 0.09
        return 0.95 - (i - 8) * 0.18

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # the waiting court: warm whole-note brass, hushed then proud
        for m in ch:
            brass.brass(b, m + 12, 3.6, vel=v * 0.75)
        # velvet and candlelight
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.55, attack=1.6,
                 cutoff=1600)
        # the weight of tomorrow: low roots
        bass.bass(b, root - 12, 3.2, vel=v * 0.7, cutoff=260)
        # heartbeat of the eve
        drums.taiko(b, vel=v * 0.65)
        drums.taiko(b + 2, vel=v * 0.4)
        if i in (4, 8):
            drums.gong(b, 4, vel=v * 0.6)

    # tomorrow's anthem, practiced alone at midnight
    eve_song = [
        (8, "F4", 1), (9, "G4", 1), (10, "A4", 1), (11, "Bb4", 2),
        (14, "C5", 2), (16, "D5", 3),
        (20, "Eb5", 1), (21, "D5", 1), (22, "C5", 2), (24, "Bb4", 2),
        (28, "D5", 1), (29, "Eb5", 1), (30, "F5", 2),
        (32, "G5", 2), (34, "F5", 2),
        (36, "Eb5", 3), (40, "D5", 2),
        (44, "C5", 2), (46, "Bb4", 4),
        (52, "A4", 1), (53, "Bb4", 3),
        (56, "G4", 2), (58, "F4", 4),
    ]
    for off, note, d in eve_song:
        lead.lead(off, n(note), d, vel=0.65, vibrato=5.0, vib_depth=4.0)

    stems = {"brass": brass, "pads": pads, "lead": lead,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("coronation-eve", stems,
            {"brass": 0.9, "pads": 0.8, "lead": 0.85,
             "bass": 0.85, "drums": 0.85}, False)


# ============================================================ LAST-HARVEST
# Melancholy abundance. A minor, 82 BPM. 12 bars. Arc.
# A minor: A B C D E F G - full barns, empty chairs.
def last_harvest():
    bpm = 82
    bars = 12
    total = bars * 4
    pluck = Track(bpm, total)
    lead = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    Em = [n("E2"), n("G2"), n("B2")]
    prog = [Am, F, C, G, Am, F, Em, Am, F, C, G, Am]

    def arc_vel(i):
        if i < 4:
            return 0.42 + i * 0.05
        if i < 8:
            return 0.62 + (i - 4) * 0.07
        return 0.90 - (i - 8) * 0.17

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # gathering: gentle eighth-note arpeggios
        arp = [0, 3, 7, 12, 7, 3]
        for k, st in enumerate(arp):
            pluck.pluck(b + k * (2 / 3), root + 12 + st, 0.9, vel=v * 0.5)
        # warm earth under it
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.55, attack=1.5,
                 cutoff=1300)
        bass.bass(b, root - 12, 3.4, vel=v * 0.65, cutoff=280)
        # autumn wind through the stubble
        windt.wind(b, 4, vel=v * 0.3)

    # the empty chairs: a melody that counts who is missing
    missing = [
        (0, "E4", 2), (2, "A4", 2),
        (4, "G4", 1), (5, "E4", 1), (6, "D4", 2),
        (8, "C4", 2), (10, "D4", 2), (12, "E4", 4),
        (16, "F4", 2), (18, "E4", 2), (20, "D4", 2), (22, "C4", 2),
        (24, "B3", 4), (28, "C4", 2), (30, "D4", 2),
        (32, "E4", 2), (34, "F4", 2), (36, "G4", 2), (38, "A4", 2),
        (40, "G4", 3), (44, "E4", 2),
        (46, "D4", 4),
    ]
    for off, note, d in missing:
        lead.lead(off, n(note), d, vel=0.62, vibrato=4.5, vib_depth=5.0)

    stems = {"pluck": pluck, "lead": lead, "pads": pads,
             "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("last-harvest", stems,
            {"pluck": 0.9, "lead": 0.9, "pads": 0.8,
             "bass": 0.8, "wind": 0.8}, False)


# ============================================================ render
def mix_track12(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (frozen_steel, 0.22),
    (lantern_festival, 0.16),
    (the_admiral, 0.20),
    (dust_devils, 0.18),
    (coronation_eve, 0.20),
    (last_harvest, 0.22),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track12(name, stems, gains, reverb_wet=wet,
                                     loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
