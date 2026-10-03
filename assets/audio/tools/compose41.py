"""Forty-first batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-40 moods already covered - do not duplicate):
  the-obsidian-campaign, drums-of-the-copper-watch, the-smiths-song,
  songs-of-the-autumn-feast, the-bronze-throne, fury-of-the-western-host.
Render: python3 compose41.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
sys.path.insert(0, "/home/hatch/workspace/staging/music36")
sys.path.insert(0, "/home/hatch/workspace/staging/music37")
sys.path.insert(0, "/home/hatch/workspace/staging/music38")
sys.path.insert(0, "/home/hatch/workspace/staging/music39")
sys.path.insert(0, "/home/hatch/workspace/staging/music40")
import compose27 as c27
from compose37 import n
from compose40 import Voice40
from synth import (SR, midi_to_freq, adsr, lowpass, highpass)

OUT = "/home/hatch/workspace/staging/music41/out"
MP3 = "/home/hatch/workspace/staging/music41/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ------------------------------------------------- new batch-41 instruments
def obsidian_note(midi, dur, vel=1.0):
    """Dark glass bell: cold minor-second shimmer, long black decay."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (0.55 * np.sin(2 * np.pi * f * t)
         + 0.30 * np.sin(2 * np.pi * 2.06 * f * t)
         + 0.20 * np.sin(2 * np.pi * 2.92 * f * t)
         + 0.10 * np.sin(2 * np.pi * 1.06 * f * t))
    x = lowpass(x, 6000)
    env = adsr(n_, min(0.02, dur * 0.05), 0.3, 0.55, min(dur * 0.5, 2.0))
    return x * env * vel * 0.38


def deep_drone(dur, vel=1.0, seed=0):
    """Sub-bass war drone: slow pulsing darkness under the campaign."""
    rng = np.random.default_rng(4100 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = (np.sin(2 * np.pi * 55 * t) * 0.6
         + np.sin(2 * np.pi * 82.5 * t) * 0.3
         + lowpass(rng.standard_normal(n_), 160) * 0.25)
    pulse = 0.6 + 0.4 * np.sin(2 * np.pi * 0.12 * t + 0.9)
    return x * pulse * vel * 0.42


def copper_pattern(dur, bpm, vel=1.0, seed=0):
    """Copper patrol drum: warm metallic dum each beat, bright tek offbeat."""
    rng = np.random.default_rng(4110 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    beat_s = 60.0 / bpm

    def dum():
        L = int(SR * 0.30)
        t = np.arange(L) / SR
        return ((np.sin(2 * np.pi * 165 * t) * np.exp(-t / 0.10)
                 + 0.5 * np.sin(2 * np.pi * 248 * t) * np.exp(-t / 0.05)
                 + lowpass(rng.standard_normal(L), 1000)
                 * np.exp(-t / 0.04) * 0.4))

    def tek():
        L = int(SR * 0.12)
        t = np.arange(L) / SR
        return ((np.sin(2 * np.pi * 700 * t) * np.exp(-t / 0.02)
                 + highpass(rng.standard_normal(L), 2800)
                 * np.exp(-t / 0.03) * 0.6))

    d, tk = dum(), tek()
    for s in np.arange(0, dur, beat_s):
        i0 = int(s * SR)
        if i0 + len(d) < n_:
            out[i0:i0 + len(d)] += d * rng.uniform(0.85, 1.0)
        j0 = i0 + int(SR * beat_s / 2)
        if j0 + len(tk) < n_:
            out[j0:j0 + len(tk)] += tk * rng.uniform(0.55, 0.75)
    return out * vel * 0.55


def anvil_hits(dur, bpm, vel=1.0, seed=0):
    """Smith's hammer: sharp strikes each beat, quench hiss each bar."""
    rng = np.random.default_rng(4120 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    beat_s = 60.0 / bpm

    def strike():
        L = int(SR * 0.14)
        t = np.arange(L) / SR
        return ((np.sin(2 * np.pi * rng.uniform(1400, 1900) * t)
                 * np.exp(-t / 0.03)
                 + highpass(rng.standard_normal(L), 2200)
                 * np.exp(-t / 0.025) * 0.7))

    def quench():
        L = int(SR * 0.40)
        return (highpass(rng.standard_normal(L), 3000)
                * np.exp(-np.arange(L) / (SR * 0.15)) * 0.5)

    st, qh = strike(), quench()
    for k, s in enumerate(np.arange(0, dur, beat_s)):
        i0 = int(s * SR)
        if i0 + len(st) < n_:
            out[i0:i0 + len(st)] += st * rng.uniform(0.75, 1.0)
        if k % 4 == 3 and i0 + len(qh) < n_:
            out[i0:i0 + len(qh)] += qh * 0.6
    return out * vel * 0.50


def autumn_leaves(dur, vel=1.0, seed=0):
    """Harvest air: rustling leaves over a warm amber bed."""
    rng = np.random.default_rng(4130 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    rustle = highpass(lowpass(rng.standard_normal(n_), 6500), 1200) * 0.30
    swell = (0.5 + 0.5 * np.sin(2 * np.pi * 0.10 * t + 0.4)
             * np.sin(2 * np.pi * 0.043 * t))
    bed = lowpass(rng.standard_normal(n_), 320) * 0.22
    return (rustle * (0.4 + 0.6 * swell) + bed * swell) * vel * 0.40


def bronze_gong(midi, dur, vel=1.0):
    """Ancient temple gong: deep inharmonic bloom, very long decay."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    partials = [(1.00, 0.65), (1.48, 0.28), (2.09, 0.22),
                (2.94, 0.13), (4.20, 0.07)]
    x = np.zeros(n_)
    for ratio, amp in partials:
        x += amp * np.sin(2 * np.pi * ratio * f * t) * np.exp(
            -t / (dur * 0.40 * ratio ** 0.5))
    x = lowpass(x, 3800)
    env = adsr(n_, min(0.01, dur * 0.03), 0.5, 0.50,
               min(dur * 0.45, 2.5))
    return x * env * vel * 0.44


def plains_wind(dur, vel=1.0, seed=0):
    """Open grass sea: airy wind with long slow swells."""
    rng = np.random.default_rng(4140 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = lowpass(highpass(rng.standard_normal(n_), 350), 2600)
    swells = (0.45 + 0.55 * np.sin(2 * np.pi * 0.08 * t + 1.3)
              * np.sin(2 * np.pi * 0.031 * t))
    return x * (0.35 + 0.65 * swells) * vel * 0.38


def stampede(dur, bpm, vel=1.0, seed=0):
    """Heavy hoof charge: rolling triplet gallop, ground-shaking."""
    rng = np.random.default_rng(4150 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    beat_s = 60.0 / bpm
    L = int(SR * 0.13)
    t = np.arange(L) / SR
    hoof = (lowpass(highpass(rng.standard_normal(L), 450), 2600)
            * np.exp(-np.arange(L) / (SR * 0.035))
            + 0.3 * np.sin(2 * np.pi * 90 * t) * np.exp(-t / 0.05))
    for s in np.arange(0, dur, beat_s / 3):
        i0 = int(s * SR)
        if i0 + L < n_:
            out[i0:i0 + L] += hoof * rng.uniform(0.70, 1.0)
    # ground rumble under the hooves
    rum = lowpass(rng.standard_normal(n_), 130) * 0.30
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * np.arange(n_) / SR)
    return (out + rum * swell) * vel * 0.55


class Voice41(Voice40):
    def shard(self, b, midi, dur_beats=4, **kw):
        self._place(obsidian_note(midi, self._b2s(dur_beats), **kw), b)

    def deep(self, b, dur_beats=16, seed=0, **kw):
        self._place(deep_drone(self._b2s(dur_beats), seed=seed, **kw), b)

    def copper(self, b, bpm, dur_beats=16, seed=0, **kw):
        self._place(copper_pattern(self._b2s(dur_beats), bpm,
                                   seed=seed, **kw), b)

    def anvil(self, b, bpm, dur_beats=16, seed=0, **kw):
        self._place(anvil_hits(self._b2s(dur_beats), bpm,
                               seed=seed, **kw), b)

    def leaves(self, b, dur_beats=16, seed=0, **kw):
        self._place(autumn_leaves(self._b2s(dur_beats),
                                  seed=seed, **kw), b)

    def gong(self, b, midi, dur_beats=4, **kw):
        self._place(bronze_gong(midi, self._b2s(dur_beats), **kw), b)

    def plains(self, b, dur_beats=16, seed=0, **kw):
        self._place(plains_wind(self._b2s(dur_beats), seed=seed, **kw), b)

    def stampede(self, b, bpm, dur_beats=16, seed=0, **kw):
        self._place(stampede(self._b2s(dur_beats), bpm,
                             seed=seed, **kw), b)


# ============================================= THE-OBSIDIAN-CAMPAIGN
# Black glass and blacker skies: the dark tide rolls over the field.
# D minor, 94 BPM. 16 bars. Arc: the gathering -> the dark tide -> the aftermath.
# Dm Bb Gm A.
def the_obsidian_campaign():
    bpm = 94
    bars = 16
    total = bars * 4
    strings = Voice41(bpm, total)
    shard = Voice41(bpm, total)
    deep = Voice41(bpm, total)
    brass = c27.Track(bpm, total)
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
            return 0.50 + i * 0.10      # the gathering
        if i < 12:
            return 1.0                  # the dark tide
        return 1.0 - (i - 12) * 0.15    # the aftermath

    # the deep drone never lifts; the glass sings above it
    deep.deep(0, total, seed=3, vel=0.70)

    # an original dark motif: narrow, cold, descending
    obsidian = [
        (0, "D5", 2), (2, "Eb5", 2), (4, "D5", 4),
        (8, "C5", 2), (10, "Bb4", 2), (12, "A4", 4),
        (16, "D5", 2), (18, "F5", 2), (20, "Eb5", 4),
        (24, "D5", 6), (30, "C5", 2),
        (32, "Bb4", 4), (36, "A4", 4),
        (40, "G4", 2), (42, "A4", 2), (44, "Bb4", 4),
        (48, "A4", 4), (52, "G4", 4),
        (56, "F4", 2), (58, "Eb4", 2), (60, "D4", 4),
    ]
    for off, note, d in obsidian:
        v = arc_vel(int(off // 4))
        shard.shard(off, n(note), d, vel=v * 0.46)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # short slashing cuts over long bowed dread
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.6, vel=v * 0.34)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.20)
        brass.brass(b, ch[0], 1.6, vel=v * 0.44)
        brass.brass(b + 2, ch[2], 1.6, vel=v * 0.40)
        drums.taiko(b, vel=v * 0.54)
        drums.taiko(b + 2, vel=v * 0.48)
        drums.snare(b + 1, vel=v * 0.36)
        drums.snare(b + 3, vel=v * 0.36)
        bass.bass(b, root, 1.8, vel=v * 0.53, cutoff=400)
        bass.bass(b + 2, root, 1.8, vel=v * 0.48, cutoff=400)
        if i == 4:
            drums.crash(b, vel=0.60)

    stems = {"strings": strings, "shard": shard, "deep": deep,
             "brass": brass, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-obsidian-campaign", stems,
            {"strings": 0.86, "shard": 0.90, "deep": 0.88,
             "brass": 0.90, "bass": 0.90, "drums": 0.90}, False)


# =========================================== DRUMS-OF-THE-COPPER-WATCH
# Warm metal on the wall: the patrol keeps the copper line through the night.
# E minor, 128 BPM. 16 bars. Arc: the patrol begins -> the copper line -> the relief.
# Em C Am B.
def drums_of_the_copper_watch():
    bpm = 128
    bars = 16
    total = bars * 4
    drums = c27.Track(bpm, total)
    copper = Voice41(bpm, total)
    wind = Voice41(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    strings = Voice41(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    Am = [n("A2"), n("C3"), n("E3")]
    B = [n("B2"), n("D#3"), n("F#3")]
    prog = [Em, C, Am, B] * 4
    roots = [n("E1"), n("C1"), n("A1"), n("B1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.10      # the patrol begins
        if i < 12:
            return 1.0                  # the copper line
        return 1.0 - (i - 12) * 0.14    # the relief

    # the patrol drums out under cold wind
    copper.copper(0, bpm, total, seed=5, vel=0.70)
    wind.nightwind(0, total, seed=9, vel=0.55)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # drum cadence drives the watch
        drums.snare(b, vel=v * 0.50)
        drums.snare(b + 1, vel=v * 0.42)
        drums.snare(b + 2, vel=v * 0.50)
        drums.snare(b + 3, vel=v * 0.42)
        drums.taiko(b, vel=v * 0.48)
        drums.taiko(b + 2, vel=v * 0.44)
        if i % 4 == 3:
            drums.crash(b, vel=v * 0.38)
        # brass signals from the gatehouse
        brass.brass(b, ch[0] + 12, 2.0, vel=v * 0.38)
        brass.brass(b + 2, ch[2] + 12, 2.0, vel=v * 0.34)
        # strings keep the night taut
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.19)
        bass.bass(b, root, 1.8, vel=v * 0.50, cutoff=400)
        bass.bass(b + 2, root, 1.8, vel=v * 0.46, cutoff=400)

    stems = {"drums": drums, "copper": copper, "wind": wind,
             "brass": brass, "bass": bass, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-copper-watch", stems,
            {"drums": 0.92, "copper": 0.88, "wind": 0.86,
             "brass": 0.88, "bass": 0.90, "strings": 0.86}, False)


# ===================================================== THE-SMITHS-SONG
# Sparks and hammer-blows: the forge sings through the working day.
# G major, 102 BPM. 12 bars. Loop, sample-exact.
# G Em C D / G D Em C.
def the_smiths_song():
    bpm = 102
    bars = 12
    total = bars * 4
    anvil = Voice41(bpm, total)
    strings = Voice41(bpm, total)
    flute = Voice41(bpm, total)
    lyre = Voice41(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, Em, C, D, G, D, Em, C, G, C, D, G]
    roots = [n("G1"), n("E1"), n("C1"), n("D1"), n("G1"), n("D1"),
             n("E1"), n("C1"), n("G1"), n("C1"), n("D1"), n("G1")]

    # the hammer never stops: honest rhythm under everything
    anvil.anvil(0, bpm, total, seed=21, vel=0.75)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.8, vel=0.30)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.18)
        # the smith's tune: sturdy and bright
        flute.flute(b, ch[2] + 24, 1.0, vel=0.34)
        flute.flute(b + 2, ch[1] + 24, 1.0, vel=0.30)
        # lyre picks the pattern between the hammer-falls
        for k in range(4):
            lyre.lyre(b + k + 0.5, ch[(k + 1) % 3] + 12, 0.5,
                      vel=0.28)
        bass.bass(b, root, 1.8, vel=0.48, cutoff=500)
        bass.bass(b + 2, root, 1.8, vel=0.44, cutoff=500)
        # bellows-drum keeps the working beat
        drums.taiko(b, vel=0.34)
        drums.taiko(b + 2, vel=0.30)
        drums.hat(b + 1, vel=0.22)
        drums.hat(b + 3, vel=0.22)

    stems = {"anvil": anvil, "strings": strings, "flute": flute,
             "lyre": lyre, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-smiths-song", stems,
            {"anvil": 0.88, "strings": 0.86, "flute": 0.90,
             "lyre": 0.88, "bass": 0.90, "drums": 0.88}, True)


# ========================================= SONGS-OF-THE-AUTUMN-FEAST
# The harvest is home: amber air, pipes, and the last feast of the year.
# A major, 116 BPM. 12 bars. Loop, sample-exact.
# A D E / A F#m D E.
def songs_of_the_autumn_feast():
    bpm = 116
    bars = 12
    total = bars * 4
    leaves = Voice41(bpm, total)
    fife = Voice41(bpm, total)
    strings = Voice41(bpm, total)
    lyre = Voice41(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    Fsm = [n("F#2"), n("A2"), n("C#3")]
    prog = [A, D, E, A, Fsm, D, A, D, A, Fsm, D, E]
    roots = [n("A1"), n("D1"), n("E1"), n("A1"), n("F#1"), n("D1"),
             n("A1"), n("D1"), n("A1"), n("F#1"), n("D1"), n("E1")]

    # amber air rustles over the whole feast
    leaves.leaves(0, total, seed=27, vel=0.60)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the harvest-dance: bouncy strings
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.7, vel=0.32)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.18)
        # fife-bright flute leads the round
        fife.flute(b, ch[2] + 24, 1.0, vel=0.36)
        fife.flute(b + 2, ch[0] + 24, 1.0, vel=0.32)
        # lyre strums between the verses
        for k in range(4):
            lyre.lyre(b + k + 0.5, ch[(k + 2) % 3] + 12, 0.5,
                      vel=0.28)
        brass.brass(b, ch[0] + 12, 1.2, vel=0.30)
        bass.bass(b, root, 1.8, vel=0.50, cutoff=500)
        bass.bass(b + 2, root + 7, 1.8, vel=0.44, cutoff=500)
        # feast drums: big and merry
        drums.taiko(b, vel=0.48)
        drums.taiko(b + 2, vel=0.44)
        drums.snare(b + 1, vel=0.34)
        drums.snare(b + 3, vel=0.34)
        if i == 0:
            drums.crash(b, vel=0.50)

    stems = {"leaves": leaves, "fife": fife, "strings": strings,
             "lyre": lyre, "brass": brass, "bass": bass,
             "drums": drums}
    for s in stems.values():
        s.trim()
    return ("songs-of-the-autumn-feast", stems,
            {"leaves": 0.88, "fife": 0.90, "strings": 0.86,
             "lyre": 0.88, "brass": 0.88, "bass": 0.90,
             "drums": 0.92}, True)


# ===================================================== THE-BRONZE-THRONE
# Ancient bronze rules the court: deep gongs over strings and old choir.
# F major, 86 BPM. 16 bars. Arc: the ancient court -> the bronze years -> the verdigris.
# F Dm Bb C.
def the_bronze_throne():
    bpm = 86
    bars = 16
    total = bars * 4
    gong = Voice41(bpm, total)
    strings = Voice41(bpm, total)
    flute = Voice41(bpm, total)
    choir = Voice41(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [F, Dm, Bb, C] * 4
    roots = [n("F1"), n("D1"), n("Bb1"), n("C1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10      # the ancient court
        if i < 12:
            return 1.0                  # the bronze years
        return 1.0 - (i - 12) * 0.16    # the verdigris

    # the gong motif: old, heavy, patient
    bronze_motif = [
        (0, "C5", 2), (2, "F5", 4), (8, "A5", 2), (10, "G5", 4),
        (16, "F5", 4), (20, "D5", 4), (24, "C5", 2), (26, "D5", 2),
        (28, "F5", 4), (32, "G5", 2), (34, "A5", 2), (36, "Bb5", 4),
        (40, "A5", 4), (44, "G5", 2), (46, "F5", 6),
        (56, "C5", 8),
    ]
    for off, note, d in bronze_motif:
        v = arc_vel(int(off // 4))
        gong.gong(off, n(note), d, vel=v * 0.52)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.24)
            strings.strings(b + 2, m + 24, 2.0, vel=v * 0.18)
        flute.flute(b, ch[2] + 24, 2.0, vel=v * 0.30)
        flute.flute(b + 2, ch[1] + 24, 2.0, vel=v * 0.26)
        choir.choir(b, ch[1] + 12, 4.0, vel=v * 0.30)
        bass.bass(b, root, 2.0, vel=v * 0.50, cutoff=350)
        bass.bass(b + 2, root, 2.0, vel=v * 0.44, cutoff=350)
        # distant court drums, never hurried
        drums.taiko(b, vel=v * 0.40)
        if i % 4 == 2:
            drums.crash(b, vel=v * 0.30)

    stems = {"gong": gong, "strings": strings, "flute": flute,
             "choir": choir, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-bronze-throne", stems,
            {"gong": 0.92, "strings": 0.86, "flute": 0.88,
             "choir": 0.90, "bass": 0.90, "drums": 0.88}, False)


# ========================================== FURY-OF-THE-WESTERN-HOST
# The plains thunder: hooves, war-horns, and the charge of the western host.
# E minor, 136 BPM. 16 bars. Arc: the plains stir -> the charge -> the dust settles.
# Em C G D.
def fury_of_the_western_host():
    bpm = 136
    bars = 16
    total = bars * 4
    stampede_t = Voice41(bpm, total)
    plains = Voice41(bpm, total)
    warhorn = Voice41(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)
    strings = Voice41(bpm, total)

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
            return 0.50 + i * 0.10      # the plains stir
        if i < 12:
            return 1.0                  # the charge
        return 1.0 - (i - 12) * 0.15    # the dust settles

    # the plains breathe under the hooves
    plains.plains(0, total, seed=33, vel=0.65)
    stampede_t.stampede(0, bpm, total, seed=37, vel=0.80)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the charge-horn sounds the advance
        warhorn.warhorn(b, n("E3"), 2.0, vel=v * 0.52)
        if i % 2 == 1:
            warhorn.warhorn(b + 2, n("B2"), 2.0, vel=v * 0.46)
        brass.brass(b, ch[0] + 12, 1.4, vel=v * 0.44)
        brass.brass(b + 2, ch[2] + 12, 1.4, vel=v * 0.40)
        # strings slash like sabers
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.5, vel=v * 0.34)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.20)
        bass.bass(b, root, 1.6, vel=v * 0.54, cutoff=400)
        bass.bass(b + 2, root, 1.6, vel=v * 0.48, cutoff=400)
        if i == 4:
            drums.crash(b, vel=v * 0.55)

    stems = {"stampede": stampede_t, "plains": plains,
             "warhorn": warhorn, "brass": brass, "bass": bass,
             "drums": drums, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("fury-of-the-western-host", stems,
            {"stampede": 0.90, "plains": 0.86, "warhorn": 0.90,
             "brass": 0.90, "bass": 0.90, "drums": 0.92,
             "strings": 0.86}, False)


# ============================================================ render
TRACKS = [
    (the_obsidian_campaign, 0.20),
    (drums_of_the_copper_watch, 0.22),
    (the_smiths_song, 0.16),
    (songs_of_the_autumn_feast, 0.18),
    (the_bronze_throne, 0.20),
    (fury_of_the_western_host, 0.24),
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
