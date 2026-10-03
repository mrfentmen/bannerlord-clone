"""Fifteenth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-14 moods already covered - do not duplicate):
  the-iron-parliament, salt-wind, the-deep-road,
  wildfire-season, the-coronation-march, quietus.
Render: python3 compose15.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import (Track, reverb_stereo, limiter, write_wav, SR,
                   midi_to_freq, adsr, lowpass, highpass, noise)

OUT = "/home/hatch/workspace/staging/music15/out"
MP3 = "/home/hatch/workspace/staging/music15/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(1515)


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


def fire_note(dur, vel=1.0):
    """Wildfire bed: low roar + random crackle bursts."""
    n_ = int(dur * SR)
    roar = lowpass(noise(n_), 400) * 0.5
    crackle = np.zeros(n_)
    for _ in range(int(dur * 8)):
        s = _frng.integers(0, max(n_ - 2500, 1))
        m = int(_frng.integers(500, 2500))
        burst = highpass(noise(m), 2500) * np.exp(-np.arange(m) / (m * 0.3))
        e = min(s + m, n_)
        crackle[s:e] += burst[:e - s] * _frng.uniform(0.2, 0.6)
    return (roar + crackle * 0.7) * vel * 0.5


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

    def fire(self, b, dur_beats=4, **kw):
        self._place(fire_note(self._b2s(dur_beats), **kw), b)


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


# ============================================================ THE-IRON-PARLIAMENT
# Political intrigue in the capital: strings and whispers. G minor, 72 BPM.
# 12 bars. Arc: hushed scheming -> confrontation -> uneasy resolution.
# G minor: G A Bb C D Eb F - every smile in the room is a calculation.
def the_iron_parliament():
    bpm = 72
    bars = 12
    total = bars * 4
    pads = Track(bpm, total)
    pluck = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    whisp = VoiceTrack(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G3"), n("Bb3"), n("D4")]
    Cm = [n("C3"), n("Eb3"), n("G3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Gm, Gm, Cm, Cm, Eb, Eb, D, D, Gm, Cm, D, Gm]
    roots = [n("G2"), n("G2"), n("C3"), n("C3"), n("Eb3"), n("Eb3"),
             n("D3"), n("D3"), n("G2"), n("C3"), n("D3"), n("G2")]

    def arc_vel(i):
        if i < 4:
            return 0.45
        if i < 8:
            return 0.45 + (i - 4) * 0.13   # the confrontation builds
        return 0.97 - (i - 8) * 0.14        # uneasy resolution

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # court strings, always watching
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.5 * v + 0.2,
                 attack=1.8, cutoff=1500)
        # cello-like bass roots
        bass.bass(b, root - 12, 3.6, vel=0.55 * v + 0.2, cutoff=300)
        # whispers behind the tapestries, loudest when quiet
        whisp.whisper(b, 4, vel=(1.2 - v) * 0.7 + 0.25)
        # low brass swells only during the confrontation
        if 4 <= i < 8:
            for m in ch:
                brass.brass(b, m - 12, 3.4, vel=v * 0.55)
        # a single soft drum, like a gavel felt through stone
        if 4 <= i < 8 and i % 2 == 0:
            drums.taiko(b + 2, vel=v * 0.4)

    # the harpsichord plot: a motif that keeps changing its story
    plot = [
        (0, "G4", 1), (1, "A4", 1), (2, "Bb4", 2),
        (4, "A4", 1), (5, "G4", 1), (6, "D4", 2),
        (8, "Eb4", 1), (9, "D4", 1), (10, "C4", 2),
        (12, "Bb3", 2), (14, "A3", 2),
        (16, "G4", 0.5), (16.5, "Bb4", 0.5), (17, "D5", 1),
        (18, "C5", 1), (19, "Bb4", 2),
        (20, "A4", 1), (21, "C5", 1), (22, "Bb4", 1), (23, "A4", 1),
        (24, "G4", 1), (25, "F#4", 1), (26, "G4", 2),
        (28, "D4", 2), (30, "Eb4", 2),
        (32, "Bb4", 2), (34, "A4", 2), (36, "G4", 4),
        (40, "D5", 2), (42, "C5", 2), (44, "Bb4", 4),
    ]
    for off, note, d in plot:
        v = arc_vel(int(off // 4))
        pluck.pluck(off, n(note), d + 0.6, vel=0.42 * v + 0.18)

    stems = {"pads": pads, "pluck": pluck, "brass": brass,
             "bass": bass, "whispers": whisp, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-iron-parliament", stems,
            {"pads": 0.85, "pluck": 0.9, "brass": 0.8,
             "bass": 0.85, "whispers": 0.7, "drums": 0.7}, False)


# ============================================================ SALT-WIND
# Coastal village life: bright and salty. D major, 92 BPM. 16 bars. Loop.
# D major: D E F# G A B C# - nets drying, gulls arguing, no one in a hurry.
def salt_wind():
    bpm = 92
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    lead = Track(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    prog = [D, G, A, D, Bm, G, D, A] * 2
    roots = [n("D3"), n("G2"), n("A2"), n("D3"),
             n("B2"), n("G2"), n("D3"), n("A2")] * 2

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # mandolin-like 8th-note arpeggios
        tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[2] + 24,
                 ch[1] + 24, ch[2] + 24, ch[2] + 12, ch[1] + 12]
        for k, m in enumerate(tones):
            pluck.pluck(b + k * 0.5, m, 0.55, vel=0.40)
        # frame drum: soft heartbeat of the village
        drums.taiko(b, vel=0.38)
        drums.taiko(b + 2, vel=0.25)
        for k in range(4):
            drums.hat(b + k, vel=0.14)
        # walking bass, barefoot on the dock
        bass.bass(b, root - 12, 0.9, vel=0.55, cutoff=380)
        bass.bass(b + 1, root - 12 + 7, 0.9, vel=0.5, cutoff=380)
        bass.bass(b + 2, root - 12 + 5, 0.9, vel=0.52, cutoff=380)
        bass.bass(b + 3, root - 12 + 7, 0.9, vel=0.5, cutoff=380)
        # sea breeze through the whole bar
        windt.wind(b, 4, vel=0.30)

    # the fisherman's tune: bright, a little salt-cracked
    tune = [
        (0, "D5", 1), (1, "E5", 1), (2, "F#5", 2),
        (4, "G5", 1), (5, "F#5", 1), (6, "E5", 2),
        (8, "D5", 1), (9, "A4", 1), (10, "B4", 2),
        (12, "A4", 3), (15, "G4", 1),
        (16, "F#4", 1), (17, "G4", 1), (18, "A4", 2),
        (20, "B4", 1), (21, "A4", 1), (22, "G4", 2),
        (24, "F#4", 1), (25, "E4", 1), (26, "D4", 2),
        (28, "E4", 3), (31, "F#4", 1),
        (32, "G4", 2), (34, "A4", 2), (36, "B4", 2), (38, "A4", 2),
        (40, "G4", 1), (41, "F#4", 1), (42, "E4", 1), (43, "D4", 1),
        (44, "E4", 2), (46, "F#4", 2),
        (48, "D5", 2), (50, "B4", 2), (52, "A4", 2), (54, "G4", 2),
        (56, "F#4", 2), (58, "E4", 1), (59, "D4", 1), (60, "E4", 4),
    ]
    for off, note, d in tune:
        lead.lead(off, n(note), d, vel=0.55, vibrato=6.5, vib_depth=4.0)

    stems = {"pluck": pluck, "lead": lead, "drums": drums,
             "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("salt-wind", stems,
            {"pluck": 0.9, "lead": 0.9, "drums": 0.8,
             "bass": 0.85, "wind": 0.8}, True)


# ============================================================ THE-DEEP-ROAD
# Underground tunnels: echoing and vast. F# minor, 66 BPM. 16 bars. Loop.
# F# minor: F# G# A B C# D E - the dark goes down further than the map.
def the_deep_road():
    bpm = 66
    bars = 16
    total = bars * 4
    rumble = VoiceTrack(bpm, total)
    glass = VoiceTrack(bpm, total)
    pads = Track(bpm, total)
    pluck = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D3"), n("F#3"), n("A3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    Cs = [n("C#3"), n("E#3"), n("G#3")]
    prog = [Fsm, D, Bm, Cs] * 4
    roots = [n("F#2"), n("D3"), n("B2"), n("C#3")] * 4

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the mountain's own breathing
        if i % 4 == 0:
            rumble.rumble(b, 12, vel=0.55)
        # dark pads, barely lit
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.42, attack=2.6,
                 cutoff=800)
        # distant drums: something else is down here
        if i % 2 == 1:
            drums.taiko(b + 1, vel=0.30)
        # cavern drips, glassy and far
        glass.glass(b + 1.5, root + 48, 3.5, vel=0.34)
        if i % 2 == 0:
            glass.glass(b + 3, root + 55, 3.5, vel=0.26)

    # a lantern carried deeper: isolated echoing notes
    lantern = [
        (0, "F#4", 4), (8, "A4", 4),
        (16, "D5", 4), (24, "C#5", 6),
        (32, "B4", 4), (40, "A4", 4),
        (48, "G#4", 4), (56, "F#4", 6),
    ]
    for off, note, d in lantern:
        pluck.pluck(off, n(note), d, vel=0.50)

    stems = {"rumble": rumble, "glass": glass, "pads": pads,
             "pluck": pluck, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-deep-road", stems,
            {"rumble": 0.9, "glass": 0.85, "pads": 0.85,
             "pluck": 0.9, "drums": 0.8}, True)


# ============================================================ WILDFIRE-SEASON
# Burning plains: urgent and hot. E minor, 120 BPM. 12 bars. Arc.
# E minor: E F# G A B C D - the horizon is already orange.
def wildfire_season():
    bpm = 120
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    fire = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, C, G, D] * 3
    roots = [n("E2"), n("C3"), n("G2"), n("D3")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.40 + i * 0.10   # the first spark
        if i < 8:
            return 0.95              # the inferno
        return 0.95 - (i - 8) * 0.20  # embers

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the fire itself, always burning
        fire.fire(b, 4, vel=0.35 + v * 0.45)
        # driving drums: panic has a tempo
        for beat in range(4):
            drums.kick(b + beat, vel=v * 0.75)
        drums.snare(b + 1, vel=v * 0.65)
        drums.snare(b + 3, vel=v * 0.65)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.35)
        if i == 4:
            drums.crash(b, vel=0.7)
        # bass pumping like a fleeing heart
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.42, vel=v * 0.65,
                      cutoff=550)
        # brass like flame fronts
        if i >= 4:
            for m in ch:
                brass.brass(b, m + 12, 1.2, vel=v * 0.55)
                brass.brass(b + 2, m + 12, 1.2, vel=v * 0.5)

    # running from the smoke: a desperate melody
    run = [
        (4, "E4", 0.5), (4.5, "F#4", 0.5), (5, "G4", 0.5), (5.5, "A4", 0.5),
        (6, "B4", 1), (7, "A4", 1),
        (8, "G4", 0.5), (8.5, "A4", 0.5), (9, "B4", 1), (10, "D5", 1),
        (12, "E5", 1), (13, "D5", 0.5), (13.5, "B4", 0.5), (14, "A4", 1),
        (16, "G4", 2), (18, "F#4", 2),
        (20, "E4", 1), (21, "G4", 1), (22, "A4", 1), (23, "B4", 1),
        (24, "D5", 2), (26, "B4", 2),
        (28, "A4", 1), (29, "G4", 1), (30, "F#4", 2),
        (32, "E4", 4),
        (40, "G4", 2), (42, "F#4", 2), (44, "E4", 4),
    ]
    for off, note, d in run:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.60, vibrato=7.0, vib_depth=5.0)

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "lead": lead, "fire": fire}
    for s in stems.values():
        s.trim()
    return ("wildfire-season", stems,
            {"drums": 0.9, "brass": 0.85, "bass": 0.9,
             "lead": 0.85, "fire": 0.85}, False)


# ============================================================ THE-CORONATION-MARCH
# Triumphant procession. Bb major, 100 BPM. 12 bars. Arc.
# Bb major: Bb C D Eb F G A - the crown is heavy, but today it shines.
def the_coronation_march():
    bpm = 100
    bars = 12
    total = bars * 4
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)

    def bar(i):
        return i * 4

    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Bb, Gm, Eb, F] * 3
    roots = [n("Bb2"), n("G2"), n("Eb3"), n("F2")] * 3

    # --- bars 0-3: the assembly (drums and anticipation)
    for i in range(4):
        b = bar(i)
        v = 0.40 + i * 0.10
        drums.snare(b, vel=v * 0.5)
        drums.snare(b + 1, vel=v * 0.4)
        drums.snare(b + 2, vel=v * 0.5)
        drums.snare(b + 3, vel=v * 0.55)
        drums.taiko(b + 2, vel=v * 0.4)
        bass.bass(b, roots[i] - 12, 3.4, vel=v * 0.6, cutoff=350)

    # --- bars 4-8: the procession (full fanfare)
    for i in range(4, 9):
        b = bar(i)
        ch, root = prog[i], roots[i]
        v = 0.95 - (i - 4) * 0.03
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.5, attack=1.2,
                 cutoff=1800)
        # oom-pah march bass
        bass.bass(b, root - 12, 0.9, vel=v * 0.7, cutoff=400)
        bass.bass(b + 1, root, 0.9, vel=v * 0.55, cutoff=400)
        bass.bass(b + 2, root - 12, 0.9, vel=v * 0.7, cutoff=400)
        bass.bass(b + 3, root, 0.9, vel=v * 0.55, cutoff=400)
        # marching snare + deep drum
        for k in range(8):
            drums.snare(b + k * 0.5, vel=v * (0.55 if k % 2 else 0.4))
        drums.taiko(b, vel=v * 0.7)
        drums.taiko(b + 2, vel=v * 0.6)
        if i == 4:
            drums.crash(b, vel=v * 0.7)

    # fanfare motif over the procession
    fanfare = [
        (16, "Bb4", 1), (17, "D5", 1), (18, "F5", 2),
        (20, "Eb5", 1), (21, "D5", 1), (22, "C5", 2),
        (24, "Bb4", 2), (26, "F4", 2), (28, "Bb4", 4),
        (32, "D5", 1), (33, "Eb5", 1), (34, "F5", 2),
        (36, "G5", 2), (38, "F5", 2),
    ]
    for off, note, d in fanfare:
        brass.brass(off, n(note), d, vel=0.72)

    # heroic horn counter-melody
    horn = [
        (20, "G4", 2), (22, "A4", 2), (24, "Bb4", 2), (26, "C5", 2),
        (28, "D5", 4),
        (32, "Eb5", 2), (34, "D5", 2), (36, "C5", 4),
    ]
    for off, note, d in horn:
        lead.lead(off, n(note), d, vel=0.62, vibrato=5.0, vib_depth=4.0)

    # --- bars 9-11: the crown is placed (grand, then resolve)
    for i in (9, 10, 11):
        b = bar(i)
        v = 0.85 - (i - 9) * 0.18
        ch, root = prog[i], roots[i]
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.5, attack=1.5,
                 cutoff=1600)
        for m in ch:
            brass.brass(b, m, 3.2, vel=v * 0.6)
        bass.bass(b, root - 12, 3.4, vel=v * 0.65, cutoff=320)
        drums.taiko(b, vel=v * 0.7)
        drums.crash(b, vel=v * 0.4)
    # the final chord: everyone kneels
    for m in [n("Bb2"), n("D3"), n("F3"), n("Bb3")]:
        brass.brass(bar(11) + 2, m, 1.8, vel=0.7)
    drums.taiko(bar(11) + 2, vel=0.8)

    stems = {"brass": brass, "drums": drums, "lead": lead,
             "bass": bass, "pads": pads}
    for s in stems.values():
        s.trim()
    return ("the-coronation-march", stems,
            {"brass": 0.9, "drums": 0.9, "lead": 0.85,
             "bass": 0.85, "pads": 0.8}, False)


# ============================================================ QUIETUS
# The end of all things: sparse and final. A minor, 55 BPM. 12 bars. Loop.
# A minor: A B C D E F G - when the last light goes out, let it be gentle.
def quietus():
    bpm = 55
    bars = 12
    total = bars * 4
    drone = Track(bpm, total)
    solo = VoiceTrack(bpm, total)
    gongt = VoiceTrack(bpm, total)
    pluck = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    E = [n("E2"), n("G#2"), n("B2")]
    prog = [Am, Am, F, E] * 3

    # the last breath: continuous, barely there
    windt.wind(0, total, vel=0.42)
    for i, ch in enumerate(prog):
        b = bar(i)
        # drone: one chord per bar, fading into the next
        drone.pad(b, [m - 24 for m in ch], 4.4, vel=0.50, attack=2.8,
                  cutoff=700)

    # a single voice, singing the world to sleep
    lullaby = [
        (0, "A4", 6), (8, "G4", 6),
        (16, "E4", 8), (28, "D4", 6),
        (36, "C4", 6), (44, "A3", 4),
    ]
    for off, note, d in lullaby:
        solo.solo(off, n(note), d, vel=0.62)

    # two bells, an eternity apart
    gongt.gong(bar(0), 10, vel=0.55)
    gongt.gong(bar(6), 10, vel=0.45)

    # three plucked notes, like stars going out
    for off, note in [(4, "E5"), (20, "C5"), (32, "A4")]:
        pluck.pluck(off, n(note), 3, vel=0.40)

    stems = {"drone": drone, "solo": solo, "gong": gongt,
             "pluck": pluck, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("quietus", stems,
            {"drone": 0.9, "solo": 0.85, "gong": 0.8,
             "pluck": 0.8, "wind": 0.9}, True)


# ============================================================ render
def mix_track15(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (the_iron_parliament, 0.22),
    (salt_wind, 0.20),
    (the_deep_road, 0.22),
    (wildfire_season, 0.16),
    (the_coronation_march, 0.20),
    (quietus, 0.24),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track15(name, stems, gains, reverb_wet=wet,
                                     loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
