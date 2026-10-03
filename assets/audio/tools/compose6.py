"""Sixth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-5 moods already covered - do not duplicate):
  winter-siege, iron-rain, ghost-town, smugglers-den, dawn-assault, homecoming.
Render: python3 compose6.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it). Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/game-music")
from synth import Track, reverb_stereo, limiter, write_wav, SR

OUT = "/home/hatch/workspace/staging/music6/out"
MP3 = "/home/hatch/workspace/staging/music6/out/mp3"
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


# ============================================================ WINTER SIEGE
# Snow/ice campaign: brittle, cold, military. F# minor, 85 BPM. 12 bars. Loop.
def winter_siege():
    bpm = 85
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D2"), n("F#2"), n("A2")]
    A = [n("A1"), n("C#2"), n("E2")]
    E = [n("E2"), n("G#2"), n("B2")]
    prog = [Fsm, Fsm, D, D, A, A, E, E, Fsm, D, A, E]

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # muffled war march in snow: soft taiko tread, heartbeat kick
        drums.taiko(b, vel=0.55)
        drums.taiko(b + 2, vel=0.42)
        drums.kick(b + 1, vel=0.4)
        drums.kick(b + 3, vel=0.4)
        # ice-crack ticks: sparse bright hats
        for k in (0.5, 2.5, 3.5):
            drums.hat(b + k, vel=0.16)
        if i % 4 == 0:
            drums.crash(b, vel=0.28)
        # frozen drone: long low root, one per 2 bars
        if i % 2 == 0:
            bass.bass(b, root - 12, 8, vel=0.62, cutoff=240)
    # original brittle ice-plucks: high crystalline fragments
    ice = [
        (0, "C#6", 2.0), (3, "B5", 2.0), (6, "A5", 3.0), (10, "G#5", 2.0),
        (16, "A5", 2.0), (19, "C#6", 3.0), (23, "B5", 4.0),
        (28, "E6", 2.0), (31, "D6", 2.0), (34, "C#6", 3.0), (38, "B5", 4.0),
    ]
    for off, note, d in ice:
        pluckt.pluck(bar(0) + off, n(note), d, vel=0.44)
    # original cold signal calls: military horn in the white-out
    calls = [
        (0, "F#4", 3.0), (4, "C#5", 3.0), (8, "A4", 4.0),
        (16, "E5", 3.0), (20, "D5", 3.0), (24, "C#5", 5.0),
        (32, "F#5", 4.0), (37, "E5", 3.0), (41, "C#5", 4.0),
    ]
    for off, note, d in calls:
        lead.lead(bar(0) + off, n(note), d, vel=0.66,
                  vibrato=3.5, vib_depth=7.0)

    stems = {"drums": drums, "bass": bass, "pluck": pluckt, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("winter-siege", stems,
            {"drums": 0.95, "bass": 0.9, "pluck": 0.85, "lead": 0.9}, True)


# ============================================================ IRON RAIN
# Artillery bombardment underscore: relentless, industrial. D minor,
# 130 BPM. 16 bars. Loop.
def iron_rain():
    bpm = 130
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
    Gm = [n("G1"), n("Bb1"), n("D2")]
    A = [n("A1"), n("C#2"), n("E2")]
    prog = [Dm, Dm, Bb, Bb, Gm, Gm, A, A] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # shell impacts: taiko booms on irregular deterministic accents
        hit1 = (i * 1.7) % 4
        hit2 = (hit1 + 2.3) % 4
        drums.taiko(b + hit1, vel=0.95)
        drums.taiko(b + hit2, vel=0.7)
        # relentless drive: 8th kicks, backbeat snare, 8th hats
        for k in range(8):
            drums.kick(b + k * 0.5, vel=0.75)
        drums.snare(b + 1, vel=0.85)
        drums.snare(b + 3, vel=0.85)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.34)
        drums.crash(b + hit1, vel=0.45)
        # grinding 8th-note bass ostinato on the root
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.45, vel=0.88, cutoff=620)
        # dark brass stabs, syncopated off the shell hits
        for m in ch:
            brass.brass(b + 0.5, m + 12, 1.2, vel=0.5)
            brass.brass(b + 2.5, m + 12, 1.2, vel=0.5)
    # original grinding descent: heavy chromatic-weighted line
    grind = [
        (0, "D5", 1.0), (1, "C5", 1.0), (2, "Bb4", 1.0), (3, "A4", 2.0),
        (6, "G4", 1.0), (7, "A4", 1.0), (8, "Bb4", 2.0), (11, "A4", 2.0),
        (14, "F5", 1.0), (15, "E5", 1.0), (16, "D5", 1.0), (17, "C5", 1.0),
        (18, "D5", 2.0), (21, "C5", 1.0), (22, "Bb4", 1.0), (23, "A4", 2.0),
    ]
    for start in (bar(0), bar(8)):
        for off, note, d in grind:
            lead.lead(start + off, n(note), d, vel=0.85,
                      vibrato=5.0, vib_depth=10.0)

    stems = {"drums": drums, "bass": bass, "brass": brass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("iron-rain", stems,
            {"drums": 1.0, "bass": 0.95, "brass": 0.85, "lead": 0.9}, True)


# ============================================================ GHOST TOWN
# Abandoned settlement: hollow, eerie. E minor, 65 BPM. 12 bars. Arc.
def ghost_town():
    bpm = 65
    bars = 12
    total = bars * 4
    windt = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    lead = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    for i in range(bars):
        b = bar(i)
        # hollow wind gusts through empty streets, keening mid-piece;
        # gaps between gusts keep the town feeling empty
        if i % 4 != 3 or i == 11:
            windt.wind(b, 4, vel=0.42 if 4 <= i < 8 else 0.3)
    # deep empty drone, breathing every 4 bars (8 beats on, 8 off)
    for i in (0, 4, 8):
        bass.bass(bar(i), n("E0"), 8, vel=0.35, cutoff=190)
    # original creaking plucks: sparse, detuned-feel low line
    creak = [
        (2, "E5", 4.0), (9, "D5", 3.0), (13, "C5", 4.0), (15, "D5", 3.0),
        (22, "B4", 5.0), (30, "A4", 4.0), (37, "G4", 5.0), (44, "E5", 6.0),
    ]
    for off, note, d in creak:
        pluckt.pluck(bar(0) + off, n(note), d, vel=0.4)
    # original hollow bells: distant, entering at bar 4
    bells = [
        (0, "B4", 4.0), (6, "E5", 5.0), (13, "G5", 4.0), (19, "E5", 6.0),
    ]
    for off, note, d in bells:
        lead.lead(bar(4) + off, n(note), d, vel=0.42,
                  vibrato=2.5, vib_depth=5.0)
    # a single distant collapse at bar 8
    drums.taiko(bar(8), vel=0.3)
    drums.taiko(bar(8) + 2.5, vel=0.18)

    stems = {"wind": windt, "bass": bass, "pluck": pluckt,
             "lead": lead, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("ghost-town", stems,
            {"wind": 0.7, "bass": 0.7, "pluck": 0.9,
             "lead": 0.85, "drums": 0.7}, False)


# ============================================================ SMUGGLERS DEN
# Shady dealings: sneaky slinking groove. B minor, 95 BPM. 16 bars. Loop.
def smugglers_den():
    bpm = 95
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Bm = [n("B1"), n("D2"), n("F#2")]
    G = [n("G1"), n("B1"), n("D2")]
    A = [n("A1"), n("C#2"), n("E2")]
    Fs = [n("F#1"), n("A#1"), n("C#2")]
    prog = [Bm, G, A, Fs] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # sneaky kit: syncopated kick, soft backbeat, swung 8th hats
        drums.kick(b, vel=0.8)
        drums.kick(b + 2.5, vel=0.65)
        drums.snare(b + 1, vel=0.55)
        drums.snare(b + 3, vel=0.55)
        for k in range(8):
            swing = 0.07 if k % 2 == 1 else 0.0
            drums.hat(b + k * 0.5 + swing, vel=0.28)
        if i % 8 == 7:
            drums.crash(b, vel=0.3)
        # slinking chromatic walk: root, fifth, approach tones
        walk = [root, root + 7, root + 6, root + 5,
                root + 7, root, root + 2, root + 3]
        for k, m in enumerate(walk):
            bass.bass(b + k * 0.5, m, 0.42, vel=0.8, cutoff=560)
        # muted comping: short off-beat chops
        for k in (0.5, 1.5, 2.5, 3.5):
            pluckt.pluck(b + k, ch[1] + 12, 0.6, vel=0.38)
    # original slinky motif: chromatic slither with a taunting fall
    slink = [
        (0, "B4", 0.75), (1, "C5", 0.5), (1.75, "B4", 0.75), (3, "A4", 1.0),
        (4.5, "G4", 0.5), (5, "F#4", 0.5), (6, "G4", 1.0), (8, "A4", 2.0),
        (12, "D5", 0.75), (13, "C#5", 0.5), (13.75, "C5", 0.5),
        (14.5, "B4", 1.5),
    ]
    for v, start in enumerate((bar(0), bar(4), bar(8), bar(12))):
        for off, note, d in slink:
            m = n(note) + (12 if v == 3 else 0)  # octave tease on last pass
            lead.lead(start + off, m, d, vel=0.8,
                      vibrato=6.5, vib_depth=9.0)

    stems = {"drums": drums, "bass": bass, "pluck": pluckt, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("smugglers-den", stems,
            {"drums": 0.95, "bass": 0.95, "pluck": 0.85, "lead": 0.9}, True)


# ============================================================ DAWN ASSAULT
# Sunrise attack: hope into fury. A minor -> A major, 110 BPM. 16 bars. Arc.
def dawn_assault():
    bpm = 110
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    # bars 0-7: A minor tension; bars 8-15: A major fury
    Am = [n("A1"), n("C2"), n("E2")]
    F = [n("F1"), n("A1"), n("C2")]
    C = [n("C2"), n("E2"), n("G2")]
    G = [n("G1"), n("B1"), n("D2")]
    A = [n("A1"), n("C#2"), n("E2")]
    D = [n("D2"), n("F#2"), n("A2")]
    E = [n("E2"), n("G#2"), n("B2")]
    minor_prog = [Am, F, C, G, Am, F, G, G]
    major_prog = [A, D, E, A, A, D, E, E]

    for i in range(8):
        b = bar(i)
        ch = minor_prog[i]
        root = ch[0]
        # gathering storm: sparse taiko, single kicks, no snare yet
        drums.taiko(b, vel=0.6 + i * 0.04)
        drums.kick(b + 2, vel=0.55)
        for k in range(4):
            drums.hat(b + k, vel=0.2 + i * 0.015)
        bass.bass(b, root, 3.5, vel=0.7, cutoff=420)
    for i in range(8):
        b = bar(8 + i)
        ch = major_prog[i]
        root = ch[0]
        # the charge: full war drums
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
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.45, vel=0.9, cutoff=700)
        # triumphant brass stabs on the major chords
        for m in ch:
            brass.brass(b, m + 12, 1.8, vel=0.55)
            brass.brass(b + 2, m + 12, 1.8, vel=0.55)
    # original minor lament (bars 2-7)
    lament = [
        (0, "E5", 2.0), (2, "D5", 2.0), (4, "C5", 3.0), (8, "B4", 2.0),
        (10, "A4", 3.0), (14, "G4", 2.0), (16, "A4", 4.0),
    ]
    for off, note, d in lament:
        lead.lead(bar(2) + off, n(note), d, vel=0.72,
                  vibrato=4.5, vib_depth=7.0)
    # original major anthem (bars 8-15): the same contour, lifted to major
    anthem = [
        (0, "A4", 1.0), (1, "C#5", 1.0), (2, "E5", 1.5), (3.5, "D5", 0.5),
        (4, "C#5", 1.0), (5, "B4", 1.0), (6, "A4", 2.0),
        (8, "E5", 1.0), (9, "F#5", 1.0), (10, "G#5", 1.5), (11.5, "E5", 0.5),
        (12, "D5", 1.0), (13, "C#5", 1.0), (14, "B4", 2.0), (16, "A4", 4.0),
    ]
    for off, note, d in anthem:
        lead.lead(bar(8) + off, n(note), d, vel=0.9,
                  vibrato=5.5, vib_depth=6.0)

    stems = {"drums": drums, "bass": bass, "brass": brass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("dawn-assault", stems,
            {"drums": 1.0, "bass": 0.95, "brass": 0.9, "lead": 0.95}, False)


# ============================================================ HOMECOMING
# War's end: weary warmth. C major, 80 BPM. 12 bars. Arc.
def homecoming():
    bpm = 80
    bars = 12
    total = bars * 4
    pluckt = Track(bpm, total)
    bass = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    C = [n("C3"), n("E3"), n("G3")]
    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    G = [n("G2"), n("B2"), n("D3")]
    prog = [C, Am, F, G, C, Am, F, G, Am, F, C, G]

    for i, ch in enumerate(prog):
        b = bar(i)
        # tired heartbeat, every 2 bars
        if i % 2 == 0:
            drums.taiko(b, vel=0.4)
            drums.taiko(b + 2, vel=0.3)
        # soft roots, unhurried
        bass.bass(b, ch[0] - 12, 3.0, vel=0.55, cutoff=380)
        # warm low pads, one per 4 bars
        if i % 4 == 0:
            pads.pad(b, ch, 16, vel=0.4, attack=2.5, cutoff=2000)
    # original weary fingerpick: descending phrases that keep trying to rise
    weary = [
        (0, "G4", 2.0), (2, "E4", 2.0), (4, "D4", 3.0), (8, "C4", 4.0),
        (12, "E4", 2.0), (14, "G4", 2.0), (16, "A4", 3.0), (20, "G4", 4.0),
        (24, "F4", 2.0), (26, "E4", 2.0), (28, "D4", 3.0), (32, "C4", 6.0),
    ]
    for off, note, d in weary:
        pluckt.pluck(bar(0) + off, n(note), d, vel=0.48)
    # original tired horn: bittersweet answer, enters at bar 4
    answer = [
        (0, "C5", 3.0), (4, "B4", 2.0), (6, "A4", 3.0), (10, "G4", 4.0),
        (16, "A4", 3.0), (20, "G4", 4.0), (24, "E4", 6.0),
    ]
    for off, note, d in answer:
        lead.lead(bar(4) + off, n(note), d, vel=0.7,
                  vibrato=3.5, vib_depth=6.0)

    stems = {"pluck": pluckt, "bass": bass, "pads": pads,
             "lead": lead, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("homecoming", stems,
            {"pluck": 1.0, "bass": 0.8, "pads": 0.7,
             "lead": 0.95, "drums": 0.7}, False)


# ============================================================ render
def mix_track6(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (winter_siege, 0.20),
    (iron_rain, 0.13),
    (ghost_town, 0.18),
    (smugglers_den, 0.15),
    (dawn_assault, 0.14),
    (homecoming, 0.22),
]


def main():
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        mix_track6(name, stems, gains, reverb_wet=wet, loop=loop)
    to_mp3()


if __name__ == "__main__":
    main()
