"""Sixteenth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-15 moods already covered - do not duplicate):
  the-frozen-council, harvest-moon, the-iron-tide-returns,
  catacombs, the-victory-feast, requiem-for-steel.
Render: python3 compose16.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import (Track, reverb_stereo, limiter, write_wav, SR,
                   midi_to_freq, adsr, lowpass, highpass, noise)

OUT = "/home/hatch/workspace/staging/music16/out"
MP3 = "/home/hatch/workspace/staging/music16/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(1616)


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


def whisper_note(dur, vel=1.0):
    """Conspiratorial whispers: band-passed noise with syllabic pulsing."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = highpass(lowpass(noise(n_), 6000), 1200)
    am = (0.3 + 0.7 * np.abs(np.sin(2 * np.pi * 2.3 * t)
                             * np.sin(2 * np.pi * 0.7 * t + 1.0)))
    return x * am * vel * 0.30


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

    def whisper(self, b, dur_beats=4, **kw):
        self._place(whisper_note(self._b2s(dur_beats), **kw), b)


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


# ============================================================ THE-FROZEN-COUNCIL
# Arctic war council: glass and drums. F# minor, 70 BPM. 16 bars. Loop.
# F# minor: F# G# A B C# D E - decisions made in a hall of ice.
def the_frozen_council():
    bpm = 70
    bars = 16
    total = bars * 4
    glass = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D3"), n("F#3"), n("A3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    Cs = [n("C#3"), n("E#3"), n("G#3")]
    prog = [Fsm, D, Bm, Cs] * 4
    roots = [n("F#2"), n("D3"), n("B2"), n("C#3")] * 4

    # arctic wind never stops in the hall
    windt.wind(0, total, vel=0.34)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the council bell: a glass chime that opens each deliberation
        glass.glass(b, root + 48, 3.2, vel=0.42)
        glass.glass(b + 2.5, root + 55, 3.2, vel=0.30)
        # war drums, measured and cold
        drums.taiko(b, vel=0.52)
        drums.taiko(b + 2, vel=0.38)
        drums.hat(b + 1, vel=0.16)
        drums.hat(b + 3, vel=0.16)
        # frozen pads
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.46, attack=1.6,
                 cutoff=1100)
        # deep council bass
        bass.bass(b, root - 12, 3.6, vel=0.60, cutoff=300)

    # the elder's motif: sparse, undeniable
    elder = [
        (0, "F#4", 2), (4, "E4", 2),
        (8, "D4", 2), (12, "C#4", 4),
        (16, "B3", 2), (20, "A3", 2),
        (24, "G#3", 2), (28, "F#3", 4),
        (32, "A4", 2), (36, "G#4", 2),
        (40, "F#4", 2), (44, "E4", 2),
        (48, "D4", 2), (52, "C#4", 2),
        (56, "B3", 2), (60, "F#3", 4),
    ]
    for off, note, d in elder:
        glass.glass(off, n(note), d, vel=0.38)

    stems = {"glass": glass, "drums": drums, "pads": pads,
             "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("the-frozen-council", stems,
            {"glass": 0.9, "drums": 0.85, "pads": 0.85,
             "bass": 0.85, "wind": 0.8}, True)


# ============================================================ HARVEST-MOON
# Autumn festival night: warm and bright. A major, 96 BPM. 16 bars. Loop.
# A major: A B C# D E F# G# - lanterns, dancing, the barns are full.
def harvest_moon():
    bpm = 96
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    lead = Track(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E2"), n("G#2"), n("B2")]
    Fsm = [n("F#2"), n("A2"), n("C#3")]
    prog = [A, D, E, A, Fsm, D, A, E] * 2
    roots = [n("A2"), n("D3"), n("E2"), n("A2"),
             n("F#2"), n("D3"), n("A2"), n("E2")] * 2

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # fiddle-like 8th-note strums
        tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[2] + 24,
                 ch[1] + 24, ch[2] + 24, ch[2] + 12, ch[1] + 12]
        for k, m in enumerate(tones):
            pluck.pluck(b + k * 0.5, m, 0.55, vel=0.42)
        # festival drums: stomping and clapping
        drums.taiko(b, vel=0.44)
        drums.snare(b + 1, vel=0.30)
        drums.taiko(b + 2, vel=0.44)
        drums.snare(b + 3, vel=0.30)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.15)
        # walking bass
        bass.bass(b, root - 12, 0.9, vel=0.58, cutoff=400)
        bass.bass(b + 1, root - 12 + 7, 0.9, vel=0.52, cutoff=400)
        bass.bass(b + 2, root - 12 + 5, 0.9, vel=0.55, cutoff=400)
        bass.bass(b + 3, root - 12 + 7, 0.9, vel=0.52, cutoff=400)
        # warm pads under the dance
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.34, attack=1.4,
                 cutoff=1600)

    # the dance caller's tune
    tune = [
        (0, "A4", 1), (1, "B4", 1), (2, "C#5", 2),
        (4, "D5", 1), (5, "C#5", 1), (6, "B4", 2),
        (8, "A4", 1), (9, "E4", 1), (10, "F#4", 2),
        (12, "E4", 3), (15, "D4", 1),
        (16, "C#4", 1), (17, "D4", 1), (18, "E4", 2),
        (20, "F#4", 1), (21, "E4", 1), (22, "D4", 2),
        (24, "C#4", 1), (25, "B3", 1), (26, "A3", 2),
        (28, "B3", 3), (31, "C#4", 1),
        (32, "D4", 2), (34, "E4", 2), (36, "F#4", 2), (38, "E4", 2),
        (40, "D4", 1), (41, "C#4", 1), (42, "B3", 1), (43, "A3", 1),
        (44, "B3", 2), (46, "C#4", 2),
        (48, "A4", 2), (50, "F#4", 2), (52, "E4", 2), (54, "D4", 2),
        (56, "C#4", 2), (58, "B3", 1), (59, "A3", 1), (60, "B3", 4),
    ]
    for off, note, d in tune:
        lead.lead(off, n(note), d, vel=0.56, vibrato=6.5, vib_depth=4.0)

    stems = {"pluck": pluck, "lead": lead, "drums": drums,
             "bass": bass, "pads": pads}
    for s in stems.values():
        s.trim()
    return ("harvest-moon", stems,
            {"pluck": 0.9, "lead": 0.9, "drums": 0.85,
             "bass": 0.85, "pads": 0.8}, True)


# ============================================================ THE-IRON-TIDE-RETURNS
# Relentless sequel energy. E minor, 124 BPM. 12 bars. Arc.
# E minor: E F# G A B C D - the machine comes back, faster and angrier.
def the_iron_tide_returns():
    bpm = 124
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    choir = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, C, G, D] * 3
    roots = [n("E2"), n("C3"), n("G2"), n("D3")] * 3

    def arc_vel(i):
        if i < 3:
            return 0.45 + i * 0.15    # the tide gathers
        if i < 8:
            return 1.0                # the full return
        return 1.0 - (i - 8) * 0.16   # it recedes, but it will be back

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # relentless engine-room drums
        for beat in range(4):
            drums.kick(b + beat, vel=v * 0.78)
        drums.snare(b + 1, vel=v * 0.68)
        drums.snare(b + 3, vel=v * 0.68)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.38)
        if i == 3:
            drums.crash(b, vel=0.72)
        # galloping bass, pistons and fury
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.42, vel=v * 0.68,
                      cutoff=620)
        # brass like ramming prows
        if i >= 2:
            for m in ch:
                brass.brass(b, m + 12, 1.1, vel=v * 0.58)
                brass.brass(b + 2, m + 12, 1.1, vel=v * 0.52)
        # the iron choir answers the machines
        if i >= 4 and i % 2 == 0:
            for m in ch:
                choir.choir(b + 1, m + 24, 2.6, vel=v * 0.5)

    # the returning riff: faster, meaner than the first tide
    riff = [
        (0, "E4", 0.5), (0.5, "E4", 0.5), (1, "G4", 0.5), (1.5, "E4", 0.5),
        (2, "A4", 1), (3, "G4", 1),
        (4, "E4", 0.5), (4.5, "E4", 0.5), (5, "G4", 0.5), (5.5, "A4", 0.5),
        (6, "B4", 1), (7, "A4", 1),
        (8, "G4", 0.5), (8.5, "A4", 0.5), (9, "B4", 0.5), (9.5, "D5", 0.5),
        (10, "E5", 1), (11, "D5", 1),
        (12, "B4", 0.5), (12.5, "A4", 0.5), (13, "G4", 1), (14, "F#4", 1),
        (16, "E4", 2), (18, "D4", 2),
        (20, "E4", 1), (21, "G4", 1), (22, "B4", 1), (23, "D5", 1),
        (24, "E5", 2), (26, "D5", 2),
        (28, "B4", 1), (29, "A4", 1), (30, "G4", 2),
        (32, "F#4", 1), (33, "G4", 1), (34, "A4", 1), (35, "B4", 1),
        (36, "D5", 2), (38, "B4", 2),
        (40, "A4", 1), (41, "G4", 1), (42, "F#4", 1), (43, "E4", 1),
        (44, "E4", 4),
    ]
    for off, note, d in riff:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.62, vibrato=7.5,
                  vib_depth=5.0)

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "lead": lead, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("the-iron-tide-returns", stems,
            {"drums": 0.9, "brass": 0.85, "bass": 0.9,
             "lead": 0.85, "choir": 0.8}, False)


# ============================================================ CATACOMBS
# Ancient burial depths: echoing dread. D minor, 62 BPM. 12 bars. Arc.
# D minor: D E F G A Bb C - the dead were buried with their secrets.
def catacombs():
    bpm = 62
    bars = 12
    total = bars * 4
    drone = Track(bpm, total)
    glass = VoiceTrack(bpm, total)
    whisp = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D2"), n("F2"), n("A2")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Bb, Gm, A] * 3
    roots = [n("D2"), n("Bb2"), n("G2"), n("A2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.35 + i * 0.06    # descending into the dark
        if i < 8:
            return 0.62               # the burial chamber
        return 0.62 - (i - 8) * 0.10  # climbing back toward the light

    # the tomb's own breath, continuous so nothing is ever truly silent
    whisp.whisper(0, total, vel=0.30)
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # drone: one vast chord per bar
        drone.pad(b, [m - 12 for m in ch], 4.4, vel=0.5 * v + 0.18,
                  attack=2.6, cutoff=750)
        # water drips in the dark, glassy and far
        glass.glass(b + 1.5, root + 48, 3.5, vel=0.30 * v + 0.12)
        if i % 2 == 1:
            glass.glass(b + 3, root + 43, 3.5, vel=0.24 * v + 0.10)
        # subterranean bass roots
        bass.bass(b, root - 24, 3.8, vel=0.55 * v + 0.2, cutoff=220)
        # something moves, far below
        if 4 <= i < 8 and i % 2 == 0:
            drums.taiko(b + 2, vel=v * 0.35)

    # a single torch carried deeper: echoing notes
    torch = [
        (0, "D4", 4), (8, "F4", 4),
        (16, "Bb4", 4), (24, "A4", 6),
        (32, "G4", 4), (40, "F4", 4),
    ]
    for off, note, d in torch:
        v = arc_vel(int(off // 4))
        glass.glass(off, n(note), d, vel=0.40 * v + 0.15)

    stems = {"drone": drone, "glass": glass, "whisper": whisp,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("catacombs", stems,
            {"drone": 0.9, "glass": 0.85, "whisper": 0.85,
             "bass": 0.85, "drums": 0.7}, False)


# ============================================================ THE-VICTORY-FEAST
# Celebration after war: joyful brass. C major, 112 BPM. 16 bars. Loop.
# C major: C D E F G A B - the tables are long and nobody is a stranger.
def the_victory_feast():
    bpm = 112
    bars = 16
    total = bars * 4
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)
    pluck = Track(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("E3"), n("G3")]
    F = [n("F2"), n("A2"), n("C3")]
    G = [n("G2"), n("B2"), n("D3")]
    Am = [n("A2"), n("C3"), n("E3")]
    prog = [C, F, G, C, Am, F, C, G] * 2
    roots = [n("C3"), n("F2"), n("G2"), n("C3"),
             n("A2"), n("F2"), n("C3"), n("G2")] * 2

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # brass fanfares, mugs raised
        for m in ch:
            brass.brass(b, m + 12, 0.9, vel=0.58)
            brass.brass(b + 2, m + 12, 0.9, vel=0.52)
        if i % 4 == 3:
            for m in ch:
                brass.brass(b + 3, m + 24, 0.8, vel=0.55)
        # feast drums: stomping dance
        drums.taiko(b, vel=0.52)
        drums.snare(b + 1, vel=0.38)
        drums.taiko(b + 2, vel=0.52)
        drums.snare(b + 3, vel=0.38)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.16)
        if i == 0:
            drums.crash(b, vel=0.55)
        # oom-pah bass
        bass.bass(b, root - 12, 0.9, vel=0.66, cutoff=420)
        bass.bass(b + 1, root, 0.9, vel=0.54, cutoff=420)
        bass.bass(b + 2, root - 12, 0.9, vel=0.66, cutoff=420)
        bass.bass(b + 3, root, 0.9, vel=0.54, cutoff=420)
        # lute strums between the courses
        for k, m in enumerate([ch[0] + 12, ch[1] + 12, ch[2] + 12,
                               ch[2] + 24]):
            pluck.pluck(b + k, m, 0.9, vel=0.40)

    # the toast-master's tune: everyone sings the chorus
    toast = [
        (0, "C5", 1), (1, "D5", 1), (2, "E5", 2),
        (4, "G5", 1), (5, "E5", 1), (6, "D5", 2),
        (8, "C5", 1), (9, "G4", 1), (10, "A4", 2),
        (12, "G4", 3), (15, "F4", 1),
        (16, "E4", 1), (17, "F4", 1), (18, "G4", 2),
        (20, "A4", 1), (21, "G4", 1), (22, "F4", 2),
        (24, "E4", 1), (25, "D4", 1), (26, "C4", 2),
        (28, "D4", 3), (31, "E4", 1),
        (32, "F4", 2), (34, "G4", 2), (36, "A4", 2), (38, "G4", 2),
        (40, "F4", 1), (41, "E4", 1), (42, "D4", 1), (43, "C4", 1),
        (44, "D4", 2), (46, "E4", 2),
        (48, "C5", 2), (50, "A4", 2), (52, "G4", 2), (54, "F4", 2),
        (56, "E4", 2), (58, "D4", 1), (59, "C4", 1), (60, "D4", 4),
    ]
    for off, note, d in toast:
        lead.lead(off, n(note), d, vel=0.58, vibrato=6.0, vib_depth=4.0)

    stems = {"brass": brass, "drums": drums, "lead": lead,
             "bass": bass, "pluck": pluck}
    for s in stems.values():
        s.trim()
    return ("the-victory-feast", stems,
            {"brass": 0.9, "drums": 0.9, "lead": 0.9,
             "bass": 0.85, "pluck": 0.85}, True)


# ============================================================ REQUIEM-FOR-STEEL
# Mourning the fallen army. Bb minor, 58 BPM. 12 bars. Arc.
# Bb minor: Bb C Db Eb F Gb Ab - the banners come home folded.
def requiem_for_steel():
    bpm = 58
    bars = 12
    total = bars * 4
    solo = VoiceTrack(bpm, total)
    drone = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    gongt = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Bbm = [n("Bb2"), n("Db3"), n("F3")]
    Gb = [n("Gb2"), n("Bb2"), n("Db3")]
    Db = [n("Db3"), n("F3"), n("Ab3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Bbm, Gb, Db, F] * 3
    roots = [n("Bb2"), n("Gb2"), n("Db3"), n("F2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.42 + i * 0.08    # the procession forms
        if i < 8:
            return 0.74               # the names are read
        return 0.74 - (i - 8) * 0.13  # the last salute

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # low drone of grief
        drone.pad(b, [m - 24 for m in ch], 4.4, vel=0.5 * v + 0.2,
                  attack=2.4, cutoff=700)
        # brass swells, muffled
        if 2 <= i < 10:
            for m in ch:
                brass.brass(b, m - 12, 3.4, vel=v * 0.5)
        # deep bass roots
        bass.bass(b, root - 24, 3.8, vel=0.55 * v + 0.2, cutoff=240)
        # the roll of honor: a gong for every bar of names
        if i % 3 == 0:
            gongt.gong(b + 2, 8, vel=v * 0.55)

    # the lament: one voice for ten thousand
    lament = [
        (0, "Bb4", 6), (8, "Ab4", 6),
        (16, "Gb4", 8), (28, "F4", 6),
        (36, "Eb4", 6), (44, "Db4", 4),
    ]
    for off, note, d in lament:
        v = arc_vel(int(off // 4))
        solo.solo(off, n(note), d, vel=0.55 * v + 0.2)

    stems = {"solo": solo, "drone": drone, "brass": brass,
             "bass": bass, "gong": gongt}
    for s in stems.values():
        s.trim()
    return ("requiem-for-steel", stems,
            {"solo": 0.85, "drone": 0.9, "brass": 0.8,
             "bass": 0.85, "gong": 0.8}, False)


# ============================================================ render
def mix_track16(name, stems, gains, reverb_wet=0.18, loop=False):
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
          f"loop_err={loop_err:.1e} -> {path}", flush=True)
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
    print(f"encoded {n} mp3s -> {MP3}", flush=True)


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
    print(f"decode ok: {len(mp3s)}/{len(mp3s)} mp3s", flush=True)

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
              f"({len(names)*(len(names)-1)//2} pairwise distinct)", flush=True)


TRACKS = [
    (the_frozen_council, 0.22),
    (harvest_moon, 0.20),
    (the_iron_tide_returns, 0.16),
    (catacombs, 0.24),
    (the_victory_feast, 0.20),
    (requiem_for_steel, 0.24),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track16(name, stems, gains, reverb_wet=wet,
                                     loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
