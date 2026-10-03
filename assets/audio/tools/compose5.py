"""Fifth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-4 moods already covered - do not duplicate):
  tide-of-war, high-pass, bayou-night, midnight-pursuit, parley, last-stand.
Render: python3 compose5.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it). Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/game-music")
from synth import Track, reverb_stereo, limiter, write_wav, SR

OUT = "/home/hatch/workspace/staging/music5/out"
MP3 = "/home/hatch/workspace/staging/music5/out/mp3"
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


# ============================================================ TIDE OF WAR
# Naval campaign: rolling 6/8 sea shanty groove, E minor, 90 BPM. 12 bars. Loop.
def tide_of_war():
    bpm = 90
    bpb = 6
    bars = 12
    total = bars * bpb
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * bpb

    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C2"), n("E2"), n("G2")]
    G = [n("G1"), n("B1"), n("D2")]
    D = [n("D2"), n("F#2"), n("A2")]
    prog = [Em, Em, C, C, G, G, D, D, Em, C, G, D]

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # rolling 6/8: taiko on 1 and 4, soft snare on the off-accents,
        # hats riding all six beats like spray
        drums.taiko(b, vel=0.85)
        drums.taiko(b + 3, vel=0.7)
        drums.snare(b + 4, vel=0.35)
        for k in range(6):
            drums.hat(b + k, vel=0.22)
        if i % 4 == 0:
            drums.crash(b, vel=0.4)
        # heaving bass: eighth-note roll 1-3-5 / 2-4-1 of the chord
        pat = [ch[0], ch[2], ch[1], ch[0], ch[2], ch[1]]
        for k, m in enumerate(pat):
            bass.bass(b + k, m, 0.9, vel=0.8, cutoff=520)
        # misty pads, one per 2 bars
        if i % 2 == 0:
            pads.pad(b, [m + 12 for m in ch], 12, vel=0.4,
                     attack=2.5, cutoff=1400)
    # original foghorn calls: long tones across the swell
    calls = [(0, "E4", 4.0), (12, "G4", 4.0), (24, "A4", 4.0), (30, "B4", 3.0)]
    for start in (bar(0), bar(6)):
        for off, note, d in calls:
            lead.lead(start + off, n(note), d, vel=0.72,
                      vibrato=4.5, vib_depth=9.0)

    stems = {"drums": drums, "bass": bass, "pads": pads, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("tide-of-war", stems,
            {"drums": 1.0, "bass": 0.95, "pads": 0.65, "lead": 0.85}, True)


# ============================================================ HIGH PASS
# Mountain pass traversal: thin, cold, sparse. A minor, 80 BPM. 12 bars. Arc.
def high_pass():
    bpm = 80
    bars = 12
    total = bars * 4
    windt = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    for i in range(bars):
        b = bar(i)
        # cold mountain wind, keening harder in the middle stretch
        windt.wind(b, 4, vel=0.6 if 4 <= i < 8 else 0.45)
    # deep granite drone, one root every 4 bars
    for i in (0, 4, 8):
        bass.bass(bar(i), n("A0"), 16, vel=0.5, cutoff=200)
    # original: sparse high plucks like ice dripping in a cavern
    echoes = [
        (1, "A5", 3.0), (7, "E6", 4.0),
        (13, "G5", 3.0), (19, "E5", 4.0),
        (25, "C6", 3.0), (31, "B5", 5.0),
        (37, "A5", 6.0),
    ]
    for off, note, d in echoes:
        pluckt.pluck(bar(0) + off, n(note), d, vel=0.5)
    # lonely horn enters at bar 4: original thin ascending line
    line = [
        (0, "A4", 2.0), (2, "C5", 2.0), (4, "B4", 3.0), (7, "A4", 4.0),
        (12, "E5", 2.0), (14, "D5", 2.0), (16, "C5", 3.0), (19, "B4", 5.0),
    ]
    for off, note, d in line:
        lead.lead(bar(4) + off, n(note), d, vel=0.68,
                  vibrato=4.0, vib_depth=8.0)
    # distant rockfall: two soft taiko hits far apart
    drums = Track(bpm, total)
    for b in (bar(5), bar(10)):
        drums.taiko(b, vel=0.28)
        drums.taiko(b + 2, vel=0.2)

    stems = {"wind": windt, "bass": bass, "pluck": pluckt,
             "lead": lead, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("high-pass", stems,
            {"wind": 1.0, "bass": 0.85, "pluck": 0.9,
             "lead": 0.9, "drums": 0.7}, False)


# ============================================================ BAYOU NIGHT
# Swamp stealth: humid drone, creeping. D minor, 70 BPM. 12 bars. Arc.
def bayou_night():
    bpm = 70
    bars = 12
    total = bars * 4
    windt = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    pluckt = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Dm, Bb, Bb, Gm, Gm, Dm, A, Dm, Bb, Gm, A]

    for i in range(bars):
        b = bar(i)
        # humid night air, unbroken
        windt.wind(b, 4, vel=0.5)
        # heartbeat taiko, very soft, every 2 bars
        if i % 2 == 0:
            drums.taiko(b, vel=0.32)
            drums.taiko(b + 2, vel=0.24)
    for i, ch in enumerate(prog):
        b = bar(i)
        # deep slow drone root, two bars at a time
        if i % 2 == 0:
            bass.bass(b, ch[0] - 12, 8, vel=0.6, cutoff=300)
        # dark swamp pads, one per 4 bars
        if i % 4 == 0:
            pads.pad(b, ch, 16, vel=0.42, attack=2.5, cutoff=1100)
    # original creeping plucks: syncopated low line through the murk
    creep = [
        (1, "D4", 2.0), (2.5, "F4", 1.5), (5, "A3", 2.0),
        (9, "C4", 2.0), (10.5, "D4", 1.5), (13, "Bb3", 2.5),
        (17, "A3", 2.0), (18.5, "G3", 1.5), (21, "F3", 3.0),
        (25, "E4", 2.0), (27, "D4", 2.0), (29, "C4", 2.0),
        (33, "A3", 3.0), (37, "D4", 4.0), (41, "F4", 3.0),
        (45, "E4", 4.0),
    ]
    for off, note, d in creep:
        pluckt.pluck(bar(0) + off, n(note), d, vel=0.42)

    stems = {"wind": windt, "bass": bass, "pads": pads,
             "pluck": pluckt, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("bayou-night", stems,
            {"wind": 0.95, "bass": 0.9, "pads": 0.75,
             "pluck": 0.95, "drums": 0.7}, False)


# ============================================================ MIDNIGHT PURSUIT
# Urban night chase: tense pulse. C minor, 120 BPM. 16 bars. Loop.
def midnight_pursuit():
    bpm = 120
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C2"), n("Eb2"), n("G2")]
    Ab = [n("Ab1"), n("C2"), n("Eb2")]
    Bb = [n("Bb1"), n("D2"), n("F2")]
    G = [n("G1"), n("B1"), n("D2")]
    prog = [Cm, Cm, Ab, Bb, Cm, Cm, Bb, G] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # chase beat: driving kick, snare backbeat, 8th hats
        for k in range(4):
            drums.kick(b + k, vel=0.9)
        drums.snare(b + 1, vel=0.75)
        drums.snare(b + 3, vel=0.75)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.3)
        if i % 4 == 0:
            drums.crash(b, vel=0.4)
        # pulsing 8th-note bass ostinato
        ost = [root, root, ch[1], root, ch[2], root, ch[1] - 1, root]
        for k, m in enumerate(ost):
            bass.bass(b + k * 0.5, m, 0.45, vel=0.85, cutoff=650)
        # tense off-beat pad stabs
        pads.pad(b + 0.5, [m + 12 for m in ch], 1.0, vel=0.5,
                 attack=0.05, cutoff=1800)
        pads.pad(b + 2.5, [m + 12 for m in ch], 1.0, vel=0.5,
                 attack=0.05, cutoff=1800)
    # original urgent motif: rising siren-like figure with a fall
    motif = [
        (0, "C5", 0.5), (0.5, "D5", 0.5), (1, "Eb5", 0.5),
        (1.5, "D5", 0.5), (2, "C5", 1.0), (3, "Bb4", 1.0),
        (4, "C5", 0.5), (4.5, "Eb5", 0.5), (5, "G5", 1.0),
        (6, "F5", 0.5), (6.5, "Eb5", 0.5), (7, "D5", 1.0),
    ]
    for v, start in enumerate((bar(0), bar(4), bar(8), bar(12))):
        for off, note, d in motif:
            m = n(note) + (2 if v >= 2 else 0)  # lift in the second half
            lead.lead(start + off, m, d, vel=0.85,
                      vibrato=7.0, vib_depth=8.0)

    stems = {"drums": drums, "bass": bass, "pads": pads, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("midnight-pursuit", stems,
            {"drums": 1.0, "bass": 0.95, "pads": 0.7, "lead": 0.9}, True)


# ============================================================ PARLEY
# Diplomacy: restrained, measured. G major, 75 BPM. 12 bars. Arc.
def parley():
    bpm = 75
    bars = 12
    total = bars * 4
    pluckt = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G3"), n("B3"), n("D4")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    Em = [n("E3"), n("G3"), n("B3")]
    prog = [G, C, G, D, Em, C, G, D, Em, C, D, G]

    for i, ch in enumerate(prog):
        b = bar(i)
        # delicate fingerpick: thumb on 1 and 3, rolling fingers
        bass.bass(b, ch[0] - 12, 1.5, vel=0.6, cutoff=480)
        bass.bass(b + 2, ch[2] - 12, 1.5, vel=0.45, cutoff=480)
        for k, m in enumerate([ch[1], ch[2], ch[1], ch[0]]):
            pluckt.pluck(b + k + 0.5, m + 12, 1.0, vel=0.4)
        # warm low pads, one per 4 bars
        if i % 4 == 0:
            pads.pad(b, ch, 16, vel=0.36, attack=2.5, cutoff=2200)
    # original measured line: statement, pause, answer
    line = [
        (0, "G4", 2.0), (2, "B4", 2.0), (4, "D5", 3.0), (8, "B4", 1.0),
        (12, "A4", 2.0), (14, "G4", 2.0), (16, "F#4", 3.0), (20, "G4", 4.0),
    ]
    for off, note, d in line:
        lead.lead(bar(2) + off, n(note), d, vel=0.75,
                  vibrato=4.5, vib_depth=5.0)
    # a single soft drum at the agreement point
    drums.taiko(bar(8), vel=0.35)

    stems = {"pluck": pluckt, "bass": bass, "pads": pads,
             "lead": lead, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("parley", stems,
            {"pluck": 1.0, "bass": 0.8, "pads": 0.65,
             "lead": 1.0, "drums": 0.7}, False)


# ============================================================ LAST STAND
# Final battle: full ensemble epic. D minor, 140 BPM. 16 bars. Loop.
def last_stand():
    bpm = 140
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D2"), n("F2"), n("A2")]
    Bb = [n("Bb1"), n("D2"), n("F2")]
    F = [n("F1"), n("A1"), n("C2")]
    C = [n("C2"), n("E2"), n("G2")]
    prog = [Dm, Bb, F, C] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # war drums: taiko thunder on 0 and 2, kick driving 8ths,
        # snare cracks on 1 and 3, hats relentless
        drums.taiko(b, vel=0.95)
        drums.taiko(b + 2, vel=0.8)
        for k in range(8):
            drums.kick(b + k * 0.5, vel=0.7)
        drums.snare(b + 1, vel=0.85)
        drums.snare(b + 3, vel=0.85)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.32)
        if i % 2 == 0:
            drums.crash(b, vel=0.5)
        # driving 8th bass on the root
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.45, vel=0.9, cutoff=750)
        # full brass stabs on the chord
        for m in ch:
            brass.brass(b, m + 12, 1.8, vel=0.55)
            brass.brass(b + 2, m + 12, 1.8, vel=0.55)
    # original heroic anthem: bold leaps, stepwise resolve
    anthem = [
        (0, "D5", 1.0), (1, "F5", 1.0), (2, "A5", 1.5),
        (3.5, "G5", 0.5), (4, "F5", 1.0), (5, "E5", 1.0),
        (6, "D5", 2.0),
        (8, "F5", 1.0), (9, "G5", 1.0), (10, "A5", 1.5),
        (11.5, "C6", 0.5), (12, "Bb5", 1.0), (13, "A5", 1.0),
        (14, "G5", 2.0),
    ]
    for start in (bar(0), bar(8)):
        for off, note, d in anthem:
            lead.lead(start + off, n(note), d, vel=0.92,
                      vibrato=6.0, vib_depth=6.0)

    stems = {"drums": drums, "bass": bass, "brass": brass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("last-stand", stems,
            {"drums": 1.0, "bass": 0.95, "brass": 0.9, "lead": 1.0}, True)


# ============================================================ render
def mix_track5(name, stems, gains, reverb_wet=0.18, loop=False):
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
    loop_err = 0.0
    if loop:
        loop_err = float(max(np.max(np.abs(stereo[-1] - stereo[0])), 0.0))
        assert loop_err == 0.0, f"{name}: loop not sample-exact ({loop_err})"
    print(f"{name}: {dur:.1f}s peak={peak:.3f} rms={rms:.3f} "
          f"{'loop' if loop else 'arc'} loop_err={loop_err:.1e} -> {path}")
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


TRACKS = [
    (tide_of_war, 0.16),
    (high_pass, 0.26),
    (bayou_night, 0.24),
    (midnight_pursuit, 0.14),
    (parley, 0.22),
    (last_stand, 0.13),
]


def main():
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        mix_track5(name, stems, gains, reverb_wet=wet, loop=loop)
    to_mp3()


if __name__ == "__main__":
    main()
