"""Twenty-first batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-20 moods already covered - do not duplicate):
  the-ashen-throne, thunder-of-hooves, the-lantern-festival,
  deep-hold, the-spymasters-web, dawnbreak.
Render: python3 compose21.py -> wav stems + mixes in out/
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

OUT = "/home/hatch/workspace/staging/music21/out"
MP3 = "/home/hatch/workspace/staging/music21/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(2021)


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

# ============================================================ THE-ASHEN-THRONE
# Ruined capital: desolate grandeur. G minor, 70 BPM. 12 bars. Arc.
# G minor: G A Bb C D Eb F - the empire's bones, still beautiful.
def the_ashen_throne():
    bpm = 70
    bars = 12
    total = bars * 4
    gong = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    drone = Track(bpm, total)
    bass = Track(bpm, total)
    glass = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    prog = [Gm, Eb, Bb, Dm] * 3
    roots = [n("G2"), n("Eb3"), n("Bb2"), n("D3")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10    # the ruins stand silent
        if i < 8:
            return 0.90               # the memory of glory swells
        return 0.90 - (i - 8) * 0.16  # and settles back to dust

    # the great bell tolls over the empty city
    for i in (0, 4, 8):
        gong.gong(bar(i), 4.0, vel=arc_vel(i) * 0.75)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the stone itself hums
        drone.pad(b, [root - 24, root - 12], 4.8, vel=0.26,
                  attack=2.0, cutoff=400)
        # the mourning choir of the empty halls
        for m in ch:
            choir.choir(b, m + 12, 4.2, vel=v * 0.50)
        # the deep foundation
        bass.bass(b, root - 24, 4.4, vel=v * 0.52, cutoff=190)
        # falling rubble: sparse bright chimes
        if i in (2, 5, 8, 10):
            glass.glass(b + 1, root + 48, 4.0, vel=v * 0.22)
            glass.glass(b + 3, root + 55, 3.0, vel=v * 0.14)

    # the lament of the last chronicler
    lament = [
        (0, "G4", 2), (2, "Bb4", 2),
        (4, "A4", 4),
        (8, "G4", 2), (10, "F4", 2),
        (12, "Eb4", 4),
        (16, "D4", 4),
        (20, "G4", 4),
        (24, "Bb4", 2), (26, "A4", 2),
        (28, "G4", 4),
        (32, "F4", 2), (34, "Eb4", 2),
        (36, "D4", 6),
    ]
    for off, note, d in lament:
        choir.choir(off, n(note), d, vel=arc_vel(int(off // 4)) * 0.55)

    stems = {"gong": gong, "choir": choir, "drone": drone,
             "bass": bass, "glass": glass}
    for s in stems.values():
        s.trim()
    return ("the-ashen-throne", stems,
            {"gong": 0.85, "choir": 0.9, "drone": 0.85,
             "bass": 0.9, "glass": 0.8}, False)


# ============================================================ THUNDER-OF-HOOVES
# Massive cavalry charge: unstoppable. D major, 140 BPM. 12 bars. Arc.
# D major: D E F# G A B C# - ten thousand horses, one horizon.
def thunder_of_hooves():
    bpm = 140
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    choir = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    G = [n("G3"), n("B3"), n("D4")]
    A = [n("A3"), n("C#4"), n("E4")]
    Bm = [n("B3"), n("D4"), n("F#4")]
    prog = [D, G, A, Bm] * 3
    roots = [n("D3"), n("G2"), n("A2"), n("B2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.11    # the squadrons wheel into line
        if i < 8:
            return 1.0                # the charge: nothing stands
        return 1.0 - (i - 8) * 0.20   # the thunder recedes

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the gallop: triplets rolling under every beat
        for beat in range(4):
            drums.kick(b + beat, vel=v * 0.60)
            for k, (dt, vv, fr) in enumerate(
                    [(0.0, 0.40, 140), (0.33, 0.46, 130), (0.67, 0.58, 150)]):
                drums.tom(b + beat + dt, freq=fr, vel=v * vv)
        drums.snare(b + 1.5, vel=v * 0.48)
        drums.snare(b + 3.5, vel=v * 0.48)
        if i == 0:
            drums.crash(b, vel=0.62)
        if i == 6:  # the line breaks through
            drums.crash(b, vel=0.72)
        # galloping bass, driving 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.36, vel=v * 0.60,
                      cutoff=680)
        # charging fanfare brass
        for m in ch:
            brass.brass(b, m + 12, 0.8, vel=v * 0.55)
            brass.brass(b + 2, m + 12, 0.8, vel=v * 0.48)
        # the riders' war chant from the second wave
        if i >= 3:
            for m in ch:
                choir.choir(b, m + 12, 3.6, vel=v * 0.42)

    # the war horn of the charge
    horn = [
        (0, "D5", 1), (1, "F#5", 1), (2, "A5", 2),
        (4, "B5", 1), (5, "A5", 1), (6, "G5", 2),
        (8, "F#5", 2), (10, "E5", 2),
        (12, "D5", 4),
        (16, "A5", 2), (18, "G5", 2),
        (20, "F#5", 2), (22, "E5", 2),
        (24, "D5", 6),
        (32, "B4", 2), (34, "D5", 2),
        (36, "F#5", 2), (38, "A5", 2),
        (40, "B5", 4),
        (44, "A5", 4),
    ]
    for off, note, d in horn:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.58, vibrato=7.0,
                  vib_depth=6.0)

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "lead": lead, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("thunder-of-hooves", stems,
            {"drums": 0.9, "brass": 0.85, "bass": 0.9,
             "lead": 0.85, "choir": 0.85}, False)


# ============================================================ THE-LANTERN-FESTIVAL
# Night celebration: lights and joy. A major, 108 BPM. 16 bars. Loop.
# A major: A B C# D E F# G# - the whole city dances by lantern light.
def the_lantern_festival():
    bpm = 108
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    drums = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    crowd = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    Fsm = [n("F#3"), n("A3"), n("C#4")]
    prog = [A, D, E, D] * 2 + [A, Fsm, D, E] * 2
    roots = [n("A2"), n("D3"), n("E3"), n("D3")] * 2 + \
            [n("A2"), n("F#3"), n("D3"), n("E3")] * 2

    # the festival never sleeps: happy murmur under everything
    crowd.whisper(0, total, vel=0.16)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # warm lantern glow
        pads.pad(b, ch, 4.4, vel=0.26, attack=1.0, cutoff=1900)
        # dancing strings: bright 8th-note arpeggios
        tones = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[2] + 36,
                 ch[1] + 24, ch[0] + 24, ch[1] + 24, ch[2] + 24]
        for k, m in enumerate(tones):
            pluck.pluck(b + k * 0.5, m, 0.6, vel=0.30)
        # festival frame-drums
        drums.tom(b, freq=150, vel=0.42)
        drums.tom(b + 1, freq=130, vel=0.34)
        drums.tom(b + 2, freq=150, vel=0.42)
        drums.tom(b + 3, freq=120, vel=0.34)
        drums.snare(b + 1.5, vel=0.26)
        drums.snare(b + 3.5, vel=0.26)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.16, open_=(k % 4 == 3))
        # bouncing bass
        bass.bass(b, root - 12, 1.6, vel=0.54, cutoff=520)
        bass.bass(b + 2, root - 12 + 7, 1.6, vel=0.46, cutoff=520)

    # the lantern-bearer's tune: bright and winding
    dance = [
        (0, "A4", 1), (1, "C#5", 1), (2, "E5", 1), (3, "C#5", 1),
        (4, "D5", 2), (6, "B4", 2),
        (8, "C#5", 1), (9, "D5", 1), (10, "E5", 2),
        (12, "F#5", 2), (14, "E5", 2),
        (16, "D5", 2), (18, "C#5", 2),
        (20, "B4", 2), (22, "A4", 2),
        (24, "G#4", 2), (26, "A4", 2),
        (28, "B4", 4),
        (32, "C#5", 2), (34, "D5", 2),
        (36, "E5", 2), (38, "F#5", 2),
        (40, "E5", 4),
        (44, "D5", 2), (46, "C#5", 2),
        (48, "B4", 2), (50, "A4", 2),
        (52, "G#4", 2), (54, "A4", 2),
        (56, "B4", 2), (58, "C#5", 2),
        (60, "A4", 4),
    ]
    for off, note, d in dance:
        pluck.pluck(off, n(note), d, vel=0.40)

    stems = {"pluck": pluck, "drums": drums, "pads": pads,
             "bass": bass, "crowd": crowd}
    for s in stems.values():
        s.trim()
    return ("the-lantern-festival", stems,
            {"pluck": 0.9, "drums": 0.85, "pads": 0.8,
             "bass": 0.85, "crowd": 0.7}, True)


# ============================================================ DEEP-HOLD
# Dwarven halls: ancient stone. E minor, 78 BPM. 16 bars. Loop.
# E minor: E F# G A B C D - a thousand years of hewn rock.
def deep_hold():
    bpm = 78
    bars = 16
    total = bars * 4
    drone = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    gong = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G3"), n("B3"), n("D4")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, C, G, D] * 4
    roots = [n("E2"), n("C3"), n("G2"), n("D3")] * 4

    # the deep bell tolls at the changing of the watch
    gong.gong(bar(0), 4.0, vel=0.55)
    gong.gong(bar(8), 4.0, vel=0.55)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the mountain's own voice
        drone.pad(b, [root - 24, root - 12], 4.8, vel=0.30,
                  attack=2.5, cutoff=420)
        # the deep choir of the hold
        for m in ch:
            choir.choir(b, m, 4.4, vel=0.30)
        # slow war-drums of the deep guard
        drums.taiko(b, vel=0.52)
        drums.taiko(b + 2, vel=0.40)
        if i % 4 == 3:
            drums.tom(b + 3, freq=90, vel=0.40)
            drums.tom(b + 3.5, freq=80, vel=0.45)
        # the bedrock below
        bass.bass(b, root - 24, 4.4, vel=0.52, cutoff=180)

    # the chant of the stonewrights: low and eternal
    chant = [
        (0, "E3", 4),
        (8, "G3", 4),
        (16, "A3", 4),
        (24, "G3", 4),
        (32, "E3", 8),
        (48, "D3", 8),
        (56, "E3", 8),
    ]
    for off, note, d in chant:
        choir.choir(off, n(note), d, vel=0.36)

    stems = {"drone": drone, "choir": choir, "drums": drums,
             "bass": bass, "gong": gong}
    for s in stems.values():
        s.trim()
    return ("deep-hold", stems,
            {"drone": 0.85, "choir": 0.9, "drums": 0.85,
             "bass": 0.85, "gong": 0.8}, True)


# ============================================================ THE-SPYMASTERS-WEB
# Intrigue and shadows: tense strings. C# minor, 92 BPM. 16 bars. Loop.
# C# minor: C# D# E F# G# A B - every ally is a thread, every thread a trap.
def the_spymasters_web():
    bpm = 92
    bars = 16
    total = bars * 4
    whisper = VoiceTrack(bpm, total)
    strings = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    glass = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Csm = [n("C#3"), n("E3"), n("G#3")]
    A = [n("A2"), n("C#3"), n("E3")]
    E = [n("E3"), n("G#3"), n("B3")]
    B = [n("B2"), n("D#3"), n("F#3")]
    prog = [Csm, A, E, B] * 4
    roots = [n("C#3"), n("A2"), n("E3"), n("B2")] * 4

    # informants in every shadow
    whisper.whisper(0, total, vel=0.24)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # tense strings, never quite resolving
        strings.pad(b, ch, 4.4, vel=0.28, attack=0.9, cutoff=2100)
        # the spymaster walks the web: measured quarter notes
        for k, step in enumerate([0, 3, 5, 7]):
            bass.bass(b + k, root - 12 + step, 0.9, vel=0.50,
                      cutoff=480)
        # one cold note: the decisive word
        if i in (4, 8, 12):
            glass.glass(b + 2, root + 48, 4.0, vel=0.20)

    # the agent's theme: beautiful, venomous, always watching
    agent = [
        (0, "G#4", 2), (2, "E4", 2),
        (4, "F#4", 3), (7, "E4", 1),
        (8, "D#4", 4),
        (12, "E4", 4),
        (16, "C#4", 2), (18, "E4", 2),
        (20, "G#4", 2), (22, "B4", 2),
        (24, "A4", 4),
        (28, "G#4", 4),
        (32, "F#4", 2), (34, "E4", 2),
        (36, "D#4", 4),
        (40, "E4", 6),
        (48, "C#5", 2), (50, "B4", 2),
        (52, "G#4", 4),
        (56, "F#4", 2), (58, "E4", 2),
        (60, "D#4", 4),
    ]
    for off, note, d in agent:
        lead.lead(off, n(note), d, vel=0.50, vibrato=6.5,
                  vib_depth=3.0)

    stems = {"whisper": whisper, "strings": strings, "bass": bass,
             "lead": lead, "glass": glass}
    for s in stems.values():
        s.trim()
    return ("the-spymasters-web", stems,
            {"whisper": 0.8, "strings": 0.85, "bass": 0.85,
             "lead": 0.9, "glass": 0.8}, True)


# ============================================================ DAWNBREAK
# Final assault at sunrise: epic climax. F major, 120 BPM. 12 bars. Arc.
# F major: F G A Bb C D E - the sun rises and the free advance.
def dawnbreak():
    bpm = 120
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    prog = [F, Bb, C, Dm] * 3
    roots = [n("F2"), n("Bb2"), n("C3"), n("D3")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.12    # the army gathers in darkness
        if i < 8:
            return 1.0                # the sun breaks: advance!
        return 1.0 - (i - 8) * 0.15   # the field is won

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # war drums of the final morning
        for beat in range(4):
            drums.taiko(b + beat, vel=v * 0.60)
        drums.kick(b, vel=v * 0.55)
        drums.kick(b + 2, vel=v * 0.55)
        drums.snare(b + 1, vel=v * 0.52)
        drums.snare(b + 3, vel=v * 0.52)
        if i == 0:
            drums.crash(b, vel=0.58)
        if i == 4:  # sunrise
            drums.crash(b, vel=0.74)
        if i == 8:
            drums.crash(b, vel=0.64)
        # rising fanfares
        for m in ch:
            brass.brass(b, m + 12, 1.0, vel=v * 0.55)
            brass.brass(b + 2, m + 12, 1.0, vel=v * 0.48)
        # the free sing as the sun rises
        if i >= 4:
            for m in ch:
                choir.choir(b, m + 12, 3.8, vel=v * 0.50)
        # driving bass, 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.38, vel=v * 0.58,
                      cutoff=640)

    # the sunrise anthem: no darkness lasts forever
    anthem = [
        (0, "F4", 2), (2, "A4", 2),
        (4, "C5", 4),
        (8, "Bb4", 2), (10, "A4", 2),
        (12, "G4", 4),
        (16, "A5", 2), (18, "G5", 2),
        (20, "F5", 4),
        (24, "E5", 2), (26, "D5", 2),
        (28, "C5", 4),
        (32, "D5", 2), (34, "E5", 2),
        (36, "F5", 6),
        (44, "F5", 4),
    ]
    for off, note, d in anthem:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.58, vibrato=6.0,
                  vib_depth=5.0)

    stems = {"drums": drums, "brass": brass, "choir": choir,
             "bass": bass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("dawnbreak", stems,
            {"drums": 0.9, "brass": 0.85, "choir": 0.85,
             "bass": 0.9, "lead": 0.9}, False)

# ============================================================ render
def mix_track21(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (the_ashen_throne, 0.20),
    (thunder_of_hooves, 0.20),
    (the_lantern_festival, 0.16),
    (deep_hold, 0.24),
    (the_spymasters_web, 0.18),
    (dawnbreak, 0.20),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track21(name, stems, gains, reverb_wet=wet,
                                    loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
