"""Eighteenth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-17 moods already covered - do not duplicate):
  the-broken-crown, emberfall, the-silent-marsh,
  highland-charge, the-widows-lament, triumph-of-dawn.
Render: python3 compose18.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np
from scipy import signal as _sig

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import (Track, reverb_stereo, limiter, write_wav, SR,
                   midi_to_freq, adsr, lowpass, highpass, noise)

OUT = "/home/hatch/workspace/staging/music18/out"
MP3 = "/home/hatch/workspace/staging/music18/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(1818)


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


def pipes_note(midi, dur, vel=1.0):
    """Highland pipes chanter: reedy, fast vibrato, quick attack."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    vib = 14.0 * np.sin(2 * np.pi * 7.5 * t) * np.minimum(t / 0.15, 1.0)
    inst = np.cumsum(2 * np.pi * (f + vib) / SR)
    x = (0.50 * _sig.sawtooth(inst) + 0.25 * np.sin(inst)
         + 0.15 * np.sin(2 * inst) + 0.10 * np.sin(3 * inst))
    x = lowpass(x, 2800)
    env = adsr(n_, 0.03, 0.05, 0.95, min(0.15, dur * 0.2))
    return x * env * vel * 0.45


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

    def pipes(self, b, midi, dur_beats=4, **kw):
        self._place(pipes_note(midi, self._b2s(dur_beats), **kw), b)


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


# ============================================================ THE-BROKEN-CROWN
# Fallen monarchy: shattered grandeur. A minor, 72 BPM. 16 bars. Loop.
# A minor: A B C D E F G - the throne sits empty and the jewels still sing.
def the_broken_crown():
    bpm = 72
    bars = 16
    total = bars * 4
    glass = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Am, F, C, G] * 4
    roots = [n("A2"), n("F2"), n("C3"), n("G2")] * 4

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # cracked crown jewels: high bells, minor-9th shimmer
        glass.glass(b, root + 48, 3.8, vel=0.30)
        glass.glass(b + 2, root + 49, 3.0, vel=0.18)
        # the mourning court sings from bar 2
        if i >= 2:
            for m in ch:
                choir.choir(b, m + 24, 3.6, vel=0.42)
        # fallen pronouncements: solemn brass from bar 4
        if i >= 4:
            for m in ch:
                brass.brass(b, m, 3.2, vel=0.48)
        # the weight of the empty throne
        bass.bass(b, root - 12, 3.6, vel=0.60, cutoff=260)
        # funeral march: slow heavy tread
        drums.taiko(b, vel=0.44)
        drums.taiko(b + 2, vel=0.34)
        if i % 2 == 1:
            drums.snare(b + 3, vel=0.22)

    # the crown's lament: jewels singing where a king once sat
    lament = [
        (0, "E4", 2), (2, "D4", 2),
        (4, "C4", 3), (7, "B3", 1),
        (8, "A3", 2), (10, "C4", 2),
        (12, "B3", 4),
        (16, "E4", 2), (18, "G4", 2),
        (20, "F4", 3), (23, "E4", 1),
        (24, "D4", 2), (26, "C4", 2),
        (28, "B3", 4),
        (32, "A4", 3), (35, "G4", 1),
        (36, "F4", 2), (38, "E4", 2),
        (40, "D4", 4),
        (44, "C4", 4),
        (48, "B3", 2), (50, "C4", 2),
        (52, "D4", 2), (54, "E4", 2),
        (56, "A3", 6),
    ]
    for off, note, d in lament:
        glass.glass(off, n(note), d, vel=0.32)

    stems = {"glass": glass, "choir": choir, "brass": brass,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-broken-crown", stems,
            {"glass": 0.85, "choir": 0.85, "brass": 0.85,
             "bass": 0.85, "drums": 0.75}, True)


# ============================================================ EMBERFALL
# Volcanic battlefield: fire and ash. E minor, 120 BPM. 12 bars. Arc.
# E minor: E F# G A B C D - the mountain bleeds and the army marches through it.
def emberfall():
    bpm = 120
    bars = 12
    total = bars * 4
    fire = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, C, G, D] * 3
    roots = [n("E3"), n("C3"), n("G2"), n("D3")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.45 + i * 0.14    # the slopes smolder
        if i < 8:
            return 1.0                # the eruption
        return 1.0 - (i - 8) * 0.18   # cooling ash

    # the wildfire never fully dies in an arc; volcanic rumble under it
    fire.fire(0, total, vel=0.30)
    fire.rumble(0, total, vel=0.30)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # war-march through the ash
        for beat in range(4):
            drums.kick(b + beat, vel=v * 0.72)
        drums.snare(b + 1, vel=v * 0.60)
        drums.snare(b + 3, vel=v * 0.60)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.32)
        if i == 0:
            drums.crash(b, vel=0.60)
        if i == 6:  # the mountainside gives way
            fire.blast(b, 2.5, vel=0.62)
            drums.crash(b, vel=0.72)
        # galloping ash-bass
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.40, vel=v * 0.62,
                      cutoff=620)
        # brass like falling rock
        if i >= 1:
            for m in ch:
                brass.brass(b, m + 12, 0.9, vel=v * 0.54)
                brass.brass(b + 2, m + 12, 0.9, vel=v * 0.48)

    # the ashen horn: a call that survives the fire
    horn = [
        (0, "E4", 1), (1, "G4", 1), (2, "B4", 2),
        (4, "A4", 1), (5, "G4", 1), (6, "F#4", 2),
        (8, "E4", 2), (10, "D4", 1), (11, "C4", 1),
        (12, "B3", 2), (14, "D4", 2),
        (16, "E4", 1), (17, "F#4", 1), (18, "G4", 1), (19, "A4", 1),
        (20, "B4", 3), (23, "A4", 1),
        (24, "G4", 2), (26, "F#4", 2),
        (28, "E4", 2), (30, "D4", 2),
        (32, "C4", 2), (34, "B3", 2),
        (36, "A3", 2), (38, "B3", 2),
        (40, "E4", 4),
    ]
    for off, note, d in horn:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.58, vibrato=6.5,
                  vib_depth=5.0)

    stems = {"fire": fire, "drums": drums, "brass": brass,
             "bass": bass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("emberfall", stems,
            {"fire": 0.85, "drums": 0.9, "brass": 0.85,
             "bass": 0.9, "lead": 0.85}, False)


# ============================================================ THE-SILENT-MARSH
# Misty wetlands: eerie calm. D minor, 76 BPM. 16 bars. Loop.
# D minor: D E F G A Bb C - nothing moves, everything watches.
def the_silent_marsh():
    bpm = 76
    bars = 16
    total = bars * 4
    mist = VoiceTrack(bpm, total)
    glass = VoiceTrack(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    reeds = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Bb, F, A] * 4
    roots = [n("D3"), n("Bb2"), n("F2"), n("A2")] * 4

    # the mist itself: whispers and slow wind, always present
    mist.whisper(0, total, vel=0.34)
    mist.wind(0, total, vel=0.22)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # dew drops on black water: sparse glass
        glass.glass(b + 1.5, root + 48, 2.5, vel=0.22)
        glass.glass(b + 3.2, root + 55, 2.0, vel=0.15)
        # fog chords, barely there
        pads.pad(b, [m - 12 for m in ch], 4.4, vel=0.28, attack=2.0,
                 cutoff=1100)
        # deep black water
        bass.bass(b, root - 24, 4.0, vel=0.50, cutoff=200)

    # a lone reed pipe across the water
    tune = [
        (0, "A4", 4), (8, "G4", 4),
        (16, "F4", 6), (28, "E4", 4),
        (32, "D4", 4), (40, "C4", 4),
        (48, "D4", 8), (60, "A3", 4),
    ]
    for off, note, d in tune:
        reeds.lead(off, n(note), d, vel=0.38, vibrato=4.5,
                   vib_depth=3.0)

    stems = {"mist": mist, "glass": glass, "pads": pads,
             "bass": bass, "reeds": reeds}
    for s in stems.values():
        s.trim()
    return ("the-silent-marsh", stems,
            {"mist": 0.85, "glass": 0.85, "pads": 0.8,
             "bass": 0.85, "reeds": 0.9}, True)


# ============================================================ HIGHLAND-CHARGE
# Mountain clans attacking: fierce pipes. G major, 128 BPM. 12 bars. Arc.
# G major: G A B C D E F# - the glen answers with war cries.
def highland_charge():
    bpm = 128
    bars = 12
    total = bars * 4
    pipes = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    C = [n("C3"), n("E3"), n("G3")]
    Em = [n("E3"), n("G3"), n("B3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, C, G, D, G, Em, C, D, G, C, G, D]
    roots = [n("G2"), n("C3"), n("G2"), n("D3"),
             n("G2"), n("E3"), n("C3"), n("D3"),
             n("G2"), n("C3"), n("G2"), n("D3")]

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.12    # the clans gather
        if i < 9:
            return 1.0                # the charge
        return 1.0 - (i - 9) * 0.22   # the aftermath

    # the pipes' drone never stops: G and D humming under everything
    pipes.pipes(0, n("G3"), total, vel=0.20)
    pipes.pipes(0, n("D4"), total, vel=0.16)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # war drums: the glen shakes
        for beat in range(4):
            drums.taiko(b + beat, vel=v * 0.52)
        drums.snare(b + 1, vel=v * 0.48)
        drums.snare(b + 3, vel=v * 0.48)
        if i == 0:
            drums.crash(b, vel=0.62)
        # clan horns answer the pipes from bar 2
        if i >= 2:
            for m in ch:
                brass.brass(b, m + 12, 1.0, vel=v * 0.52)
        # driving clan bass, 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.38, vel=v * 0.60,
                      cutoff=700)
        # the clan's war cry swells mid-charge
        if 4 <= i < 9:
            for m in ch:
                choir.choir(b, m + 24, 3.4, vel=v * 0.42)

    # the chanter's war tune: fast, fierce, unforgettable
    chant = [
        (0, "G4", 0.5), (0.5, "A4", 0.5), (1, "B4", 1),
        (2, "D5", 1), (3, "B4", 1),
        (4, "A4", 0.5), (4.5, "G4", 0.5), (5, "A4", 1), (6, "B4", 2),
        (8, "D5", 1), (9, "E5", 1), (10, "D5", 1), (11, "B4", 1),
        (12, "A4", 1), (13, "B4", 1), (14, "G4", 2),
        (16, "G4", 0.5), (16.5, "A4", 0.5), (17, "B4", 0.5),
        (17.5, "C5", 0.5),
        (18, "D5", 1), (19, "B4", 1), (20, "G4", 1), (21, "A4", 1),
        (22, "B4", 2), (24, "A4", 1), (25, "G4", 1),
        (26, "E4", 1), (27, "G4", 1), (28, "A4", 2),
        (30, "B4", 1), (31, "D5", 1),
        (32, "E5", 2), (34, "D5", 1), (35, "B4", 1),
        (36, "A4", 1), (37, "G4", 1), (38, "A4", 1), (39, "B4", 1),
        (40, "D5", 2), (42, "B4", 2),
        (44, "G4", 2), (46, "A4", 2),
    ]
    for off, note, d in chant:
        v = arc_vel(int(off // 4))
        pipes.pipes(off, n(note), d, vel=v * 0.55)

    stems = {"pipes": pipes, "drums": drums, "brass": brass,
             "bass": bass, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("highland-charge", stems,
            {"pipes": 0.9, "drums": 0.9, "brass": 0.85,
             "bass": 0.9, "choir": 0.8}, False)


# ============================================================ THE-WIDOWS-LAMENT
# Mourning widows: sorrowful strings. F# minor, 60 BPM. 12 bars. Arc.
# F# minor: F# G# A B C# D E - the procession moves slowly and no one speaks.
def the_widows_lament():
    bpm = 60
    bars = 12
    total = bars * 4
    solo = VoiceTrack(bpm, total)
    strings = Track(bpm, total)
    drone = Track(bpm, total)
    bells = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D3"), n("F#3"), n("A3")]
    A = [n("A2"), n("C#3"), n("E3")]
    E = [n("E2"), n("G#2"), n("B2")]
    prog = [Fsm, D, A, E] * 3
    roots = [n("F#2"), n("D3"), n("A2"), n("E2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.42 + i * 0.06    # the procession forms
        if i < 8:
            return 0.66               # the names are read aloud
        return 0.66 - (i - 8) * 0.13  # the salute fades into grief

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # sorrowful strings, very slow bloom
        strings.pad(b, [m for m in ch], 4.4, vel=0.30 * v + 0.12,
                    attack=2.5, cutoff=1400)
        # the grave's own hum
        drone.pad(b, [root - 24], 4.4, vel=0.26, attack=3.0,
                  cutoff=500)
        # funeral bells toll at the head of each act
        if i % 4 == 0:
            bells.glass(b, root + 24, 6.0, vel=0.42)
            bells.glass(b + 2, root + 31, 5.0, vel=0.28)
        # the deepest grief
        bass.bass(b, root - 24, 4.0, vel=0.50 * v + 0.15, cutoff=220)

    # one widow sings for all of them
    lament = [
        (0, "C#5", 4), (8, "B4", 4),
        (16, "A4", 6), (28, "G#4", 4),
        (32, "F#5", 4), (40, "E5", 4),
        (44, "D5", 2), (46, "C#5", 2),
    ]
    for off, note, d in lament:
        v = arc_vel(int(off // 4))
        solo.solo(off, n(note), d, vel=0.55 * v + 0.12)

    stems = {"solo": solo, "strings": strings, "drone": drone,
             "bells": bells, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-widows-lament", stems,
            {"solo": 0.9, "strings": 0.85, "drone": 0.85,
             "bells": 0.85, "bass": 0.85}, False)


# ============================================================ TRIUMPH-OF-DAWN
# Final victory: glorious sunrise. C major, 100 BPM. 16 bars. Loop.
# C major: C D E F G A B - the war is over and the sun keeps its promise.
def triumph_of_dawn():
    bpm = 100
    bars = 16
    total = bars * 4
    choir = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)
    drums = Track(bpm, total)
    pluck = Track(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("E3"), n("G3")]
    F = [n("F2"), n("A2"), n("C3")]
    G = [n("G2"), n("B2"), n("D3")]
    Am = [n("A2"), n("C3"), n("E3")]
    prog = [C, F, G, C] * 2 + [C, Am, F, G] * 2
    roots = [n("C3"), n("F2"), n("G2"), n("C3")] * 2 + \
            [n("C3"), n("A2"), n("F2"), n("G2")] * 2

    # marching bass line (own track, folded into brass stem below)
    march_bass = Track(bpm, total)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # dawn choir, full and bright
        for m in ch:
            choir.choir(b, m + 24, 3.6, vel=0.46)
        # victory fanfares
        for m in ch:
            brass.brass(b, m + 12, 1.2, vel=0.56)
            brass.brass(b + 2.5, m + 12, 0.9, vel=0.48)
        # triumph march
        drums.kick(b, vel=0.62)
        drums.kick(b + 2, vel=0.62)
        drums.snare(b + 1, vel=0.50)
        drums.snare(b + 3, vel=0.50)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.20)
        if i == 0:
            drums.crash(b, vel=0.58)
        # marching bass
        march_bass.bass(b, root - 12, 1.4, vel=0.60, cutoff=420)
        march_bass.bass(b + 2, root - 12 + 7, 1.4, vel=0.52,
                        cutoff=420)
        # bright celebration picking
        for k, m in enumerate([ch[0] + 24, ch[1] + 24, ch[2] + 24,
                               ch[2] + 36]):
            pluck.pluck(b + k, m, 0.8, vel=0.32)

    # the victory anthem: every voice in the square sings it
    anthem = [
        (0, "C4", 1), (1, "E4", 1), (2, "G4", 2),
        (4, "A4", 1), (5, "G4", 1), (6, "F4", 2),
        (8, "E4", 1), (9, "F4", 1), (10, "G4", 2),
        (12, "C5", 3), (15, "B4", 1),
        (16, "A4", 1), (17, "G4", 1), (18, "A4", 2),
        (20, "G4", 1), (21, "F4", 1), (22, "E4", 2),
        (24, "D4", 1), (25, "E4", 1), (26, "F4", 1), (27, "G4", 1),
        (28, "A4", 2), (30, "G4", 2),
        (32, "C5", 2), (34, "B4", 1), (35, "A4", 1),
        (36, "G4", 2), (38, "A4", 2),
        (40, "F4", 2), (42, "E4", 2),
        (44, "D4", 2), (46, "E4", 2),
        (48, "F4", 2), (50, "G4", 2),
        (52, "A4", 2), (54, "G4", 1), (55, "F4", 1),
        (56, "E4", 2), (58, "D4", 1), (59, "C4", 1),
        (60, "D4", 4),
    ]
    for off, note, d in anthem:
        lead.lead(off, n(note), d, vel=0.58, vibrato=6.0,
                  vib_depth=4.0)

    # fold the marching bass into the brass stem (keeps 5-stem budget);
    # both buffers are untrimmed here so the shapes match
    brass.buf += march_bass.buf * 0.8

    stems = {"choir": choir, "brass": brass, "lead": lead,
             "drums": drums, "pluck": pluck}
    for s in stems.values():
        s.trim()
    return ("triumph-of-dawn", stems,
            {"choir": 0.9, "brass": 0.9, "lead": 0.9,
             "drums": 0.85, "pluck": 0.85}, True)


# ============================================================ render
def mix_track18(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (the_broken_crown, 0.24),
    (emberfall, 0.16),
    (the_silent_marsh, 0.26),
    (highland_charge, 0.16),
    (the_widows_lament, 0.26),
    (triumph_of_dawn, 0.20),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track18(name, stems, gains, reverb_wet=wet,
                                     loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
