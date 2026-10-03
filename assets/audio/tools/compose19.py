"""Nineteenth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-18 moods already covered - do not duplicate):
  the-iron-covenant, salt-and-thunder, the-harvest-home,
  whispers-of-the-deep, the-kings-ransom, banners-of-the-free.
Render: python3 compose19.py -> wav stems + mixes in out/
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

OUT = "/home/hatch/workspace/staging/music19/out"
MP3 = "/home/hatch/workspace/staging/music19/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# dedicated deterministic rng for texture beds in this batch
_frng = np.random.default_rng(1919)


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
    # rise to peak at 40%, fall back
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


# ============================================================ THE-IRON-COVENANT
# Sacred oath of steel: solemn and powerful. D minor, 80 BPM. 12 bars. Arc.
# D minor: D E F G A Bb C - knights kneel and the anvil witnesses.
def the_iron_covenant():
    bpm = 80
    bars = 12
    total = bars * 4
    gong = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Bb, Gm, A] * 3
    roots = [n("D3"), n("Bb2"), n("G2"), n("A2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.45 + i * 0.13    # the knights gather
        if i < 8:
            return 1.0                # the oath is sworn
        return 1.0 - (i - 8) * 0.20   # the hall empties

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the great gong marks each act of the ceremony
        if i % 4 == 0:
            gong.gong(b, 6.0, vel=0.65)
        # the order sings its vow from bar 2
        if i >= 2:
            for m in ch:
                choir.choir(b, m + 12, 3.6, vel=v * 0.48)
        # steel pronouncements: brass chords of the covenant
        for m in ch:
            brass.brass(b, m, 3.2, vel=v * 0.52)
        # the anvil's own heartbeat
        bass.bass(b, root - 12, 3.6, vel=v * 0.62, cutoff=280)
        # slow war-drums: one-two, one-two
        drums.taiko(b, vel=v * 0.50)
        drums.taiko(b + 2, vel=v * 0.40)
        if i % 2 == 1:
            drums.snare(b + 3, vel=v * 0.22)

    # the oath horn: a vow that outlives the speaker
    oath = [
        (0, "D4", 2), (2, "F4", 2),
        (4, "A4", 3), (7, "G4", 1),
        (8, "F4", 2), (10, "E4", 2),
        (12, "D4", 4),
        (16, "F4", 2), (18, "A4", 2),
        (20, "Bb4", 3), (23, "A4", 1),
        (24, "G4", 2), (26, "F4", 2),
        (28, "E4", 4),
        (32, "D5", 3), (35, "C5", 1),
        (36, "Bb4", 2), (38, "A4", 2),
        (40, "G4", 4),
        (44, "F4", 4),
    ]
    for off, note, d in oath:
        v = arc_vel(int(off // 4))
        brass.brass(off, n(note), d, vel=v * 0.55)

    stems = {"gong": gong, "choir": choir, "brass": brass,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-iron-covenant", stems,
            {"gong": 0.85, "choir": 0.85, "brass": 0.9,
             "bass": 0.85, "drums": 0.8}, False)


# ============================================================ SALT-AND-THUNDER
# Naval war in a storm: epic sea battle. A minor, 132 BPM. 12 bars. Arc.
# A minor: A B C D E F G - the fleet meets the gale and neither yields.
def salt_and_thunder():
    bpm = 132
    bars = 12
    total = bars * 4
    sea = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Am, F, C, G] * 3
    roots = [n("A2"), n("F2"), n("C3"), n("G2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.12    # the storm gathers
        if i < 8:
            return 1.0                # broadsides in the gale
        return 1.0 - (i - 8) * 0.20   # the sea calms

    # the storm never stops: waves under everything
    sea.wave(0, total, vel=0.42)

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # battle rhythm: driving naval war-drums
        for beat in range(4):
            drums.kick(b + beat, vel=v * 0.70)
        drums.snare(b + 1, vel=v * 0.58)
        drums.snare(b + 3, vel=v * 0.58)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.30)
        if i == 0:
            drums.crash(b, vel=0.62)
        if i == 6:  # lightning splits the mainmast
            sea.blast(b, 2.0, vel=0.55)
            drums.crash(b, vel=0.70)
        # rolling sea-bass, 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.38, vel=v * 0.60,
                      cutoff=650)
        # signal-gun brass
        for m in ch:
            brass.brass(b, m + 12, 1.0, vel=v * 0.52)
            brass.brass(b + 2, m + 12, 1.0, vel=v * 0.46)

    # the admiral's horn: heard above the storm
    horn = [
        (0, "A4", 1), (1, "C5", 1), (2, "E5", 2),
        (4, "D5", 1), (5, "C5", 1), (6, "B4", 2),
        (8, "A4", 1), (9, "G4", 1), (10, "A4", 2),
        (12, "E5", 3), (15, "D5", 1),
        (16, "C5", 1), (17, "D5", 1), (18, "E5", 1), (19, "G5", 1),
        (20, "A5", 3), (23, "G5", 1),
        (24, "E5", 2), (26, "D5", 2),
        (28, "C5", 2), (30, "B4", 2),
        (32, "A4", 4),
        (36, "G4", 2), (38, "A4", 2),
        (40, "B4", 4),
    ]
    for off, note, d in horn:
        v = arc_vel(int(off // 4))
        lead.lead(off, n(note), d, vel=v * 0.56, vibrato=6.5,
                  vib_depth=5.0)

    stems = {"sea": sea, "drums": drums, "brass": brass,
             "bass": bass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("salt-and-thunder", stems,
            {"sea": 0.85, "drums": 0.9, "brass": 0.85,
             "bass": 0.9, "lead": 0.85}, False)


# ============================================================ THE-HARVEST-HOME
# Return from the fields: warm celebration. G major, 104 BPM. 16 bars. Loop.
# G major: G A B C D E F# - the wagons roll in and the tables are set.
def the_harvest_home():
    bpm = 104
    bars = 16
    total = bars * 4
    lead = Track(bpm, total)
    pluck = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    C = [n("C3"), n("E3"), n("G3")]
    Em = [n("E3"), n("G3"), n("B3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, C, G, D] * 2 + [G, Em, C, D] * 2
    roots = [n("G2"), n("C3"), n("G2"), n("D3")] * 2 + \
            [n("G2"), n("E3"), n("C3"), n("D3")] * 2

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # warm hearth chords
        pads.pad(b, [m for m in ch], 4.4, vel=0.30, attack=0.9,
                 cutoff=2000)
        # the harvest dance: bright picking
        for k, m in enumerate([ch[0] + 24, ch[1] + 24, ch[2] + 24,
                               ch[2] + 36, ch[1] + 24, ch[0] + 24]):
            pluck.pluck(b + k * 0.66, m, 0.7, vel=0.30)
        # steady farm bass
        bass.bass(b, root - 12, 1.6, vel=0.58, cutoff=480)
        bass.bass(b + 2, root - 12 + 7, 1.6, vel=0.50, cutoff=480)
        # barn dance: hand drums and stomps
        drums.tom(b, freq=130, vel=0.42)
        drums.tom(b + 2, freq=130, vel=0.36)
        drums.snare(b + 1, vel=0.30)
        drums.snare(b + 3, vel=0.30)
        if i % 4 == 0:
            drums.crash(b, vel=0.30)

    # the fiddler's homecoming tune
    fiddle = [
        (0, "G4", 1), (1, "B4", 1), (2, "D5", 1), (3, "B4", 1),
        (4, "A4", 1), (5, "G4", 1), (6, "A4", 2),
        (8, "B4", 1), (9, "D5", 1), (10, "G5", 2),
        (12, "F#5", 1), (13, "E5", 1), (14, "D5", 2),
        (16, "E5", 1), (17, "D5", 1), (18, "B4", 1), (19, "A4", 1),
        (20, "G4", 2), (22, "A4", 2),
        (24, "B4", 1), (25, "A4", 1), (26, "G4", 1), (27, "E4", 1),
        (28, "D4", 2), (30, "G4", 2),
        (32, "D5", 1), (33, "B4", 1), (34, "G4", 1), (35, "B4", 1),
        (36, "D5", 1), (37, "G5", 1), (38, "E5", 2),
        (40, "D5", 1), (41, "B4", 1), (42, "A4", 1), (43, "G4", 1),
        (44, "F#4", 2), (46, "G4", 2),
        (48, "A4", 2), (50, "B4", 2),
        (52, "C5", 2), (54, "B4", 2),
        (56, "A4", 2), (58, "G4", 2),
        (60, "D4", 4),
    ]
    for off, note, d in fiddle:
        lead.lead(off, n(note), d, vel=0.52, vibrato=7.0,
                  vib_depth=4.0)

    stems = {"lead": lead, "pluck": pluck, "pads": pads,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-harvest-home", stems,
            {"lead": 0.9, "pluck": 0.85, "pads": 0.8,
             "bass": 0.85, "drums": 0.8}, True)


# ============================================================ WHISPERS-OF-THE-DEEP
# Underwater mystery: dark and flowing. E minor, 68 BPM. 16 bars. Loop.
# E minor: E F# G A B C D - the drowned city remembers its name.
def whispers_of_the_deep():
    bpm = 68
    bars = 16
    total = bars * 4
    drone = Track(bpm, total)
    whale = VoiceTrack(bpm, total)
    glass = VoiceTrack(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, C, G, D] * 4
    roots = [n("E3"), n("C3"), n("G2"), n("D3")] * 4

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the abyss itself: deep slow chords
        drone.pad(b, [root - 24, root - 12], 4.6, vel=0.30,
                  attack=2.5, cutoff=450)
        # the drowned choir, barely audible
        for m in ch:
            choir.choir(b, m + 12, 4.2, vel=0.26)
        # sunken bells: light filtering down
        glass.glass(b + 1.0, root + 36, 4.0, vel=0.20)
        glass.glass(b + 3.0, root + 43, 3.0, vel=0.14)
        # the ocean floor
        bass.bass(b, root - 24, 4.2, vel=0.52, cutoff=190)

    # the great whales pass overhead, singing
    calls = [
        (0, 8.0, 0.40, 150.0, 380.0),
        (12, 6.0, 0.32, 170.0, 340.0),
        (24, 8.0, 0.36, 140.0, 400.0),
        (36, 6.0, 0.30, 180.0, 320.0),
        (48, 8.0, 0.34, 150.0, 360.0),
    ]
    for off, d, vel, f0, f1 in calls:
        whale.whale(off, d, vel=vel, f0=f0, f1=f1)

    stems = {"drone": drone, "whale": whale, "glass": glass,
             "choir": choir, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("whispers-of-the-deep", stems,
            {"drone": 0.85, "whale": 0.9, "glass": 0.8,
             "choir": 0.8, "bass": 0.85}, True)


# ============================================================ THE-KINGS-RANSOM
# Tense negotiation: gold and danger. C minor, 88 BPM. 12 bars. Arc.
# C minor: C D Eb F G Ab Bb - every coin is counted and every hand is armed.
def the_kings_ransom():
    bpm = 88
    bars = 12
    total = bars * 4
    tension = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    glass = VoiceTrack(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Fm = [n("F2"), n("Ab2"), n("C3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [Cm, Ab, Fm, G] * 3
    roots = [n("C3"), n("Ab2"), n("F2"), n("G2")] * 3

    def arc_vel(i):
        if i < 4:
            return 0.40 + i * 0.08    # the terms are laid out
        if i < 8:
            return 0.72               # the haggling turns sharp
        return 0.72 - (i - 8) * 0.14  # the deal is struck

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # tight low strings: no one relaxes
        tension.pad(b, [m - 12 for m in ch] + [root - 11],
                    4.4, vel=0.26 * v + 0.10, attack=1.2, cutoff=1300)
        # the counting-house clock: 8ths, quiet, relentless
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.22, open_=False)
        # danger brass: short swells
        for m in ch:
            brass.brass(b + 1, m, 1.6, vel=v * 0.44)
        # gold on the table: high coins
        glass.glass(b + 0.5, root + 48, 1.6, vel=v * 0.22)
        glass.glass(b + 2.5, root + 55, 1.2, vel=v * 0.16)
        # the vault below
        bass.bass(b, root - 24, 3.8, vel=v * 0.55 + 0.10, cutoff=230)
        # a single heartbeat drum per bar
        drums.taiko(b + 3, vel=v * 0.34)

    # the negotiator's theme: sparse, patient, dangerous
    motif = [
        (4, "G4", 2),
        (12, "Ab4", 2),
        (20, "G4", 2),
        (28, "F4", 3),
        (36, "Eb5", 2),
        (40, "D5", 2),
        (44, "C5", 4),
    ]
    for off, note, d in motif:
        v = arc_vel(int(off // 4))
        brass.brass(off, n(note), d, vel=v * 0.50)

    stems = {"tension": tension, "brass": brass, "bass": bass,
             "glass": glass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-kings-ransom", stems,
            {"tension": 0.85, "brass": 0.85, "bass": 0.85,
             "glass": 0.8, "drums": 0.75}, False)


# ============================================================ BANNERS-OF-THE-FREE
# Rebellion rising: defiant hope. F major, 116 BPM. 16 bars. Loop.
# F major: F G A Bb C D E - the banners go up and the people follow.
def banners_of_the_free():
    bpm = 116
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    lead = Track(bpm, total)
    brass = Track(bpm, total)
    choir = VoiceTrack(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [F, Bb, F, C] * 2 + [Dm, Bb, F, C] * 2
    roots = [n("F2"), n("Bb2"), n("F2"), n("C3")] * 2 + \
            [n("D3"), n("Bb2"), n("F2"), n("C3")] * 2

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the people's march: snare-forward
        drums.snare(b, vel=0.52)
        drums.snare(b + 1, vel=0.44)
        drums.snare(b + 2, vel=0.52)
        drums.snare(b + 3, vel=0.44)
        drums.kick(b, vel=0.58)
        drums.kick(b + 2, vel=0.58)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.20)
        if i == 0:
            drums.crash(b, vel=0.55)
        # the rising: choir grows from bar 2
        if i >= 2:
            for m in ch:
                choir.choir(b, m + 24, 3.4, vel=0.44)
        # defiant fanfares
        for m in ch:
            brass.brass(b, m + 12, 1.1, vel=0.54)
            brass.brass(b + 2.5, m + 12, 0.9, vel=0.46)
        # marching low end, 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root - 12, 0.38, vel=0.58,
                      cutoff=560)

    # the anthem of the free: sung in every square
    anthem = [
        (0, "F4", 1), (1, "A4", 1), (2, "C5", 2),
        (4, "Bb4", 1), (5, "A4", 1), (6, "G4", 2),
        (8, "A4", 1), (9, "Bb4", 1), (10, "C5", 2),
        (12, "F5", 3), (15, "E5", 1),
        (16, "D5", 1), (17, "C5", 1), (18, "Bb4", 1),
        (19, "A4", 1), (20, "G4", 2), (22, "A4", 2),
        (24, "Bb4", 2), (26, "C5", 2),
        (28, "D5", 2), (30, "C5", 2),
        (32, "F5", 2), (34, "E5", 1), (35, "D5", 1),
        (36, "C5", 2), (38, "Bb4", 2),
        (40, "A4", 2), (42, "G4", 2),
        (44, "F4", 4),
        (48, "G4", 2), (50, "A4", 2),
        (52, "Bb4", 2), (54, "A4", 2),
        (56, "G4", 2), (58, "F4", 2),
        (60, "C4", 4),
    ]
    for off, note, d in anthem:
        lead.lead(off, n(note), d, vel=0.56, vibrato=6.0,
                  vib_depth=4.0)

    stems = {"drums": drums, "lead": lead, "brass": brass,
             "choir": choir, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("banners-of-the-free", stems,
            {"drums": 0.85, "lead": 0.9, "brass": 0.9,
             "choir": 0.85, "bass": 0.85}, True)


# ============================================================ render
def mix_track19(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (the_iron_covenant, 0.24),
    (salt_and_thunder, 0.16),
    (the_harvest_home, 0.20),
    (whispers_of_the_deep, 0.26),
    (the_kings_ransom, 0.22),
    (banners_of_the_free, 0.18),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track19(name, stems, gains, reverb_wet=wet,
                                     loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
