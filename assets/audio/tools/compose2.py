"""Second batch of original game music for the Bannerlord-clone web game.
New tracks (batch 1 lives in compose.py - do not duplicate those):
  open-highway, night-city, standoff, muster, dawn-after, pursuit.
Render: python3 compose2.py  -> wav stems + mixes in out2/
Then: ffmpeg to mp3. Pure numpy DSP, no samples."""
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from synth import Track, reverb_stereo, limiter, write_wav, SR
from sfx import _seamless

OUT = os.path.join(os.path.dirname(__file__), "out2")
os.makedirs(OUT, exist_ok=True)

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


# ============================================================ OPEN HIGHWAY
# Driving roots-rock road theme, E major, 130 BPM. 16 bars. Seamless loop.
def open_highway():
    bpm = 130
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    guitar = Track(bpm, total)

    def bar(i):
        return i * 4

    E, A, B = n("E2"), n("A2"), n("B2")
    prog = [E, E, A, E, B, A, E, B] * 2

    for i, root in enumerate(prog):
        b = bar(i)
        # drums: backbeat with driving 8th hats
        drums.kick(b, vel=1.0)
        drums.kick(b + 2, vel=0.9)
        drums.snare(b + 1, vel=1.0)
        drums.snare(b + 3, vel=1.0)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.55 if k % 2 == 0 else 0.35)
        if i % 8 == 7:
            drums.crash(b, vel=0.5)
        # bass: driving 8ths
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.45, vel=0.9, cutoff=1000)
        # power-chord stabs: beat 1 and the "and" of 2
        for off in (0, 1.5):
            guitar.pad(b + off, [root + 12, root + 19, root + 24], 1.4,
                       vel=0.5, attack=0.05, cutoff=3200)
    # pentatonic lead phrases over bars 4-7 and 12-15 (original riff)
    riff = [
        (0, "E4", 0.5), (0.5, "G4", 0.5), (1, "A4", 1.0),
        (2, "B4", 0.5), (2.5, "A4", 0.5), (3, "G4", 1.0),
        (4, "E4", 0.5), (4.5, "D4", 0.5), (5, "E4", 1.5),
        (8, "G4", 0.5), (8.5, "A4", 0.5), (9, "B4", 1.0),
        (10, "D5", 1.0), (11, "B4", 0.5), (11.5, "A4", 0.5),
        (12, "G4", 1.5), (14, "E4", 2.0),
    ]
    for start in (bar(4), bar(12)):
        for off, note, d in riff:
            guitar.lead(start + off, n(note), d, vel=0.9,
                        vibrato=6.5, vib_depth=7.0)

    stems = {"drums": drums, "bass": bass, "guitar": guitar}
    for s in stems.values():
        s.trim()
    return ("open-highway", stems,
            {"drums": 1.0, "bass": 0.95, "guitar": 0.9}, True)


# ============================================================ NIGHT CITY
# Urban synth-noir bed, A minor, 96 BPM. 12 bars. Seamless loop.
def night_city():
    bpm = 96
    bars = 12
    total = bars * 4
    pads = Track(bpm, total)
    arp = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Am9 = [n("A2"), n("E3"), n("B3"), n("C4")]
    Fm9 = [n("F2"), n("C3"), n("Eb3"), n("G3")]
    Cm9 = [n("C3"), n("G3"), n("D4"), n("Eb4")]
    G7s = [n("G2"), n("D3"), n("F3"), n("B3")]
    prog = [Am9, Fm9, Cm9, G7s] * 3

    for i, ch in enumerate(prog):
        b = bar(i)
        pads.pad(b, ch, 4, vel=0.8, attack=1.2, cutoff=1800)
        # 16th-note synth arp on chord tones, two octaves
        tones = ch[1:] + [m + 12 for m in ch[1:]]
        for k in range(16):
            arp.pluck(b + k * 0.25, tones[k % len(tones)], 0.3, vel=0.45)
        # noir groove: soft kick 1/3, rim snare 2/4, 8th hats
        drums.kick(b, vel=0.7)
        drums.kick(b + 2, vel=0.6)
        drums.snare(b + 1, vel=0.45)
        drums.snare(b + 3, vel=0.45)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.3)
    # sparse noir lead motif (original), bars 4-5 and 8-9
    motif = [(0, "E5", 1.5), (2, "D5", 1.0), (3, "C5", 1.5),
             (4, "B4", 2.0), (6, "A4", 2.0)]
    for start in (bar(4), bar(8)):
        for off, note, d in motif:
            arp.lead(start + off, n(note), d, vel=0.55,
                     vibrato=5.0, vib_depth=9.0)

    stems = {"pads": pads, "arp": arp, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("night-city", stems,
            {"pads": 0.9, "arp": 0.85, "drums": 0.75}, True)


# ============================================================ STANDOFF
# Tense western-tinged standoff, E minor, 90 BPM. 12 bars. Seamless loop.
def standoff():
    bpm = 90
    bars = 12
    total = bars * 4
    pluckt = Track(bpm, total)
    drums = Track(bpm, total)
    brass = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E2"), n("B2"), n("E3"), n("G3")]
    C = [n("C2"), n("G2"), n("C3"), n("E3")]
    G = [n("G2"), n("D3"), n("G3"), n("B3")]
    D = [n("D2"), n("A2"), n("D3"), n("F#3")]
    prog = [Em, Em, C, G, Em, D, Em, Em, C, D, Em, Em]

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # western tremolo ostinato: pulsing 8ths on root+E, accents on 1
        for k in range(8):
            vel = 0.75 if k == 0 else 0.42
            pluckt.pluck(b + k * 0.5, root + 24, 0.5, vel=vel)
            if k % 2 == 1:
                pluckt.pluck(b + k * 0.5, root + 31, 0.5, vel=vel * 0.7)
        # low brass swell on chord changes
        brass.brass(b, root + 12, 3.6, vel=0.5)
        brass.brass(b, root + 19, 3.6, vel=0.4)
        # sparse taiko: heartbeat with a dragged second hit
        drums.taiko(b, vel=0.8)
        drums.taiko(b + 2.75, vel=0.55)
        if i % 4 == 3:
            drums.taiko(b + 3.5, vel=0.65)
    # lonely lead line, bars 8-11 (original)
    line = [(0, "B4", 2.5), (3, "A4", 1.5), (4, "G4", 2.5),
            (8, "A4", 1.5), (10, "B4", 1.0), (11, "E5", 3.0)]
    for off, note, d in line:
        pluckt.lead(bar(8) + off, n(note), d, vel=0.7,
                    vibrato=4.5, vib_depth=10.0)

    stems = {"pluck": pluckt, "drums": drums, "brass": brass}
    for s in stems.values():
        s.trim()
    return ("standoff", stems,
            {"pluck": 0.95, "drums": 0.9, "brass": 0.85}, True)


# ============================================================ MUSTER
# Military snare / bugle-call march, Bb major, 120 BPM. 16 bars. Loops.
def muster():
    bpm = 120
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)

    def bar(i):
        return i * 4

    # bugle harmonic series on Bb
    Bb2, F3, Bb3, D4, F4, Bb4 = (n("Bb2"), n("F3"), n("Bb3"),
                                n("D4"), n("F4"), n("Bb4"))
    # original "assembly" call: rising triadic figure + answer
    call = [
        (0.0, Bb3, 0.4), (0.5, D4, 0.4), (1.0, F4, 0.4), (1.5, Bb4, 1.0),
        (3.0, F4, 0.4), (3.5, D4, 0.4),
        (4.0, Bb3, 0.4), (4.5, D4, 0.4), (5.0, F4, 1.0),
        (6.0, D4, 0.5), (6.5, Bb3, 1.5),
    ]

    for i in range(bars):
        b = bar(i)
        # march: kick 1/3, snare quarters with alternating accent,
        # 8th pickups, roll into every 4th bar
        drums.kick(b, vel=1.0)
        drums.kick(b + 2, vel=0.9)
        for q in range(4):
            drums.snare(b + q, vel=0.95 if q % 2 == 0 else 0.55)
            drums.snare(b + q + 0.5, vel=0.35)
        if i % 4 == 3:
            for k in range(8):  # crescendo roll, 16ths
                drums.snare(b + 3 + k * 0.125, vel=0.3 + 0.6 * k / 8)
        if i % 4 == 0:
            drums.crash(b, vel=0.5)
        # low brass root movement: Bb - Eb - Bb - F per 4 bars
        roots = [Bb2, n("Eb3"), Bb2, n("F2")]
        r = roots[(i // 4) % 4]
        brass.brass(b, r, 3.8, vel=0.55)
        brass.brass(b, r + 7, 3.8, vel=0.45)
    # bugle calls at bars 4, 8, 12
    for start in (bar(4), bar(8), bar(12)):
        for off, midi, d in call:
            brass.lead(start + off, midi, d, vel=0.9,
                       vibrato=0.0, vib_depth=0.0)  # straight bugle tone

    stems = {"drums": drums, "brass": brass}
    for s in stems.values():
        s.trim()
    return ("muster", stems, {"drums": 1.0, "brass": 0.95}, True)


# ============================================================ DAWN AFTER
# Hopeful acoustic-leaning resolve, G major, 76 BPM. 12 bars. Has an arc.
def dawn_after():
    bpm = 76
    bars = 12
    total = bars * 4
    pluckt = Track(bpm, total)
    pads = Track(bpm, total)
    drums = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("D3"), n("G3"), n("B3")]
    Em = [n("E2"), n("B2"), n("E3"), n("G3")]
    C = [n("C3"), n("G3"), n("C4"), n("E4")]
    D = [n("D2"), n("A2"), n("D3"), n("F#3")]
    prog = [G, Em, C, D] * 3

    for i, ch in enumerate(prog):
        b = bar(i)
        # fingerpicked arpeggio: root, 3rd, 5th, octave, 5th, 3rd
        pat = [ch[0], ch[2], ch[3], ch[2] + 12, ch[3], ch[2]]
        for k, midi in enumerate(pat):
            pluckt.pluck(b + k * (4 / 6), midi + 12, 1.2, vel=0.6)
        pads.pad(b, ch, 4, vel=0.55, attack=1.8, cutoff=2000)
        if i >= 4:  # rhythm section enters halfway
            drums.kick(b, vel=0.6)
            drums.kick(b + 2, vel=0.5)
            drums.snare(b + 1, vel=0.4)
            drums.snare(b + 3, vel=0.4)
            for k in range(8):
                drums.hat(b + k * 0.5, vel=0.28)
    # hopeful lead statement, bars 8-11 (original)
    line = [
        (0, "D5", 1.5), (1.5, "E5", 1.0), (2.5, "G5", 2.0),
        (4.5, "A5", 1.5), (6, "G5", 1.0), (7, "E5", 1.5),
        (8.5, "D5", 1.5), (10, "B4", 1.0), (11, "D5", 2.0),
        (13, "G5", 3.0),
    ]
    for off, note, d in line:
        lead.lead(bar(8) + off, n(note), d, vel=0.85,
                  vibrato=5.5, vib_depth=6.0)
    drums.crash(bar(8), vel=0.45)
    drums.crash(bar(11), vel=0.6)

    stems = {"pluck": pluckt, "pads": pads, "drums": drums, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("dawn-after", stems,
            {"pluck": 0.9, "pads": 0.8, "drums": 0.7, "lead": 1.0}, False)


# ============================================================ PURSUIT
# High-tension chase: percussion + bass ostinato, D minor, 150 BPM.
# 24 bars. Seamless loop.
def pursuit():
    bpm = 150
    bars = 24
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    D, C, Bb, A = n("D2"), n("C2"), n("Bb1"), n("A1")
    prog = [D, D, C, D, D, Bb, C, A] * 3

    for i, root in enumerate(prog):
        b = bar(i)
        # relentless drums: kick 4-floor, snare 2/4, 16th hats
        for q in range(4):
            drums.kick(b + q, vel=1.0)
        drums.snare(b + 1, vel=1.0)
        drums.snare(b + 3, vel=1.0)
        for k in range(16):
            drums.hat(b + k * 0.25, vel=0.5 if k % 4 == 0 else 0.3)
        if i % 8 == 7:
            drums.crash(b, vel=0.5)
            drums.tom(b + 3.5, freq=140, vel=0.7)
        # 16th-note bass ostinato on root with octave pops
        for k in range(16):
            midi = root + (12 if k % 8 == 6 else 0)
            bass.bass(b + k * 0.25, midi, 0.22, vel=0.9, cutoff=1300)
    # tense lead ostinato: minor-2nd rub (original motif), enters bar 8
    motif = [(0, "D5", 0.25), (0.25, "Eb5", 0.25), (0.5, "D5", 0.25),
             (1.0, "F5", 0.5), (1.5, "E5", 0.25), (1.75, "D5", 0.25),
             (2.0, "C5", 0.5), (2.5, "D5", 0.5), (3.0, "A4", 0.5),
             (3.5, "Bb4", 0.5)]
    for i in range(8, 24):
        b = bar(i)
        for off, note, d in motif:
            lead.lead(b + off, n(note), d, vel=0.85,
                      vibrato=7.0, vib_depth=9.0)

    stems = {"drums": drums, "bass": bass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("pursuit", stems,
            {"drums": 1.0, "bass": 0.95, "lead": 0.9}, True)


# ============================================================ render
def mix_track2(name, stems, gains, reverb_wet=0.18, loop=False):
    """Sum stems -> stereo mix with reverb + limiter. Saves mix + stems.
    loop=True crossfades each stem's tail into its head (sample-exact loop)."""
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
    print(f"{name}: {dur:.1f}s peak={peak:.3f} rms={rms:.3f} "
          f"{'loop' if loop else 'arc'} -> {path}")
    return path


def main():
    for fn, wet in ((open_highway, 0.14), (night_city, 0.22),
                    (standoff, 0.20), (muster, 0.12),
                    (dawn_after, 0.24), (pursuit, 0.12)):
        name, stems, gains, loop = fn()
        mix_track2(name, stems, gains, reverb_wet=wet, loop=loop)


if __name__ == "__main__":
    main()
