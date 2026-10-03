"""Seventh batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-6 moods already covered - do not duplicate):
  ember-fall, deep-current, war-council, harvest-festival, night-raid,
  founders-hymn.
Render: python3 compose7.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it). Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/game-music")
from synth import Track, reverb_stereo, limiter, write_wav, SR

OUT = "/home/hatch/workspace/staging/music7/out"
MP3 = "/home/hatch/workspace/staging/music7/out/mp3"
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


# ============================================================ EMBER FALL
# Volcanic ash wastes: choking heat, sulfur haze. C# minor, 75 BPM.
# 16 bars. Loop.
def ember_fall():
    bpm = 75
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)
    windt = Track(bpm, total)

    def bar(i):
        return i * 4

    Csm = [n("C#2"), n("E2"), n("G#2")]
    A = [n("A1"), n("C#2"), n("E2")]
    E = [n("E2"), n("G#2"), n("B2")]
    B = [n("B1"), n("D#2"), n("F#2")]
    prog = [Csm, Csm, A, A, E, E, B, B] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # volcano heartbeat: deep slow taiko pulse
        drums.taiko(b, vel=0.85)
        drums.taiko(b + 2, vel=0.6)
        drums.kick(b + 3, vel=0.35)
        # ash crackle: deterministic irregular bright ticks
        for k in range(8):
            if ((i * 5 + k * 3) % 7) < 3:
                drums.hat(b + k * 0.5, vel=0.14)
        if i % 8 == 0:
            drums.crash(b, vel=0.3)
        # molten drone: continuous low root every bar
        bass.bass(b, root - 12, 4, vel=0.7, cutoff=260)
        # eruption stabs: brass chords on phrase turns
        if i % 4 == 2:
            for m in ch:
                brass.brass(b + 1, m + 12, 2.0, vel=0.5)
        # sulfur haze: continuous wind bed keeps the loop alive
        windt.wind(b, 4, vel=0.3)
    # original heat-shimmer line: wide vibrato, scorched contour
    shimmer = [
        (0, "G#4", 3.0), (3, "A4", 2.0), (5, "G#4", 3.0), (8, "E4", 4.0),
        (13, "F#4", 2.0), (15, "E4", 2.0), (17, "D#4", 3.0), (21, "C#4", 4.0),
        (26, "E4", 3.0), (29, "G#4", 2.0), (32, "A4", 4.0), (37, "G#4", 3.0),
        (41, "F#4", 2.0), (43, "E4", 3.0), (47, "D#4", 4.0), (52, "C#4", 6.0),
    ]
    for off, note, d in shimmer:
        lead.lead(bar(0) + off, n(note), d, vel=0.78,
                  vibrato=4.0, vib_depth=12.0)

    stems = {"drums": drums, "bass": bass, "brass": brass,
             "lead": lead, "wind": windt}
    for s in stems.values():
        s.trim()
    return ("ember-fall", stems,
            {"drums": 1.0, "bass": 0.95, "brass": 0.85,
             "lead": 0.9, "wind": 0.7}, True)


# ============================================================ DEEP CURRENT
# Underwater diving: muffled pressure, slow descent. G minor, 60 BPM.
# 12 bars. Arc: surface -> depths -> faint return.
def deep_current():
    bpm = 60
    bars = 12
    total = bars * 4
    windt = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Cm = [n("C3"), n("Eb3"), n("G3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    prog = [Gm, Gm, Cm, Cm, Gm, Dm, Gm, Gm, Cm, Dm, Gm, Gm]

    # pressure drone: deep G root through the whole dive
    for i in range(0, bars, 2):
        bass.bass(bar(i), n("G0"), 8, vel=0.5, cutoff=170)
    # water bed: continuous muffled swells
    for i in range(bars):
        vel = 0.5 if 4 <= i < 8 else 0.32
        windt.wind(bar(i), 4, vel=vel)
    # descent pads: one per 4 bars, muffled
    for i in (0, 4, 8):
        pads.pad(bar(i), prog[i], 16, vel=0.35, attack=3.0, cutoff=1400)
    # original sonar pings: sparse high calls, fading with depth
    pings = [
        (1, "G5", 3.0), (7, "D6", 4.0), (13, "Bb5", 3.0), (20, "G5", 4.0),
        (27, "F5", 3.0), (33, "Eb5", 4.0), (40, "D5", 5.0),
    ]
    for off, note, d in pings:
        pluckt.pluck(bar(0) + off, n(note), d, vel=0.38)
    # original whale-song melody: emerges at bar 4, peaks at bar 6-7
    song = [
        (0, "D5", 4.0), (5, "C5", 3.0), (9, "Bb4", 4.0), (14, "G4", 5.0),
        (20, "A4", 3.0), (24, "Bb4", 4.0), (29, "D5", 5.0),
    ]
    for off, note, d in song:
        lead.lead(bar(4) + off, n(note), d, vel=0.6,
                  vibrato=2.0, vib_depth=14.0)

    stems = {"wind": windt, "bass": bass, "pluck": pluckt,
             "pads": pads, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("deep-current", stems,
            {"wind": 0.58, "bass": 0.5, "pluck": 0.85,
             "pads": 0.45, "lead": 0.72}, False)


# ============================================================ WAR COUNCIL
# Strategy planning: tense deliberation around the map table. E minor,
# 90 BPM. 12 bars. Loop.
def war_council():
    bpm = 90
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    pads = Track(bpm, total)
    brass = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C2"), n("E2"), n("G2")]
    G = [n("G1"), n("B1"), n("D2")]
    D = [n("D2"), n("F#2"), n("A2")]
    prog = [Em, C, G, D] * 3

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # the gavel: single decisive taiko at each phrase opening
        if i % 4 == 0:
            drums.taiko(b, vel=0.8)
            drums.taiko(b + 3.5, vel=0.4)
        # low table-taps: soft kicks marking deliberation beats
        drums.kick(b + 1, vel=0.35)
        drums.kick(b + 3, vel=0.35)
        for k in (0.5, 2.5):
            drums.hat(b + k, vel=0.15)
        # tense hum: continuous low pad bed keeps the loop seamless
        pads.pad(b, ch, 4, vel=0.4, attack=1.2, cutoff=1600)
        # long roots, one per 2 bars
        if i % 2 == 0:
            bass.bass(b, root - 12, 8, vel=0.6, cutoff=330)
        # decisive chord: brass stab closing each 4-bar phrase
        if i % 4 == 3:
            for m in ch:
                brass.brass(b + 2, m + 12, 1.5, vel=0.55)
    # original deliberation motif: questioning rise, unresolved fall
    motif = [
        (0, "E4", 1.0), (1, "G4", 1.0), (2, "B4", 1.5), (4, "A4", 1.0),
        (5, "G4", 1.5), (8, "F#4", 1.0), (9, "G4", 1.0), (10, "E4", 2.0),
    ]
    for v, start in enumerate((bar(0), bar(4), bar(8))):
        for off, note, d in motif:
            m = n(note) + (12 if v == 2 else 0)  # lifted octave, final word
            pluckt.pluck(start + off, m, d, vel=0.52)

    stems = {"drums": drums, "bass": bass, "pluck": pluckt,
             "pads": pads, "brass": brass}
    for s in stems.values():
        s.trim()
    return ("war-council", stems,
            {"drums": 0.85, "bass": 0.85, "pluck": 0.95,
             "pads": 0.7, "brass": 0.8}, True)


# ============================================================ HARVEST FESTIVAL
# Peacetime celebration: joyful folk dance. D major, 115 BPM. 16 bars.
# Arc: solo fiddle -> full dance -> last stomp.
def harvest_festival():
    bpm = 115
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [D, D, G, G, D, D, A, A, D, D, G, G, D, A, D, D]

    # original dance tune: bright D-major reel, stated then doubled
    tune = [
        (0, "D5", 0.5), (0.5, "E5", 0.5), (1, "F#5", 0.5), (1.5, "G5", 0.5),
        (2, "A5", 1.0), (3, "G5", 0.5), (3.5, "F#5", 0.5),
        (4, "E5", 0.5), (4.5, "F#5", 0.5), (5, "D5", 1.0), (6, "D5", 1.0),
        (8, "G5", 0.5), (8.5, "A5", 0.5), (9, "B5", 1.0), (10, "A5", 0.5),
        (10.5, "G5", 0.5), (11, "F#5", 1.0), (12, "E5", 1.0),
        (13, "D5", 1.0), (14, "E5", 0.5), (14.5, "F#5", 0.5), (15, "D5", 1.0),
    ]
    # intro: solo fiddle states the tune once (bars 0-3)
    for off, note, d in tune:
        pluckt.pluck(bar(0) + off, n(note), d, vel=0.5)
    # climax: full band joins at bar 4, tune doubled an octave by whistle
    for v, start in enumerate((bar(4), bar(8))):
        for off, note, d in tune:
            pluckt.pluck(start + off, n(note), d + 0.2, vel=0.62)
            lead.lead(start + off, n(note) + 12, d, vel=0.72,
                      vibrato=6.0, vib_depth=5.0)
    # outro: last statement winds down (bars 12-15), pluck only
    for off, note, d in tune:
        pluckt.pluck(bar(12) + off, n(note), d, vel=0.45)

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        if i < 4:
            # intro: foot stomps only, gathering
            drums.kick(b, vel=0.5)
            drums.kick(b + 2, vel=0.5)
            bass.bass(b, root - 12, 2.0, vel=0.45, cutoff=420)
        elif i < 12:
            # climax: full dance band
            drums.kick(b, vel=0.8)
            drums.kick(b + 2, vel=0.8)
            drums.snare(b + 1, vel=0.75)
            drums.snare(b + 3, vel=0.75)
            for k in range(8):
                drums.hat(b + k * 0.5, vel=0.3)
            if i == 4:
                drums.crash(b, vel=0.5)
            # oom-pah: root on 1, fifth on 3
            bass.bass(b, root - 12, 1.5, vel=0.8, cutoff=600)
            bass.bass(b + 2, root - 12 + 7, 1.5, vel=0.7, cutoff=600)
        else:
            # outro: stomps return, final crash
            drums.kick(b, vel=0.6)
            drums.kick(b + 2, vel=0.6)
            drums.snare(b + 1, vel=0.5)
            drums.snare(b + 3, vel=0.5)
            bass.bass(b, root - 12, 2.0, vel=0.55, cutoff=420)
            if i == 15:
                drums.crash(b, vel=0.55)

    stems = {"drums": drums, "bass": bass, "pluck": pluckt, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("harvest-festival", stems,
            {"drums": 1.0, "bass": 0.9, "pluck": 1.0, "lead": 0.9}, False)


# ============================================================ NIGHT RAID
# Stealth night attack: heartbeat tension. F minor, 100 BPM. 16 bars.
# Loop.
def night_raid():
    bpm = 100
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Fm = [n("F2"), n("Ab2"), n("C3")]
    Db = [n("Db2"), n("F2"), n("Ab2")]
    C = [n("C2"), n("E2"), n("G2")]
    Bbm = [n("Bb1"), n("Db2"), n("F2")]
    prog = [Fm, Fm, Db, Db, Fm, Bbm, C, C] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # heartbeat: lub-dub kick through the whole raid
        drums.kick(b, vel=0.9)
        drums.kick(b + 0.75, vel=0.6)
        # distant war drums, barely heard
        drums.taiko(b + 2, vel=0.3)
        # night insects: sparse faint hats
        if (i * 3) % 5 < 2:
            drums.hat(b + 1.5, vel=0.12)
            drums.hat(b + 3.5, vel=0.1)
        # sneaking drone: continuous low root every bar
        bass.bass(b, root - 12, 4, vel=0.65, cutoff=300)
        # shadow steps: short high plucks, irregular
        for k in (0.5, 2.5):
            if ((i * 7 + int(k * 2)) % 9) < 5:
                pluckt.pluck(b + k, ch[2] + 24, 0.8, vel=0.3)
    # original signal calls: two-note owl motifs, sparse and tense
    calls = [
        (0, "C5", 1.0), (1.5, "Bb4", 1.5),
        (16, "Db5", 1.0), (17.5, "C5", 1.5),
        (32, "F5", 1.0), (33.5, "Eb5", 1.5),
        (48, "C5", 1.0), (49.5, "Bb4", 1.5),
    ]
    for off, note, d in calls:
        lead.lead(bar(0) + off, n(note), d, vel=0.62,
                  vibrato=5.0, vib_depth=4.0)

    stems = {"drums": drums, "bass": bass, "pluck": pluckt, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("night-raid", stems,
            {"drums": 1.0, "bass": 0.9, "pluck": 0.8, "lead": 0.85}, True)


# ============================================================ FOUNDERS HYMN
# Faction anthem: proud and soaring. Bb major, 95 BPM. 12 bars.
# Arc: lone call -> full anthem -> final chord.
def founders_hymn():
    bpm = 95
    bars = 12
    total = bars * 4
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Bb = [n("Bb2"), n("D3"), n("F3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    F = [n("F2"), n("A2"), n("C3")]
    prog = [Bb, Bb, Eb, Eb, Bb, Bb, F, F, Bb, Eb, Bb, F]

    # intro: lone brass call over swelling pads (bars 0-3)
    for i in range(4):
        b = bar(i)
        pads.pad(b, prog[i], 4, vel=0.35, attack=2.0, cutoff=2200)
    brass.brass(bar(0), n("Bb3"), 3.0, vel=0.55)
    brass.brass(bar(2), n("D4"), 3.0, vel=0.55)
    # climax: full anthem (bars 4-8)
    for i in range(4, 9):
        b = bar(i)
        ch = prog[i]
        root = ch[0]
        for m in ch:
            brass.brass(b, m + 12, 3.5, vel=0.6)
            brass.brass(b + 2, m + 12, 1.5, vel=0.45)
        drums.taiko(b, vel=0.85)
        drums.taiko(b + 2, vel=0.7)
        for k in range(8):
            drums.kick(b + k * 0.5, vel=0.5)
        drums.snare(b + 1, vel=0.6)
        drums.snare(b + 3, vel=0.6)
        if i == 4:
            drums.crash(b, vel=0.55)
        bass.bass(b, root - 12, 3.5, vel=0.75, cutoff=520)
        pads.pad(b, ch, 4, vel=0.45, attack=1.0, cutoff=2600)
    # outro: resolve to the final held chord (bars 9-11)
    for i in range(9, 12):
        b = bar(i)
        pads.pad(b, prog[i], 4, vel=0.4, attack=1.5, cutoff=2200)
        bass.bass(b, prog[i][0] - 12, 3.5, vel=0.6, cutoff=420)
    for m in Bb:
        brass.brass(bar(11), m + 12, 3.5, vel=0.65)
    drums.taiko(bar(11), vel=0.7)
    drums.crash(bar(11), vel=0.5)
    # original anthem melody: the founding theme
    call = [(0, "Bb4", 2.0), (3, "D5", 2.0)]
    for off, note, d in call:
        lead.lead(bar(0) + off, n(note), d, vel=0.7,
                  vibrato=4.5, vib_depth=5.0)
    anthem = [
        (0, "F5", 1.0), (1, "Eb5", 1.0), (2, "D5", 2.0),
        (4, "C5", 1.0), (5, "D5", 1.0), (6, "Bb4", 3.0),
        (10, "D5", 1.0), (11, "Eb5", 1.0), (12, "F5", 2.0),
        (14, "G5", 1.5), (16, "F5", 2.5),
    ]
    for off, note, d in anthem:
        lead.lead(bar(4) + off, n(note), d, vel=0.9,
                  vibrato=5.0, vib_depth=6.0)

    stems = {"brass": brass, "drums": drums, "bass": bass,
             "pads": pads, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("founders-hymn", stems,
            {"brass": 0.95, "drums": 0.9, "bass": 0.85,
             "pads": 0.7, "lead": 1.0}, False)


# ============================================================ render
def mix_track7(name, stems, gains, reverb_wet=0.18, loop=False):
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
    assert 0.1 <= rms <= 0.3, f"{name}: rms {rms:.3f} out of range"
    assert peak <= 0.95, f"{name}: peak {peak:.3f} over budget"
    assert sil_frac == 0.0, f"{name}: silence gaps {sil_frac:.2%}"
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


TRACKS = [
    (ember_fall, 0.16),
    (deep_current, 0.24),
    (war_council, 0.15),
    (harvest_festival, 0.16),
    (night_raid, 0.14),
    (founders_hymn, 0.18),
]


def main():
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        mix_path = os.path.join(OUT, f"{name}-mix.wav")
        if os.path.exists(mix_path):
            print(f"{name}: already rendered, skipping")
            continue
        mix_track7(name, stems, gains, reverb_wet=wet, loop=loop)
    to_mp3()


if __name__ == "__main__":
    main()
