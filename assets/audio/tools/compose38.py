"""Thirty-eighth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-37 moods already covered - do not duplicate):
  the-ember-campaign, drums-of-the-storm-watch, the-millers-song,
  songs-for-the-harvest-home, the-steel-crown (renamed from the-iron-crown:
  taken on live main), charge-of-the-winged-host.
Render: python3 compose38.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np
from scipy import signal as _sig

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
sys.path.insert(0, "/home/hatch/workspace/staging/music36")
sys.path.insert(0, "/home/hatch/workspace/staging/music37")
import compose27 as c27
from compose37 import Voice37, n
from synth import (SR, midi_to_freq, adsr, lowpass, highpass, noise)

OUT = "/home/hatch/workspace/staging/music38/out"
MP3 = "/home/hatch/workspace/staging/music38/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ------------------------------------------------- new batch-38 instruments
def bellows_blast(dur, vel=1.0, seed=0):
    """Forge bellows: a breathing blast of hot air feeding the siege fires."""
    rng = np.random.default_rng(3800 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    air = lowpass(rng.standard_normal(n_), 900)
    pulse = 0.55 + 0.45 * np.sin(2 * np.pi * 1.4 * t)
    whoosh = highpass(lowpass(rng.standard_normal(n_), 4000), 700) * 0.35
    return (air * pulse + whoosh * pulse * 0.6) * vel * 0.42


def storm_rumble(dur, vel=1.0, seed=0):
    """Distant storm bed: rolling thunder under gusting wind."""
    rng = np.random.default_rng(3810 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    rumble = lowpass(rng.standard_normal(n_), 220)
    gusts = 0.5 + 0.5 * (np.sin(2 * np.pi * 0.21 * t + 1.3)
                         * np.sin(2 * np.pi * 0.073 * t))
    far = lowpass(rng.standard_normal(n_), 90) * 0.8
    return (rumble * (0.55 + 0.45 * gusts) + far) * vel * 0.50


def rain_hiss(dur, vel=1.0, seed=0):
    """Steady rain: patter over a hiss, with random droplet strikes."""
    rng = np.random.default_rng(3820 + seed)
    n_ = int(dur * SR)
    base = highpass(lowpass(rng.standard_normal(n_), 6000), 1200) * 0.35
    drops = np.zeros(n_)
    for _ in range(int(dur * 14)):
        s = rng.integers(0, max(n_ - 2000, 1))
        L = int(rng.uniform(300, 1800))
        env = np.exp(-np.arange(L) / (SR * rng.uniform(0.003, 0.015)))
        drop = highpass(rng.standard_normal(L),
                        rng.uniform(2500, 7000)) * env
        drops[s:s + L] += drop * rng.uniform(0.08, 0.30)
    return (base + drops) * vel * 0.38


def mill_clatter(dur, vel=1.0, seed=0):
    """Water-wheel mill: rhythmic wooden knock and creak, patient work."""
    rng = np.random.default_rng(3830 + seed)
    n_ = int(dur * SR)
    out = np.zeros(n_)
    period = int(SR * 0.52)     # the wheel's patient turning
    L = int(SR * 0.18)
    for s in range(0, n_ - L, period):
        knock = (lowpass(highpass(rng.standard_normal(L), 400), 1800)
                 * np.exp(-np.arange(L) / (SR * 0.05)))
        out[s:s + L] += knock * rng.uniform(0.50, 0.80)
        cl = int(SR * 0.22)
        if s + L + cl < n_:
            creak = np.sin(np.cumsum(2 * np.pi * (
                300 + 120 * np.sin(2 * np.pi * 3 * np.arange(cl) / SR))
                / SR))
            creak *= np.exp(-np.arange(cl) / (SR * 0.12))
            out[s + L:s + L + cl] += creak * 0.12
    return out * vel * 0.48


def organ_pipe_note(midi, dur, vel=1.0):
    """Cathedral organ: heavy full-harmonic stack, slow-speaking pipes."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (0.50 * np.sin(2 * np.pi * f * t)
         + 0.28 * np.sin(2 * np.pi * 2 * f * t)
         + 0.18 * np.sin(2 * np.pi * 3 * f * t)
         + 0.12 * np.sin(2 * np.pi * 4 * f * t)
         + 0.07 * np.sin(2 * np.pi * 5 * f * t))
    x = lowpass(x, 2400)
    env = adsr(n_, min(0.8, dur * 0.15), 0.4, 0.90,
               min(1.5, dur * 0.20))
    return x * env * vel * 0.40


def whinny(dur=1.2, vel=1.0):
    """Horse whinny: a long falling-rising call with trembling vibrato."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f0 = 1600 - 750 * np.minimum(t / (dur * 0.45), 1.0)
    f = np.where(t > dur * 0.45,
                 850 + 450 * np.minimum((t - dur * 0.45) / (dur * 0.55),
                                        1.0), f0)
    f = f + 90 * np.sin(2 * np.pi * 11 * t) * np.minimum(t / 0.2, 1.0)
    inst = np.cumsum(2 * np.pi * f / SR)
    x = (0.50 * np.sin(inst) + 0.30 * np.sin(2 * inst)
         + 0.15 * np.sin(3 * inst))
    x = lowpass(highpass(x, 500), 4500)
    return x * adsr(n_, 0.06, 0.20, 0.80,
                    min(0.40, dur * 0.30)) * vel * 0.42


class Voice38(Voice37):
    def bellows(self, b, dur_beats=4, seed=0, **kw):
        self._place(bellows_blast(self._b2s(dur_beats), seed=seed,
                                  **kw), b)

    def storm(self, b, dur_beats=16, seed=0, **kw):
        self._place(storm_rumble(self._b2s(dur_beats), seed=seed, **kw),
                    b)

    def rain(self, b, dur_beats=16, seed=0, **kw):
        self._place(rain_hiss(self._b2s(dur_beats), seed=seed, **kw), b)

    def mill(self, b, dur_beats=16, seed=0, **kw):
        self._place(mill_clatter(self._b2s(dur_beats), seed=seed,
                                 **kw), b)

    def organ(self, b, midi, dur_beats=8, **kw):
        self._place(organ_pipe_note(midi, self._b2s(dur_beats), **kw),
                    b)

    def whinny(self, b, **kw):
        self._place(whinny(**kw), b)


# ========================================================= THE-EMBER-CAMPAIGN
# The town burns through the night: sparks, bellows, and the siege fire.
# E minor, 96 BPM. 16 bars. Arc: sparks -> the siege fire -> dying embers.
# Em C G D.
def the_ember_campaign():
    bpm = 96
    bars = 16
    total = bars * 4
    strings = Voice38(bpm, total)
    fire = Voice38(bpm, total)
    bellows = Voice38(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

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
            return 0.50 + i * 0.10    # the first sparks
        if i < 12:
            return 1.0                # the siege fire
        return 1.0 - (i - 12) * 0.15  # the dying embers

    # the fire never goes out: ember bed under everything
    fire.fire(0, total, seed=11, vel=0.70)
    for i in range(0, 16, 4):
        bellows.bellows(bar(i), 16, seed=i, vel=0.55)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the crack of burning timbers: string stabs
        for k in range(4):
            strings.strings(b + k, ch[k % 3] + 12, 0.6, vel=v * 0.38)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.22)
        # the siege engines: brass pushes the fire forward
        brass.brass(b, ch[0], 1.6, vel=v * 0.48)
        brass.brass(b + 2, ch[2], 1.6, vel=v * 0.44)
        # the war-drum: heavy taiko through the smoke
        drums.taiko(b, vel=v * 0.58)
        drums.taiko(b + 2, vel=v * 0.52)
        drums.snare(b + 1, vel=v * 0.40)
        drums.snare(b + 3, vel=v * 0.40)
        # deep roots hold the ground
        bass.bass(b, root, 1.8, vel=v * 0.55, cutoff=400)
        bass.bass(b + 2, root, 1.8, vel=v * 0.50, cutoff=400)
        if i == 4:
            drums.crash(b, vel=0.65)

    # an original fire-tune: stubborn, rising, unburned
    ember = [
        (0, "B3", 2), (2, "C4", 2), (4, "B3", 4),
        (8, "A3", 2), (10, "G3", 2), (12, "A3", 4),
        (16, "B3", 2), (18, "D4", 2), (20, "E4", 4),
        (24, "D4", 2), (26, "B3", 2), (28, "A3", 8),
        (32, "G3", 4), (36, "A3", 4),
        (40, "B3", 2), (42, "C4", 2), (44, "D4", 4),
        (48, "E4", 4), (52, "D4", 4),
        (56, "B3", 2), (58, "A3", 2), (60, "G3", 4),
    ]
    for off, note, d in ember:
        v = arc_vel(int(off // 4))
        strings.strings(off, n(note) + 12, d, vel=v * 0.44)

    stems = {"strings": strings, "fire": fire, "bellows": bellows,
             "brass": brass, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-ember-campaign", stems,
            {"strings": 0.86, "fire": 0.92, "bellows": 0.88,
             "brass": 0.90, "bass": 0.90, "drums": 0.90}, False)


# ================================================= DRUMS-OF-THE-STORM-WATCH
# Lightning walks the wall: the watch holds through the tempest.
# D minor, 130 BPM. 16 bars. Arc: distant storm -> the tempest -> the calm.
# Dm Bb F C.
def drums_of_the_storm_watch():
    bpm = 130
    bars = 16
    total = bars * 4
    drums = c27.Track(bpm, total)
    storm = Voice38(bpm, total)
    rain = Voice38(bpm, total)
    warhorn = Voice38(bpm, total)
    bass = c27.Track(bpm, total)
    strings = Voice38(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [Dm, Bb, F, C] * 4
    roots = [n("D1"), n("Bb1"), n("F1"), n("C1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.52 + i * 0.08    # the storm gathers
        if i < 12:
            return 1.0                # the tempest
        return 1.0 - (i - 12) * 0.16  # the calm after

    # the weather holds the whole track
    storm.storm(0, total, seed=3, vel=0.65)
    rain.rain(0, total, seed=5, vel=0.60)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the watch drums: war-taiko against the thunder
        drums.taiko(b, vel=v * 0.60)
        drums.tom(b + 1, freq=95, vel=v * 0.42)
        drums.taiko(b + 2, vel=v * 0.60)
        drums.tom(b + 3, freq=78, vel=v * 0.46)
        drums.kick(b + 0.5, vel=v * 0.50)
        for k in range(4):
            drums.hat(b + k, vel=v * 0.22)
        if 4 <= i < 12:
            drums.snare(b + 1, vel=v * 0.44)
            drums.snare(b + 3, vel=v * 0.44)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the horn calls through the rain
        warhorn.warhorn(b, ch[0] + 12, 3.2, vel=v * 0.40)
        # dark strings hold the line
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.28)
        # the deep foundation
        bass.bass(b, root, 1.8, vel=v * 0.55, cutoff=380)
        bass.bass(b + 2, root, 1.8, vel=v * 0.50, cutoff=380)

    # an original storm-call: defiant against the wind
    tempest = [
        (0, "A3", 4),
        (8, "Bb3", 2), (10, "A3", 2), (12, "F3", 4),
        (16, "G3", 4), (20, "A3", 4),
        (24, "D4", 2), (26, "C4", 2), (28, "Bb3", 8),
        (32, "A3", 2), (34, "G3", 2), (36, "A3", 4),
        (40, "F3", 8),
        (48, "G3", 4), (52, "A3", 4),
        (56, "D4", 8),
    ]
    for off, note, d in tempest:
        v = arc_vel(int(off // 4))
        warhorn.warhorn(off, n(note), d, vel=v * 0.42)

    stems = {"drums": drums, "storm": storm, "rain": rain,
             "warhorn": warhorn, "bass": bass, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-storm-watch", stems,
            {"drums": 0.95, "storm": 0.90, "rain": 0.88,
             "warhorn": 0.88, "bass": 0.90, "strings": 0.86}, False)


# ========================================================= THE-MILLERS-SONG
# The wheel turns, the grain goes through: the miller's own work-song.
# G major, 104 BPM. 16 bars. Loop (sample-exact).
# G Em C D.
def the_millers_song():
    bpm = 104
    bars = 16
    total = bars * 4
    mill = Voice38(bpm, total)
    flute = Voice38(bpm, total)
    strings = Voice38(bpm, total)
    dulcimer = Voice38(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, Em, C, D] * 4
    roots = [n("G1"), n("E1"), n("C1"), n("D1")] * 4

    # the wheel never stops: mill bed under everything
    mill.mill(0, total, seed=7, vel=0.70)

    v = 0.88
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the grinding rhythm: dulcimer eighths with the wheel
        ham = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[2] + 24,
               ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 24]
        for k, m in enumerate(ham):
            dulcimer.dulcimer(b + k * 0.5, m, 1, vel=v * 0.40)
        # the warm day: strings hold the sun
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.26)
        # the miller's tread: walking bass
        walk = [root, ch[1] - 12, ch[2] - 12, ch[0] - 12]
        for k, m in enumerate(walk):
            bass.bass(b + k, m, 0.8, vel=v * 0.52, cutoff=520)
        # light hand-drums keep the rhythm
        drums.taiko(b, vel=v * 0.50)
        drums.taiko(b + 2, vel=v * 0.46)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.22)

    # an original mill-song: steady, merry, unbothered
    miller = [
        (0, "D4", 2), (2, "G4", 2), (4, "B4", 4),
        (8, "A4", 2), (10, "G4", 2), (12, "E4", 4),
        (16, "G4", 2), (18, "B4", 2), (20, "D5", 4),
        (24, "C5", 2), (26, "B4", 2), (28, "A4", 4),
        (32, "G4", 4), (36, "E4", 4),
        (40, "F#4", 2), (42, "G4", 2), (44, "A4", 4),
        (48, "G4", 2), (50, "F#4", 2), (52, "E4", 4),
        (56, "D4", 2), (58, "E4", 2), (60, "G4", 4),
    ]
    for off, note, d in miller:
        flute.flute(off, n(note), d, vel=v * 0.44)

    stems = {"mill": mill, "flute": flute, "strings": strings,
             "dulcimer": dulcimer, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-millers-song", stems,
            {"mill": 0.90, "flute": 0.90, "strings": 0.86,
             "dulcimer": 0.90, "bass": 0.90, "drums": 0.88}, True)


# =============================================== SONGS-FOR-THE-HARVEST-HOME
# The last sheaf is in: the village sings the harvest home.
# A major, 116 BPM. 16 bars. Loop (sample-exact).
# A D E A / A F#m D E.
def songs_for_the_harvest_home():
    bpm = 116
    bars = 16
    total = bars * 4
    fife = Voice38(bpm, total)
    drums = c27.Track(bpm, total)
    strings = Voice38(bpm, total)
    lyre = Voice38(bpm, total)
    brass = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    Fsm = [n("F#2"), n("A2"), n("C#3")]
    prog = [A, D, E, A, A, Fsm, D, E] * 2
    roots = [n("A1"), n("D2"), n("E1"), n("A1"),
             n("A1"), n("F#1"), n("D2"), n("E1")] * 2

    v = 0.92
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the harvest dance: lyre eighths lead the step
        dance = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
                 ch[2] + 24, ch[0] + 24, ch[1] + 24, ch[2] + 24]
        for k, m in enumerate(dance):
            lyre.lyre(b + k * 0.5, m, 1, vel=v * 0.40)
        # the full table: strings warm the room
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.28)
        # the toast: brass on the downbeats
        brass.brass(b, ch[0], 1.2, vel=v * 0.46)
        brass.brass(b + 2, ch[2], 1.2, vel=v * 0.42)
        # the stamping feet: drums drive the dance
        drums.taiko(b, vel=v * 0.58)
        drums.taiko(b + 2, vel=v * 0.54)
        drums.snare(b + 1, vel=v * 0.42)
        drums.snare(b + 3, vel=v * 0.42)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.24)
        if i == 0:
            drums.crash(b, vel=0.70)
        # the round bass: quarter-note roots
        for k in range(4):
            bass.bass(b + k, root, 0.8, vel=v * 0.55, cutoff=500)

    # an original harvest-air: joyful, ringing, full-throated
    harvest = [
        (0, "E4", 2), (2, "E4", 2), (4, "A4", 4),
        (8, "G#4", 2), (10, "F#4", 2), (12, "E4", 4),
        (16, "F#4", 2), (18, "G#4", 2), (20, "A4", 4),
        (24, "B4", 4), (28, "A4", 4),
        (32, "E4", 2), (34, "F#4", 2), (36, "G#4", 4),
        (40, "A4", 4), (44, "E4", 4),
        (48, "D4", 2), (50, "E4", 2), (52, "F#4", 2), (54, "G#4", 2),
        (56, "A4", 4), (60, "G#4", 4),
    ]
    for off, note, d in harvest:
        fife.fife(off, n(note), d, vel=v * 0.46)

    stems = {"fife": fife, "drums": drums, "strings": strings,
             "lyre": lyre, "brass": brass, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("songs-for-the-harvest-home", stems,
            {"fife": 0.90, "drums": 0.92, "strings": 0.86,
             "lyre": 0.90, "brass": 0.90, "bass": 0.90}, True)


# ============================================================ THE-STEEL-CROWN
# The anointing is done: iron years under a heavier crown.
# C minor, 82 BPM. 16 bars. Arc: the anointing -> the iron years ->
# the rust.
# Cm Ab Eb Bb.
def the_steel_crown():
    bpm = 82
    bars = 16
    total = bars * 4
    organ = Voice38(bpm, total)
    choir = Voice38(bpm, total)
    strings = Voice38(bpm, total)
    bell = Voice38(bpm, total)
    bass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Eb = [n("Eb2"), n("G2"), n("Bb2")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    prog = [Cm, Ab, Eb, Bb] * 4
    roots = [n("C1"), n("Ab1"), n("Eb2"), n("Bb1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.08    # the anointing
        if i < 12:
            return 1.0                # the iron years
        return 1.0 - (i - 12) * 0.16  # the rust

    # the organ fills the cathedral: full chords under everything
    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        for m in ch:
            organ.organ(b, m, 4.4, vel=v * 0.38)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the court sings: choir holds the weight
        for m in ch:
            choir.choir(b, m, 4.4, vel=v * 0.34)
        # the counter-line: high strings answer
        strings.strings(b, ch[2] + 12, 2.0, vel=v * 0.30)
        strings.strings(b + 2, ch[1] + 12, 2.0, vel=v * 0.28)
        # the coronation bell: FM copper, tolling slow
        bell.bell(b, ch[0] + 12, 8, vel=v * 0.34)
        # the iron foundation: patient bass
        bass.bass(b, root, 3.5, vel=v * 0.52, cutoff=240)
        # muffled court drums: restrained taiko
        drums.taiko(b, vel=v * 0.44)
        drums.taiko(b + 2, vel=v * 0.40)

    # an original royal lament: dignity under the weight
    steel = [
        (0, "G3", 8),
        (8, "Ab3", 4), (12, "G3", 4),
        (16, "Eb3", 8),
        (24, "D3", 4), (28, "C3", 4),
        (32, "Eb3", 8),
        (40, "G3", 4), (44, "Ab3", 4),
        (48, "Bb3", 8),
        (56, "G3", 8),
    ]
    for off, note, d in steel:
        v = arc_vel(int(off // 4))
        strings.strings(off, n(note) + 12, d, vel=v * 0.46)

    stems = {"organ": organ, "choir": choir, "strings": strings,
             "bell": bell, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-steel-crown", stems,
            {"organ": 0.88, "choir": 0.88, "strings": 0.86,
             "bell": 0.85, "bass": 0.90, "drums": 0.86}, False)


# ============================================== CHARGE-OF-THE-WINGED-HOST
# The winged host takes the field: two thousand hooves, one charge.
# F minor, 138 BPM. 16 bars. Arc: the muster -> the charge ->
# the dust settles.
# Fm Db Ab Eb.
def charge_of_the_winged_host():
    bpm = 138
    bars = 16
    total = bars * 4
    hooves = Voice38(bpm, total)
    warhorn = Voice38(bpm, total)
    brass = c27.Track(bpm, total)
    drums = c27.Track(bpm, total)
    bass = c27.Track(bpm, total)
    neigh = Voice38(bpm, total)

    def bar(i):
        return i * 4

    Fm = [n("F3"), n("Ab3"), n("C4")]
    Db = [n("Db3"), n("F3"), n("Ab3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    prog = [Fm, Db, Ab, Eb] * 4
    roots = [n("F1"), n("Db2"), n("Ab1"), n("Eb2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.12    # the muster
        if i < 12:
            return 1.0                # the charge
        return 1.0 - (i - 12) * 0.17  # the dust settles

    # the horses answer: whinnies before the charge
    neigh.whinny(bar(1), vel=0.50)
    neigh.whinny(bar(2) + 2, vel=0.44)
    neigh.whinny(bar(13), vel=0.40)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # two thousand hooves: galloping eighth-beats
        gallop = [0, 0.5, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 3.25, 3.5]
        for k in gallop:
            hooves.hoof(b + k, vel=v * 0.55)
        # the war-horns: the charge is sounded
        if 4 <= i < 12:
            warhorn.warhorn(b, ch[0] + 12, 3.2, vel=v * 0.46)
            warhorn.warhorn(b + 2, ch[2] + 12, 2.0, vel=v * 0.42)
        # the winged charge: brass rides over the top
        if 4 <= i < 12:
            brass.brass(b, ch[0], 0.8, vel=v * 0.50)
            brass.brass(b + 1, ch[1], 0.8, vel=v * 0.46)
            brass.brass(b + 2, ch[2], 0.8, vel=v * 0.50)
            brass.brass(b + 3, ch[0], 0.8, vel=v * 0.46)
        # the battle-drums: relentless
        for k in range(8):
            drums.taiko(b + k * 0.5, vel=v * 0.55)
        drums.kick(b + 0.25, vel=v * 0.52)
        drums.kick(b + 2.25, vel=v * 0.52)
        if 4 <= i < 12:
            drums.snare(b + 1, vel=v * 0.46)
            drums.snare(b + 3, vel=v * 0.46)
        if i == 4:
            drums.crash(b, vel=0.72)
        # the thunder of the charge: driving bass
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.4, vel=v * 0.56,
                      cutoff=440)

    # an original charge-call: no horse turns back
    wings = [
        (0, "C4", 2), (2, "Db4", 2), (4, "C4", 4),
        (8, "Bb3", 2), (10, "Ab3", 2), (12, "G3", 4),
        (16, "Ab3", 2), (18, "Bb3", 2), (20, "C4", 4),
        (24, "Db4", 4), (28, "C4", 4),
        (32, "Bb3", 4), (36, "Ab3", 4),
        (40, "G3", 2), (42, "Ab3", 2), (44, "Bb3", 4),
        (48, "C4", 8),
        (56, "Bb3", 4), (60, "Ab3", 4),
    ]
    for off, note, d in wings:
        v = arc_vel(int(off // 4))
        warhorn.warhorn(off, n(note), d, vel=v * 0.44)

    stems = {"hooves": hooves, "warhorn": warhorn, "brass": brass,
             "drums": drums, "bass": bass, "neigh": neigh}
    for s in stems.values():
        s.trim()
    return ("charge-of-the-winged-host", stems,
            {"hooves": 0.92, "warhorn": 0.90, "brass": 0.90,
             "drums": 0.95, "bass": 0.90, "neigh": 0.88}, False)


# ============================================================ render
TRACKS = [
    (the_ember_campaign, 0.20),
    (drums_of_the_storm_watch, 0.22),
    (the_millers_song, 0.16),
    (songs_for_the_harvest_home, 0.18),
    (the_steel_crown, 0.20),
    (charge_of_the_winged_host, 0.24),
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
