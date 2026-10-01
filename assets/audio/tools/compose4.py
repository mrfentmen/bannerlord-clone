"""Fourth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-3 live in compose.py / staging/music2/compose2.py /
staging/music3/compose3.py - do not duplicate those moods):
  border-crossing, homestead, convoy-ambush, city-hall, wasteland,
  victory-parade.
Render: python3 compose4.py  -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it). Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/game-music")
from synth import Track, reverb_stereo, limiter, write_wav, SR

OUT = "/home/hatch/workspace/staging/music4/out"
MP3 = "/home/hatch/workspace/staging/music4/out/mp3"
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


# ============================================================ BORDER CROSSING
# Tense checkpoint groove at night, E minor, 96 BPM. 16 bars. Loop.
def border_crossing():
    bpm = 96
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    # original tense ostinato: E F# G, low and insistent
    ost = [n("E1"), n("E1"), n("F#1"), n("G1")]
    Em = [n("E2"), n("G2"), n("B2"), n("E3")]
    C = [n("C2"), n("E2"), n("G2"), n("C3")]
    D = [n("D2"), n("F#2"), n("A2"), n("D3")]
    prog = [Em, Em, C, D] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        # pulsing 8th-note bass ostinato
        for k in range(8):
            bass.bass(b + k * 0.5, ost[k % 4], 0.45, vel=0.8, cutoff=500)
        # heartbeat taiko + snare backbeat, hats ticking
        drums.taiko(b, vel=0.85)
        drums.taiko(b + 2, vel=0.7)
        drums.snare(b + 1, vel=0.55)
        drums.snare(b + 3, vel=0.55)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.25)
        # dark pad swell, one per 2 bars
        if i % 2 == 0:
            pads.pad(b, [m for m in ch], 8, vel=0.45,
                     attack=2.0, cutoff=1300)
    # original sparse signal calls: perfect-fourth/fifth horn blasts
    calls = [(0, "E4", 1.5), (4, "B3", 1.5), (8, "A3", 2.0), (12, "B3", 1.0)]
    for start in (bar(0), bar(8)):
        for off, note, d in calls:
            lead.lead(start + off, n(note), d, vel=0.75,
                      vibrato=6.0, vib_depth=10.0)

    stems = {"drums": drums, "bass": bass, "pads": pads, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("border-crossing", stems,
            {"drums": 1.0, "bass": 0.95, "pads": 0.7, "lead": 0.85}, True)


# ============================================================ HOMESTEAD
# Warm 4/4 acoustic Americana, A major, 84 BPM. 16 bars. Loop.
def homestead():
    bpm = 84
    bars = 16
    total = bars * 4
    pluckt = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    Fsm = [n("F#2"), n("A2"), n("C#3")]
    prog = [A, D, A, E, A, D, Fsm, E] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # fingerpick pattern: bass note then rolling 8ths across the chord
        bass.bass(b, root - 12, 1.0, vel=0.75, cutoff=550)
        bass.bass(b + 2, root - 5, 1.0, vel=0.6, cutoff=550)  # fifth
        for k, m in enumerate([ch[0], ch[1], ch[2], ch[1]] * 2):
            pluckt.pluck(b + k * 0.5, m + 12, 0.8, vel=0.42)
    # original folk melody, phrases over bars 0-3, 4-7, 8-11, 12-15
    phrase = [
        (0, "A4", 1.0), (1, "C#5", 1.0), (2, "E5", 1.5), (3.5, "D5", 0.5),
        (4, "C#5", 1.0), (5, "B4", 1.0), (6, "A4", 2.0),
        (8, "F#4", 1.0), (9, "A4", 1.0), (10, "C#5", 1.5), (11.5, "B4", 0.5),
        (12, "A4", 3.0),
    ]
    for start in (bar(0), bar(8)):
        for off, note, d in phrase:
            pluckt.pluck(start + off, n(note), d + 0.6, vel=0.62)
    # soft sunrise pad, one chord per 4 bars
    for i in range(0, bars, 4):
        pads.pad(bar(i), [m + 12 for m in prog[i]], 16, vel=0.38,
                 attack=2.5, cutoff=2400)

    stems = {"pluck": pluckt, "bass": bass, "pads": pads}
    for s in stems.values():
        s.trim()
    return ("homestead", stems,
            {"pluck": 1.0, "bass": 0.85, "pads": 0.65}, True)


# ============================================================ CONVOY AMBUSH
# Driving 7/8 action cue, D minor, 132 BPM. 16 bars of 7. Loop.
def convoy_ambush():
    bpm = 132
    beats_per_bar = 7
    bars = 16
    total = bars * beats_per_bar
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * beats_per_bar

    # 7/8 as 3+2+2: accents land on 0, 3, 5
    Dm = [n("D2"), n("F2"), n("A2")]
    Bb = [n("Bb1"), n("D2"), n("F2")]
    C = [n("C2"), n("E2"), n("G2")]
    prog = [Dm, Dm, Bb, C] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # relentless 7/8: kick on 0/3/5, snare on the 2s, hats on all
        for k in (0, 3, 5):
            drums.kick(b + k, vel=0.95)
        for k in (1, 2, 4, 6):
            drums.snare(b + k, vel=0.6)
        for k in range(7):
            drums.hat(b + k, vel=0.3)
        if i % 4 == 3:
            drums.crash(b, vel=0.5)
        # chugging bass riff on the root
        for k in range(7):
            bass.bass(b + k, root, 0.9, vel=0.85, cutoff=700)
        # brass stabs on the accents
        for k in (0, 3, 5):
            for m in ch:
                brass.brass(b + k, m + 12, 0.8, vel=0.5)
    # original urgent lead: short stabbed phrases in the gaps
    line = [
        (0, "D5", 0.5), (0.5, "C5", 0.5), (1, "D5", 0.5),
        (3, "F5", 1.0), (4, "E5", 0.5), (4.5, "D5", 0.5),
        (7, "C5", 0.5), (7.5, "A4", 1.0), (9, "Bb4", 1.0),
        (10, "A4", 1.5),
    ]
    for start in (bar(4), bar(12)):
        for off, note, d in line:
            lead.lead(start + off, n(note), d, vel=0.85,
                      vibrato=7.0, vib_depth=7.0)

    stems = {"drums": drums, "bass": bass, "brass": brass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("convoy-ambush", stems,
            {"drums": 1.0, "bass": 0.95, "brass": 0.85, "lead": 0.9}, True)


# ============================================================ CITY HALL
# Civic dignity: a small formal chamber piece, F major, 76 BPM. 12 bars. Arc.
def city_hall():
    bpm = 76
    bars = 12
    total = bars * 4
    pluckt = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F3"), n("A3"), n("C4")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    prog = [F, Bb, F, C, Dm, Bb, F, C, F, Bb, C, F]

    for i, ch in enumerate(prog):
        b = bar(i)
        # hymn-like plucked chords, quarter-note tread
        for q, m in enumerate([ch[0], ch[1], ch[2], ch[1]]):
            pluckt.pluck(b + q, m + 12, 1.2, vel=0.55)
        bass.bass(b, ch[0] - 12, 3.5, vel=0.7, cutoff=500)
        # restrained brass chorale enters halfway
        if i >= 6:
            for m in ch:
                brass.brass(b, m, 3.8, vel=0.42)
    # original dignified melody: long arching line over bars 2-9
    melody = [
        (0, "F4", 2.0), (2, "A4", 2.0), (4, "C5", 3.0),
        (8, "Bb4", 2.0), (10, "A4", 2.0), (12, "G4", 3.0),
        (16, "F4", 2.0), (18, "G4", 1.0), (19, "A4", 1.0),
        (20, "G4", 2.0), (22, "F4", 4.0),
    ]
    for off, note, d in melody:
        lead.lead(bar(2) + off, n(note), d, vel=0.8,
                  vibrato=4.0, vib_depth=6.0)

    stems = {"pluck": pluckt, "bass": bass, "brass": brass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("city-hall", stems,
            {"pluck": 0.95, "bass": 0.8, "brass": 0.85, "lead": 1.0}, False)


# ============================================================ WASTELAND
# Desolate open space: wind, sub rumble, distant notes. 60 BPM. 12 bars. Arc.
def wasteland():
    bpm = 60
    bars = 12
    total = bars * 4
    windt = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    for i in range(bars):
        b = bar(i)
        # endless wind, swelling slightly in the middle
        windt.wind(b, 4, vel=0.55 if 3 <= i < 9 else 0.4)
        # sub-bass rumble on A, barely there
        bass.bass(b, n("A0"), 4, vel=0.5, cutoff=220)
    # original: a few distant plucked notes, long silences between
    notes = [
        (0, "A4", 4.0), (12, "E5", 5.0),
        (24, "G4", 4.0), (32, "A4", 6.0),
        (40, "E4", 5.0),
    ]
    for off, note, d in notes:
        pluckt.pluck(off, n(note), d, vel=0.55)
    # distant thunder: soft taiko rolls far apart
    for b in (bar(3), bar(7), bar(10)):
        drums.taiko(b, vel=0.35)
        drums.taiko(b + 1.5, vel=0.25)
    # high cold shimmer near the end
    for off, note in ((42, "A5"), (44, "E6")):
        pluckt.pluck(off, n(note), 4.0, vel=0.3)

    stems = {"wind": windt, "bass": bass, "pluck": pluckt, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("wasteland", stems,
            {"wind": 1.0, "bass": 0.8, "pluck": 0.9, "drums": 0.7}, False)


# ============================================================ VICTORY PARADE
# Celebratory street march, Bb major, 120 BPM. 16 bars. Loop.
def victory_parade():
    bpm = 120
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Bb = [n("Bb2"), n("D3"), n("F3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    F = [n("F2"), n("A2"), n("C3")]
    Cm = [n("C3"), n("Eb3"), n("G3")]
    prog = [Bb, Eb, Bb, F, Bb, Eb, Cm, F] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # march snare: 16th-ish street beat with accents
        for k in range(8):
            vel = 0.8 if k % 2 == 0 else 0.45
            drums.snare(b + k * 0.5, vel=vel)
        drums.kick(b, vel=0.9)
        drums.kick(b + 2, vel=0.75)
        if i % 4 == 0:
            drums.crash(b, vel=0.45)
        # oom-pah bass
        bass.bass(b, root - 12, 1.0, vel=0.85, cutoff=600)
        bass.bass(b + 2, root - 5, 1.0, vel=0.7, cutoff=600)
        # full brass on the chord, off-beat pah
        for m in ch:
            brass.brass(b + 1, m, 0.9, vel=0.5)
            brass.brass(b + 3, m, 0.9, vel=0.5)
    # original march melody: bright, stepwise, singable
    march = [
        (0, "Bb4", 0.5), (0.5, "D5", 0.5), (1, "F5", 1.0),
        (2, "Eb5", 0.5), (2.5, "D5", 0.5), (3, "C5", 1.0),
        (4, "Bb4", 1.0), (5, "C5", 0.5), (5.5, "D5", 0.5),
        (6, "Eb5", 1.5), (7.5, "D5", 0.5),
        (8, "C5", 0.5), (8.5, "Bb4", 0.5), (9, "A4", 1.0),
        (10, "Bb4", 2.0),
    ]
    for start in (bar(0), bar(8)):
        for off, note, d in march:
            lead.lead(start + off, n(note), d, vel=0.88,
                      vibrato=5.5, vib_depth=5.0)

    stems = {"drums": drums, "brass": brass, "bass": bass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("victory-parade", stems,
            {"drums": 1.0, "brass": 0.95, "bass": 0.9, "lead": 1.0}, True)


# ============================================================ render
def mix_track4(name, stems, gains, reverb_wet=0.18, loop=False):
    """Sum stems -> stereo mix with reverb + limiter. Saves mix + stems.
    loop=True crossfades each stem's tail into its head AND the reverbed
    mix's tail into its head (sample-exact loop). Returns (dur, peak)."""
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
    # QC: sample-exact loop means last sample == first sample, exactly
    loop_err = 0.0
    if loop:
        loop_err = float(max(np.max(np.abs(stereo[-1] - stereo[0])), 0.0))
        assert loop_err == 0.0, f"{name}: loop not sample-exact ({loop_err})"
    print(f"{name}: {dur:.1f}s peak={peak:.3f} rms={rms:.3f} "
          f"{'loop' if loop else 'arc'} loop_err={loop_err:.1e} -> {path}")
    return dur, peak


def to_mp3():
    """Encode every wav in out/ to mp3 (mixes + stems)."""
    for fname in sorted(os.listdir(OUT)):
        if not fname.endswith(".wav"):
            continue
        src = os.path.join(OUT, fname)
        # victory-parade-mix.wav -> victory-parade.mp3 ;
        # victory-parade-stem-drums.wav -> victory-parade-stem-drums.mp3
        base = fname[:-4]
        if base.endswith("-mix"):
            base = base[:-4]
        dst = os.path.join(MP3, base + ".mp3")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src,
                        "-codec:a", "libmp3lame", "-b:a", "192k", dst],
                       check=True)
    n = len([f for f in os.listdir(MP3) if f.endswith(".mp3")])
    print(f"encoded {n} mp3s -> {MP3}")


TRACKS = [
    (border_crossing, 0.16),
    (homestead, 0.20),
    (convoy_ambush, 0.14),
    (city_hall, 0.22),
    (wasteland, 0.24),
    (victory_parade, 0.14),
]


def main():
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        mix_track4(name, stems, gains, reverb_wet=wet, loop=loop)
    to_mp3()


if __name__ == "__main__":
    main()
