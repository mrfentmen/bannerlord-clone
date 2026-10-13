"""Twentieth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-19 moods already covered - do not duplicate):
  the-crimson-tide, fields-of-valor, the-night-market,
  frostbound, the-gilded-cage, oathbreakers.
Render: python3 compose20.py -> wav stems + mixes in out/
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

OUT = "/home/hatch/workspace/staging/music20/out"
MP3 = "/home/hatch/workspace/staging/music20/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(2020)


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


def whale_note(dur, vel=1.0, f0=160.0, f1=420.0):
    """Whale call: slow sine glissando rising then falling, deep and mournful."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    peak_at = 0.4
    f = np.where(t / dur < peak_at,
                 f0 + (f1 - f0) * (t / dur / peak_at),
                 f1 - (f1 - f0 * 0.8) * ((t / dur - peak_at) / (1 - peak_at)))
    inst = np.cumsum(2 * np.pi * f / SR)
    x = (0.7 * np.sin(inst) + 0.2 * np.sin(2 * inst) + 0.1 * np.sin(3 * inst))
    x = lowpass(x, 1200)
    env = np.sin(np.pi * np.minimum(t / dur, 1.0)) ** 1.5
    return x * env * vel * 0.5


def wave_note(dur, vel=1.0):
    """Crashing sea: filtered noise with slow breaker swells."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = lowpass(noise(n_), 900)
    swell = 0.55 + 0.45 * np.sin(2 * np.pi * 0.11 * t + 0.7)
    swell *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.043 * t + 2.0)
    hiss = highpass(noise(n_), 3000) * 0.25 * np.maximum(swell - 0.55, 0)
    return (x * swell + hiss) * vel * 0.5


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

    def whale(self, b, dur_beats=4, **kw):
        self._place(whale_note(self._b2s(dur_beats), **kw), b)

    def wave(self, b, dur_beats=4, **kw):
        self._place(wave_note(self._b2s(dur_beats), **kw), b)


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


# ============================================================ THE-CRIMSON-TIDE
# Brutal naval assault: blood and iron. D minor, 136 BPM. 12 bars. Arc.
# D minor: D E F G A Bb C - the fleet burns and the sea runs red.
def the_crimson_tide():
    bpm = 136
    bars = 12
    total = bars * 4
    sea = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Bb, Gm, A] * 3
    roots = [n("D3"), n("Bb2"), n("G2"), n("A2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.11    # the fleet closes in
        if i < 8:
            return 1.0                # the assault: no quarter
        return 1.0 - (i - 8) * 0.22   # the wreckage drifts

    # blood-red sea under everything
    sea.wave(0, total, vel=0.40)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # brutal war-drums: relentless
        for beat in range(4):
            drums.taiko(b + beat, vel=v * 0.62)
        drums.snare(b + 1, vel=v * 0.55)
        drums.snare(b + 3, vel=v * 0.55)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.32, open_=(k % 4 == 3))
        if i == 0:
            drums.crash(b, vel=0.60)
        if i == 6:  # the flagship explodes
            sea.blast(b, 2.0, vel=0.60)
            drums.crash(b, vel=0.72)
        # iron bass, driving 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.38, vel=v * 0.62,
                      cutoff=700)
        # brutal brass stabs
        for m in ch:
            brass.brass(b, m + 12, 0.8, vel=v * 0.55)
            brass.brass(b + 1.5, m + 12, 0.8, vel=v * 0.48)
            brass.brass(b + 3, m + 12, 0.6, vel=v * 0.42)

    # the war horn of the crimson fleet
    horn = [
        (0, "D5", 1), (1, "D5", 1), (2, "F5", 1), (3, "E5", 1),
        (4, "D5", 2), (6, "C5", 2),
        (8, "Bb4", 1), (9, "C5", 1), (10, "D5", 2),
        (12, "A5", 2), (14, "G5", 2),
        (16, "F5", 1), (17, "E5", 1), (18, "D5", 2),
        (20, "C5", 4),
        (24, "D5", 1), (25, "E5", 1), (26, "F5", 1), (27, "G5", 1),
        (28, "A5", 2), (30, "Bb5", 2),
        (32, "A5", 4),
        (36, "G5", 2), (38, "F5", 2),
        (40, "E5", 2), (42, "D5", 2),
        (44, "D5", 4),
    ]
    for off, note, d in horn:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.58, vibrato=7.0,
                  vib_depth=6.0)

    stems = {"sea": sea, "drums": drums, "brass": brass,
             "bass": bass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("the-crimson-tide", stems,
            {"sea": 0.85, "drums": 0.9, "brass": 0.85,
             "bass": 0.9, "lead": 0.85}, False)


# ============================================================ FIELDS-OF-VALOR
# Heroic battlefield memorial: noble and sad. Bb major, 84 BPM. 16 bars. Loop.
# Bb major: Bb C D Eb F G A - the fallen are named and the living weep.
def fields_of_valor():
    bpm = 84
    bars = 16
    total = bars * 4
    solo = VoiceTrack(bpm, total)
    strings = Track(bpm, total)
    drone = Track(bpm, total)
    bells = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Bb = [n("Bb2"), n("D3"), n("F3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Cm = [n("C3"), n("Eb3"), n("G3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Bb, Eb, Cm, F] * 4
    roots = [n("Bb2"), n("Eb3"), n("C3"), n("F2")] * 4

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # noble strings hold the field
        strings.pad(b, ch, 4.6, vel=0.32, attack=1.0, cutoff=1800)
        # the earth itself remembers
        drone.pad(b, [root - 24, root - 12], 4.8, vel=0.24,
                  attack=2.0, cutoff=380)
        # memorial bells toll
        bells.glass(b, root + 36, 4.0, vel=0.22)
        # the deep ground
        bass.bass(b, root - 24, 4.2, vel=0.50, cutoff=200)

    # the lament of the living: a soprano names the fallen
    lament = [
        (0, "F4", 2), (2, "G4", 2),
        (4, "Bb4", 3), (7, "A4", 1),
        (8, "G4", 2), (10, "F4", 2),
        (12, "Eb4", 4),
        (16, "F4", 2), (18, "D4", 2),
        (20, "Eb4", 3), (23, "D4", 1),
        (24, "C4", 2), (26, "Bb3", 2),
        (28, "F4", 4),
        (32, "G4", 2), (34, "A4", 2),
        (36, "Bb4", 4),
        (40, "A4", 2), (42, "G4", 2),
        (44, "F4", 2), (46, "Eb4", 2),
        (48, "D4", 4),
        (52, "Eb4", 2), (54, "F4", 2),
        (56, "G4", 4),
        (60, "F4", 4),
    ]
    for off, note, d in lament:
        solo.solo(off, n(note), d, vel=0.52)

    stems = {"solo": solo, "strings": strings, "drone": drone,
             "bells": bells, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("fields-of-valor", stems,
            {"solo": 0.9, "strings": 0.85, "drone": 0.8,
             "bells": 0.8, "bass": 0.85}, True)


# ============================================================ THE-NIGHT-MARKET
# Bustling bazaar after dark: exotic and lively. E phrygian, 112 BPM.
# 16 bars. Loop. E phrygian: E F G A B C D - lanterns, spices, secrets.
def the_night_market():
    bpm = 112
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    drums = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    crowd = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    # E phrygian colors
    Em = [n("E3"), n("G3"), n("B3")]
    F = [n("F3"), n("A3"), n("C4")]
    G = [n("G3"), n("B3"), n("D4")]
    Am = [n("A3"), n("C4"), n("E4")]
    prog = [Em, F, G, F] * 2 + [Em, Am, G, F] * 2
    roots = [n("E3"), n("F3"), n("G3"), n("F3")] * 2 + \
            [n("E3"), n("A3"), n("G3"), n("F3")] * 2

    # the bazaar never sleeps: market murmur under everything
    crowd.whisper(0, total, vel=0.20)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # exotic drone pads
        pads.pad(b, ch, 4.4, vel=0.24, attack=1.1, cutoff=1600)
        # oud-like picking: fast and bright
        for k, m in enumerate([ch[0] + 24, ch[1] + 24, ch[2] + 24,
                               ch[2] + 36, ch[1] + 24, ch[0] + 24,
                               ch[1] + 24, ch[2] + 24]):
            pluck.pluck(b + k * 0.5, m, 0.6, vel=0.32)
        # frame-drum bustle
        drums.tom(b, freq=150, vel=0.44)
        drums.tom(b + 1, freq=130, vel=0.36)
        drums.tom(b + 2, freq=150, vel=0.44)
        drums.tom(b + 3, freq=120, vel=0.36)
        drums.snare(b + 1.5, vel=0.28)
        drums.snare(b + 3.5, vel=0.28)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.18)
        # deep market bass
        bass.bass(b, root - 12, 1.8, vel=0.56, cutoff=520)
        bass.bass(b + 2, root - 12 + 7, 1.8, vel=0.48, cutoff=520)

    # the spice merchant's tune: winding and bright
    oud = [
        (0, "E4", 1), (1, "F4", 1), (2, "G4", 1), (3, "F4", 1),
        (4, "E4", 2), (6, "D4", 2),
        (8, "C4", 1), (9, "D4", 1), (10, "E4", 2),
        (12, "G4", 2), (14, "F4", 2),
        (16, "E4", 1), (17, "G4", 1), (18, "A4", 1), (19, "G4", 1),
        (20, "F4", 2), (22, "E4", 2),
        (24, "D4", 1), (25, "E4", 1), (26, "F4", 1), (27, "G4", 1),
        (28, "A4", 2), (30, "G4", 2),
        (32, "F4", 2), (34, "E4", 2),
        (36, "D4", 2), (38, "C4", 2),
        (40, "B3", 2), (42, "C4", 2),
        (44, "D4", 2), (46, "E4", 2),
        (48, "F4", 1), (49, "E4", 1), (50, "D4", 1), (51, "C4", 1),
        (52, "B3", 2), (54, "A3", 2),
        (56, "G3", 2), (58, "A3", 2),
        (60, "B3", 4),
    ]
    for off, note, d in oud:
        pluck.pluck(off, n(note), d, vel=0.42)

    stems = {"pluck": pluck, "drums": drums, "pads": pads,
             "bass": bass, "crowd": crowd}
    for s in stems.values():
        s.trim()
    return ("the-night-market", stems,
            {"pluck": 0.9, "drums": 0.85, "pads": 0.8,
             "bass": 0.85, "crowd": 0.75}, True)


# ============================================================ FROSTBOUND
# Arctic expedition: cold and vast. F# minor, 64 BPM. 16 bars. Loop.
# F# minor: F# G# A B C# D E - the ice goes on forever.
def frostbound():
    bpm = 64
    bars = 16
    total = bars * 4
    wind = Track(bpm, total)
    glass = VoiceTrack(bpm, total)
    drone = Track(bpm, total)
    bass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Fsm = [n("F#3"), n("A3"), n("C#4")]
    D = [n("D3"), n("F#3"), n("A3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [Fsm, D, Bm, E] * 4
    roots = [n("F#3"), n("D3"), n("B2"), n("E3")] * 4

    # the polar wind never stops
    wind.wind(0, total, vel=0.55)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # vast frozen chords
        drone.pad(b, [root - 24, root - 12], 4.8, vel=0.28,
                  attack=2.5, cutoff=420)
        # the expedition's distant song
        for m in ch:
            choir.choir(b, m + 12, 4.4, vel=0.24)
        # ice crystals: sparse and bright
        glass.glass(b + 0.5, root + 48, 4.0, vel=0.18)
        glass.glass(b + 2.5, root + 55, 3.0, vel=0.12)
        # the glacier below
        bass.bass(b, root - 24, 4.4, vel=0.50, cutoff=180)

    # the ice sings: a slow descending line
    ice_song = [
        (0, "F#5", 4), (8, "E5", 4),
        (16, "D5", 4), (24, "C#5", 4),
        (32, "B4", 4), (40, "A4", 4),
        (48, "G#4", 4), (56, "F#4", 4),
    ]
    for off, note, d in ice_song:
        glass.glass(off, n(note), d, vel=0.30)

    stems = {"wind": wind, "glass": glass, "drone": drone,
             "bass": bass, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("frostbound", stems,
            {"wind": 0.85, "glass": 0.85, "drone": 0.85,
             "bass": 0.85, "choir": 0.8}, True)


# ============================================================ THE-GILDED-CAGE
# Court intrigue: elegant and dangerous. A major, 96 BPM. 12 bars. Arc.
# A major: A B C# D E F# G# - silk gloves hide the daggers.
def the_gilded_cage():
    bpm = 96
    bars = 12
    total = bars * 4
    pluck = Track(bpm, total)
    strings = Track(bpm, total)
    bass = Track(bpm, total)
    whisper = VoiceTrack(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    Fsm = [n("F#3"), n("A3"), n("C#4")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [A, Fsm, D, E] * 3
    roots = [n("A2"), n("F#3"), n("D3"), n("E3")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.45 + i * 0.10    # the court assembles
        if i < 8:
            return 0.85               # the plotting sharpens
        return 0.85 - (i - 8) * 0.15  # the mask slips

    # conspiracies in every corner
    whisper.whisper(0, total, vel=0.22)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # elegant court strings
        strings.pad(b, ch, 4.4, vel=(0.26 * v + 0.08), attack=0.8,
                    cutoff=2200)
        # harpsichord grace
        for k, m in enumerate([ch[0] + 24, ch[1] + 24, ch[2] + 24,
                               ch[2] + 36]):
            pluck.pluck(b + k, m, 1.0, vel=0.30 * v + 0.08)
        # measured court bass
        bass.bass(b, root - 12, 2.0, vel=0.52 * v + 0.08, cutoff=420)
        bass.bass(b + 2, root - 12 + 7, 2.0, vel=0.44 * v + 0.08,
                  cutoff=420)

    # the intriguer's theme: beautiful and venomous
    courtier = [
        (0, "E5", 1), (1, "C#5", 1), (2, "A4", 1), (3, "C#5", 1),
        (4, "E5", 2), (6, "D5", 2),
        (8, "C#5", 1), (9, "D5", 1), (10, "E5", 2),
        (12, "A5", 3), (15, "G#5", 1),
        (16, "F#5", 2), (18, "E5", 2),
        (20, "D5", 1), (21, "C#5", 1), (22, "B4", 2),
        (24, "C#5", 4),
        (28, "B4", 2), (30, "A4", 2),
        (32, "G#4", 2), (34, "A4", 2),
        (36, "B4", 2), (38, "C#5", 2),
        (40, "D5", 4),
        (44, "C#5", 4),
    ]
    for off, note, d in courtier:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.52, vibrato=6.0,
                  vib_depth=3.5)

    stems = {"pluck": pluck, "strings": strings, "bass": bass,
             "whisper": whisper, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("the-gilded-cage", stems,
            {"pluck": 0.85, "strings": 0.85, "bass": 0.85,
             "whisper": 0.8, "lead": 0.9}, False)


# ============================================================ OATHBREAKERS
# Betrayal and vengeance: dark and driving. C minor, 124 BPM. 12 bars. Arc.
# C minor: C D Eb F G Ab Bb - the oath is broken and blood will answer.
def oathbreakers():
    bpm = 124
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Fm = [n("F2"), n("Ab2"), n("C3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Cm, Ab, Fm, G] * 3
    roots = [n("C3"), n("Ab2"), n("F2"), n("G2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.12    # trust, still whole
        if i < 8:
            return 1.0                # the betrayal strikes
        return 1.0 - (i - 8) * 0.18   # vengeance runs its course

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # relentless pursuit drums
        for beat in range(4):
            drums.kick(b + beat, vel=v * 0.68)
        drums.snare(b + 1, vel=v * 0.56)
        drums.snare(b + 3, vel=v * 0.56)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.30)
        if i == 0:
            drums.crash(b, vel=0.60)
        if i == 4:  # the knife in the back
            drums.crash(b, vel=0.70)
            for m in ch:
                brass.brass(b, m + 12, 1.2, vel=0.65)
        # the betrayed sing for blood from bar 2
        if i >= 2:
            for m in ch:
                choir.choir(b, m + 12, 3.4, vel=v * 0.46)
        # stabbing brass
        for m in ch:
            brass.brass(b + 0.5, m + 12, 0.9, vel=v * 0.52)
            brass.brass(b + 2.5, m + 12, 0.9, vel=v * 0.46)
        # driving dark bass, 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.38, vel=v * 0.60,
                      cutoff=640)

    # the avenger's theme: no mercy, no rest
    vengeance = [
        (0, "C5", 1), (1, "C5", 1), (2, "Eb5", 2),
        (4, "D5", 1), (5, "C5", 1), (6, "Bb4", 2),
        (8, "Ab4", 2), (10, "G4", 2),
        (12, "C5", 3), (15, "Bb4", 1),
        (16, "Ab4", 2), (18, "G4", 2),
        (20, "F4", 2), (22, "Eb4", 2),
        (24, "D4", 4),
        (28, "Eb4", 2), (30, "F4", 2),
        (32, "G4", 2), (34, "Ab4", 2),
        (36, "Bb4", 2), (38, "C5", 2),
        (40, "Db5", 3), (43, "C5", 1),
        (44, "Bb4", 4),
    ]
    for off, note, d in vengeance:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.56, vibrato=7.0,
                  vib_depth=5.5)

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "choir": choir, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("oathbreakers", stems,
            {"drums": 0.9, "brass": 0.85, "bass": 0.9,
             "choir": 0.85, "lead": 0.85}, False)


# ============================================================ render
def mix_track20(name, stems, gains, reverb_wet=0.18, loop=False):
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

    # ffprobe readability check on every mp3
    for f in mp3s:
        path = os.path.join(MP3, f)
        p = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "format=duration", "-of", "csv=p=0", path],
            check=True, capture_output=True, text=True)
        dur = float(p.stdout.strip())
        assert dur > 0.5, f"{f}: ffprobe duration too short ({dur})"
    print(f"ffprobe ok: {len(mp3s)}/{len(mp3s)} mp3s", flush=True)

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
    (the_crimson_tide, 0.20),
    (fields_of_valor, 0.24),
    (the_night_market, 0.16),
    (frostbound, 0.26),
    (the_gilded_cage, 0.22),
    (oathbreakers, 0.18),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track20(name, stems, gains, reverb_wet=wet,
                                    loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
