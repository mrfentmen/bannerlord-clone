"""Twenty-second batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-21 moods already covered - do not duplicate):
  the-sundered-crown, wolves-of-the-steppe, the-emerald-isles,
  iron-and-oak, the-hollow-king, sails-at-dawn.
Render: python3 compose22.py -> wav stems + mixes in out/
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

OUT = "/home/hatch/workspace/staging/music22/out"
MP3 = "/home/hatch/workspace/staging/music22/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(2022)


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

# ============================================================ THE-SUNDERED-CROWN
# Empire fracturing: dramatic collapse. E minor, 76 BPM. 12 bars. Arc.
# Em C Am B7 - the crown cracks in two.
def the_sundered_crown():
    bpm = 76
    bars = 12
    total = bars * 4
    gong = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C3"), n("E3"), n("G3")]
    Am = [n("A2"), n("C3"), n("E3")]
    B7 = [n("B2"), n("D#3"), n("F#3")]
    prog = [Em, C, Am, B7] * 3
    roots = [n("E2"), n("C3"), n("A2"), n("B2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10    # the court gathers, uneasy
        if i < 8:
            return 1.0                # the crown shatters
        return 1.0 - (i - 8) * 0.15    # the shards settle

    for i in (0, 6, 10):
        gong.gong(bar(i), 4.0, vel=arc_vel(i) * 0.8)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the deep fracture
        bass.bass(b, root - 24, 4.4, vel=v * 0.55, cutoff=200)
        # brass pronouncements of doom
        for m in ch:
            brass.brass(b, m + 12, 1.0, vel=v * 0.55)
            brass.brass(b + 2, m + 12, 1.0, vel=v * 0.46)
        # the mourning court
        if i >= 2:
            for m in ch:
                choir.choir(b, m + 12, 3.8, vel=v * 0.45)
        # drums of the breaking
        if i >= 4:
            for beat in range(4):
                drums.taiko(b + beat, vel=v * 0.58)
            drums.snare(b + 1, vel=v * 0.50)
            drums.snare(b + 3, vel=v * 0.50)
        if i == 4:  # the crack
            drums.crash(b, vel=0.72)
            gong.blast(b, 4.0, vel=0.5)

    # the king's last address: proud to the end
    address = [
        (0, "E4", 2), (2, "G4", 2),
        (4, "B4", 4),
        (8, "A4", 2), (10, "G4", 2),
        (12, "F#4", 4),
        (16, "E4", 6),
        (24, "D4", 2), (26, "C4", 2),
        (28, "B3", 4),
        (32, "A3", 2), (34, "B3", 2),
        (36, "C4", 6),
        (44, "B3", 4),
    ]
    for off, note, d in address:
        v = arc_vel(int(off // 4))
        choir.solo(off, n(note), d, vel=v * 0.52)

    stems = {"gong": gong, "brass": brass, "choir": choir,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-sundered-crown", stems,
            {"gong": 0.85, "brass": 0.85, "choir": 0.85,
             "bass": 0.9, "drums": 0.9}, False)


# ============================================================ WOLVES-OF-THE-STEPPE
# Nomad horse archers: wild and fast. A minor, 144 BPM. 16 bars. Arc.
# Am G F E - the steppe knows no master.
def wolves_of_the_steppe():
    bpm = 144
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    pipes = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    G = [n("G2"), n("B2"), n("D3")]
    F = [n("F2"), n("A2"), n("C3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [Am, G, F, E] * 4
    roots = [n("A2"), n("G2"), n("F2"), n("E3")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.55 + i * 0.10    # the horde wheels into line
        if i < 12:
            return 1.0                # the charge
        return 1.0 - (i - 12) * 0.18  # and rides on

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # galloping hooves
        for k in range(8):
            drums.kick(b + k * 0.5, vel=v * 0.55)
            drums.hat(b + k * 0.5, vel=v * 0.35)
        drums.snare(b + 1, vel=v * 0.50)
        drums.snare(b + 3, vel=v * 0.50)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the steppe horn calls
        for m in ch:
            brass.brass(b + 2, m + 12, 1.0, vel=v * 0.45)
        # galloping bass, 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.34, vel=v * 0.60,
                      cutoff=700)
        # the war-songs of the riders
        if i >= 4 and i < 12:
            for m in ch:
                choir.choir(b, m + 12, 3.6, vel=v * 0.42)

    # the steppe flute: wild, wheeling, free
    flute = [
        (0, "A4", 1), (1, "C5", 1), (2, "D5", 1), (3, "E5", 1),
        (4, "D5", 1), (5, "C5", 1), (6, "B4", 1), (7, "A4", 1),
        (8, "G4", 1), (9, "A4", 1), (10, "B4", 1), (11, "C5", 1),
        (12, "B4", 1), (13, "A4", 1), (14, "G4", 2),
        (16, "A4", 1), (17, "C5", 1), (18, "E5", 1), (19, "A5", 1),
        (20, "G5", 1), (21, "E5", 1), (22, "D5", 1), (23, "C5", 1),
        (24, "B4", 1), (25, "C5", 1), (26, "D5", 1), (27, "B4", 1),
        (28, "A4", 3),
        (32, "E5", 1), (33, "D5", 1), (34, "C5", 1), (35, "B4", 1),
        (36, "A4", 1), (37, "G4", 1), (38, "A4", 2),
        (40, "F5", 1), (41, "E5", 1), (42, "D5", 1), (43, "C5", 1),
        (44, "B4", 4),
        (48, "A4", 6),
        (56, "G#4", 2), (58, "A4", 4),
    ]
    for off, note, d in flute:
        v = arc_vel(int(off // 4))
        pipes.pipes(off, n(note), d, vel=v * 0.55)

    stems = {"drums": drums, "pipes": pipes, "brass": brass,
             "bass": bass, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("wolves-of-the-steppe", stems,
            {"drums": 0.9, "pipes": 0.85, "brass": 0.8,
             "bass": 0.9, "choir": 0.85}, False)

# ============================================================ THE-EMERALD-ISLES
# Celtic coastal: misty and green. D major, 92 BPM. 12 bars. Loop.
# D G A Bm - the mist rolls off the headlands.
def the_emerald_isles():
    bpm = 92
    bars = 12
    total = bars * 4
    pluck = Track(bpm, total)
    wind = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    prog = [D, G, A, Bm] * 3
    roots = [n("D3"), n("G2"), n("A2"), n("B2")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # harp of the headlands: rolling 8ths
        arp = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[2] + 24, ch[0] + 24, ch[1] + 24, ch[2] + 24]
        for k, m in enumerate(arp):
            pluck.pluck(b + k * 0.5, m, 1.0, vel=0.48)
        # sea-mist over the cliffs
        wind.wind(b, 4.4, vel=0.42)
        # warm green pads
        pads.pad(b, [m + 12 for m in ch], 4.4, vel=0.32,
                 attack=1.2, cutoff=1800)
        # the tide's bass
        bass.bass(b, root - 24, 4.2, vel=0.50, cutoff=220)

    # the fife of the fisherfolk
    fife = [
        (0, "D5", 2), (2, "F#5", 2),
        (4, "A5", 4),
        (8, "G5", 2), (10, "F#5", 2),
        (12, "E5", 4),
        (16, "D5", 6),
        (24, "B4", 2), (26, "A4", 2),
        (28, "G4", 4),
        (32, "F#4", 4),
        (36, "A4", 6),
        (44, "D5", 4),
    ]
    for off, note, d in fife:
        lead.lead(off, n(note), d, vel=0.50, vibrato=6.0, vib_depth=4.0)

    stems = {"pluck": pluck, "wind": wind, "pads": pads,
             "bass": bass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("the-emerald-isles", stems,
            {"pluck": 0.9, "wind": 0.8, "pads": 0.85,
             "bass": 0.9, "lead": 0.9}, True)


# ============================================================ IRON-AND-OAK
# Steadfast defenders: solid and proud. G major, 100 BPM. 12 bars. Loop.
# G C Em D - the wall does not move.
def iron_and_oak():
    bpm = 100
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    C = [n("C3"), n("E3"), n("G3")]
    Em = [n("E3"), n("G3"), n("B3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, C, Em, D] * 3
    roots = [n("G2"), n("C3"), n("E3"), n("D3")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the shield-wall's heartbeat
        for beat in range(4):
            drums.taiko(b + beat, vel=0.58)
        drums.kick(b, vel=0.55)
        drums.kick(b + 2, vel=0.55)
        drums.snare(b + 1, vel=0.50)
        drums.snare(b + 3, vel=0.50)
        if i == 0:
            drums.crash(b, vel=0.55)
        # oak and iron: brass stabs
        for m in ch:
            brass.brass(b, m + 12, 1.0, vel=0.52)
            brass.brass(b + 2, m + 12, 1.0, vel=0.45)
        # the defenders sing
        for m in ch:
            choir.choir(b, m + 12, 3.8, vel=0.42)
        # marching bass, 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.38, vel=0.58,
                      cutoff=620)

    # the captain's horn: we hold
    horn = [
        (0, "G4", 2), (2, "B4", 2),
        (4, "D5", 4),
        (8, "C5", 2), (10, "B4", 2),
        (12, "A4", 4),
        (16, "G4", 6),
        (24, "E4", 2), (26, "G4", 2),
        (28, "A4", 4),
        (32, "B4", 4),
        (36, "D5", 6),
        (44, "G5", 4),
    ]
    for off, note, d in horn:
        lead.lead(off, n(note), d, vel=0.55, vibrato=6.0, vib_depth=5.0)

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "choir": choir, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("iron-and-oak", stems,
            {"drums": 0.9, "brass": 0.85, "bass": 0.9,
             "choir": 0.85, "lead": 0.9}, True)


# ============================================================ THE-HOLLOW-KING
# Undead monarch: chilling dread. C minor, 66 BPM. 12 bars. Arc.
# Cm Ab Bb G - the throne room is colder than the grave.
def the_hollow_king():
    bpm = 66
    bars = 12
    total = bars * 4
    whisper = VoiceTrack(bpm, total)
    glass = VoiceTrack(bpm, total)
    drone = Track(bpm, total)
    bass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Cm, Ab, Bb, G] * 3
    roots = [n("C3"), n("Ab2"), n("Bb2"), n("G2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.45 + i * 0.10    # the court of the dead stirs
        if i < 8:
            return 0.85               # the hollow king rises
        return 0.85 - (i - 8) * 0.14  # and sinks back to sleep

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the whispering dead
        whisper.whisper(b, 4.4, vel=v * 0.55)
        # the crypt hums
        drone.pad(b, [root - 24, root - 12], 4.8, vel=0.26,
                  attack=2.2, cutoff=380)
        # the grave-choir
        for m in ch:
            choir.choir(b, m + 12, 4.2, vel=v * 0.45)
        # the throne's deep pulse
        bass.bass(b, root - 36, 4.4, vel=v * 0.55, cutoff=170)
        # cold crown jewels: sparse glass
        if i in (1, 4, 6, 9, 11):
            glass.glass(b + 2, root + 48, 4.0, vel=v * 0.20)

    # the hollow king speaks: one voice from the dark
    voice = [
        (0, "C4", 4),
        (8, "Eb4", 4),
        (16, "D4", 4),
        (24, "C4", 6),
        (32, "Bb3", 4),
        (40, "G3", 6),
    ]
    for off, note, d in voice:
        v = arc_vel(int(off // 4))
        choir.solo(off, n(note), d, vel=v * 0.50)

    stems = {"whisper": whisper, "glass": glass, "drone": drone,
             "bass": bass, "choir": choir}
    for s in stems.values():
        s.trim()
    return ("the-hollow-king", stems,
            {"whisper": 0.8, "glass": 0.8, "drone": 0.85,
             "bass": 0.9, "choir": 0.85}, False)


# ============================================================ SAILS-AT-DAWN
# Fleet departing: hopeful voyage. Bb major, 112 BPM. 12 bars. Loop.
# Bb Gm Eb F - fair winds and following seas.
def sails_at_dawn():
    bpm = 112
    bars = 12
    total = bars * 4
    sea = VoiceTrack(bpm, total)
    pluck = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    F = [n("F3"), n("A3"), n("C4")]
    prog = [Bb, Gm, Eb, F] * 3
    roots = [n("Bb2"), n("G2"), n("Eb3"), n("F3")] * 3

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the sea beneath the fleet
        sea.wave(b, 4.4, vel=0.50)
        # rigging harp: bright 8ths
        arp = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[2] + 24, ch[0] + 24, ch[1] + 24, ch[2] + 24]
        for k, m in enumerate(arp):
            pluck.pluck(b + k * 0.5, m, 1.0, vel=0.46)
        # the promise of the horizon
        pads.pad(b, [m + 12 for m in ch], 4.4, vel=0.30,
                 attack=1.2, cutoff=2000)
        # the hull's rhythm
        bass.bass(b, root - 24, 4.2, vel=0.52, cutoff=260)

    # the lookout's song: land ho in the heart
    song = [
        (0, "Bb4", 2), (2, "D5", 2),
        (4, "F5", 4),
        (8, "Eb5", 2), (10, "D5", 2),
        (12, "C5", 4),
        (16, "Bb4", 6),
        (24, "G4", 2), (26, "Bb4", 2),
        (28, "D5", 4),
        (32, "Eb5", 4),
        (36, "F5", 6),
        (44, "Bb5", 4),
    ]
    for off, note, d in song:
        lead.lead(off, n(note), d, vel=0.52, vibrato=6.0, vib_depth=5.0)

    stems = {"sea": sea, "pluck": pluck, "pads": pads,
             "bass": bass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("sails-at-dawn", stems,
            {"sea": 0.85, "pluck": 0.9, "pads": 0.85,
             "bass": 0.9, "lead": 0.9}, True)

# ============================================================ render
def mix_track22(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (the_sundered_crown, 0.20),
    (wolves_of_the_steppe, 0.20),
    (the_emerald_isles, 0.16),
    (iron_and_oak, 0.20),
    (the_hollow_king, 0.22),
    (sails_at_dawn, 0.16),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track22(name, stems, gains, reverb_wet=wet,
                                    loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
