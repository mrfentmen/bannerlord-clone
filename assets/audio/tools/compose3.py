"""Third batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-2 live in compose.py / staging/music2/compose2.py -
do not duplicate those moods):
  siege-preparation, tavern-rest, betrayal, coronation, desert-march,
  funeral-march.
Render: python3 compose3.py  -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it). Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/game-music")
from synth import Track, reverb_stereo, limiter, write_wav, SR

OUT = "/home/hatch/workspace/staging/music3/out"
MP3 = "/home/hatch/workspace/staging/music3/out/mp3"
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


# ============================================================ SIEGE PREPARATION
# Dark war-drum buildup before an assault, D minor, 100 BPM. 16 bars. Loop.
def siege_preparation():
    bpm = 100
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D2"), n("A2"), n("D3"), n("F3")]
    Bb = [n("Bb1"), n("F2"), n("Bb2"), n("D3")]
    Gm = [n("G2"), n("D3"), n("G3"), n("Bb3")]
    A = [n("A1"), n("E2"), n("A2"), n("C#3")]
    prog = [Dm, Dm, Bb, Bb, Gm, Gm, A, A] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # relentless taiko 8ths, accents on 1 and the "and" of 3
        for k in range(8):
            vel = 0.95 if k in (0, 6) else 0.55
            drums.taiko(b + k * 0.5, vel=vel)
        drums.snare(b + 3.5, vel=0.4)  # dragged rim click
        # low brass pedal on the root, swells each 2 bars
        brass.brass(b, root, 3.8, vel=0.55)
        brass.brass(b, root + 7, 3.8, vel=0.4)
        # rising dread pad
        pads.pad(b, [m + 12 for m in ch], 4, vel=0.5,
                 attack=1.5, cutoff=1600)
        if i % 8 == 7:
            drums.crash(b + 3.5, vel=0.5)
    # original horn motif: short-long calls over bars 8-11 and 12-15
    motif = [(0, "D4", 1.0), (1.5, "F4", 1.0), (3, "E4", 2.0),
             (6, "C4", 1.0), (7.5, "D4", 2.5)]
    for start in (bar(8), bar(12)):
        for off, note, d in motif:
            lead.lead(start + off, n(note), d, vel=0.8,
                      vibrato=5.0, vib_depth=8.0)

    stems = {"drums": drums, "brass": brass, "pads": pads, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("siege-preparation", stems,
            {"drums": 1.0, "brass": 0.9, "pads": 0.75, "lead": 0.95}, True)


# ============================================================ TAVERN REST
# Warm folk waltz for the safe haven, G major 3/4, 92 BPM. 24 bars. Loop.
def tavern_rest():
    bpm = 92
    beats_per_bar = 3
    bars = 24
    total = bars * beats_per_bar
    pluckt = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * beats_per_bar

    G = [n("G2"), n("B2"), n("D3")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    Em = [n("E2"), n("G2"), n("B2")]
    prog = [G, C, G, D, G, C, G, D, G, Em, C, D] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        bass.bass(b, root - 12, 1.0, vel=0.8, cutoff=600)  # beat 1
        # after-beats: soft plucked chord on 2 and 3
        for off in (1, 2):
            for m in ch:
                pluckt.pluck(b + off, m + 12, 0.9, vel=0.4)
    # original waltz melody, phrases over bars 0-5, 6-11, 12-17, 18-23
    phrase = [
        (0, "D5", 1.0), (1, "B4", 1.0), (2, "G4", 1.0),
        (3, "A4", 1.5), (4.5, "B4", 1.5),
        (6, "C5", 1.0), (7, "B4", 1.0), (8, "A4", 1.0),
        (9, "G4", 2.0), (11, "D4", 1.0),
    ]
    for start in (bar(0), bar(6), bar(12), bar(18)):
        for off, note, d in phrase:
            pluckt.pluck(start + off, n(note), d + 0.5, vel=0.65)
    # warm pad underpinning, one chord per 2 bars
    for i in range(0, bars, 2):
        pads.pad(bar(i), [m + 12 for m in prog[i]], 6, vel=0.4,
                 attack=1.2, cutoff=2200)

    stems = {"pluck": pluckt, "pads": pads, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("tavern-rest", stems,
            {"pluck": 1.0, "pads": 0.7, "bass": 0.85}, True)


# ============================================================ BETRAYAL
# Cold cutscene cue: treachery revealed, A minor, 70 BPM. 12 bars. Arc.
def betrayal():
    bpm = 70
    bars = 12
    total = bars * 4
    pluckt = Track(bpm, total)
    pads = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    # uneasy cluster: A minor with a flat-2 rub
    cluster = [n("A1"), n("Bb1"), n("E2"), n("A2")]
    for i in range(bars):
        b = bar(i)
        pads.pad(b, cluster, 4, vel=0.45, attack=2.0, cutoff=1200)
        windt.wind(b, 4, vel=0.5 if i < 8 else 0.8)
    # original sparse motif: single notes, long silences, slight build
    notes = [
        (0, "E5", 2.0), (8, "C5", 2.5),
        (16, "B4", 2.0), (24, "Bb4", 3.0),
        (32, "A4", 2.0), (36, "Bb4", 1.0), (38, "A4", 4.0),
    ]
    for off, note, d in notes:
        pluckt.pluck(off, n(note), d, vel=0.7)
    # final cold shimmer: high harmonic-ish plucks
    for off, note in ((40, "E6"), (42, "A5"), (44, "E6")):
        pluckt.pluck(off, n(note), 3.0, vel=0.35)

    stems = {"pluck": pluckt, "pads": pads, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("betrayal", stems,
            {"pluck": 1.0, "pads": 0.85, "wind": 0.8}, False)


# ============================================================ CORONATION
# Stately processional for claiming power, C major, 100 BPM. 16 bars. Loop.
def coronation():
    bpm = 100
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("G3"), n("C4"), n("E4")]
    F = [n("F2"), n("C3"), n("F3"), n("A3")]
    G = [n("G2"), n("D3"), n("G3"), n("B3")]
    prog = [C, F, C, G] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # timpani: quarter-note processional tread
        for q in range(4):
            drums.tom(b + q, freq=72, vel=0.85 if q == 0 else 0.6)
        drums.crash(b, vel=0.3)
        # full brass chorale on the chord
        for m in ch:
            brass.brass(b, m, 3.8, vel=0.5)
    # original fanfare motif: rising fourths/fifths, bars 4-7 and 12-15
    fanfare = [
        (0, "C4", 0.5), (0.5, "F4", 0.5), (1, "G4", 1.0),
        (2, "C5", 1.5), (3.5, "G4", 0.5),
        (4, "A4", 0.5), (4.5, "G4", 0.5), (5, "F4", 1.0),
        (6, "E4", 1.0), (7, "D4", 1.0), (8, "C4", 2.0),
    ]
    for start in (bar(4), bar(12)):
        for off, note, d in fanfare:
            lead.lead(start + off, n(note), d, vel=0.9,
                      vibrato=4.0, vib_depth=5.0)

    stems = {"drums": drums, "brass": brass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("coronation", stems,
            {"drums": 0.9, "brass": 1.0, "lead": 1.0}, True)


# ============================================================ DESERT MARCH
# Caravan groove, E phrygian-dominant, 104 BPM. 16 bars. Loop.
def desert_march():
    bpm = 104
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    pads = Track(bpm, total)

    def bar(i):
        return i * 4

    # E phrygian dominant: E F G# A B C D
    E, F, Gsh, A = n("E2"), n("F2"), n("G#2"), n("A2")
    prog = [E, E, F, E, Gsh, F, E, A] * 2

    for i, root in enumerate(prog):
        b = bar(i)
        # darbuka-ish pattern: doum (taiko) + tek/ka (snare/hat)
        drums.taiko(b, vel=0.9)            # doum
        drums.snare(b + 0.75, vel=0.5)     # tek
        drums.snare(b + 1.0, vel=0.35)     # ka
        drums.taiko(b + 1.5, vel=0.7)      # doum
        drums.snare(b + 2.25, vel=0.5)     # tek
        drums.taiko(b + 2.5, vel=0.8)      # doum
        drums.snare(b + 3.0, vel=0.35)
        drums.snare(b + 3.5, vel=0.5)
        for k in range(8):                 # shaker 8ths
            drums.hat(b + k * 0.5, vel=0.28)
        # bass drone on E with root movement
        bass.bass(b, n("E1"), 3.5, vel=0.85, cutoff=500)
        bass.bass(b, root, 0.5, vel=0.7, cutoff=800)
        # desert drone pad
        pads.pad(b, [n("E3"), n("B3"), n("E4")], 4, vel=0.4,
                 attack=1.6, cutoff=1500)
    # original oud-like lead: augmented-2nd flavor, bars 4-7 and 12-15
    line = [
        (0, "E5", 0.5), (0.5, "F5", 0.5), (1, "G#5", 1.0),
        (2, "A5", 0.5), (2.5, "G#5", 0.5), (3, "F5", 1.0),
        (4, "E5", 1.0), (5, "D5", 0.5), (5.5, "C5", 0.5),
        (6, "B4", 1.0), (7, "A4", 1.0), (8, "G#4", 2.0),
    ]
    for start in (bar(4), bar(12)):
        for off, note, d in line:
            lead.pluck(start + off, n(note), d + 0.4, vel=0.7)

    stems = {"drums": drums, "bass": bass, "lead": lead, "pads": pads}
    for s in stems.values():
        s.trim()
    return ("desert-march", stems,
            {"drums": 1.0, "bass": 0.9, "lead": 0.95, "pads": 0.65}, True)


# ============================================================ FUNERAL MARCH
# Solemn procession for the fallen, Bb minor, 60 BPM. 12 bars. Arc.
def funeral_march():
    bpm = 60
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Bbm = [n("Bb1"), n("F2"), n("Bb2"), n("Db3")]
    Gb = [n("Gb1"), n("Db2"), n("Gb2"), n("Bb2")]
    Db = [n("Db2"), n("Ab2"), n("Db3"), n("F3")]
    Fm = [n("F1"), n("C2"), n("F2"), n("Ab2")]
    prog = [Bbm, Bbm, Gb, Db, Bbm, Fm, Bbm, Gb, Db, Fm, Bbm, Bbm]

    for i, ch in enumerate(prog):
        b = bar(i)
        # muffled procession drums: soft kick + dragged snare
        drums.kick(b, vel=0.5)
        drums.snare(b + 2, vel=0.35)
        drums.snare(b + 2.5, vel=0.25)
        # low brass chorale
        for m in ch:
            brass.brass(b, m, 3.9, vel=0.5)
    # original lament: descending line over bars 4-11
    lament = [
        (0, "Db5", 2.0), (2, "C5", 1.5), (3.5, "Bb4", 2.0),
        (6, "Ab4", 2.0), (8, "Gb4", 1.5), (9.5, "F4", 2.0),
        (12, "Eb4", 2.0), (14, "Db4", 3.0),
        (18, "C4", 2.0), (20, "Bb3", 4.0),
    ]
    for off, note, d in lament:
        lead.lead(bar(4) + off, n(note), d, vel=0.85,
                  vibrato=4.5, vib_depth=9.0)
    drums.crash(bar(11), vel=0.4)

    stems = {"drums": drums, "brass": brass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("funeral-march", stems,
            {"drums": 0.85, "brass": 1.0, "lead": 1.0}, False)


# ============================================================ render
def mix_track3(name, stems, gains, reverb_wet=0.18, loop=False):
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
        # open-highway-mix.wav -> open-highway.mp3 ;
        # open-highway-stem-drums.wav -> open-highway-stem-drums.mp3
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
    (siege_preparation, 0.16),
    (tavern_rest, 0.20),
    (betrayal, 0.24),
    (coronation, 0.14),
    (desert_march, 0.16),
    (funeral_march, 0.22),
]


def main():
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        mix_track3(name, stems, gains, reverb_wet=wet, loop=loop)
    to_mp3()


if __name__ == "__main__":
    main()
