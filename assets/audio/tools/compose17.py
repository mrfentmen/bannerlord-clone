"""Seventeenth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-16 moods already covered - do not duplicate):
  the-sunken-fleet, iron-harvest, the-quiet-valley,
  stormwatch, the-last-council, dawn-of-empires.
Render: python3 compose17.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import (Track, reverb_stereo, limiter, write_wav, SR,
                   midi_to_freq, adsr, lowpass, highpass, noise)

OUT = "/home/hatch/workspace/staging/music17/out"
MP3 = "/home/hatch/workspace/staging/music17/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(1717)


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


# ============================================================ THE-SUNKEN-FLEET
# Drowned armada: watery and mournful. G minor, 68 BPM. 16 bars. Loop.
# G minor: G A Bb C D Eb F - the ships rest where the light never reaches.
def the_sunken_fleet():
    bpm = 68
    bars = 16
    total = bars * 4
    glass = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    tide = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Gm, Eb, Bb, F] * 4
    roots = [n("G2"), n("Eb3"), n("Bb2"), n("F3")] * 4

    # the sea itself: a constant wash, louder than any instrument
    tide.whisper(0, total, vel=0.42)
    tide.wind(0, total, vel=0.18)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # ship's bells under the waves, dripping and distant
        glass.glass(b, root + 48, 3.8, vel=0.34)
        glass.glass(b + 2.5, root + 55, 3.8, vel=0.24)
        # the drowned crew sings from bar 4
        if i >= 4:
            for m in ch:
                choir.choir(b, m + 24, 3.8, vel=0.40)
        # deep anchor bass
        bass.bass(b, root - 12, 3.6, vel=0.60, cutoff=260)
        # hull groans: slow, massive taiko
        if i % 2 == 0:
            drums.taiko(b + 2, vel=0.34)

    # the admiral's lament: one voice above the water
    lament = [
        (0, "G4", 4), (8, "F4", 4),
        (16, "Eb4", 6), (28, "D4", 4),
        (32, "Bb3", 4), (40, "C4", 4),
        (48, "D4", 4), (56, "G3", 6),
    ]
    for off, note, d in lament:
        glass.glass(off, n(note), d, vel=0.32)

    stems = {"glass": glass, "choir": choir, "tide": tide,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-sunken-fleet", stems,
            {"glass": 0.85, "choir": 0.85, "tide": 0.85,
             "bass": 0.85, "drums": 0.7}, True)


# ============================================================ IRON-HARVEST
# Wartime industry: pounding and proud. D minor, 116 BPM. 12 bars. Arc.
# D minor: D E F G A Bb C - the forges never sleep and the banners fly.
def iron_harvest():
    bpm = 116
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    forge = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [Dm, Bb, F, C] * 3
    roots = [n("D3"), n("Bb2"), n("F2"), n("C3")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.45 + i * 0.14    # the shifts begin
        if i < 8:
            return 1.0                # the furnaces at full roar
        return 1.0 - (i - 8) * 0.15   # the day's shift ends, not the war

    # the forge bed: fire and smoke never fully die in an arc
    forge.fire(0, total, vel=0.26)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # factory-floor rhythm
        for beat in range(4):
            drums.kick(b + beat, vel=v * 0.74)
        drums.snare(b + 1, vel=v * 0.64)
        drums.snare(b + 3, vel=v * 0.64)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.36)
        if i == 0:
            drums.crash(b, vel=0.62)
        if i == 8:  # the great hammer falls at the climax
            forge.blast(b, 2.5, vel=v * 0.55)
            drums.crash(b, vel=0.70)
        # galloping production-line bass
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.40, vel=v * 0.64,
                      cutoff=600)
        # brass stabs like press-strokes
        if i >= 1:
            for m in ch:
                brass.brass(b, m + 12, 0.9, vel=v * 0.56)
                brass.brass(b + 2, m + 12, 0.9, vel=v * 0.50)
        # the workers' choir swells in the middle shift
        if 3 <= i < 9:
            for m in ch:
                choir.choir(b + 1, m + 24, 2.6, vel=v * 0.48)

    # the hammerfall anthem: proud, unbroken, made of iron
    anthem = [
        (0, "D4", 1), (1, "F4", 1), (2, "A4", 2),
        (4, "G4", 1), (5, "F4", 1), (6, "E4", 2),
        (8, "D4", 1), (9, "F4", 1), (10, "A4", 1), (11, "C5", 1),
        (12, "D5", 2), (14, "C5", 1), (15, "A4", 1),
        (16, "Bb4", 2), (18, "A4", 2),
        (20, "G4", 1), (21, "F4", 1), (22, "E4", 1), (23, "D4", 1),
        (24, "F4", 2), (26, "A4", 2),
        (28, "C5", 1), (29, "Bb4", 1), (30, "A4", 2),
        (32, "D5", 2), (34, "C5", 1), (35, "Bb4", 1),
        (36, "A4", 1), (37, "G4", 1), (38, "F4", 1), (39, "E4", 1),
        (40, "D4", 2), (42, "E4", 2),
        (44, "F4", 4),
    ]
    for off, note, d in anthem:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.60, vibrato=7.0,
                  vib_depth=4.5)

    # forge bed (fire + the climax hammer-blast) folds into the drums stem
    drums.buf += forge.buf * 0.8

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "lead": lead, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("iron-harvest", stems,
            {"drums": 0.9, "brass": 0.85, "bass": 0.9,
             "lead": 0.85, "choir": 0.8}, False)


# ============================================================ THE-QUIET-VALLEY
# Hidden peaceful valley: gentle folk. F major, 84 BPM. 16 bars. Loop.
# F major: F G A Bb C D E - a place the war never found.
def the_quiet_valley():
    bpm = 84
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    lead = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    breeze = Track(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [F, Dm, Bb, C] * 4
    roots = [n("F2"), n("D3"), n("Bb2"), n("C3")] * 4

    # valley breeze, always present
    breeze.wind(0, total, vel=0.30)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # shepherd's harp: rolling 8th arpeggios
        tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[2] + 24,
                 ch[1] + 24, ch[2] + 24, ch[2] + 12, ch[1] + 12]
        for k, m in enumerate(tones):
            pluck.pluck(b + k * 0.5, m, 0.55, vel=0.36)
        # warm meadow pads
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.32, attack=1.6,
                 cutoff=1500)
        # gentle roots
        bass.bass(b, root - 12, 3.4, vel=0.52, cutoff=380)
        # soft frame-drum heartbeat on the backbeat
        drums_heartbeat = None
        if i % 2 == 0:
            drums_heartbeat = (b, b + 2)

    # hand-drum heartbeat track (own stem would exceed budget; fold into breeze)
    heartbeat = Track(bpm, total)
    for i in range(bars):
        b = bar(i)
        if i % 2 == 0:
            heartbeat.taiko(b, vel=0.22)
            heartbeat.taiko(b + 2, vel=0.18)
    breeze.buf += heartbeat.buf * 0.5

    # a fife whistles the valley's old tune
    tune = [
        (0, "F4", 1), (1, "G4", 1), (2, "A4", 2),
        (4, "C5", 1), (5, "A4", 1), (6, "G4", 2),
        (8, "F4", 1), (9, "D4", 1), (10, "E4", 2),
        (12, "F4", 3), (15, "G4", 1),
        (16, "A4", 1), (17, "G4", 1), (18, "F4", 2),
        (20, "E4", 1), (21, "D4", 1), (22, "E4", 2),
        (24, "F4", 1), (25, "A4", 1), (26, "C5", 2),
        (28, "D5", 3), (31, "C5", 1),
        (32, "Bb4", 2), (34, "A4", 2), (36, "G4", 2), (38, "F4", 2),
        (40, "A4", 1), (41, "G4", 1), (42, "F4", 1), (43, "E4", 1),
        (44, "D4", 2), (46, "C4", 2),
        (48, "D4", 2), (50, "E4", 2), (52, "F4", 2), (54, "G4", 2),
        (56, "A4", 2), (58, "G4", 1), (59, "F4", 1), (60, "E4", 4),
    ]
    for off, note, d in tune:
        lead.lead(off, n(note), d, vel=0.52, vibrato=5.0, vib_depth=3.5)

    stems = {"pluck": pluck, "lead": lead, "pads": pads,
             "bass": bass, "breeze": breeze}
    for s in stems.values():
        s.trim()
    return ("the-quiet-valley", stems,
            {"pluck": 0.9, "lead": 0.9, "pads": 0.8,
             "bass": 0.85, "breeze": 0.85}, True)


# ============================================================ STORMWATCH
# Coastal fortress in a gale: dramatic. C minor, 104 BPM. 12 bars. Arc.
# C minor: C D Eb F G Ab Bb - hold the wall while the sea goes mad.
def stormwatch():
    bpm = 104
    bars = 12
    total = bars * 4
    wind = Track(bpm, total)
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    swell_bass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    gale = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Cm, Ab, Bb, G] * 3
    roots = [n("C3"), n("Ab2"), n("Bb2"), n("G2")] * 3

    def arc_vel(i):
        if i < 5:
            return 0.50 + i * 0.10    # the gale rises
        if i < 9:
            return 1.0                # the storm's eye-wall
        return 1.0 - (i - 9) * 0.20   # the sea backs down, not defeated

    # the gale itself: wind howl + tearing gusts
    wind.wind(0, total, vel=0.40)
    gale.fire(0, total, vel=0.16)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # surf-driven taiko, doubling as the storm's fist
        drums.taiko(b, vel=v * 0.58)
        drums.taiko(b + 1, vel=v * 0.42)
        drums.taiko(b + 2, vel=v * 0.58)
        drums.snare(b + 3, vel=v * 0.44)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.26)
        if i == 0:
            drums.crash(b, vel=0.60)
        if i == 6:  # lightning strikes the beacon tower
            gale.blast(b, 2.5, vel=0.62)
            drums.crash(b, vel=0.72)
        # warning horns, long blasts
        if i >= 1:
            for m in ch:
                brass.brass(b, m, 2.2, vel=v * 0.56)
        # the garrison holds its line: tense choir
        if 4 <= i < 10:
            for m in ch:
                choir.choir(b + 2, m + 24, 1.8, vel=v * 0.44)
        # deep swell bass
        swell_bass.bass(b, root - 24, 3.4, vel=v * 0.60, cutoff=280)

    # the watchman's horn call: answered by the storm
    horn = [
        (0, "C4", 2), (2, "Eb4", 2),
        (4, "G4", 3), (7, "F4", 1),
        (8, "Eb4", 2), (10, "D4", 2),
        (12, "C4", 2), (14, "Bb3", 2),
        (16, "Ab4", 3), (19, "G4", 1),
        (20, "F4", 2), (22, "Eb4", 2),
        (24, "G4", 2), (26, "F4", 1), (27, "Eb4", 1),
        (28, "D4", 2), (30, "C4", 2),
        (32, "Eb4", 2), (34, "G4", 2),
        (36, "Ab4", 2), (38, "Bb4", 2),
        (40, "C5", 4),
    ]
    lead = Track(bpm, total)
    for off, note, d in horn:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.60, vibrato=6.0,
                  vib_depth=5.0)

    # fold gale texture (and the lightning blast) into the wind stem,
    # fold the deep swell bass into the brass stem (keeps 5-stem budget)
    wind.buf += gale.buf * 0.5
    brass.buf += swell_bass.buf * 0.8

    stems = {"wind": wind, "drums": drums, "brass": brass,
             "choir": choir, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("stormwatch", stems,
            {"wind": 0.85, "drums": 0.9, "brass": 0.85,
             "choir": 0.8, "lead": 0.9}, False)


# ============================================================ THE-LAST-COUNCIL
# Final war council: tense and weighty. Bb minor, 66 BPM. 12 bars. Arc.
# Bb minor: Bb C Db Eb F Gb Ab - every word decides who lives.
def the_last_council():
    bpm = 66
    bars = 12
    total = bars * 4
    gong = VoiceTrack(bpm, total)
    whisp = VoiceTrack(bpm, total)
    drone = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Bbm = [n("Bb2"), n("Db3"), n("F3")]
    Gb = [n("Gb2"), n("Bb2"), n("Db3")]
    Db = [n("Db3"), n("F3"), n("Ab3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Bbm, Gb, Db, F] * 3
    roots = [n("Bb2"), n("Gb2"), n("Db3"), n("F2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.40 + i * 0.07    # the doors are barred
        if i < 8:
            return 0.68               # the hard words are spoken
        return 0.68 - (i - 8) * 0.12  # the verdict is sealed

    # plotting whispers never fully die; the room is never truly quiet
    whisp.whisper(0, total, vel=0.34)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # a single gong opens each act of the debate
        if i % 4 == 0:
            gong.gong(b, 6, vel=v * 0.72)
        # dread bed under the arguing
        drone.pad(b, [m - 24 for m in ch], 4.4, vel=0.5 * v + 0.18,
                  attack=2.8, cutoff=640)
        # weighty brass pronouncements
        if 2 <= i < 10:
            for m in ch:
                brass.brass(b + 1, m - 12, 2.4, vel=v * 0.52)
        # the deepest bass: the stakes themselves
        bass.bass(b, root - 24, 3.8, vel=0.55 * v + 0.2, cutoff=220)
        # the decisive word: a glass note in the heart of the chamber
        if i == 7:
            gong.glass(b + 2, root + 48, 5.0, vel=0.44)

    # the verdict motif: short, inarguable phrases
    verdict = [
        (0, "Bb3", 3), (4, "Db4", 3),
        (8, "Gb4", 4), (16, "F4", 6),
        (24, "Eb4", 3), (28, "Db4", 3),
        (32, "F4", 4), (40, "Bb3", 6),
    ]
    for off, note, d in verdict:
        v = arc_vel(int(off // 4))
        brass.brass(off, n(note), d * 0.9, vel=0.55 * v + 0.15)

    stems = {"gong": gong, "whisper": whisp, "drone": drone,
             "brass": brass, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-last-council", stems,
            {"gong": 0.85, "whisper": 0.85, "drone": 0.9,
             "brass": 0.85, "bass": 0.85}, False)


# ============================================================ DAWN-OF-EMPIRES
# New era beginning: hopeful epic. E major, 92 BPM. 16 bars. Loop.
# E major: E F# G# A B C# D# - the sun rises on something bigger.
def dawn_of_empires():
    bpm = 92
    bars = 16
    total = bars * 4
    choir = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)
    drums = Track(bpm, total)
    pluck = Track(bpm, total)

    def bar(i):
        return i * 4

    E = [n("E2"), n("G#2"), n("B2")]
    A = [n("A2"), n("C#3"), n("E3")]
    Csm = [n("C#3"), n("E3"), n("G#3")]
    B = [n("B2"), n("D#3"), n("F#3")]
    prog = [E, A, Csm, B] * 4
    roots = [n("E2"), n("A2"), n("C#3"), n("B2")] * 4

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # sunrise choir swells every bar
        for m in ch:
            choir.choir(b, m + 24, 3.6, vel=0.46)
        # royal fanfares
        for m in ch:
            brass.brass(b, m + 12, 1.4, vel=0.56)
            brass.brass(b + 2.5, m + 12, 1.0, vel=0.48)
        # stately march drums
        drums.taiko(b, vel=0.50)
        drums.snare(b + 1, vel=0.36)
        drums.taiko(b + 2, vel=0.50)
        drums.snare(b + 3, vel=0.36)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.15)
        if i == 0:
            drums.crash(b, vel=0.55)

    # bass line written as its own stem
    bass = Track(bpm, total)
    for i, root in enumerate(roots):
        b = bar(i)
        bass.bass(b, root - 12, 1.4, vel=0.62, cutoff=420)
        bass.bass(b + 2, root - 12 + 7, 1.4, vel=0.54, cutoff=420)

    # the founding anthem: hopeful, ascending, unforgettable
    anthem = [
        (0, "E4", 1), (1, "F#4", 1), (2, "G#4", 2),
        (4, "B4", 1), (5, "A4", 1), (6, "G#4", 2),
        (8, "F#4", 1), (9, "G#4", 1), (10, "A4", 2),
        (12, "B4", 3), (15, "C#5", 1),
        (16, "D#5", 1), (17, "C#5", 1), (18, "B4", 2),
        (20, "A4", 1), (21, "B4", 1), (22, "C#5", 2),
        (24, "B4", 1), (25, "G#4", 1), (26, "A4", 2),
        (28, "G#4", 3), (31, "F#4", 1),
        (32, "E4", 2), (34, "G#4", 2), (36, "B4", 2), (38, "A4", 2),
        (40, "G#4", 1), (41, "F#4", 1), (42, "E4", 1), (43, "D#4", 1),
        (44, "E4", 2), (46, "F#4", 2),
        (48, "G#4", 2), (50, "A4", 2), (52, "B4", 2), (54, "C#5", 2),
        (56, "B4", 2), (58, "A4", 1), (59, "G#4", 1), (60, "E4", 4),
    ]
    for off, note, d in anthem:
        lead.lead(off, n(note), d, vel=0.58, vibrato=6.0, vib_depth=4.0)

    # bright picking under the anthem
    for i, ch in enumerate(prog):
        b = bar(i)
        for k, m in enumerate([ch[0] + 24, ch[1] + 24, ch[2] + 24,
                               ch[2] + 36]):
            pluck.pluck(b + k, m, 0.8, vel=0.34)

    stems = {"choir": choir, "brass": brass, "lead": lead,
             "drums": drums, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("dawn-of-empires", stems,
            {"choir": 0.9, "brass": 0.9, "lead": 0.9,
             "drums": 0.85, "bass": 0.85}, True)


# ============================================================ render
def mix_track17(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (the_sunken_fleet, 0.22),
    (iron_harvest, 0.16),
    (the_quiet_valley, 0.20),
    (stormwatch, 0.20),
    (the_last_council, 0.24),
    (dawn_of_empires, 0.20),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track17(name, stems, gains, reverb_wet=wet,
                                     loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
