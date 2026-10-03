"""Thirteenth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-12 moods already covered - do not duplicate):
  iron-choir, the-smugglers-path, golden-hour,
  breach-point, widows-lament, the-long-peace.
Render: python3 compose13.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import (Track, reverb_stereo, limiter, write_wav, SR,
                   midi_to_freq, adsr, lowpass, highpass, noise)

OUT = "/home/hatch/workspace/staging/music13/out"
MP3 = "/home/hatch/workspace/staging/music13/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


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
    x = highpass(x, 120.0) if not solo else x
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


# ============================================================ IRON-CHOIR
# Massed voices and war drums: sacred and terrifying. D minor, 84 BPM.
# 16 bars. Loop.
# D minor: D E F G A Bb C - the temple burns and the choir does not stop.
def iron_choir():
    bpm = 84
    bars = 16
    total = bars * 4
    choir = VoiceTrack(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [Dm, Bb, F, C] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # the massed choir: whole-note triads, low and vast
        for m in ch:
            choir.choir(b, m, 3.8, vel=0.75)
            choir.choir(b, m + 12, 3.8, vel=0.45)
        # war drums: the slow heartbeat of the rite
        drums.taiko(b, vel=0.85)
        drums.taiko(b + 2, vel=0.55)
        if i % 4 == 2:
            drums.taiko(b + 3, vel=0.7)
            drums.taiko(b + 3.5, vel=0.7)
        if i in (0, 8):
            drums.crash(b, vel=0.5)
        # sub-bass roots under the voices
        bass.bass(b, root - 24, 3.6, vel=0.7, cutoff=220)
        # brass answers the choir in the second half of each phrase
        if i % 4 >= 2:
            for m in ch:
                brass.brass(b + 2, m + 12, 1.6, vel=0.55)
        # cold air in the cathedral
        windt.wind(b, 4, vel=0.22)

    # the chant: a lone cantor line above the massed voices
    chant = [
        (0, "A4", 3), (4, "G4", 2), (6, "F4", 2),
        (8, "E4", 2), (10, "D4", 4),
        (16, "F4", 3), (20, "E4", 2), (22, "D4", 3),
        (32, "A4", 2), (34, "Bb4", 2), (36, "A4", 4),
        (40, "G4", 2), (42, "F4", 2), (44, "E4", 4),
        (48, "D5", 3), (52, "C5", 2), (54, "Bb4", 2), (56, "A4", 4),
    ]
    for off, note, d in chant:
        choir.solo(off, n(note), d, vel=0.6)

    stems = {"choir": choir, "drums": drums, "bass": bass,
             "brass": brass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("iron-choir", stems,
            {"choir": 0.95, "drums": 0.9, "bass": 0.85,
             "brass": 0.8, "wind": 0.8}, True)


# ============================================================ THE-SMUGGLERS-PATH
# Midnight contraband run: slinky and tense. B minor, 96 BPM. 12 bars. Arc.
# B minor: B C# D E F# G A - lanterns doused, the cart rolls silent.
def the_smugglers_path():
    bpm = 96
    bars = 12
    total = bars * 4
    pluck = Track(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Bm = [n("B2"), n("D3"), n("F#3")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    Em = [n("E3"), n("G3"), n("B3")]
    prog = [Bm, Bm, G, A, Bm, Em, G, A, Bm, G, A, Bm]

    def arc_vel(i):
        if i < 3:
            return 0.30 + i * 0.05
        if i < 8:
            return 0.45 + (i - 3) * 0.10
        if i < 10:
            return 0.95
        return 0.85 - (i - 10) * 0.25

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # walking bassline: root, third, fifth, sixth, octave, back
        walk = [0, 3, 7, 9, 12, 9, 7, 3]
        for k, st in enumerate(walk):
            if i < 3 and k % 2:
                continue  # sparser in the shadows
            bass.bass(b + k * 0.5, root - 12 + st, 0.42, vel=v * 0.7,
                      cutoff=500)
        # brushed hats, nervous and quiet
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.30)
        if i >= 4:
            drums.snare(b + 1, vel=v * 0.45)
            drums.snare(b + 3, vel=v * 0.45)
        if i >= 8:
            drums.kick(b, vel=v * 0.7)
            drums.kick(b + 2.5, vel=v * 0.6)
        # muted pluck comping, offbeats only
        if i >= 3:
            for m in ch:
                pluck.pluck(b + 0.5, m + 12, 0.5, vel=v * 0.45)
                pluck.pluck(b + 2.5, m + 12, 0.5, vel=v * 0.40)
        # night air
        windt.wind(b, 4, vel=v * 0.20)

    # the runner's theme: a muted horn, heard once and never again
    runner = [
        (12, "B4", 1), (13, "D5", 1), (14, "C#5", 2),
        (16, "B4", 1), (17, "A4", 1), (18, "G4", 2),
        (20, "F#4", 3), (24, "E4", 2),
        (28, "G4", 1), (29, "A4", 1), (30, "B4", 2),
        (32, "D5", 1), (33, "C#5", 1), (34, "B4", 1), (35, "A4", 1),
        (36, "G4", 2), (38, "F#4", 2),
        (40, "E4", 1), (41, "F#4", 1), (42, "G4", 2), (44, "B4", 4),
    ]
    for off, note, d in runner:
        lead.lead(off, n(note), d, vel=0.55, vibrato=5.5, vib_depth=3.0)

    stems = {"pluck": pluck, "lead": lead, "bass": bass,
             "drums": drums, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("the-smugglers-path", stems,
            {"pluck": 0.85, "lead": 0.85, "bass": 0.9,
             "drums": 0.8, "wind": 0.8}, False)


# ============================================================ GOLDEN-HOUR
# Peaceful countryside: warm strings. F major, 76 BPM. 16 bars. Loop.
# F major: F G A Bb C D E - dust on the road, bread in the oven.
def golden_hour():
    bpm = 76
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [F, Bb, Dm, C] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # warm afternoon pads
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.55, attack=1.8,
                 cutoff=1500)
        # lazy arpeggios on the porch
        arp = [12, 15, 19, 24, 19, 15]
        for k, st in enumerate(arp):
            pluck.pluck(b + k * (2 / 3), root + 12 + st, 0.9, vel=0.42)
        # unhurried bass
        bass.bass(b, root - 24, 1.8, vel=0.6, cutoff=300)
        bass.bass(b + 2, root - 24 + 7, 1.8, vel=0.55, cutoff=300)
        # evening breeze through the wheat
        windt.wind(b, 4, vel=0.30)

    # the long light: a melody in no hurry at all
    sunlight = [
        (0, "A4", 2), (2, "C5", 2), (4, "Bb4", 2), (6, "A4", 2),
        (8, "G4", 3), (12, "F4", 3),
        (16, "C5", 2), (18, "D5", 2), (20, "C5", 2), (22, "A4", 2),
        (24, "G4", 4), (28, "A4", 4),
        (32, "F4", 2), (34, "G4", 2), (36, "A4", 2), (38, "C5", 2),
        (40, "D5", 3), (44, "C5", 3),
        (48, "Bb4", 2), (50, "A4", 2), (52, "G4", 2), (54, "F4", 2),
        (56, "E4", 2), (58, "D4", 2), (60, "C4", 4),
    ]
    for off, note, d in sunlight:
        lead.lead(off, n(note), d, vel=0.60, vibrato=4.5, vib_depth=4.0)

    stems = {"pluck": pluck, "pads": pads, "lead": lead,
             "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("golden-hour", stems,
            {"pluck": 0.9, "pads": 0.8, "lead": 0.9,
             "bass": 0.8, "wind": 0.8}, True)


# ============================================================ BREACH-POINT
# The moment the wall falls: explosive then chaotic. C minor, 130 BPM.
# 12 bars. Arc: tension (bars 0-5) -> breach (bar 6) -> chaos -> rubble.
# C minor: C D Eb F G Ab Bb - the stones decide to be somewhere else.
def breach_point():
    bpm = 130
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    fx = VoiceTrack(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    BbM = [n("Bb2"), n("D3"), n("F3")]
    G = [n("G2"), n("B2"), n("D3")]

    # --- bars 0-5: the held breath before the wall gives
    for i in range(6):
        b = bar(i)
        v = 0.30 + i * 0.09
        # ticking hats, faster and louder as the cracks spread
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.45)
        # low pedal: the wall groaning
        root = Cm[0] if i % 2 == 0 else G[0]
        bass.bass(b, root - 24, 3.6, vel=v * 0.8, cutoff=240)
        brass.brass(b, root - 12, 3.6, vel=v * 0.5)
        # dissonant cluster swelling under everything
        pads.pad(b, [n("C3"), n("Db3"), n("G3")], 4, vel=v * 0.4,
                 attack=2.5, cutoff=1100)
    # snare roll climbs into the breach
    for k in range(16):
        drums.snare(16 + k * 0.5, vel=0.35 + k * 0.04)

    # --- bar 6: the wall falls
    b6 = bar(6)
    fx.blast(b6, 6, vel=1.0)
    drums.crash(b6, vel=0.9)
    drums.taiko(b6, vel=1.0)
    drums.taiko(b6 + 0.5, vel=0.9)
    for m in Cm:
        brass.brass(b6, m + 12, 2.0, vel=0.9)
        brass.brass(b6 + 2, m + 12, 1.5, vel=0.8)

    # --- bars 6-9: chaos in the breach
    for i in (6, 7, 8, 9):
        b = bar(i)
        v = 0.95 - (i - 6) * 0.10
        for beat in range(4):
            drums.kick(b + beat, vel=v * 0.85)
        drums.snare(b + 1, vel=v * 0.85)
        drums.snare(b + 3, vel=v * 0.85)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.45)
        if i in (7, 9):
            drums.tom(b + 3.5, freq=130, vel=v * 0.7)
        ch = [Cm, Ab, BbM, G][i - 6]
        for m in ch:
            brass.brass(b, m + 12, 1.2, vel=v * 0.65)
        bass.bass(b, ch[0] - 24, 3.2, vel=v * 0.8, cutoff=400)
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.5, attack=0.4,
                 cutoff=2000)

    # --- bars 10-11: the dust settles
    for i in (10, 11):
        b = bar(i)
        v = 0.55 - (i - 10) * 0.20
        drums.taiko(b, vel=v * 0.7)
        drums.taiko(b + 2.5, vel=v * 0.4)
        bass.bass(b, n("C2") - 12, 3.6, vel=v * 0.7, cutoff=220)
        pads.pad(b, [n("C2"), n("G2"), n("Eb3")], 4, vel=v * 0.45,
                 attack=2.0, cutoff=900)
    fx.gong(bar(10), 6, vel=0.55)  # one bell for the fallen wall
    wind = Track(bpm, total)
    wind.wind(0, total, vel=0.35)  # dust hanging in the air

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "pads": pads, "blast": fx}
    for s in stems.values():
        s.trim()
    wind.trim()
    stems["dust"] = wind
    return ("breach-point", stems,
            {"drums": 0.9, "brass": 0.85, "bass": 0.85,
             "pads": 0.8, "blast": 0.95, "dust": 0.8}, False)


# ============================================================ WIDOWS-LAMENT
# Grief after battle: solo voice and drone. E minor, 60 BPM. 12 bars. Arc.
# E minor: E F# G A B C D - the field is quiet now. Too quiet.
def widows_lament():
    bpm = 60
    bars = 12
    total = bars * 4
    voice = VoiceTrack(bpm, total)
    drone = Track(bpm, total)
    pluck = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    # the unending drone: low E, never leaving
    for i in range(12):
        b = bar(i)
        v = 0.30 if i < 4 else (0.45 if i < 8 else 0.32)
        drone.pad(b, [n("E2"), n("B2"), n("E3")], 4, vel=v,
                  attack=2.5, cutoff=700)
        bass.bass(b, n("E1"), 3.8, vel=v * 0.8, cutoff=180)

    # sparse lute, like someone remembering how to play
    remembering = [
        (2, "E4", 1.5), (8, "G4", 1.5), (14, "F#4", 1.5),
        (22, "E4", 2), (30, "D4", 1.5), (38, "B3", 2),
        (44, "G4", 1.5),
    ]
    for off, note, d in remembering:
        pluck.pluck(off, n(note), d, vel=0.42)

    # the lament itself: a wordless soprano over the drone
    lament = [
        (4, "B4", 4), (8, "A4", 3), (12, "G4", 4),
        (16, "F#4", 3), (20, "E4", 5),
        (28, "G4", 3), (32, "A4", 3), (36, "B4", 4),
        (40, "A4", 4), (44, "G4", 6),
    ]
    for off, note, d in lament:
        voice.solo(off, n(note), d, vel=0.62)

    stems = {"voice": voice, "drone": drone, "pluck": pluck,
             "bass": bass}
    for s in stems.values():
        s.trim()
    return ("widows-lament", stems,
            {"voice": 0.95, "drone": 0.85, "pluck": 0.8,
             "bass": 0.85}, False)


# ============================================================ THE-LONG-PEACE
# Decades of calm: gentle and wise. G major, 72 BPM. 16 bars. Loop.
# G major: G A B C D E F# - the grandchildren never knew the war.
def the_long_peace():
    bpm = 72
    bars = 16
    total = bars * 4
    pluck = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, Em, C, D] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # patient pads
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.5, attack=2.2,
                 cutoff=1400)
        # rocking-chair arpeggios
        arp = [12, 15, 19, 24, 19, 15]
        for k, st in enumerate(arp):
            pluck.pluck(b + k * (2 / 3), root + 12 + st, 1.0, vel=0.38)
        # deep, slow roots
        bass.bass(b, root - 24, 3.6, vel=0.6, cutoff=280)
        # leaves and memory
        windt.wind(b, 4, vel=0.28)

    # the elder's tune: simple, because it has earned simplicity
    elder = [
        (0, "D4", 2), (2, "E4", 2), (4, "G4", 3), (8, "E4", 3),
        (12, "D4", 2), (14, "B3", 2),
        (16, "C4", 2), (18, "D4", 2), (20, "E4", 2), (22, "G4", 2),
        (24, "A4", 3), (28, "G4", 3),
        (32, "E4", 2), (34, "G4", 2), (36, "A4", 2), (38, "B4", 2),
        (40, "D5", 3), (44, "B4", 3),
        (48, "A4", 2), (50, "G4", 2), (52, "E4", 2), (54, "D4", 2),
        (56, "E4", 2), (58, "D4", 2), (60, "B3", 4),
    ]
    for off, note, d in elder:
        lead.lead(off, n(note), d, vel=0.58, vibrato=4.0, vib_depth=3.5)

    stems = {"pluck": pluck, "pads": pads, "lead": lead,
             "bass": bass, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("the-long-peace", stems,
            {"pluck": 0.9, "pads": 0.8, "lead": 0.9,
             "bass": 0.8, "wind": 0.8}, True)


# ============================================================ render
def mix_track13(name, stems, gains, reverb_wet=0.18, loop=False):
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
          f"loop_err={loop_err:.1e} -> {path}")
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
    print(f"encoded {n} mp3s -> {MP3}")


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
    print(f"decode ok: {len(mp3s)}/{len(mp3s)} mp3s")

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
              f"({len(names)*(len(names)-1)//2} pairwise distinct)")


TRACKS = [
    (iron_choir, 0.22),
    (the_smugglers_path, 0.18),
    (golden_hour, 0.22),
    (breach_point, 0.16),
    (widows_lament, 0.24),
    (the_long_peace, 0.22),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track13(name, stems, gains, reverb_wet=wet,
                                     loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
