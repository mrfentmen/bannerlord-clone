"""Twenty-sixth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-25 moods already covered - do not duplicate):
  the-last-harvest, drums-of-the-empire, the-silver-tongue,
  storm-over-the-reach, the-weeping-willow, wings-of-victory.
Render: python3 compose26.py -> wav stems + mixes in out/
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

OUT = "/home/hatch/workspace/staging/music26/out"
MP3 = "/home/hatch/workspace/staging/music26/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(2026)


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


# ---------------------------------------------------------------- new batch-26 instruments
def organ_note(midi, dur, vel=1.0):
    """Pipe organ: full harmonic chorus, slow solemn attack."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = np.zeros(n_)
    for h, a in ((1, 0.55), (2, 0.30), (3, 0.18), (4, 0.12), (5, 0.07),
                 (6, 0.05)):
        x += a * np.sin(2 * np.pi * f * h * t)
    x *= 1.0 + 0.04 * np.sin(2 * np.pi * 0.5 * t)  # bellows breath
    x = lowpass(x, 4200)
    env = adsr(n_, 0.5, 0.4, 0.9, min(1.5, dur * 0.3))
    return x * env * vel * 0.4


def bell_toll(midi, dur, vel=1.0):
    """Deep tolling bell: inharmonic partials, long grave decay."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (0.70 * np.sin(2 * np.pi * f * t)
         + 0.35 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t * 1.2)
         + 0.22 * np.sin(2 * np.pi * f * 2.74 * t) * np.exp(-t * 1.8)
         + 0.12 * np.sin(2 * np.pi * f * 3.76 * t) * np.exp(-t * 2.4)
         + 0.08 * np.sin(2 * np.pi * f * 5.40 * t) * np.exp(-t * 3.0))
    x *= np.exp(-t * 0.9)
    strike = highpass(noise(n_), 2500) * np.exp(-t * 80) * 0.25
    return (x + strike) * vel * 0.5


def wolf_howl(dur=2.5, f0=520.0, vel=1.0, seed=0):
    """A lone wolf: FM howl rising, holding, falling into the night."""
    rng = np.random.default_rng(9000 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f0j = f0 * rng.uniform(0.94, 1.06)
    u = t / dur
    f = f0j * (0.72 + 0.38 * np.sin(np.pi * np.minimum(u * 1.15, 1.0)))
    mod = 14.0 * np.sin(2 * np.pi * 6.2 * t)
    inst = np.cumsum(2 * np.pi * (f + mod) / SR)
    x = 0.60 * np.sin(inst) + 0.25 * np.sin(2 * inst) + 0.10 * np.sin(3 * inst)
    env = (np.minimum(t / 0.5, 1.0)
           * np.exp(-np.maximum(t - dur + 0.9, 0.0) * 2.2))
    x = lowpass(x, 2600)
    return x * env * vel * 0.5


def sea_bed(dur, vel=1.0, seed=0):
    """Dark ocean: slow wave swells over a deep water rumble."""
    rng = np.random.default_rng(4100 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    w = lowpass(noise(n_), 420)
    ph = rng.uniform(0, 6.28)
    swell = 0.45 + 0.55 * np.sin(2 * np.pi * 0.09 * t + ph)
    swell *= 0.7 + 0.3 * np.sin(2 * np.pi * 0.031 * t)
    deep = lowpass(noise(n_), 90) * 0.5
    return (w * swell * 0.5 + deep * 0.6) * vel * 0.5


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

    def organ(self, b, midi, dur_beats, **kw):
        self._place(organ_note(midi, self._b2s(dur_beats), **kw), b)

    def bells(self, b, midi, dur_beats=6, **kw):
        self._place(bell_toll(midi, self._b2s(dur_beats), **kw), b)

    def howl(self, b, dur_beats=4, f0=520.0, seed=0, **kw):
        self._place(wolf_howl(self._b2s(dur_beats), f0=f0, seed=seed, **kw),
                    b)

    def sea(self, b, dur_beats=4, **kw):
        seed = kw.pop("seed", 0)
        self._place(sea_bed(self._b2s(dur_beats), seed=seed, **kw), b)

    def harpsi(self, b, midi, dur_beats=1, **kw):
        self._place(harpsichord_note(midi, self._b2s(dur_beats), **kw), b)


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


# ============================================================ THE-LAST-HARVEST
# Autumn: the final gathering before the hard frost.
# G minor, 76 BPM. 12 bars. Arc: gather -> the hard frost -> quiet barn.
# Gm Eb Bb F.
def the_last_harvest():
    bpm = 76
    bars = 12
    total = bars * 4
    flute = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)
    choir = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb2"), n("G2"), n("Bb2")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Gm, Eb, Bb, F] * 3
    roots = [n("G2"), n("Eb2"), n("Bb2"), n("F2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.07    # the gathering
        if i < 8:
            return 1.0                # the hard frost
        return 1.0 - (i - 8) * 0.16   # the quiet barn

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # golden fields: low string pads
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.36)
        # the wagon rolls: steady soft bass
        for k in range(8):
            bass.bass(b + k * 0.5, root - 24, 0.4, vel=v * 0.50,
                      cutoff=220)
        # the first frost bites: drums enter hard
        if i < 4:
            drums.tom(b + 2, freq=100, vel=v * 0.40)
        elif i < 8:
            drums.taiko(b, vel=v * 0.58)
            drums.taiko(b + 2, vel=v * 0.52)
            drums.snare(b + 1, vel=v * 0.44)
            drums.snare(b + 3, vel=v * 0.44)
            if i == 4:
                drums.crash(b, vel=0.60)
        else:
            drums.tom(b + 1.5, freq=88, vel=v * 0.34)
        # the village sings the harvest home
        if i >= 4 and i < 8:
            for m in ch:
                choir.choir(b, m - 12, 3.8, vel=v * 0.36)

    # the reaper's song: an old tune, nearly forgotten
    song = [
        (0, "G4", 2), (2, "Bb4", 2),
        (4, "A4", 4),
        (8, "G4", 2), (10, "F4", 2),
        (12, "Eb4", 4),
        (16, "D4", 6),
        (24, "Eb4", 2), (26, "F4", 2),
        (28, "G4", 4),
        (32, "Bb4", 2), (34, "A4", 2),
        (36, "G4", 4),
        (40, "F4", 2), (42, "Eb4", 2),
        (44, "D4", 6),
    ]
    for off, note, d in song:
        v = arc_vel(int(off // 4))
        flute.flute(off, n(note), d, vel=v * 0.50)

    stems = {"flute": flute, "strings": strings, "bass": bass,
             "drums": drums, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("the-last-harvest", stems,
            {"flute": 0.92, "strings": 0.88, "bass": 0.9,
             "drums": 0.9, "choir": 0.85}, False)


# ============================================================ DRUMS-OF-THE-EMPIRE
# The imperial war machine: iron columns, endless, relentless.
# C minor, 132 BPM. 16 bars. Arc: the march -> the charge -> dust settles.
# Cm Ab Bb G.
def drums_of_the_empire():
    bpm = 132
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Cm, Ab, Bb, G] * 4
    roots = [n("C2"), n("Ab2"), n("Bb2"), n("G2")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10    # the march begins
        if i < 12:
            return 1.0                # the legion charges
        return 1.0 - (i - 12) * 0.15  # the dust settles

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the war machine: relentless, unchanging
        drums.kick(b, vel=v * 0.62)
        drums.kick(b + 1, vel=v * 0.56)
        drums.kick(b + 2, vel=v * 0.62)
        drums.kick(b + 3, vel=v * 0.56)
        drums.snare(b + 0.5, vel=v * 0.46)
        drums.snare(b + 2.5, vel=v * 0.46)
        drums.taiko(b + 1.5, vel=v * 0.52)
        drums.taiko(b + 3.5, vel=v * 0.52)
        if i >= 4 and i < 12:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.30)
            drums.tom(b + 0.75, freq=105, vel=v * 0.50)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the iron tread: pounding 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.56,
                      cutoff=480)
        # the imperial horns: dark fifths
        if i in (4, 8):
            for m in ch:
                brass.brass(b, m, 3.5, vel=v * 0.44)
        elif i >= 4 and i < 12:
            brass.brass(b, ch[0], 1.0, vel=v * 0.48)
            brass.brass(b + 2, ch[2], 1.0, vel=v * 0.44)
        # the legion sings as one
        if i >= 4:
            for m in ch:
                choir.choir(b, m - 12, 3.6, vel=v * 0.38)
        # the cataphracts roll: driving strings
        if i >= 4 and i < 12:
            ost = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 24,
                   ch[2] + 24, ch[0] + 24, ch[1] + 24, ch[2] + 24]
            for k, m in enumerate(ost):
                strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.38)

    # the emperor's standard: a call no man can refuse
    call = [
        (16, "C4", 2), (18, "Eb4", 2),
        (20, "G4", 4),
        (24, "Ab4", 4),
        (28, "G4", 2), (30, "Eb4", 2),
        (32, "D4", 4),
        (36, "Eb4", 4),
        (40, "F4", 2), (42, "G4", 2),
        (44, "Ab4", 4),
        (48, "G4", 4),
        (52, "Eb4", 2), (54, "D4", 2),
        (56, "C4", 4),
    ]
    for off, note, d in call:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.52,
                   vibrato=6.0, vib_depth=8.0)

    stems = {"drums": drums, "bass": bass, "brass": brass,
             "choir": choir, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-empire", stems,
            {"drums": 0.95, "bass": 0.9, "brass": 0.88,
             "choir": 0.85, "strings": 0.85}, False)


# ============================================================ THE-SILVER-TONGUE
# The diplomat: smooth words, sweeter poison.
# Bb major, 94 BPM. 12 bars. Loop.
# Bb Gm Eb F.
def the_silver_tongue():
    bpm = 94
    bars = 12
    total = bars * 4
    harpsi = VoiceTrack(bpm, total)
    flute = VoiceTrack(bpm, total)
    strings = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    celesta = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb2"), n("G2"), n("Bb2")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Bb, Gm, Eb, F] * 3
    roots = [n("Bb2"), n("G2"), n("Eb2"), n("F2")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # silver coins: sparkling 16th arpeggios
        arp = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[2] + 24, ch[0] + 36, ch[2] + 24, ch[1] + 24,
               ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[2] + 24,
               ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24]
        for k, m in enumerate(arp):
            harpsi.harpsi(b + k * 0.25, m, 0.8, vel=0.42)
        # the velvet lie: warm string pads
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.32)
        # the patient negotiator: unhurried bass
        bass.bass(b, root - 24, 2.0, vel=0.50, cutoff=200)
        bass.bass(b + 2, root - 24, 2.0, vel=0.44, cutoff=200)
        # a glint of steel: bright celesta
        celesta.celesta(b, ch[2] + 36, 1.6, vel=0.18)
        if i % 2 == 1:
            celesta.celesta(b + 2, ch[0] + 36, 1.6, vel=0.15)

    # the envoy's smile: a melody that never quite lands
    smile = [
        (0, "D5", 2), (2, "C5", 2),
        (4, "Bb4", 4),
        (8, "C5", 2), (10, "D5", 2),
        (12, "Eb5", 4),
        (16, "D5", 6),
        (24, "C5", 2), (26, "Bb4", 2),
        (28, "A4", 4),
        (32, "Bb4", 4),
        (36, "D5", 2), (38, "Eb5", 2),
        (40, "F5", 4),
        (44, "Eb5", 4),
    ]
    for off, note, d in smile:
        flute.flute(off, n(note), d, vel=0.48)

    stems = {"harpsi": harpsi, "flute": flute, "strings": strings,
             "bass": bass, "celesta": celesta}
    for s in stems.values():
        s.trim()
    return ("the-silver-tongue", stems,
            {"harpsi": 0.9, "flute": 0.92, "strings": 0.88,
             "bass": 0.9, "celesta": 0.8}, True)


# ============================================================ STORM-OVER-THE-REACH
# Tempest: a naval battle fought inside a hurricane.
# D minor, 112 BPM. 12 bars. Loop.
# Dm Bb Gm A.
def storm_over_the_reach():
    bpm = 112
    bars = 12
    total = bars * 4
    storm = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    strings = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Bb, Gm, A] * 3
    roots = [n("D2"), n("Bb2"), n("G2"), n("A2")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the hurricane: endless grey water
        storm.sea(b, 4, vel=0.55, seed=i)
        storm.wind(b, 4, vel=0.42)
        # the hull groans: deep pounding roots
        for k in range(4):
            bass.bass(b + k, root - 24, 0.9, vel=0.60, cutoff=260)
        # breakers crash over the deck
        drums.crash(b, vel=0.55)
        drums.tom(b + 1, freq=90, vel=0.52)
        drums.tom(b + 2.5, freq=76, vel=0.52)
        drums.kick(b + 3, vel=0.60)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.24)
        # the battle horns sound through the rain
        if i % 2 == 0:
            brass.brass(b, ch[0], 2.0, vel=0.46)
            brass.brass(b + 2, ch[2], 2.0, vel=0.42)
        # the oars drive: relentless string strokes
        ost = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[2] + 24, ch[0] + 24, ch[1] + 24, ch[2] + 24]
        for k, m in enumerate(ost):
            strings.strings(b + k * 0.5, m, 0.5, vel=0.40)

    # the admiral's defiance: a cry above the gale
    cry = [
        (0, "D5", 2), (2, "F5", 2),
        (4, "E5", 4),
        (8, "D5", 2), (10, "C5", 2),
        (12, "Bb4", 4),
        (16, "A4", 6),
        (24, "Bb4", 2), (26, "C5", 2),
        (28, "D5", 4),
        (32, "F5", 2), (34, "E5", 2),
        (36, "D5", 4),
        (40, "C5", 2), (42, "D5", 2),
        (44, "E5", 4),
    ]
    for off, note, d in cry:
        brass.lead(off, n(note), d, vel=0.52,
                   vibrato=6.0, vib_depth=7.0)

    stems = {"storm": storm, "drums": drums, "bass": bass,
             "brass": brass, "strings": strings}
    for s in stems.values():
        s.trim()
    return ("storm-over-the-reach", stems,
            {"storm": 0.85, "drums": 0.95, "bass": 0.9,
             "brass": 0.9, "strings": 0.85}, True)


# ============================================================ THE-WEEPING-WILLOW
# Sorrow: grief that bends but does not break.
# A minor, 68 BPM. 12 bars. Loop.
# Am F C G.
def the_weeping_willow():
    bpm = 68
    bars = 12
    total = bars * 4
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    pluck_ = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    flute = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Am, F, C, G] * 3
    roots = [n("A2"), n("F2"), n("C3"), n("G2")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the willow sways: soft string pads
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=0.32)
        # tears fall: gentle plucked arpeggios
        arp = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[2] + 24, ch[1] + 24, ch[0] + 24, ch[2] + 24]
        for k, m in enumerate(arp):
            pluck_.pluck(b + k * 0.5, m, dur_beats=1.5, vel=0.36)
        # the grave: slow, deep roots
        bass.bass(b, root - 24, 4.4, vel=0.48, cutoff=180)
        # the mourners hum
        if i >= 4:
            for m in ch:
                choir.choir(b, m - 24, 3.8, vel=0.28)

    # the willow weeps: a melody that falls and falls
    weep = [
        (0, "E5", 4),
        (4, "D5", 2), (6, "C5", 2),
        (8, "B4", 4),
        (12, "C5", 6),
        (20, "A4", 4),
        (24, "G4", 2), (26, "F4", 2),
        (28, "E4", 4),
        (32, "D4", 4),
        (36, "C4", 2), (38, "B3", 2),
        (40, "A3", 4),
        (44, "G3", 4),
    ]
    for off, note, d in weep:
        strings.strings(off, n(note), d, vel=0.48)

    # a friend's hand: the flute answers in the second half
    answer = [
        (32, "A5", 2), (34, "G5", 2),
        (36, "E5", 4),
        (40, "D5", 2), (42, "C5", 2),
        (44, "B4", 4),
    ]
    for off, note, d in answer:
        flute.flute(off, n(note), d, vel=0.40)

    stems = {"strings": strings, "choir": choir, "pluck": pluck_,
             "bass": bass, "flute": flute}
    for s in stems.values():
        s.trim()
    return ("the-weeping-willow", stems,
            {"strings": 0.9, "choir": 0.85, "pluck": 0.9,
             "bass": 0.9, "flute": 0.85}, True)


# ============================================================ WINGS-OF-VICTORY
# Triumph: the eagles rise, the enemy breaks, the sky is ours.
# E major, 138 BPM. 12 bars. Arc: take flight -> triumph -> soaring home.
# E C#m A B.
def wings_of_victory():
    bpm = 138
    bars = 12
    total = bars * 4
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    strings = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    E = [n("E2"), n("G#2"), n("B2")]
    Csm = [n("C#2"), n("E2"), n("G#2")]
    A = [n("A2"), n("C#3"), n("E3")]
    B = [n("B2"), n("D#3"), n("F#3")]
    prog = [E, Csm, A, B] * 3
    roots = [n("E2"), n("C#2"), n("A2"), n("B2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.08    # take flight
        if i < 8:
            return 1.0                # triumph
        return 1.0 - (i - 8) * 0.14   # soaring home

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the fanfare: drums of victory
        drums.kick(b, vel=v * 0.62)
        drums.snare(b + 1, vel=v * 0.50)
        drums.kick(b + 2, vel=v * 0.62)
        drums.snare(b + 3, vel=v * 0.50)
        drums.taiko(b + 0.5, vel=v * 0.48)
        drums.taiko(b + 2.5, vel=v * 0.48)
        if i >= 4 and i < 8:
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.28)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the ground shakes: triumphant 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.4, vel=v * 0.56,
                      cutoff=520)
        # the host ascends: soaring string pads
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.38)
        # the eagles cry: brass swells
        if i >= 2:
            brass.brass(b, ch[2], 2.0, vel=v * 0.44)
            brass.brass(b + 2, ch[0] + 12, 2.0, vel=v * 0.40)
        # the choir of the victorious
        if i >= 4:
            for m in ch:
                choir.choir(b, m - 12, 3.6, vel=v * 0.40)

    # the eagle's flight: glory in every note
    flight = [
        (0, "E4", 2), (2, "G#4", 2),
        (4, "B4", 4),
        (8, "C#5", 4),
        (12, "B4", 2), (14, "A4", 2),
        (16, "G#4", 4),
        (20, "A4", 2), (22, "B4", 2),
        (24, "C#5", 4),
        (28, "B4", 4),
        (32, "E5", 4),
        (36, "D#5", 2), (38, "C#5", 2),
        (40, "B4", 4),
        (44, "A4", 4),
    ]
    for off, note, d in flight:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.56,
                   vibrato=5.5, vib_depth=6.0)

    stems = {"brass": brass, "drums": drums, "strings": strings,
             "choir": choir, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("wings-of-victory", stems,
            {"brass": 0.92, "drums": 0.95, "strings": 0.85,
             "choir": 0.85, "bass": 0.9}, False)


# ============================================================ render
def mix_track26(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (the_last_harvest, 0.22),
    (drums_of_the_empire, 0.24),
    (the_silver_tongue, 0.16),
    (storm_over_the_reach, 0.18),
    (the_weeping_willow, 0.20),
    (wings_of_victory, 0.22),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track26(name, stems, gains, reverb_wet=wet,
                                    loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
