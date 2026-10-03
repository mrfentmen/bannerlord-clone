"""Thirty-ninth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-38 moods already covered - do not duplicate):
  the-crimson-campaign, drums-of-the-iron-watch, the-weavers-song,
  songs-of-the-midwinter-feast, the-silver-throne, wrath-of-the-southern-host.
Render: python3 compose39.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
sys.path.insert(0, "/home/hatch/workspace/staging/music36")
sys.path.insert(0, "/home/hatch/workspace/staging/music37")
sys.path.insert(0, "/home/hatch/workspace/staging/music38")
import compose27 as c27
from compose37 import n
from compose38 import Voice38
from synth import (SR, midi_to_freq, adsr, lowpass, highpass, noise)

OUT = "/home/hatch/workspace/staging/music39/out"
MP3 = "/home/hatch/workspace/staging/music39/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ------------------------------------------------- new batch-39 instruments
def heartbeat_pulse(dur, bpm, vel=1.0, seed=0):
    """War-heart: deep lub-dub thump on every beat."""
    rng = np.random.default_rng(3900 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    beat_s = 60.0 / bpm
    L = int(SR * 0.30)
    t = np.arange(L) / SR
    thump = (np.sin(2 * np.pi * 48 * t) * np.exp(-t / 0.05)
             + 0.6 * np.sin(2 * np.pi * 96 * t) * np.exp(-t / 0.035))
    for s in np.arange(0, dur, beat_s):
        i0 = int(s * SR)
        if i0 + L >= n_:
            break
        g = rng.uniform(0.85, 1.0)
        out[i0:i0 + L] += thump * g
        j0 = i0 + int(SR * 0.22)  # the dub
        if j0 + L < n_:
            out[j0:j0 + L] += thump * 0.7 * g
    return out * vel * 0.55


def ashfall(dur, vel=1.0, seed=0):
    """Falling ash: breathy bed with faint ember crackles."""
    rng = np.random.default_rng(3910 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = lowpass(highpass(rng.standard_normal(n_), 300), 2500)
    swell = (0.55 + 0.45 * np.sin(2 * np.pi * 0.13 * t + 1.0)
             * np.sin(2 * np.pi * 0.041 * t))
    crackle = np.zeros(n_)
    for _ in range(int(dur * 3)):
        i0 = rng.integers(0, max(n_ - 800, 1))
        L = int(rng.uniform(200, 1200))
        env = np.exp(-np.arange(L) / (SR * rng.uniform(0.002, 0.012)))
        crackle[i0:i0 + L] += (highpass(rng.standard_normal(L), 2000)
                               * env * rng.uniform(0.05, 0.20))
    return (x * 0.5 * swell + crackle) * vel * 0.40


def footfalls(dur, bpm, vel=1.0, seed=0):
    """Iron-shod patrol march: alternating heavy steps, two per beat."""
    rng = np.random.default_rng(3920 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    step_s = 60.0 / bpm / 2
    L = int(SR * 0.16)
    t = np.arange(L) / SR
    for k, s in enumerate(np.arange(0, dur, step_s)):
        i0 = int(s * SR)
        if i0 + L >= n_:
            break
        step = (lowpass(highpass(rng.standard_normal(L), 500), 2400)
                * np.exp(-np.arange(L) / (SR * 0.045)))
        metal = (np.sin(2 * np.pi * rng.uniform(1800, 2600) * t)
                 * np.exp(-t / 0.03) * 0.15)
        out[i0:i0 + L] += (step + metal) * (0.85 if k % 2 == 0 else 0.65)
    return out * vel * 0.50


def loom_clack(dur, bpm, vel=1.0, seed=0):
    """Weaver's loom: shuttle clack each beat, treadle thump every two."""
    rng = np.random.default_rng(3930 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    beat_s = 60.0 / bpm
    L = int(SR * 0.09)
    clack = (lowpass(highpass(rng.standard_normal(L), 900), 4200)
             * np.exp(-np.arange(L) / (SR * 0.02)))
    Lt = int(SR * 0.14)
    thump = (lowpass(rng.standard_normal(Lt), 500)
             * np.exp(-np.arange(Lt) / (SR * 0.05)))
    for k, s in enumerate(np.arange(0, dur, beat_s)):
        i0 = int(s * SR)
        if i0 + L >= n_:
            break
        out[i0:i0 + L] += clack * rng.uniform(0.75, 1.0)
        if k % 2 == 0 and i0 + Lt < n_:
            out[i0:i0 + Lt] += thump * 0.8
    return out * vel * 0.45


def sleighbells(dur, vel=1.0, seed=0):
    """Feast-day sleigh bells: bright jingle clusters."""
    rng = np.random.default_rng(3940 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    for _ in range(int(dur * 22)):
        i0 = rng.integers(0, max(n_ - 4000, 1))
        f = rng.uniform(5200, 8800)
        L = int(rng.uniform(1500, 4000))
        t = np.arange(L) / SR
        j = ((np.sin(2 * np.pi * f * t)
              + 0.4 * np.sin(2 * np.pi * 1.51 * f * t))
             * np.exp(-t / 0.09))
        out[i0:i0 + L] += j * rng.uniform(0.05, 0.16)
    return out * vel * 0.42


def frost_wind(dur, vel=1.0, seed=0):
    """Cold whistle: thin night air over the feast hall."""
    rng = np.random.default_rng(3950 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = lowpass(highpass(rng.standard_normal(n_), 1400), 5200)
    whistle = 0.5 + 0.5 * np.sin(2 * np.pi * 0.09 * t + 0.5)
    return x * whistle * vel * 0.30


def moonchime_note(midi, dur, vel=1.0):
    """Silver bell: bright, long, moonlit."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (0.55 * np.sin(2 * np.pi * f * t)
         + 0.30 * np.sin(2 * np.pi * 2.01 * f * t)
         + 0.20 * np.sin(2 * np.pi * 2.99 * f * t)
         + 0.10 * np.sin(2 * np.pi * 4.20 * f * t))
    x = lowpass(x, 7000)
    env = adsr(n_, min(0.02, dur * 0.05), 0.3, 0.55, min(dur * 0.5, 2.0))
    return x * env * vel * 0.38


def sand_wind(dur, vel=1.0, seed=0):
    """Desert wind: grain hiss riding slow hot swells."""
    rng = np.random.default_rng(3960 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    hiss = highpass(lowpass(rng.standard_normal(n_), 5200), 900) * 0.4
    swell = (0.45 + 0.55 * np.sin(2 * np.pi * 0.11 * t + 2.0)
             * np.sin(2 * np.pi * 0.037 * t))
    return hiss * swell * vel * 0.42


def camel_bells(dur, vel=1.0, seed=0):
    """Caravan bells: irregular deep clunks on the march."""
    rng = np.random.default_rng(3970 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    s = 0.0
    while s < dur - 0.4:
        i0 = int(s * SR)
        L = int(SR * 0.30)
        t = np.arange(L) / SR
        f = rng.uniform(700, 1100)
        clunk = ((np.sin(2 * np.pi * f * t)
                  + 0.5 * np.sin(2 * np.pi * 2.7 * f * t))
                 * np.exp(-t / 0.08))
        out[i0:i0 + L] += clunk * rng.uniform(0.20, 0.45)
        s += rng.uniform(0.35, 0.95)
    return out * vel * 0.45


def nightwind(dur, vel=1.0, seed=0):
    """Watch wind: cold gusts along the wall."""
    rng = np.random.default_rng(3980 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = lowpass(highpass(rng.standard_normal(n_), 500), 3200)
    gusts = (0.5 + 0.5 * np.sin(2 * np.pi * 0.16 * t + 0.8)
             * np.sin(2 * np.pi * 0.053 * t))
    return x * (0.35 + 0.65 * gusts) * vel * 0.38


def darbuka_hit(kind, vel=1.0, seed=0):
    """Doumbek-style strike: dum (deep) or tek (bright slap)."""
    rng = np.random.default_rng(3990 + seed)
    if kind == "dum":
        n_ = int(SR * 0.28)
        t = np.arange(n_) / SR
        x = (np.sin(2 * np.pi * 110 * t) * np.exp(-t / 0.09)
             + lowpass(rng.standard_normal(n_), 900)
             * np.exp(-t / 0.05) * 0.5)
        return x * vel * 0.60
    n_ = int(SR * 0.12)
    t = np.arange(n_) / SR
    x = (np.sin(2 * np.pi * 720 * t) * np.exp(-t / 0.02)
         + highpass(rng.standard_normal(n_), 2500)
         * np.exp(-t / 0.025) * 0.7)
    return x * vel * 0.50


class Voice39(Voice38):
    def beat(self, b, bpm, dur_beats=4, seed=0, **kw):
        self._place(heartbeat_pulse(self._b2s(dur_beats), bpm,
                                    seed=seed, **kw), b)

    def ash(self, b, dur_beats=16, seed=0, **kw):
        self._place(ashfall(self._b2s(dur_beats), seed=seed, **kw), b)

    def march(self, b, bpm, dur_beats=16, seed=0, **kw):
        self._place(footfalls(self._b2s(dur_beats), bpm,
                              seed=seed, **kw), b)

    def loom(self, b, bpm, dur_beats=16, seed=0, **kw):
        self._place(loom_clack(self._b2s(dur_beats), bpm,
                               seed=seed, **kw), b)

    def sleigh(self, b, dur_beats=16, seed=0, **kw):
        self._place(sleighbells(self._b2s(dur_beats), seed=seed, **kw), b)

    def frost(self, b, dur_beats=16, seed=0, **kw):
        self._place(frost_wind(self._b2s(dur_beats), seed=seed, **kw), b)

    def moon(self, b, midi, dur_beats=4, **kw):
        self._place(moonchime_note(midi, self._b2s(dur_beats), **kw), b)

    def sand(self, b, dur_beats=16, seed=0, **kw):
        self._place(sand_wind(self._b2s(dur_beats), seed=seed, **kw), b)

    def camel(self, b, dur_beats=16, seed=0, **kw):
        self._place(camel_bells(self._b2s(dur_beats), seed=seed, **kw), b)

    def nightwind(self, b, dur_beats=16, seed=0, **kw):
        self._place(nightwind(self._b2s(dur_beats), seed=seed, **kw), b)

    def darbuka(self, b, kind, **kw):
        self._place(darbuka_hit(kind, **kw), b)


# ================================================ THE-CRIMSON-CAMPAIGN
# The army bleeds forward: a war-heart under ash, brass, and lament.
# F minor, 98 BPM. 16 bars. Arc: the gathering -> the bloodletting -> the mourning.
# Fm Db Ab Eb.
def the_crimson_campaign():
    bpm = 98
    bars = 16
    total = bars * 4
    strings = Voice39(bpm, total)
    beat = Voice39(bpm, total)
    ash = Voice39(bpm, total)
    choir = Voice39(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    Fm = [n("F3"), n("Ab3"), n("C4")]
    Db = [n("Db3"), n("F3"), n("Ab3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    prog = [Fm, Db, Ab, Eb] * 4
    roots = [n("F1"), n("Db1"), n("Ab1"), n("Eb1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10      # the gathering
        if i < 12:
            return 1.0                  # the bloodletting
        return 1.0 - (i - 12) * 0.16    # the mourning

    # the war-heart never stops; ash hangs over the field
    beat.beat(0, bpm, total, seed=3, vel=0.80)
    ash.ash(0, total, seed=7, vel=0.60)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # short bleeding string cuts over long bowed lines
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.6, vel=v * 0.36)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.22)
        brass.brass(b, ch[0], 1.6, vel=v * 0.46)
        brass.brass(b + 2, ch[2], 1.6, vel=v * 0.42)
        drums.taiko(b, vel=v * 0.56)
        drums.taiko(b + 2, vel=v * 0.50)
        drums.snare(b + 1, vel=v * 0.38)
        drums.snare(b + 3, vel=v * 0.38)
        bass.bass(b, root, 1.8, vel=v * 0.55, cutoff=400)
        bass.bass(b + 2, root, 1.8, vel=v * 0.50, cutoff=400)
        if i == 4:
            drums.crash(b, vel=0.62)
        # the lament rises as the battle dies
        if i >= 12:
            choir.choir(b, ch[1] + 12, 4.0, vel=(i - 11) * 0.10)

    # an original war-tune: hard, rising, unbroken
    crimson = [
        (0, "C4", 2), (2, "Db4", 2), (4, "C4", 4),
        (8, "Bb3", 2), (10, "Ab3", 2), (12, "Bb3", 4),
        (16, "C4", 2), (18, "Eb4", 2), (20, "F4", 4),
        (24, "Eb4", 2), (26, "C4", 2), (28, "Bb3", 8),
        (32, "Ab3", 4), (36, "Bb3", 4),
        (40, "C4", 2), (42, "Db4", 2), (44, "Eb4", 4),
        (48, "F4", 4), (52, "Eb4", 4),
        (56, "Db4", 2), (58, "C4", 2), (60, "Bb3", 4),
    ]
    for off, note, d in crimson:
        v = arc_vel(int(off // 4))
        strings.strings(off, n(note) + 12, d, vel=v * 0.42)

    stems = {"strings": strings, "beat": beat, "ash": ash,
             "choir": choir, "brass": brass, "bass": bass,
             "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-crimson-campaign", stems,
            {"strings": 0.86, "beat": 0.90, "ash": 0.88,
             "choir": 0.90, "brass": 0.90, "bass": 0.90,
             "drums": 0.90}, False)


# ============================================ DRUMS-OF-THE-IRON-WATCH
# Cold steel on the wall: the patrol keeps the iron line through the night.
# G minor, 132 BPM. 16 bars. Arc: the patrol begins -> the iron line -> the relief.
# Gm Eb Cm D.
def drums_of_the_iron_watch():
    bpm = 132
    bars = 16
    total = bars * 4
    drums = c27.Track(bpm, total)
    march = Voice39(bpm, total)
    wind = Voice39(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    strings = Voice39(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G3"), n("Bb3"), n("D4")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Cm = [n("C3"), n("Eb3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Gm, Eb, Cm, D] * 4
    roots = [n("G1"), n("Eb1"), n("C1"), n("D1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.10      # the patrol begins
        if i < 12:
            return 1.0                  # the iron line
        return 1.0 - (i - 12) * 0.14    # the relief

    # the patrol marches under cold wind
    march.march(0, bpm, total, seed=5, vel=0.70)
    wind.nightwind(0, total, seed=9, vel=0.55)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # drum cadence drives the watch
        drums.snare(b, vel=v * 0.52)
        drums.snare(b + 1, vel=v * 0.44)
        drums.snare(b + 2, vel=v * 0.52)
        drums.snare(b + 3, vel=v * 0.44)
        drums.taiko(b, vel=v * 0.50)
        drums.taiko(b + 2, vel=v * 0.46)
        if i % 4 == 3:
            drums.crash(b, vel=v * 0.40)
        # brass signals from the gatehouse
        brass.brass(b, ch[0] + 12, 2.0, vel=v * 0.40)
        brass.brass(b + 2, ch[2] + 12, 2.0, vel=v * 0.36)
        # strings keep the night taut
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.20)
        bass.bass(b, root, 1.8, vel=v * 0.52, cutoff=400)
        bass.bass(b + 2, root, 1.8, vel=v * 0.48, cutoff=400)

    stems = {"drums": drums, "march": march, "wind": wind,
             "brass": brass, "bass": bass, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-iron-watch", stems,
            {"drums": 0.92, "march": 0.88, "wind": 0.86,
             "brass": 0.88, "bass": 0.90, "strings": 0.86}, False)


# ===================================================== THE-WEAVERS-SONG
# Shuttle and treadle: the loom sings through the working day.
# D major, 102 BPM. 12 bars. Loop, sample-exact.
# D G A / D Bm G A.
def the_weavers_song():
    bpm = 102
    bars = 12
    total = bars * 4
    loom = Voice39(bpm, total)
    strings = Voice39(bpm, total)
    flute = Voice39(bpm, total)
    lyre = Voice39(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    G = [n("G3"), n("B3"), n("D4")]
    A = [n("A2"), n("C#3"), n("E3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    prog = [D, G, A, D, Bm, G, D, G, D, Bm, G, A]
    roots = [n("D1"), n("G1"), n("A1"), n("D1"), n("B1"),
             n("G1"), n("D1"), n("G1"), n("D1"), n("B1"),
             n("G1"), n("A1")]

    # the loom never stops: patient rhythm under everything
    loom.loom(0, bpm, total, seed=11, vel=0.75)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.8, vel=0.30)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.18)
        # the weaver's tune on flute: bright and even
        flute.flute(b, ch[2] + 24, 1.0, vel=0.34)
        flute.flute(b + 2, ch[1] + 24, 1.0, vel=0.30)
        # lyre picks the pattern between the shuttles
        for k in range(4):
            lyre.lyre(b + k + 0.5, ch[(k + 1) % 3] + 12, 0.5,
                      vel=0.28)
        bass.bass(b, root, 1.8, vel=0.48, cutoff=500)
        bass.bass(b + 2, root, 1.8, vel=0.44, cutoff=500)
        # light hand-drum keeps the working beat
        drums.taiko(b, vel=0.34)
        drums.taiko(b + 2, vel=0.30)
        drums.hat(b + 1, vel=0.22)
        drums.hat(b + 3, vel=0.22)

    stems = {"loom": loom, "strings": strings, "flute": flute,
             "lyre": lyre, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-weavers-song", stems,
            {"loom": 0.88, "strings": 0.86, "flute": 0.90,
             "lyre": 0.88, "bass": 0.90, "drums": 0.88}, True)


# ========================================= SONGS-OF-THE-MIDWINTER-FEAST
# The hall roars through the longest night: fire, bells, and full cups.
# C major, 118 BPM. 12 bars. Loop, sample-exact.
# C G Am F / C F G C.
def songs_of_the_midwinter_feast():
    bpm = 118
    bars = 12
    total = bars * 4
    bells = Voice39(bpm, total)
    fire = Voice39(bpm, total)
    strings = Voice39(bpm, total)
    flute = Voice39(bpm, total)
    lyre = Voice39(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [C, G, Am, F, C, F, G, C, G, Am, F, G]
    roots = [n("C1"), n("G1"), n("A1"), n("F1"), n("C1"),
             n("F1"), n("G1"), n("C1"), n("G1"), n("A1"),
             n("F1"), n("G1")]

    # fire in the hearth, bells over the feast
    fire.fire(0, total, seed=13, vel=0.55)
    bells.sleigh(0, total, seed=17, vel=0.60)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the feast-dance: bouncy strings
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.7, vel=0.32)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.18)
        # fife-bright flute leads the round
        flute.flute(b, ch[2] + 24, 1.0, vel=0.36)
        flute.flute(b + 2, ch[0] + 24, 1.0, vel=0.32)
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

    stems = {"bells": bells, "fire": fire, "strings": strings,
             "flute": flute, "lyre": lyre, "brass": brass,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("songs-of-the-midwinter-feast", stems,
            {"bells": 0.88, "fire": 0.90, "strings": 0.86,
             "flute": 0.90, "lyre": 0.88, "brass": 0.88,
             "bass": 0.90, "drums": 0.92}, True)


# ===================================================== THE-SILVER-THRONE
# The moon rules the court: silver chimes over strings and night choir.
# A minor, 84 BPM. 16 bars. Arc: the moonrise court -> the silver years -> the eclipse.
# Am F Dm E.
def the_silver_throne():
    bpm = 84
    bars = 16
    total = bars * 4
    moon = Voice39(bpm, total)
    strings = Voice39(bpm, total)
    flute = Voice39(bpm, total)
    choir = Voice39(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A3"), n("C4"), n("E4")]
    F = [n("F3"), n("A3"), n("C4")]
    Dm = [n("D3"), n("F3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [Am, F, Dm, E] * 4
    roots = [n("A1"), n("F1"), n("D1"), n("E1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10      # the moonrise court
        if i < 12:
            return 1.0                  # the silver years
        return 1.0 - (i - 12) * 0.18    # the eclipse

    # the moon-chime motif: bright over the sleeping court
    motif = [
        (0, "E5", 2), (2, "A5", 4), (8, "G5", 2), (10, "E5", 4),
        (16, "D5", 2), (18, "E5", 4), (24, "C5", 4), (28, "A4", 4),
        (32, "E5", 2), (34, "G5", 2), (36, "A5", 4),
        (40, "C6", 4), (44, "B5", 2), (46, "A5", 6),
        (56, "E5", 8),
    ]
    for off, note, d in motif:
        v = arc_vel(int(off // 4))
        moon.moon(off, n(note), d, vel=v * 0.50)

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

    stems = {"moon": moon, "strings": strings, "flute": flute,
             "choir": choir, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-silver-throne", stems,
            {"moon": 0.90, "strings": 0.86, "flute": 0.88,
             "choir": 0.90, "bass": 0.90, "drums": 0.88}, False)


# ========================================= WRATH-OF-THE-SOUTHERN-HOST
# The desert rises: sand, caravan bells, and the charge of the southern host.
# D minor, 140 BPM. 16 bars. Arc: the sand stirs -> the charge -> the dust settles.
# Dm Bb Gm A.
def wrath_of_the_southern_host():
    bpm = 140
    bars = 16
    total = bars * 4
    drums = Voice39(bpm, total)
    sand = Voice39(bpm, total)
    camel = Voice39(bpm, total)
    warhorn = Voice39(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    strings = Voice39(bpm, total)

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
            return 0.50 + i * 0.10      # the sand stirs
        if i < 12:
            return 1.0                  # the charge
        return 1.0 - (i - 12) * 0.15    # the dust settles

    # the desert never sleeps: sand and caravan bells under everything
    sand.sand(0, total, seed=19, vel=0.65)
    camel.camel(0, total, seed=23, vel=0.55)

    # darbuka war-pattern: dum on the beats, tek between
    for b in range(total):
        v = arc_vel(int(b // 4))
        drums.darbuka(b, "dum", vel=v * 0.85, seed=b)
        drums.darbuka(b + 0.5, "tek", vel=v * 0.70, seed=b + 100)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the charge-horn sounds the advance
        warhorn.warhorn(b, n("D3"), 2.0, vel=v * 0.52)
        if i % 2 == 1:
            warhorn.warhorn(b + 2, n("A2"), 2.0, vel=v * 0.46)
        brass.brass(b, ch[0] + 12, 1.4, vel=v * 0.44)
        brass.brass(b + 2, ch[2] + 12, 1.4, vel=v * 0.40)
        # strings slash like scimitars
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.5, vel=v * 0.34)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.20)
        bass.bass(b, root, 1.6, vel=v * 0.54, cutoff=400)
        bass.bass(b + 2, root, 1.6, vel=v * 0.48, cutoff=400)
        if i == 4:
            drums.crash(b, vel=v * 0.55)

    stems = {"drums": drums, "sand": sand, "camel": camel,
             "warhorn": warhorn, "brass": brass, "bass": bass,
             "strings": strings}
    for s in stems.values():
        s.trim()
    return ("wrath-of-the-southern-host", stems,
            {"drums": 0.94, "sand": 0.88, "camel": 0.86,
             "warhorn": 0.90, "brass": 0.90, "bass": 0.90,
             "strings": 0.86}, False)


# ============================================================ render
TRACKS = [
    (the_crimson_campaign, 0.20),
    (drums_of_the_iron_watch, 0.22),
    (the_weavers_song, 0.16),
    (songs_of_the_midwinter_feast, 0.18),
    (the_silver_throne, 0.20),
    (wrath_of_the_southern_host, 0.24),
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
