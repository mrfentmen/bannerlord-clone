"""Fortieth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-39 moods already covered - do not duplicate):
  the-ashen-campaign, drums-of-the-bronze-watch, the-coopers-song,
  songs-of-the-spring-feast, the-golden-throne, storm-of-the-eastern-host.
Render: python3 compose40.py -> wav stems + mixes in out/
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
import compose27 as c27
from compose37 import n
from compose39 import Voice39
from synth import (SR, midi_to_freq, adsr, lowpass, highpass)

OUT = "/home/hatch/workspace/staging/music40/out"
MP3 = "/home/hatch/workspace/staging/music40/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ------------------------------------------------- new batch-40 instruments
def toll_note(midi, dur, vel=1.0):
    """Cracked tolling bell: inharmonic partials, weary and low."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    partials = [(1.00, 0.60), (2.02, 0.30), (2.74, 0.22),
                (3.76, 0.14), (5.40, 0.08)]
    x = np.zeros(n_)
    for ratio, amp in partials:
        x += amp * np.sin(2 * np.pi * ratio * f * t) * np.exp(
            -t / (dur * 0.35 * ratio ** 0.5))
    # the crack: a faint shimmer riding the decay
    x += 0.05 * np.sin(2 * np.pi * 7.13 * f * t) * np.exp(-t / 0.6)
    x = lowpass(x, 5200)
    env = adsr(n_, min(0.01, dur * 0.03), 0.4, 0.45,
               min(dur * 0.45, 2.2))
    return x * env * vel * 0.42


def rubble(dur, vel=1.0, seed=0):
    """Falling masonry: deep thuds and gritty slides in the ruin."""
    rng = np.random.default_rng(4000 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    out = np.zeros(n_)
    for _ in range(int(dur * 1.6)):
        i0 = rng.integers(0, max(n_ - int(SR * 0.5), 1))
        L = int(rng.uniform(SR * 0.15, SR * 0.5))
        lt = np.arange(L) / SR
        thud = (np.sin(2 * np.pi * rng.uniform(55, 110) * lt)
                * np.exp(-lt / rng.uniform(0.10, 0.25)))
        grit = (lowpass(rng.standard_normal(L), 700)
                * np.exp(-lt / rng.uniform(0.12, 0.30)) * 0.6)
        out[i0:i0 + L] += (thud + grit) * rng.uniform(0.25, 0.70)
    bed = lowpass(rng.standard_normal(n_), 260) * 0.25
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * 0.09 * t + 0.7)
    return (out + bed * swell) * vel * 0.50


def bronze_pattern(dur, bpm, vel=1.0, seed=0):
    """Bronze patrol drum: deep metallic dum each beat, bright tek offbeat."""
    rng = np.random.default_rng(4010 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    beat_s = 60.0 / bpm

    def dum():
        L = int(SR * 0.30)
        t = np.arange(L) / SR
        return ((np.sin(2 * np.pi * 150 * t) * np.exp(-t / 0.10)
                 + 0.5 * np.sin(2 * np.pi * 231 * t) * np.exp(-t / 0.05)
                 + lowpass(rng.standard_normal(L), 900)
                 * np.exp(-t / 0.04) * 0.4))

    def tek():
        L = int(SR * 0.12)
        t = np.arange(L) / SR
        return ((np.sin(2 * np.pi * 640 * t) * np.exp(-t / 0.02)
                 + highpass(rng.standard_normal(L), 2600)
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


def stave_taps(dur, bpm, vel=1.0, seed=0):
    """Cooper's hammer: wooden taps every beat, iron hoop ring each bar."""
    rng = np.random.default_rng(4020 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    beat_s = 60.0 / bpm

    def tap():
        L = int(SR * 0.10)
        t = np.arange(L) / SR
        return ((np.sin(2 * np.pi * rng.uniform(800, 1050) * t)
                 * np.exp(-t / 0.025)
                 + lowpass(highpass(rng.standard_normal(L), 700), 3800)
                 * np.exp(-t / 0.02) * 0.7))

    def ring():
        L = int(SR * 0.45)
        t = np.arange(L) / SR
        f = rng.uniform(1250, 1450)
        return ((np.sin(2 * np.pi * f * t)
                 + 0.4 * np.sin(2 * np.pi * 2.76 * f * t))
                * np.exp(-t / 0.12))

    for k, s in enumerate(np.arange(0, dur, beat_s)):
        i0 = int(s * SR)
        if i0 + int(SR * 0.10) >= n_:
            break
        tp = tap()
        out[i0:i0 + len(tp)] += tp * rng.uniform(0.70, 1.0)
        if k % 4 == 0:
            rg = ring()
            j0 = i0 + int(SR * 0.08)
            if j0 + len(rg) < n_:
                out[j0:j0 + len(rg)] += rg * 0.55
    return out * vel * 0.48


def lark_song(dur, vel=1.0, seed=0):
    """Spring birdsong: bright twitter clusters over a soft green bed."""
    rng = np.random.default_rng(4030 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    for _ in range(int(dur * 9)):
        i0 = rng.integers(0, max(n_ - 6000, 1))
        L = int(rng.uniform(1200, 6000))
        t = np.arange(L) / SR
        f0 = rng.uniform(3200, 5200)
        f1 = f0 * rng.uniform(0.7, 1.4)
        f = f0 + (f1 - f0) * np.sin(2 * np.pi * rng.uniform(4, 9) * t) ** 2
        inst = np.cumsum(2 * np.pi * f / SR)
        chirp = np.sin(inst) * np.sin(np.pi * t / (L / SR)) ** 2
        out[i0:i0 + L] += chirp * rng.uniform(0.06, 0.16)
    bed = lowpass(rng.standard_normal(n_), 900) * 0.20
    return (out + bed) * vel * 0.44


def sun_chime(dur, vel=1.0, seed=0):
    """Golden gong swells: radiant, slow, sunlit."""
    rng = np.random.default_rng(4040 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = np.zeros(n_)
    ratios = [1.0, 1.51, 2.09, 2.94, 4.20]
    for r in ratios:
        f = 196.0 * r
        swell = 0.4 + 0.6 * np.sin(2 * np.pi * 0.07 * t + r) ** 2
        x += (np.sin(2 * np.pi * f * t) * swell
              * np.exp(-t / rng.uniform(6, 14)))
    x = lowpass(x, 6500)
    return x * vel * 0.36


def gallop(dur, bpm, vel=1.0, seed=0):
    """Triplet cavalry gallop: three hoofbeats per beat, relentless."""
    rng = np.random.default_rng(4050 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    beat_s = 60.0 / bpm

    def hoof():
        L = int(SR * 0.09)
        return (lowpass(highpass(rng.standard_normal(L), 700), 2600)
                * np.exp(-np.arange(L) / (SR * 0.035)))

    for s in np.arange(0, dur, beat_s):
        for j, off in enumerate((0.0, 0.33, 0.62)):
            i0 = int((s + off * beat_s) * SR)
            h = hoof()
            if i0 + len(h) < n_:
                out[i0:i0 + len(h)] += h * (0.85 if j == 0 else 0.60)
    return out * vel * 0.52


def steppe_wind(dur, vel=1.0, seed=0):
    """Open steppe wind: wide gusts over dry grass."""
    rng = np.random.default_rng(4060 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = lowpass(highpass(rng.standard_normal(n_), 350), 2800)
    gusts = (0.45 + 0.55 * np.sin(2 * np.pi * 0.14 * t + 1.4)
             * np.sin(2 * np.pi * 0.047 * t))
    return x * (0.35 + 0.65 * gusts) * vel * 0.40


class Voice40(Voice39):
    def toll(self, b, midi, dur_beats=4, **kw):
        self._place(toll_note(midi, self._b2s(dur_beats), **kw), b)

    def rubble(self, b, dur_beats=16, seed=0, **kw):
        self._place(rubble(self._b2s(dur_beats), seed=seed, **kw), b)

    def bronze(self, b, bpm, dur_beats=16, seed=0, **kw):
        self._place(bronze_pattern(self._b2s(dur_beats), bpm,
                                  seed=seed, **kw), b)

    def stave(self, b, bpm, dur_beats=16, seed=0, **kw):
        self._place(stave_taps(self._b2s(dur_beats), bpm,
                               seed=seed, **kw), b)

    def lark(self, b, dur_beats=16, seed=0, **kw):
        self._place(lark_song(self._b2s(dur_beats), seed=seed, **kw), b)

    def sun(self, b, dur_beats=16, seed=0, **kw):
        self._place(sun_chime(self._b2s(dur_beats), seed=seed, **kw), b)

    def gallop(self, b, bpm, dur_beats=16, seed=0, **kw):
        self._place(gallop(self._b2s(dur_beats), bpm,
                           seed=seed, **kw), b)

    def steppe(self, b, dur_beats=16, seed=0, **kw):
        self._place(steppe_wind(self._b2s(dur_beats), seed=seed, **kw), b)


# ================================================ THE-ASHEN-CAMPAIGN
# The city lies in ruin: cracked bells toll over rubble and a last stand.
# G minor, 92 BPM. 16 bars. Arc: the ruin -> the last stand -> the silence.
# Gm Dm Eb Bb.
def the_ashen_campaign():
    bpm = 92
    bars = 16
    total = bars * 4
    strings = Voice40(bpm, total)
    toll = Voice40(bpm, total)
    rubble_t = Voice40(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G3"), n("Bb3"), n("D4")]
    Dm = [n("D3"), n("F3"), n("A3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    prog = [Gm, Dm, Eb, Bb] * 4
    roots = [n("G1"), n("D1"), n("Eb1"), n("Bb1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10      # the ruin
        if i < 12:
            return 1.0                  # the last stand
        return 1.0 - (i - 12) * 0.17    # the silence

    # cracked bells toll the hours of the siege; rubble settles
    for i in range(16):
        toll.toll(bar(i), n("G4") if i % 2 == 0 else n("D4"),
                  4.0, vel=arc_vel(i) * 0.52)
    rubble_t.rubble(0, total, seed=21, vel=0.60)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # bowed lines drag through the dust
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.26)
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.6, vel=v * 0.32)
        brass.brass(b, ch[0], 1.8, vel=v * 0.44)
        brass.brass(b + 2, ch[2], 1.8, vel=v * 0.40)
        drums.taiko(b, vel=v * 0.54)
        drums.taiko(b + 2, vel=v * 0.48)
        drums.snare(b + 1, vel=v * 0.36)
        drums.snare(b + 3, vel=v * 0.36)
        bass.bass(b, root, 1.8, vel=v * 0.54, cutoff=380)
        bass.bass(b + 2, root, 1.8, vel=v * 0.48, cutoff=380)
        if i == 4:
            drums.crash(b, vel=0.60)

    # an original dirge-tune: the banner falls, the line holds
    dirge = [
        (0, "G4", 2), (2, "Bb4", 2), (4, "A4", 4),
        (8, "G4", 2), (10, "F4", 2), (12, "Eb4", 4),
        (16, "D4", 4), (20, "Eb4", 4),
        (24, "F4", 2), (26, "G4", 2), (28, "Bb4", 4),
        (32, "A4", 4), (36, "G4", 4),
        (40, "F4", 2), (42, "Eb4", 2), (44, "D4", 4),
        (48, "G4", 8),
        (56, "Bb4", 2), (58, "A4", 2), (60, "G4", 4),
    ]
    for off, note, d in dirge:
        v = arc_vel(int(off // 4))
        strings.strings(off, n(note) + 12, d, vel=v * 0.40)

    stems = {"strings": strings, "toll": toll, "rubble": rubble_t,
             "brass": brass, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-ashen-campaign", stems,
            {"strings": 0.88, "toll": 0.88, "rubble": 0.86,
             "brass": 0.90, "bass": 0.90, "drums": 0.90}, False)


# ========================================= DRUMS-OF-THE-BRONZE-WATCH
# The bronze watch keeps its rounds: metallic drums under a cold moon.
# A minor, 126 BPM. 16 bars. Arc: the rounds begin -> the bronze line -> the dawn.
# Am F C G.
def drums_of_the_bronze_watch():
    bpm = 126
    bars = 16
    total = bars * 4
    drums = c27.Track(bpm, total)
    bronze = Voice40(bpm, total)
    wind = Voice40(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    strings = Voice40(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A3"), n("C4"), n("E4")]
    F = [n("F3"), n("A3"), n("C4")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Am, F, C, G] * 4
    roots = [n("A1"), n("F1"), n("C1"), n("G1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.10      # the rounds begin
        if i < 12:
            return 1.0                  # the bronze line
        return 1.0 - (i - 12) * 0.14    # the dawn

    # bronze drums never stop; cold wind on the wall
    bronze.bronze(0, bpm, total, seed=25, vel=0.72)
    wind.nightwind(0, total, seed=29, vel=0.55)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # watch cadence on skin drums
        drums.snare(b, vel=v * 0.50)
        drums.snare(b + 1, vel=v * 0.42)
        drums.snare(b + 2, vel=v * 0.50)
        drums.snare(b + 3, vel=v * 0.42)
        drums.taiko(b, vel=v * 0.48)
        drums.taiko(b + 2, vel=v * 0.44)
        if i % 4 == 3:
            drums.crash(b, vel=v * 0.38)
        # bronze horns signal the all-clear
        brass.brass(b, ch[0] + 12, 2.0, vel=v * 0.40)
        brass.brass(b + 2, ch[2] + 12, 2.0, vel=v * 0.36)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.20)
        bass.bass(b, root, 1.8, vel=v * 0.52, cutoff=400)
        bass.bass(b + 2, root, 1.8, vel=v * 0.48, cutoff=400)

    stems = {"drums": drums, "bronze": bronze, "wind": wind,
             "brass": brass, "bass": bass, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-bronze-watch", stems,
            {"drums": 0.92, "bronze": 0.88, "wind": 0.86,
             "brass": 0.88, "bass": 0.90, "strings": 0.86}, False)


# ===================================================== THE-COOPERS-SONG
# Staves and hoops: the cooper's hammer keeps time through the working day.
# F major, 100 BPM. 12 bars. Loop, sample-exact.
# F Bb C / F Dm Bb C.
def the_coopers_song():
    bpm = 100
    bars = 12
    total = bars * 4
    stave = Voice40(bpm, total)
    strings = Voice40(bpm, total)
    flute = Voice40(bpm, total)
    lyre = Voice40(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F3"), n("A3"), n("C4")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    prog = [F, Bb, C, F, Dm, Bb, F, Bb, F, Dm, Bb, C]
    roots = [n("F1"), n("Bb1"), n("C1"), n("F1"), n("D1"),
             n("Bb1"), n("F1"), n("Bb1"), n("F1"), n("D1"),
             n("Bb1"), n("C1")]

    # the cooper's hammer never stops: honest rhythm under everything
    stave.stave(0, bpm, total, seed=31, vel=0.75)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.8, vel=0.30)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.18)
        # the cooper's tune: round and cheerful
        flute.flute(b, ch[2] + 24, 1.0, vel=0.34)
        flute.flute(b + 2, ch[1] + 24, 1.0, vel=0.30)
        for k in range(4):
            lyre.lyre(b + k + 0.5, ch[(k + 1) % 3] + 12, 0.5,
                      vel=0.28)
        bass.bass(b, root, 1.8, vel=0.48, cutoff=500)
        bass.bass(b + 2, root, 1.8, vel=0.44, cutoff=500)
        drums.taiko(b, vel=0.34)
        drums.taiko(b + 2, vel=0.30)
        drums.hat(b + 1, vel=0.22)
        drums.hat(b + 3, vel=0.22)

    stems = {"stave": stave, "strings": strings, "flute": flute,
             "lyre": lyre, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-coopers-song", stems,
            {"stave": 0.88, "strings": 0.86, "flute": 0.90,
             "lyre": 0.88, "bass": 0.90, "drums": 0.88}, True)


# ======================================== SONGS-OF-THE-SPRING-FEAST
# The thaw has come: birdsong, pipes, and the first feast of the year.
# D major, 114 BPM. 12 bars. Loop, sample-exact.
# D G A / D Bm G A.
def songs_of_the_spring_feast():
    bpm = 114
    bars = 12
    total = bars * 4
    lark = Voice40(bpm, total)
    fife = Voice40(bpm, total)
    strings = Voice40(bpm, total)
    harp = Voice40(bpm, total)
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

    # spring sings over everything
    lark.lark(0, total, seed=37, vel=0.60)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the feast-dance: light bouncing strings
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.7, vel=0.30)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.18)
        # fife leads the round, bright as morning
        fife.fife(b, ch[2] + 24, 1.0, vel=0.36)
        fife.fife(b + 2, ch[0] + 24, 1.0, vel=0.32)
        # harp answers between the phrases
        for k in range(4):
            harp.harp(b + k + 0.5, ch[(k + 2) % 3] + 12, 0.5,
                      vel=0.28)
        bass.bass(b, root, 1.8, vel=0.48, cutoff=500)
        bass.bass(b + 2, root + 7, 1.8, vel=0.44, cutoff=500)
        # feast drums: bright and dancing
        drums.taiko(b, vel=0.44)
        drums.taiko(b + 2, vel=0.40)
        drums.snare(b + 1, vel=0.32)
        drums.snare(b + 3, vel=0.32)
        if i == 0:
            drums.crash(b, vel=0.48)

    stems = {"lark": lark, "fife": fife, "strings": strings,
             "harp": harp, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("songs-of-the-spring-feast", stems,
            {"lark": 0.88, "fife": 0.90, "strings": 0.86,
             "harp": 0.88, "bass": 0.90, "drums": 0.90}, True)


# ===================================================== THE-GOLDEN-THRONE
# The sun rules the court: golden gongs over strings and glad choir.
# E major, 88 BPM. 16 bars. Arc: the sunrise court -> the golden years -> the sunset.
# E C#m A B.
def the_golden_throne():
    bpm = 88
    bars = 16
    total = bars * 4
    sun = Voice40(bpm, total)
    strings = Voice40(bpm, total)
    flute = Voice40(bpm, total)
    choir = Voice40(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    E = [n("E3"), n("G#3"), n("B3")]
    Csm = [n("C#3"), n("E3"), n("G#3")]
    A = [n("A2"), n("C#3"), n("E3")]
    B = [n("B2"), n("D#3"), n("F#3")]
    prog = [E, Csm, A, B] * 4
    roots = [n("E1"), n("C#1"), n("A1"), n("B1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10      # the sunrise court
        if i < 12:
            return 1.0                  # the golden years
        return 1.0 - (i - 12) * 0.16    # the sunset

    # golden gongs swell over the court
    sun.sun(0, total, seed=41, vel=0.70)

    # a stately sun-motif on high strings
    motif = [
        (0, "B4", 2), (2, "E5", 4), (8, "D#5", 2), (10, "B4", 4),
        (16, "C#5", 2), (18, "B4", 4), (24, "A4", 4), (28, "G#4", 4),
        (32, "B4", 2), (34, "D#5", 2), (36, "E5", 4),
        (40, "G#5", 4), (44, "F#5", 2), (46, "E5", 6),
        (56, "B4", 8),
    ]
    for off, note, d in motif:
        v = arc_vel(int(off // 4))
        strings.strings(off, n(note) + 12, d, vel=v * 0.38)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.22)
            strings.strings(b + 2, m + 24, 2.0, vel=v * 0.16)
        flute.flute(b, ch[2] + 24, 2.0, vel=v * 0.30)
        flute.flute(b + 2, ch[1] + 24, 2.0, vel=v * 0.26)
        choir.choir(b, ch[1] + 12, 4.0, vel=v * 0.30)
        bass.bass(b, root, 2.0, vel=v * 0.50, cutoff=380)
        bass.bass(b + 2, root, 2.0, vel=v * 0.44, cutoff=380)
        drums.taiko(b, vel=v * 0.42)
        if i % 4 == 2:
            drums.crash(b, vel=v * 0.32)

    stems = {"sun": sun, "strings": strings, "flute": flute,
             "choir": choir, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-golden-throne", stems,
            {"sun": 0.88, "strings": 0.86, "flute": 0.88,
             "choir": 0.90, "bass": 0.90, "drums": 0.88}, False)


# ========================================= STORM-OF-THE-EASTERN-HOST
# The steppe erupts: galloping horse-lords under a warhorn sky.
# A minor, 134 BPM. 16 bars. Arc: the steppe stirs -> the charge -> the dust settles.
# Am G F E.
def storm_of_the_eastern_host():
    bpm = 134
    bars = 16
    total = bars * 4
    gallop_t = Voice40(bpm, total)
    steppe = Voice40(bpm, total)
    warhorn = Voice40(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    G = [n("G2"), n("B2"), n("D3")]
    F = [n("F2"), n("A2"), n("C3")]
    E = [n("E2"), n("G#2"), n("B2")]
    prog = [Am, G, F, E] * 4
    roots = [n("A1"), n("G1"), n("F1"), n("E1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10      # the steppe stirs
        if i < 12:
            return 1.0                  # the charge
        return 1.0 - (i - 12) * 0.15    # the dust settles

    # the horde rides under open wind
    gallop_t.gallop(0, bpm, total, seed=43, vel=0.72)
    steppe.steppe(0, total, seed=47, vel=0.60)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the charge-horn sounds the advance
        warhorn.warhorn(b, n("A2"), 2.0, vel=v * 0.52)
        if i % 2 == 1:
            warhorn.warhorn(b + 2, n("E2"), 2.0, vel=v * 0.46)
        brass.brass(b, ch[0] + 12, 1.4, vel=v * 0.44)
        brass.brass(b + 2, ch[2] + 12, 1.4, vel=v * 0.40)
        # warhorn stabs slash like sabres over the charge
        for k in range(4):
            warhorn.warhorn(b + k, ch[k % 3] - 12, 0.5, vel=v * 0.30)
        for k in range(4):
            drums.taiko(b + k, vel=v * 0.50)
        bass.bass(b, root, 1.6, vel=v * 0.54, cutoff=400)
        bass.bass(b + 2, root, 1.6, vel=v * 0.48, cutoff=400)
        if i == 4:
            drums.crash(b, vel=v * 0.55)

    stems = {"gallop": gallop_t, "steppe": steppe,
             "warhorn": warhorn, "brass": brass, "bass": bass,
             "drums": drums}
    for s in stems.values():
        s.trim()
    return ("storm-of-the-eastern-host", stems,
            {"gallop": 0.90, "steppe": 0.86, "warhorn": 0.90,
             "brass": 0.90, "bass": 0.90, "drums": 0.92}, False)


# ============================================================ render
TRACKS = [
    (the_ashen_campaign, 0.20),
    (drums_of_the_bronze_watch, 0.22),
    (the_coopers_song, 0.16),
    (songs_of_the_spring_feast, 0.18),
    (the_golden_throne, 0.20),
    (storm_of_the_eastern_host, 0.24),
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
