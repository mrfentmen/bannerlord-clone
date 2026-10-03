"""Twenty-third batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-22 moods already covered - do not duplicate):
  the-fallen-standard, drums-of-the-deep, the-sunlit-meadow,
  shadows-over-kings-landing, the-ice-queens-court, last-stand-at-dawn.
Render: python3 compose23.py -> wav stems + mixes in out/
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

OUT = "/home/hatch/workspace/staging/music23/out"
MP3 = "/home/hatch/workspace/staging/music23/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(2023)


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


def strings_note(midi, dur, vel=1.0):
    """Bowed string section: detuned saws, slow attack, soft vibrato."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = np.zeros(n_)
    for det in (-7, 6):
        fr = f * (2.0 ** (det / 1200.0))
        vib = 5.0 * np.sin(2 * np.pi * 5.0 * t) * np.minimum(t / 0.6, 1.0)
        inst = np.cumsum(2 * np.pi * (fr + vib) / SR)
        x += 0.30 * _sig.sawtooth(inst) + 0.18 * np.sin(inst)
    x = lowpass(x, 2600)
    env = adsr(n_, 0.35, 0.4, 0.85, min(1.2, dur * 0.3))
    return x * env * vel * 0.5


def flute_note(midi, dur, vel=1.0):
    """Breathy folk flute: soft sine stack, airy chiff, gentle vibrato."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    vib = 6.0 * np.sin(2 * np.pi * 5.4 * t) * np.minimum(t / 0.3, 1.0)
    inst = np.cumsum(2 * np.pi * (f + vib) / SR)
    x = 0.55 * np.sin(inst) + 0.20 * np.sin(2 * inst) + 0.08 * np.sin(3 * inst)
    chiff = highpass(noise(n_), 3000) * np.exp(-t * 60) * 0.3
    x = lowpass(x + chiff, 3600)
    env = adsr(n_, 0.08, 0.2, 0.85, min(0.4, dur * 0.3))
    return x * env * vel * 0.5


def pizz_note(midi, vel=1.0):
    """Pizzicato string snap: fast-decay pluck with attack transient."""
    n_ = int(0.9 * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (np.sin(2 * np.pi * f * t) * np.exp(-t * 14)
         + 0.4 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 22))
    attack = highpass(noise(n_), 2000) * np.exp(-t * 90) * 0.5
    return (x + attack) * vel * 0.55


def sub_drum(dur=1.2, vel=1.0):
    """Subterranean deep drum: sub 40Hz thump with stone skin."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = 42 + 60 * np.exp(-t * 10)
    ph = np.cumsum(2 * np.pi * f / SR)
    body = np.sin(ph) * np.exp(-t * 3.5)
    skin = lowpass(noise(n_), 400) * np.exp(-t * 30) * 0.5
    return (body * 0.9 + skin * 0.6) * vel * 0.9


def cavern_rumble(dur, vel=1.0):
    """Deep cave air: slow sub swells with stone breath."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    x = lowpass(noise(n_), 70) * 0.6 + np.sin(2 * np.pi * 30 * t) * 0.4
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * 0.09 * t + 0.4)
    env = np.minimum(t / 1.5, 1.0) * np.exp(-np.maximum(t - dur + 1.0, 0) * 1.5)
    return x * swell * env * vel * 0.6


def celesta_note(midi, dur, vel=1.0):
    """Celesta: bright keyboard bell, octave partial, quick sparkle."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (0.65 * np.sin(2 * np.pi * f * t)
         + 0.30 * np.sin(2 * np.pi * f * 3.98 * t) * np.exp(-t * 2)
         + 0.10 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 4))
    x *= np.exp(-t * 2.2)
    return x * vel * 0.45


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


def bird_chirp(dur, vel=1.0, seed=0):
    """Meadow birds: little FM chirps scattered through the bed."""
    rng = np.random.default_rng(7000 + seed)
    n_ = int(dur * SR)
    x = np.zeros(n_)
    for _ in range(int(rng.integers(2, 5))):
        s = int(rng.integers(0, max(n_ - int(0.5 * SR), 1)))
        m = int(rng.uniform(0.12, 0.35) * SR)
        t = np.arange(m) / SR
        f0 = rng.uniform(2800, 4200)
        f1 = rng.uniform(2200, 3800)
        f = f0 + (f1 - f0) * t / t[-1]
        inst = np.cumsum(2 * np.pi * f / SR)
        env = np.sin(np.pi * t / t[-1])
        e = min(s + m, n_)
        x[s:e] += np.sin(inst[:e - s]) * env[:e - s] * rng.uniform(0.1, 0.3)
    return x * vel * 0.5


def meadow_bed(dur, vel=1.0, seed=0):
    """Sunlit pasture bed: soft wind + scattered birds."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    w = lowpass(noise(n_), 500)
    swell = 0.6 + 0.4 * np.sin(2 * np.pi * 0.12 * t + 1.3)
    return (w * swell * 0.35 + bird_chirp(dur, 1.0, seed)) * vel * 0.5


def choir_note(midi, dur, vel=1.0, solo=False):
    """Massed-voice 'ooh': detuned harmonic stack, slow bloom, soft vibrato."""
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


class VoiceTrack(Track):
    def choir(self, b, midi, dur_beats, **kw):
        self._place(choir_note(midi, self._b2s(dur_beats), **kw), b)

    def solo(self, b, midi, dur_beats, **kw):
        kw = dict(kw)
        kw["solo"] = True
        self._place(choir_note(midi, self._b2s(dur_beats), **kw), b)
    def strings(self, b, midi, dur_beats, **kw):
        self._place(strings_note(midi, self._b2s(dur_beats), **kw), b)

    def flute(self, b, midi, dur_beats, **kw):
        self._place(flute_note(midi, self._b2s(dur_beats), **kw), b)

    def pizz(self, b, midi, **kw):
        self._place(pizz_note(midi, **kw), b)

    def subdrum(self, b, dur_beats=2, **kw):
        self._place(sub_drum(self._b2s(dur_beats), **kw), b)

    def cavern(self, b, dur_beats=4, **kw):
        self._place(cavern_rumble(self._b2s(dur_beats), **kw), b)

    def celesta(self, b, midi, dur_beats=1, **kw):
        self._place(celesta_note(midi, self._b2s(dur_beats), **kw), b)

    def glass(self, b, midi, dur_beats=4, **kw):
        self._place(glass_note(midi, self._b2s(dur_beats), **kw), b)

    def meadow(self, b, dur_beats=4, **kw):
        seed = kw.pop("seed", 0)
        self._place(meadow_bed(self._b2s(dur_beats), seed=seed, **kw), b)


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


# ============================================================ THE-FALLEN-STANDARD
# A lost cause: tattered honor, a standard carried into the mist.
# F minor, 72 BPM. 12 bars. Arc: dirge -> last charge -> the silence after.
# Fm Db Ab Eb.
def the_fallen_standard():
    bpm = 72
    bars = 12
    total = bars * 4
    brass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Fm = [n("F2"), n("Ab2"), n("C3")]
    Db = [n("Db3"), n("F3"), n("Ab3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    prog = [Fm, Db, Ab, Eb] * 3
    roots = [n("F2"), n("Db3"), n("Ab2"), n("Eb3")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.45 + i * 0.08    # the dirge: the standard still flies
        if i < 8:
            return 1.0                # the last charge
        return 1.0 - (i - 8) * 0.16   # the silence after

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the earth itself: deep root drones
        bass.bass(b, root - 24, 4.4, vel=v * 0.50, cutoff=200)
        # tattered strings carry the flag's shadow
        for m in ch:
            strings.strings(b, m + 12, 4.2, vel=v * 0.40)
        # the mourning host joins late
        if i >= 2:
            for m in ch:
                choir.choir(b, m + 12, 3.8, vel=v * 0.40)
        # funeral march under the charge
        if i < 4:
            drums.snare(b, vel=v * 0.45)
            drums.snare(b + 2, vel=v * 0.45)
        elif i < 8:
            for beat in range(4):
                drums.taiko(b + beat, vel=v * 0.58)
            drums.snare(b + 1, vel=v * 0.50)
            drums.snare(b + 3, vel=v * 0.50)
            if i == 4:
                drums.crash(b, vel=0.70)
        else:
            drums.taiko(b, vel=v * 0.55)
            drums.snare(b + 2, vel=v * 0.40)
        # brass fanfares: proud, then ragged, then gone
        if i < 4:
            if i in (0, 2):
                for m in ch:
                    brass.brass(b, m + 12, 3.5, vel=v * 0.40)
        elif i < 8:
            for m in ch:
                brass.brass(b, m + 12, 1.0, vel=v * 0.55)
                brass.brass(b + 2, m + 12, 1.0, vel=v * 0.46)
        else:
            for m in ch:
                brass.brass(b + 2, m + 12, 1.8, vel=v * 0.38)

    # the captain's horn: one last address to the line
    horn = [
        (0, "F4", 2), (2, "Ab4", 2),
        (4, "Bb4", 4),
        (8, "C5", 4),
        (12, "Db5", 6),
        (20, "C5", 2), (22, "Bb4", 2),
        (24, "Ab4", 4),
        (28, "G4", 2), (30, "Ab4", 2),
        (32, "Bb4", 6),
        (40, "Ab4", 4),
        (44, "G4", 2), (46, "F4", 2),
    ]
    for off, note, d in horn:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.50,
                   vibrato=5.5, vib_depth=6.0)

    stems = {"brass": brass, "choir": choir, "strings": strings,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-fallen-standard", stems,
            {"brass": 0.9, "choir": 0.85, "strings": 0.85,
             "bass": 0.9, "drums": 0.9}, False)


# ============================================================ DRUMS-OF-THE-DEEP
# Subterranean war drums: primal, the mountain's heartbeat.
# D minor, 132 BPM. 16 bars. Arc: stir -> frenzy -> dying echo.
# Dm Dm Bb C (roots D2 D2 Bb2 C3).
def drums_of_the_deep():
    bpm = 132
    bars = 16
    total = bars * 4
    drums = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    cavern = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [Dm, Dm, Bb, C] * 4
    roots = [n("D2"), n("D2"), n("Bb2"), n("C3")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.08    # the deep stirs
        if i < 12:
            return 1.0                # the frenzy
        return 1.0 - (i - 12) * 0.17  # the dying echo

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the cavern breathes
        cavern.cavern(b, 4.4, vel=0.55)
        # the heartbeat of the mountain
        drums.subdrum(b, 2.5, vel=v * 0.85)
        if i >= 4:
            drums.subdrum(b + 2, 2.5, vel=v * 0.75)
        # war-drum syncopation
        drums.taiko(b + 2, vel=v * 0.60)
        if i >= 2:
            drums.taiko(b + 1.5, vel=v * 0.50)
            drums.taiko(b + 3.5, vel=v * 0.50)
        # low toms rolling
        if i >= 4 and i < 12:
            drums.tom(b + 0.5, freq=95, vel=v * 0.50)
            drums.tom(b + 1.0, freq=85, vel=v * 0.50)
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.30)
            drums.snare(b + 1, vel=v * 0.45)
            drums.snare(b + 3, vel=v * 0.45)
        if i == 4:
            drums.crash(b, vel=0.65)
        # sub pulse: the war-party marches
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.36, vel=v * 0.55,
                      cutoff=300)
        # war-horn long tones over the frenzy
        if i in (4, 8):
            for m in ch:
                brass.brass(b, m, 3.5, vel=v * 0.42)
        elif i >= 4 and i < 12:
            for m in ch:
                brass.brass(b + 2, m, 1.0, vel=v * 0.40)

    # the final blow: the mountain answers
    drums.subdrum(bar(14), 4.0, vel=0.9)
    drums.crash(bar(14), vel=0.6)

    stems = {"drums": drums, "bass": bass, "brass": brass,
             "cavern": cavern}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-deep", stems,
            {"drums": 0.95, "bass": 0.9, "brass": 0.85,
             "cavern": 0.85}, False)


# ============================================================ THE-SUNLIT-MEADOW
# Peaceful pasture: idyllic, bees and birds over the grass.
# C major, 88 BPM. 12 bars. Loop.
# C G Am F.
def the_sunlit_meadow():
    bpm = 88
    bars = 12
    total = bars * 4
    pluck = Track(bpm, total)
    flute = VoiceTrack(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    meadow = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [C, G, Am, F] * 3
    roots = [n("C3"), n("G2"), n("A2"), n("F2")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # bees in the grass: bright rolling 8ths
        arp = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[2] + 24, ch[0] + 24, ch[1] + 24, ch[2] + 24]
        for k, m in enumerate(arp):
            pluck.pluck(b + k * 0.5, m, 1.0, vel=0.50)
        # wind and birds over the field
        meadow.meadow(b, 4.4, vel=0.55, seed=i)
        # warm noon pads
        pads.pad(b, [m + 12 for m in ch], 4.4, vel=0.30,
                 attack=1.2, cutoff=1800)
        # the ground beneath: gentle roots
        bass.bass(b, root - 24, 2.0, vel=0.50, cutoff=220)
        bass.bass(b + 2, root - 24, 2.0, vel=0.45, cutoff=220)

    # the shepherd's pipe: a tune for the afternoon
    pipe = [
        (0, "C5", 2), (2, "D5", 2),
        (4, "E5", 4),
        (8, "G5", 2), (10, "E5", 2),
        (12, "D5", 4),
        (16, "C5", 6),
        (24, "E5", 2), (26, "F5", 2),
        (28, "G5", 4),
        (32, "A5", 2), (34, "G5", 2),
        (36, "F5", 4),
        (40, "E5", 2), (42, "D5", 2),
        (44, "E5", 4),
    ]
    for off, note, d in pipe:
        flute.flute(off, n(note), d, vel=0.52)

    stems = {"pluck": pluck, "flute": flute, "pads": pads,
             "bass": bass, "meadow": meadow}
    for s in stems.values():
        s.trim()
    return ("the-sunlit-meadow", stems,
            {"pluck": 0.9, "flute": 0.9, "pads": 0.85,
             "bass": 0.9, "meadow": 0.85}, True)


# ============================================================ SHADOWS-OVER-KINGS-LANDING
# Urban intrigue: dark streets, a deal going wrong in the alley.
# A minor, 96 BPM. 12 bars. Loop.
# Am F Dm E.
def shadows_over_kings_landing():
    bpm = 96
    bars = 12
    total = bars * 4
    pizz = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [Am, F, Dm, E] * 3
    roots = [n("A2"), n("F2"), n("D3"), n("E3")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # footsteps behind you: tense off-beat pizz
        cyc = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 24]
        for k, m in enumerate(cyc):
            pizz.pizz(b + k * 1.0 + 0.5, m, vel=0.50)
        # the city's low pulse
        bass.bass(b, root - 24, 2.0, vel=0.55, cutoff=300)
        bass.bass(b + 2, root - 24 + 7, 2.0, vel=0.50, cutoff=300)
        # watchman's brass: short, suspicious
        for m in ch:
            brass.brass(b + 1, m + 12, 0.6, vel=0.38)
            brass.brass(b + 3, m + 12, 0.6, vel=0.34)
        # the night watch marches past
        drums.snare(b + 1, vel=0.42)
        drums.snare(b + 3, vel=0.42)
        drums.tom(b + 2.5, freq=100, vel=0.40)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.28)

    # a lone informant whistles from the shadows
    whistle = [
        (8, "A4", 2), (10, "C5", 2),
        (24, "E5", 2), (26, "D5", 2),
        (40, "B4", 2), (42, "A4", 2),
    ]
    for off, note, d in whistle:
        lead.lead(off, n(note), d, vel=0.48, vibrato=6.0, vib_depth=5.0)

    stems = {"pizz": pizz, "bass": bass, "brass": brass,
             "drums": drums, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("shadows-over-kings-landing", stems,
            {"pizz": 0.9, "bass": 0.9, "brass": 0.85,
             "drums": 0.9, "lead": 0.9}, True)


# ============================================================ THE-ICE-QUEENS-COURT
# Frozen palace: elegant cold, jewels of ice in candlelight.
# E major, 84 BPM. 12 bars. Loop.
# E C#m A B.
def the_ice_queens_court():
    bpm = 84
    bars = 12
    total = bars * 4
    glass = VoiceTrack(bpm, total)
    celesta = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    E = [n("E3"), n("G#3"), n("B3")]
    Csm = [n("C#3"), n("E3"), n("G#3")]
    A = [n("A2"), n("C#3"), n("E3")]
    B = [n("B2"), n("D#3"), n("F#3")]
    prog = [E, Csm, A, B] * 3
    roots = [n("E3"), n("C#3"), n("A2"), n("B2")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # ice chandeliers: sparse high bells
        glass.glass(b + 2, ch[2] + 48, 4.0, vel=0.18)
        if i % 2 == 1:
            glass.glass(b, ch[0] + 48, 4.0, vel=0.14)
        # the queen's clockwork: flowing celesta arpeggios
        arp = [ch[0] + 36, ch[1] + 36, ch[2] + 36, ch[1] + 36,
               ch[2] + 36, ch[0] + 36, ch[1] + 36, ch[2] + 36]
        for k, m in enumerate(arp):
            celesta.celesta(b + k * 0.5, m, 1.0, vel=0.45)
        # the court's slow dance: legato strings
        for m in ch:
            strings.strings(b, m + 24, 4.4, vel=0.36)
        # cold breath of the palace choir
        if i >= 4:
            for m in ch:
                choir.choir(b, m + 12, 4.2, vel=0.30)
        # frozen foundations
        bass.bass(b, root - 24, 4.4, vel=0.45, cutoff=180)

    stems = {"glass": glass, "celesta": celesta, "strings": strings,
             "choir": choir, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-ice-queens-court", stems,
            {"glass": 0.85, "celesta": 0.9, "strings": 0.9,
             "choir": 0.85, "bass": 0.9}, True)


# ============================================================ LAST-STAND-AT-DAWN
# Desperate defense: heroic tragedy, the line holds until sunrise.
# G minor, 116 BPM. 14 bars. Arc: muster -> the stand -> dawn breaks.
# Gm Eb Bb F, coda on Gm.
def last_stand_at_dawn():
    bpm = 116
    bars = 14
    total = bars * 4
    brass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F3"), n("A3"), n("C4")]
    prog = [Gm, Eb, Bb, F] * 3 + [Gm, Gm]
    roots = [n("G2"), n("Eb3"), n("Bb2"), n("F3")] * 3 + [n("G2"), n("G2")]

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10    # the muster: shields up
        if i < 10:
            return 1.0                # the stand
        return 1.0 - (i - 10) * 0.18   # dawn breaks over the field

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the shield-wall's feet: quarter pulses
        for k in range(4):
            bass.bass(b + k, root - 12, 0.9, vel=v * 0.60, cutoff=500)
        # driving string ostinato: arrows in the air
        ost = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[2] + 24]
        for k, m in enumerate(ost):
            strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.42)
        # the doomed host sings
        if i >= 2:
            for m in ch:
                choir.choir(b, m + 12, 3.8, vel=v * 0.44)
        # war drums of the defense
        for beat in range(4):
            drums.taiko(b + beat, vel=v * 0.58)
        drums.snare(b + 1, vel=v * 0.50)
        drums.snare(b + 3, vel=v * 0.50)
        if i == 4:
            drums.crash(b, vel=0.72)
        # brass fanfares over the line
        if i < 4:
            for m in ch:
                brass.brass(b, m + 12, 3.5, vel=v * 0.40)
        elif i < 10:
            for m in ch:
                brass.brass(b, m + 12, 1.0, vel=v * 0.55)
                brass.brass(b + 2, m + 12, 1.0, vel=v * 0.46)
        else:
            for m in ch:
                brass.brass(b + 2, m + 12, 1.8, vel=v * 0.40)

    # the hero's theme: hold the line
    theme = [
        (0, "G4", 4),
        (4, "Bb4", 4),
        (8, "D5", 6),
        (16, "G4", 2), (18, "Bb4", 2),
        (20, "D5", 4),
        (24, "C5", 2), (26, "Bb4", 2),
        (28, "A4", 4),
        (32, "G4", 4),
        (36, "A4", 4),
        (40, "Bb4", 4),
        (44, "D5", 6),
        (52, "G4", 4),
    ]
    for off, note, d in theme:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.55,
                   vibrato=5.5, vib_depth=6.0)

    # the last arrow falls as the sun rises
    drums.crash(bar(13) + 2, vel=0.55)

    stems = {"brass": brass, "choir": choir, "strings": strings,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("last-stand-at-dawn", stems,
            {"brass": 0.9, "choir": 0.85, "strings": 0.9,
             "bass": 0.9, "drums": 0.95}, False)


# ============================================================ render
def mix_track23(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (the_fallen_standard, 0.22),
    (drums_of_the_deep, 0.24),
    (the_sunlit_meadow, 0.16),
    (shadows_over_kings_landing, 0.18),
    (the_ice_queens_court, 0.20),
    (last_stand_at_dawn, 0.22),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track23(name, stems, gains, reverb_wet=wet,
                                    loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
