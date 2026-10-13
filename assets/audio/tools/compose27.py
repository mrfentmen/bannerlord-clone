"""Twenty-seventh batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-26 moods already covered - do not duplicate):
  the-crimson-tide, drums-of-the-south, the-velvet-glove,
  fog-over-the-moors, the-ivory-tower, thunder-of-the-gods.
Render: python3 compose27.py -> wav stems + mixes in out/
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

OUT = "/home/hatch/workspace/staging/music27/out"
MP3 = "/home/hatch/workspace/staging/music27/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(2727)


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


def harpsichord_note(midi, dur, vel=1.0):
    """Courtly harpsichord: bright double-pluck snap, quick decay."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (np.sin(2 * np.pi * f * t)
         + 0.5 * np.sin(2 * np.pi * 2 * f * t)
         + 0.25 * np.sin(2 * np.pi * 3 * f * t)
         + 0.12 * np.sin(2 * np.pi * 4 * f * t))
    x *= np.exp(-t * 3.2)
    snap = highpass(noise(n_), 3000) * np.exp(-t * 120) * 0.35
    return (x + snap) * vel * 0.45


# ---------------------------------------------------------------- new batch-27 instruments
def war_horn_note(midi, dur, vel=1.0):
    """Deep curved war horn: growling low brass, slow dreadful swell."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    growl = 1.0 + 0.25 * np.sin(2 * np.pi * 7.0 * t) * np.minimum(t / 0.3, 1.0)
    x = (_sig.sawtooth(2 * np.pi * f * t) * 0.55 * growl
         + np.sin(2 * np.pi * f * 0.5 * t) * 0.45
         + _sig.sawtooth(2 * np.pi * f * 2 * t) * 0.18)
    x = lowpass(x, 1400)
    env = adsr(n_, 0.6, 0.5, 0.85, min(1.4, dur * 0.3))
    return x * env * vel * 0.5


def thunder_crack(dur=3.0, vel=1.0, seed=0):
    """A divine thunderclap: sharp crack, then the long rolling rumble."""
    rng = np.random.default_rng(27000 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    crack = highpass(rng.standard_normal(n_), 900) * np.exp(-t * 26) * 0.9
    rumble = lowpass(rng.standard_normal(n_), 140) * np.exp(-t * 1.6) * 1.2
    # a second, deeper roll arriving late
    late = lowpass(rng.standard_normal(n_), 90) * np.exp(-np.maximum(t - 0.8, 0) * 1.1) * 0.7
    return (crack + rumble + late) * vel * 0.5


def mist_bed(dur, vel=1.0, seed=0):
    """Cold moorland fog: grey noise drifting in slow, uneasy swells."""
    rng = np.random.default_rng(2700 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    w = lowpass(rng.standard_normal(n_), 700)
    w = highpass(w, 180)  # cold, no warmth
    ph = rng.uniform(0, 6.28)
    swell = 0.45 + 0.55 * np.sin(2 * np.pi * 0.07 * t + ph)
    swell *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.023 * t + ph * 2)
    return w * swell * vel * 0.45


def lyre_note(midi, dur, vel=1.0):
    """Ancient lyre: bright gut-string pluck with shimmering harmonics."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (np.sin(2 * np.pi * f * t)
         + 0.42 * np.sin(2 * np.pi * 2 * f * t)
         + 0.24 * np.sin(2 * np.pi * 3 * f * t)
         + 0.12 * np.sin(2 * np.pi * 4.02 * f * t)
         + 0.06 * np.sin(2 * np.pi * 5.9 * f * t))
    x *= np.exp(-t * 2.6)
    snap = highpass(noise(n_), 4200) * np.exp(-t * 140) * 0.25
    return (x + snap) * vel * 0.42


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

    def celesta(self, b, midi, dur_beats=1, **kw):
        self._place(celesta_note(midi, self._b2s(dur_beats), **kw), b)

    def harpsi(self, b, midi, dur_beats=1, **kw):
        self._place(harpsichord_note(midi, self._b2s(dur_beats), **kw), b)

    def warhorn(self, b, midi, dur_beats=4, **kw):
        self._place(war_horn_note(midi, self._b2s(dur_beats), **kw), b)

    def lyre(self, b, midi, dur_beats=2, **kw):
        self._place(lyre_note(midi, self._b2s(dur_beats), **kw), b)

    def mist(self, b, dur_beats=4, **kw):
        seed = kw.pop("seed", 0)
        self._place(mist_bed(self._b2s(dur_beats), seed=seed, **kw), b)

    def thunder(self, b, dur_beats=6, seed=0, **kw):
        self._place(thunder_crack(self._b2s(dur_beats), seed=seed, **kw), b)


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
# War, blood, sacrifice: the field drinks deep.
# E minor, 120 BPM. 16 bars. Arc: muster -> the charge -> the fallen.
# Em C G D.
def the_crimson_tide():
    bpm = 120
    bars = 16
    total = bars * 4
    brass = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, C, G, D] * 4
    roots = [n("E2"), n("C2"), n("G2"), n("D2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.07    # the muster
        if i < 12:
            return 1.0                # the charge
        return 1.0 - (i - 12) * 0.14  # the fallen

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the heartbeat of war: pounding 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.58,
                      cutoff=430)
        # the war drums speak
        drums.kick(b, vel=v * 0.62)
        drums.snare(b + 1, vel=v * 0.48)
        drums.kick(b + 2, vel=v * 0.62)
        drums.snare(b + 3, vel=v * 0.48)
        drums.taiko(b + 0.5, vel=v * 0.50)
        drums.taiko(b + 2.5, vel=v * 0.50)
        if i >= 4 and i < 12:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.28)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the war horns: dark, growling
        if i >= 2 and i < 12:
            brass.warhorn(b, ch[0] - 12, 3.0, vel=v * 0.42)
            if i % 2 == 0:
                brass.warhorn(b + 2, ch[2] - 12, 2.0, vel=v * 0.38)
        # the host sings going in
        if i >= 4 and i < 12:
            for m in ch:
                choir.choir(b, m - 12, 3.6, vel=v * 0.38)
        # the strings drive the charge
        if i >= 4 and i < 12:
            ost = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 24,
                   ch[2] + 24, ch[0] + 24, ch[1] + 24, ch[2] + 24]
            for k, m in enumerate(ost):
                strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.38)
        # the lament of the fallen
        if i >= 12:
            for m in ch:
                strings.strings(b, m + 12, 4.4, vel=v * 0.36)
                choir.choir(b, m - 12, 4.2, vel=v * 0.30)

    # the red standard: a theme that will not retreat
    theme = [
        (16, "E4", 2), (18, "G4", 2),
        (20, "A4", 4),
        (24, "B4", 2), (26, "A4", 2),
        (28, "G4", 4),
        (32, "A4", 2), (34, "B4", 2),
        (36, "C5", 4),
        (40, "B4", 4),
        (44, "A4", 2), (46, "G4", 2),
        (48, "F#4", 4),
        (52, "G4", 2), (54, "A4", 2),
        (56, "B4", 4),
    ]
    for off, note, d in theme:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.52,
                   vibrato=5.5, vib_depth=7.0)

    stems = {"brass": brass, "drums": drums, "choir": choir,
             "bass": bass, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("the-crimson-tide", stems,
            {"brass": 0.92, "drums": 0.95, "choir": 0.85,
             "bass": 0.9, "strings": 0.85}, False)


# ============================================================ DRUMS-OF-THE-SOUTH
# Tribal war drums: fierce, primal, unstoppable.
# A minor, 136 BPM. 16 bars. Arc: drums wake -> frenzy -> dying echo.
# Am F G Em.
def drums_of_the_south():
    bpm = 136
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    G = [n("G2"), n("B2"), n("D3")]
    Em = [n("E2"), n("G2"), n("B2")]
    prog = [Am, F, G, Em] * 4
    roots = [n("A2"), n("F2"), n("G2"), n("E2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10    # the drums wake
        if i < 12:
            return 1.0                # frenzy
        return 1.0 - (i - 12) * 0.15  # the dying echo

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the war council: deep talking drums
        drums.taiko(b, vel=v * 0.62)
        drums.taiko(b + 0.75, vel=v * 0.55)
        drums.taiko(b + 1.5, vel=v * 0.62)
        drums.taiko(b + 2.25, vel=v * 0.55)
        drums.taiko(b + 3, vel=v * 0.58)
        drums.kick(b + 1, vel=v * 0.55)
        drums.kick(b + 3, vel=v * 0.55)
        drums.tom(b + 0.5, freq=120, vel=v * 0.50)
        drums.tom(b + 2.5, freq=100, vel=v * 0.50)
        if i >= 4 and i < 12:
            drums.snare(b + 0.25, vel=v * 0.44)
            drums.snare(b + 1.25, vel=v * 0.44)
            drums.snare(b + 2.25, vel=v * 0.44)
            drums.snare(b + 3.25, vel=v * 0.44)
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.30)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the earth shakes: low root pounding
        for k in range(8):
            bass.bass(b + k * 0.5, root - 24, 0.4, vel=v * 0.56,
                      cutoff=380)
        # the war cry: brass stabs
        if i >= 4 and i < 12:
            brass.brass(b + 0.5, ch[0], 0.8, vel=v * 0.46)
            brass.brass(b + 2.5, ch[2], 0.8, vel=v * 0.46)
        # the tribe chants
        if i >= 4:
            for m in ch:
                choir.choir(b, m - 12, 3.4, vel=v * 0.36)
        # the dancers stamp: driving strings
        if i >= 4 and i < 12:
            ost = [ch[0] + 12, ch[0] + 12, ch[2] + 12, ch[1] + 12,
                   ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 12]
            for k, m in enumerate(ost):
                strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.40)

    # the chief's call: no one stands still
    call = [
        (16, "A3", 2), (18, "C4", 2),
        (20, "E4", 4),
        (24, "D4", 2), (26, "C4", 2),
        (28, "B3", 4),
        (32, "C4", 2), (34, "D4", 2),
        (36, "E4", 4),
        (40, "G4", 4),
        (44, "E4", 2), (46, "D4", 2),
        (48, "C4", 4),
        (52, "B3", 2), (54, "A3", 2),
        (56, "G3", 4),
    ]
    for off, note, d in call:
        v = arc_vel(int(off // 4))
        strings.strings(off, n(note) + 12, d, vel=v * 0.50)

    stems = {"drums": drums, "bass": bass, "brass": brass,
             "choir": choir, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-south", stems,
            {"drums": 0.95, "bass": 0.9, "brass": 0.88,
             "choir": 0.85, "strings": 0.85}, False)


# ============================================================ THE-VELVET-GLOVE
# Court intrigue: soft power, sweeter poison.
# F major, 88 BPM. 12 bars. Loop.
# F Dm Bb C.
def the_velvet_glove():
    bpm = 88
    bars = 12
    total = bars * 4
    harpsi = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    celesta = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [F, Dm, Bb, C] * 3
    roots = [n("F2"), n("D3"), n("Bb2"), n("C3")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # silk and daggers: delicate 16th arpeggios
        arp = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[2] + 24,
               ch[0] + 36, ch[2] + 24, ch[1] + 24, ch[0] + 24,
               ch[2] + 24, ch[1] + 24, ch[0] + 24, ch[2] + 24,
               ch[1] + 24, ch[2] + 24, ch[0] + 24, ch[1] + 24]
        for k, m in enumerate(arp):
            harpsi.harpsi(b + k * 0.25, m, 0.8, vel=0.40)
        # the court smiles: warm string pads
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.30)
        # the patient spider: unhurried bass
        bass.bass(b, root - 24, 2.0, vel=0.48, cutoff=190)
        bass.bass(b + 2, ch[2] - 24, 2.0, vel=0.42, cutoff=190)
        # a glint in the dark: celesta
        celesta.celesta(b + 1, ch[0] + 36, 1.6, vel=0.16)
        if i % 2 == 0:
            celesta.celesta(b + 3, ch[2] + 36, 1.6, vel=0.14)

    # the whispered promise: a melody that never quite lands
    whisper = [
        (0, "A4", 2), (2, "G4", 2),
        (4, "F4", 4),
        (8, "G4", 2), (10, "A4", 2),
        (12, "Bb4", 4),
        (16, "A4", 6),
        (24, "G4", 2), (26, "F4", 2),
        (28, "E4", 4),
        (32, "F4", 4),
        (36, "A4", 2), (38, "Bb4", 2),
        (40, "C5", 4),
        (44, "Bb4", 4),
    ]
    for off, note, d in whisper:
        flute.flute(off, n(note), d, vel=0.46)

    stems = {"harpsi": harpsi, "flute": flute, "strings": strings,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("the-velvet-glove", stems,
            {"harpsi": 0.9, "flute": 0.92, "strings": 0.88,
             "bass": 0.9, "celesta": 0.8}, True)


# ============================================================ FOG-OVER-THE-MOORS
# Mystery: something walks the grey, and it is patient.
# B minor, 72 BPM. 12 bars. Loop.
# Bm G D A.
def fog_over_the_moors():
    bpm = 72
    bars = 12
    total = bars * 4
    mist = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Bm = [n("B2"), n("D3"), n("F#3")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D3"), n("F#3"), n("A3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Bm, G, D, A] * 3
    roots = [n("B2"), n("G2"), n("D3"), n("A2")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the grey: fog that never lifts
        mist.mist(b, 4, vel=0.55, seed=i)
        # the standing stones: sparse, cold pads
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.30)
        # the peat: deep, slow roots
        bass.bass(b, root - 24, 4.4, vel=0.46, cutoff=170)
        # the old voices: distant, wordless
        if i % 3 == 1:
            for m in ch:
                choir.choir(b, m - 24, 3.6, vel=0.26)

    # the wanderer: a lone pipe in the fog
    wander = [
        (0, "F#4", 4),
        (4, "E4", 2), (6, "D4", 2),
        (8, "B3", 4),
        (12, "D4", 6),
        (20, "C#4", 4),
        (24, "B3", 2), (26, "A3", 2),
        (28, "G3", 4),
        (32, "A3", 4),
        (36, "B3", 2), (38, "C#4", 2),
        (40, "D4", 4),
        (44, "E4", 4),
    ]
    for off, note, d in wander:
        flute.flute(off, n(note), d, vel=0.44)

    stems = {"mist": mist, "strings": strings, "flute": flute,
             "bass": bass, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("fog-over-the-moors", stems,
            {"mist": 0.85, "strings": 0.88, "flute": 0.92,
             "bass": 0.9, "choir": 0.8}, True)


# ============================================================ THE-IVORY-TOWER
# Scholars: wisdom kept behind high white walls.
# G major, 84 BPM. 12 bars. Loop.
# G Em C D.
def the_ivory_tower():
    bpm = 84
    bars = 12
    total = bars * 4
    lyre = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    celesta = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, Em, C, D] * 3
    roots = [n("G2"), n("E2"), n("C3"), n("D3")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the scribes: bright lyre figures
        fig = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[2] + 24, ch[0] + 36, ch[1] + 24, ch[2] + 24]
        for k, m in enumerate(fig):
            lyre.lyre(b + k * 0.5, m, dur_beats=2.0, vel=0.42)
        # the white walls: calm string pads
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.30)
        # the old master: measured steps
        bass.bass(b, root - 24, 1.5, vel=0.48, cutoff=200)
        bass.bass(b + 1.5, ch[1] - 24, 1.5, vel=0.42, cutoff=200)
        bass.bass(b + 3, ch[2] - 24, 1.0, vel=0.40, cutoff=200)
        # starlight on marble: celesta
        celesta.celesta(b, ch[2] + 36, 1.6, vel=0.16)
        if i % 2 == 1:
            celesta.celesta(b + 2, ch[0] + 36, 1.6, vel=0.14)

    # the master's lecture: patient, clear, kind
    lecture = [
        (0, "B4", 2), (2, "D5", 2),
        (4, "G5", 4),
        (8, "F#5", 2), (10, "E5", 2),
        (12, "D5", 4),
        (16, "E5", 6),
        (24, "D5", 2), (26, "C5", 2),
        (28, "B4", 4),
        (32, "A4", 4),
        (36, "B4", 2), (38, "D5", 2),
        (40, "E5", 4),
        (44, "D5", 4),
    ]
    for off, note, d in lecture:
        flute.flute(off, n(note), d, vel=0.46)

    stems = {"lyre": lyre, "strings": strings, "flute": flute,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("the-ivory-tower", stems,
            {"lyre": 0.9, "strings": 0.88, "flute": 0.92,
             "bass": 0.9, "celesta": 0.8}, True)


# ============================================================ THUNDER-OF-THE-GODS
# Divine wrath: the sky itself takes the field.
# D major, 142 BPM. 16 bars. Arc: storm gathers -> divine wrath -> awe.
# D Bm G A.
def thunder_of_the_gods():
    bpm = 142
    bars = 16
    total = bars * 4
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    sky = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [D, Bm, G, A] * 4
    roots = [n("D2"), n("B2"), n("G2"), n("A2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.08    # the storm gathers
        if i < 12:
            return 1.0                # divine wrath
        return 1.0 - (i - 12) * 0.14  # awe

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the heavens split: thunder over every phrase
        if i % 2 == 0:
            sky.thunder(b, 6, seed=i, vel=v * 0.60)
        # the gods march: crushing drums
        drums.kick(b, vel=v * 0.62)
        drums.snare(b + 1, vel=v * 0.50)
        drums.kick(b + 2, vel=v * 0.62)
        drums.snare(b + 3, vel=v * 0.50)
        drums.taiko(b + 0.5, vel=v * 0.52)
        drums.taiko(b + 2.5, vel=v * 0.52)
        if i >= 4 and i < 12:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.28)
        if i == 4:
            drums.crash(b, vel=0.72)
        # the firmament: deep rolling 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.58,
                      cutoff=520)
        # the fanfare of heaven: blazing brass
        if i >= 2:
            brass.brass(b, ch[0], 2.0, vel=v * 0.46)
            brass.brass(b + 2, ch[2], 2.0, vel=v * 0.42)
        # the choir of the spheres
        if i >= 4:
            for m in ch:
                choir.choir(b, m - 12, 3.6, vel=v * 0.40)
        # lightning runs: ascending string scales
        if i >= 4 and i < 12:
            run = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[0] + 36,
                   ch[1] + 36, ch[2] + 36, ch[1] + 24, ch[0] + 24]
            for k, m in enumerate(run):
                strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.40)
        else:
            for m in ch:
                strings.strings(b, m + 12, 4.4, vel=v * 0.34)

    # the judgement: no appeal, no mercy, no end
    judgement = [
        (16, "D4", 2), (18, "F#4", 2),
        (20, "A4", 4),
        (24, "B4", 4),
        (28, "A4", 2), (30, "G4", 2),
        (32, "F#4", 4),
        (36, "G4", 2), (38, "A4", 2),
        (40, "B4", 4),
        (44, "A4", 4),
        (48, "D5", 4),
        (52, "C#5", 2), (54, "B4", 2),
        (56, "A4", 4),
    ]
    for off, note, d in judgement:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.56,
                   vibrato=5.5, vib_depth=6.0)

    stems = {"brass": brass, "drums": drums, "choir": choir,
             "strings": strings, "bass": bass, "sky": sky}
    for s in stems.values():
        s.trim()
    return ("thunder-of-the-gods", stems,
            {"brass": 0.92, "drums": 0.95, "choir": 0.88,
             "strings": 0.85, "bass": 0.9, "sky": 0.85}, False)


# ============================================================ render
def mix_track27(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (the_crimson_tide, 0.22),
    (drums_of_the_south, 0.24),
    (the_velvet_glove, 0.16),
    (fog_over_the_moors, 0.18),
    (the_ivory_tower, 0.16),
    (thunder_of_the_gods, 0.24),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track27(name, stems, gains, reverb_wet=wet,
                                    loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
