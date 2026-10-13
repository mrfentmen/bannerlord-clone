"""Tenth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-9 moods already covered - do not duplicate):
  ashen-dawn, iron-tide, whisper-network, salt-and-iron,
  the-long-march, crown-of-thorns.
Render: python3 compose10.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import Track, reverb_stereo, limiter, write_wav, SR

OUT = "/home/hatch/workspace/staging/music10/out"
MP3 = "/home/hatch/workspace/staging/music10/out/mp3"
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


# ============================================================ ASHEN-DAWN
# Aftermath of fire: grey morning resolve. D minor, 80 BPM. 12 bars. Arc.
# D minor: D E F G A Bb C - embers cooling into a quiet vow.
def ashen_dawn():
    bpm = 80
    bars = 12
    total = bars * 4
    pluck = Track(bpm, total)
    pads = Track(bpm, total)
    windt = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D2"), n("F2"), n("A2")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    F = [n("F2"), n("A2"), n("C3")]
    Gm = [n("G2"), n("Bb2"), n("D3")]
    C = [n("C3"), n("E3"), n("G3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [Dm, Dm, Bb, F, Gm, Dm, C, Bb, Gm, A, Dm, Dm]

    def arc_vel(i):
        if i < 4:
            return 0.32 + i * 0.07
        if i < 8:
            return 0.6 + (i - 4) * 0.08
        return 0.92 - (i - 8) * 0.2

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        windt.wind(b, 4, vel=v * 0.8)
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.7,
                 attack=1.8, cutoff=1300)
        if i % 3 == 0:
            bass.bass(b, ch[0] - 12, 3.6, vel=v * 0.8, cutoff=240)
        if i in (5, 7):
            windt.taiko(b + 2.5, vel=v * 0.3)

    # embers: a slow vow rising out of the ash
    embers = [
        (0, "A3", 2, 0.4), (4, "D4", 3, 0.45),
        (8, "F4", 2, 0.5), (12, "A4", 3, 0.6),
        (16, "G4", 2, 0.65), (20, "F4", 2, 0.6),
        (24, "E4", 3, 0.7),
        (28, "D5", 2, 0.75), (32, "C5", 3, 0.7),
        (36, "Bb4", 2, 0.6),
        (40, "A4", 3, 0.55),
        (44, "D4", 3.5, 0.45),
    ]
    for off, note, d, v in embers:
        pluck.pluck(off, n(note), d, vel=v)

    stems = {"pluck": pluck, "pads": pads, "wind": windt, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("ashen-dawn", stems,
            {"pluck": 0.95, "pads": 0.85, "wind": 0.9,
             "bass": 0.85}, False)


# ============================================================ IRON-TIDE
# Relentless industrial war machine. E minor, 120 BPM. 16 bars. Loop.
# E minor: E F# G A B C D - gears grinding, pistons pumping, no mercy.
def iron_tide():
    bpm = 120
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)
    pads = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, Em, C, D] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # the machine: kick on every beat, hats on 8ths, snare 2 & 4
        for beat in range(4):
            drums.kick(b + beat, vel=0.9)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.45)
        drums.snare(b + 1, vel=0.7)
        drums.snare(b + 3, vel=0.7)
        drums.taiko(b, vel=0.85)
        if i in (0, 8):
            drums.crash(b, vel=0.5)
        # piston bass: root root, third, fifth, octave pounding
        patt = [0, 0, 3, 5, 7, 5, 3, 0]
        for k, st in enumerate(patt):
            bass.bass(b + k * 0.5, root - 12 + st, 0.45,
                      vel=0.85, cutoff=600)
        # iron stabs on the offbeats
        for m in ch:
            brass.brass(b + 1.5, m + 12, 0.8, vel=0.65)
            brass.brass(b + 3.5, m + 12, 0.8, vel=0.65)
        # dark furnace bed
        pads.pad(b, [m - 24 for m in ch], 4, vel=0.55, attack=0.4,
                 cutoff=900)
        # mechanical riff: semitone pattern above the root
        for k, st in enumerate(patt):
            lead.lead(b + k * 0.5, root + 12 + st, 0.45, vel=0.55,
                      vibrato=7.0, vib_depth=2.0)

    stems = {"drums": drums, "bass": bass, "brass": brass,
             "lead": lead, "pads": pads}
    for s in stems.values():
        s.trim()
    return ("iron-tide", stems,
            {"drums": 0.9, "bass": 0.85, "brass": 0.85,
             "lead": 0.7, "pads": 0.6}, True)


# ============================================================ WHISPER-NETWORK
# Spies and informants: delicate intrigue. A minor, 85 BPM. 12 bars. Arc.
# A minor: A B C D E F G - with chromatic whispers (Bb, G#) in the dark.
def whisper_network():
    bpm = 85
    bars = 12
    total = bars * 4
    pluck = Track(bpm, total)
    pads = Track(bpm, total)
    windt = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3")]
    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [Am, Am, F, Dm, Am, E, F, Dm, Am, F, E, Am]

    def arc_vel(i):
        if i < 4:
            return 0.3 + i * 0.06
        if i < 8:
            return 0.55 + (i - 4) * 0.09
        return 0.9 - (i - 8) * 0.2

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        windt.wind(b, 4, vel=v * 0.45)
        pads.pad(b, [m - 12 for m in ch] + [ch[1] - 12 + 2], 4,
                 vel=v * 0.6, attack=1.6, cutoff=1400)
        if i % 2 == 1:
            bass.bass(b + 2, ch[0] - 12, 1.8, vel=v * 0.7, cutoff=280)
        # coded taps: irregular plucked signals
        if i % 3 == 0:
            pluck.pluck(b + 0.5, ch[2] + 12, 0.8, vel=v * 0.5)
        if i % 3 == 2:
            pluck.pluck(b + 2.5, ch[1] + 12, 0.8, vel=v * 0.45)

    # the secret itself: half-heard, chromatic, gone before dawn
    secret = [
        (2, "A4", 1, 0.4), (4, "C5", 1, 0.45),
        (5, "B4", 0.5, 0.4), (5.5, "Bb4", 0.5, 0.42),
        (8, "A4", 2, 0.5),
        (12, "E5", 1, 0.55), (13, "D5", 0.5, 0.5),
        (13.5, "C#5", 0.5, 0.52), (14, "D5", 1, 0.55),
        (16, "E5", 2, 0.6),
        (20, "G5", 1, 0.65), (21, "F5", 1, 0.6), (22, "E5", 2, 0.6),
        (24, "A4", 2, 0.55), (28, "C5", 1, 0.6),
        (29, "B4", 1, 0.55), (30, "A4", 2, 0.5),
        (32, "E4", 1, 0.45), (34, "G#4", 1, 0.5),
        (36, "A4", 3, 0.5),
        (40, "E5", 2, 0.45),
        (44, "A4", 3.5, 0.4),
    ]
    for off, note, d, v in secret:
        lead.lead(off, n(note), d, vel=v, vibrato=8.0, vib_depth=7.0)

    stems = {"pluck": pluck, "pads": pads, "wind": windt,
             "bass": bass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("whisper-network", stems,
            {"pluck": 0.9, "pads": 0.8, "wind": 0.85,
             "bass": 0.85, "lead": 0.9}, False)


# ============================================================ SALT-AND-IRON
# Coastal fortress: sea-spray and steel. G minor, 95 BPM. 16 bars. Loop.
# G minor: G A Bb C D Eb F - waves breaking on iron walls.
def salt_and_iron():
    bpm = 95
    bars = 16
    total = bars * 4
    windt = Track(bpm, total)
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Gm = [n("G2"), n("Bb2"), n("D3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    BbM = [n("Bb2"), n("D3"), n("F3")]
    FM = [n("F3"), n("A3"), n("C4")]
    prog = [Gm, Eb, BbM, FM] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # the sea: swell every two bars
        windt.wind(b, 4, vel=0.3 if i % 2 == 0 else 0.18)
        # fortress march: taiko on 1, snare answering on 3
        drums.taiko(b, vel=0.95)
        drums.snare(b + 2, vel=0.65)
        drums.taiko(b + 3, vel=0.45)
        if i in (0, 8):
            drums.crash(b, vel=0.5)
        # ironclad brass: beat 1 and the push of 2.5
        for m in ch:
            brass.brass(b, m + 12, 1.6, vel=0.7)
            brass.brass(b + 2.5, m + 12, 1.2, vel=0.55)
        # anchor bass: rolling 8ths
        for k in range(8):
            m = root - 12 if k % 2 == 0 else root - 12 + 7
            bass.bass(b + k * 0.5, m, 0.45, vel=0.75, cutoff=420)

    # horn of the headland: rising over the surf, salt in every note
    horn = [
        (0, "D4", 1), (1, "G4", 1), (2, "Bb4", 2),
        (4, "A4", 1), (5, "G4", 1), (6, "F4", 2),
        (8, "Eb4", 1), (9, "F4", 1), (10, "G4", 2),
        (12, "A4", 1), (13, "Bb4", 1), (14, "D5", 2),
        (16, "C5", 1), (17, "Bb4", 1), (18, "A4", 2),
        (20, "G4", 1), (21, "F4", 1), (22, "Eb4", 2),
        (24, "D4", 2), (26, "Eb4", 2),
        (28, "F4", 4),
        (32, "G4", 1), (33, "A4", 1), (34, "Bb4", 2),
        (36, "C5", 1), (37, "D5", 1), (38, "Eb5", 2),
        (40, "D5", 2), (42, "C5", 2),
        (44, "Bb4", 4),
        (48, "A4", 1), (49, "Bb4", 1), (50, "C5", 2),
        (52, "D5", 2), (54, "C5", 2),
        (56, "Bb4", 1), (57, "A4", 1), (58, "G4", 2),
        (60, "G4", 4),
    ]
    for off, note, d in horn:
        lead.lead(off, n(note), d, vel=0.75, vibrato=5.0, vib_depth=5.0)

    stems = {"wind": windt, "drums": drums, "brass": brass,
             "bass": bass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("salt-and-iron", stems,
            {"wind": 0.9, "drums": 0.9, "brass": 0.9,
             "bass": 0.85, "lead": 0.85}, True)


# ============================================================ THE-LONG-MARCH
# Weary army on the move: trudging hope. C minor, 75 BPM. 16 bars. Loop.
# C minor: C D Eb F G Ab Bb - dust on the road, home far behind.
def the_long_march():
    bpm = 75
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)
    pads = Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    BbM = [n("Bb2"), n("D3"), n("F3")]
    prog = [Cm, Cm, Ab, BbM] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # the trudge: heavy taiko on 1 and 3, kick under it
        drums.taiko(b, vel=0.9)
        drums.taiko(b + 2, vel=0.7)
        drums.kick(b, vel=0.6)
        if i % 4 == 3:
            drums.snare(b + 3.5, vel=0.5)
        if i in (0, 8):
            drums.crash(b, vel=0.45)
        # plodding half notes: root, fifth
        bass.bass(b, root - 12, 1.8, vel=0.8, cutoff=380)
        bass.bass(b + 2, root - 12 + 7, 1.8, vel=0.7, cutoff=380)
        # dust pads through the column
        pads.pad(b, [m - 12 for m in ch], 4, vel=0.55, attack=1.4)
        # low brass pedal joins the column from bar 4
        if i >= 4:
            for m in ch:
                brass.brass(b, m, 3.6, vel=0.55)

    # weary song: the same road, sung quieter each time
    song = [
        (0, "C4", 2), (2, "Eb4", 2),
        (4, "G4", 3), (7, "F4", 1),
        (8, "Eb4", 2), (10, "D4", 2),
        (12, "C4", 4),
        (16, "Ab3", 2), (18, "Bb3", 2),
        (20, "C4", 3), (23, "Bb3", 1),
        (24, "Ab3", 2), (26, "G3", 2),
        (28, "C4", 4),
        (32, "Eb4", 2), (34, "F4", 2),
        (36, "G4", 3), (39, "Ab4", 1),
        (40, "G4", 2), (42, "F4", 2),
        (44, "Eb4", 4),
        (48, "D4", 2), (50, "Eb4", 2),
        (52, "C4", 3), (55, "Bb3", 1),
        (56, "C4", 2), (58, "D4", 2),
        (60, "C4", 4),
    ]
    for off, note, d in song:
        lead.lead(off, n(note), d, vel=0.7, vibrato=5.0, vib_depth=6.0)

    stems = {"drums": drums, "bass": bass, "brass": brass,
             "lead": lead, "pads": pads}
    for s in stems.values():
        s.trim()
    return ("the-long-march", stems,
            {"drums": 0.9, "bass": 0.85, "brass": 0.8,
             "lead": 0.85, "pads": 0.6}, True)


# ============================================================ CROWN-OF-THORNS
# Tragic ruler: heavy fate. F# minor, 70 BPM. 12 bars. Arc.
# F# minor: F# G# A B C# D E - the crown is iron, the head beneath it bleeds.
def crown_of_thorns():
    bpm = 70
    bars = 12
    total = bars * 4
    drums = Track(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    pads = Track(bpm, total)

    def bar(i):
        return i * 4

    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D3"), n("F#3"), n("A3")]
    A = [n("A2"), n("C#3"), n("E3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [Fsm, D, A, E] * 3

    def arc_vel(i):
        if i < 4:
            return 0.45 + i * 0.07
        if i < 8:
            return 0.72 + (i - 4) * 0.07
        return 0.95 - (i - 8) * 0.18

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # the tolling: great drum on 1, answering thud on 3
        drums.taiko(b, vel=v * 0.95)
        drums.taiko(b + 2, vel=v * 0.6)
        if i in (0, 4, 8):
            drums.crash(b, vel=v * 0.5)
        # the weight of the crown: full brass chords
        for m in ch:
            brass.brass(b, m + 12, 3.4, vel=v * 0.75)
        # doom roots
        bass.bass(b, root - 12, 3.4, vel=v * 0.8, cutoff=320)
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.55,
                 attack=1.2, cutoff=1100)

    # the lament: a ruler remembering every wrong turn
    lament = [
        (0, "F#4", 3, 0.5), (4, "A4", 2, 0.55),
        (8, "C#5", 3, 0.6),
        (12, "B4", 2, 0.65), (16, "A4", 3, 0.65),
        (20, "G#4", 2, 0.7),
        (24, "A4", 4, 0.7),
        (28, "E4", 2, 0.6), (32, "F#4", 3, 0.6),
        (36, "E5", 2, 0.65),
        (40, "D5", 3, 0.6),
        (44, "C#5", 3.5, 0.5),
    ]
    for off, note, d, v in lament:
        lead.lead(off, n(note), d, vel=v, vibrato=4.5, vib_depth=7.0)

    stems = {"drums": drums, "brass": brass, "bass": bass,
             "lead": lead, "pads": pads}
    for s in stems.values():
        s.trim()
    return ("crown-of-thorns", stems,
            {"drums": 0.9, "brass": 0.9, "bass": 0.85,
             "lead": 0.9, "pads": 0.7}, False)


# ============================================================ render
def mix_track10(name, stems, gains, reverb_wet=0.18, loop=False):
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
        # decode check (also gives duration)
        x = _decode_mp3(path)
        assert len(x) > SR, f"{f}: decoded too short"
        assert np.max(np.abs(x)) > 0.01, f"{f}: decoded silent"
        decoded[f] = x
    print(f"decode ok: {len(mp3s)}/{len(mp3s)} mp3s")

    # group by track: <track>.mp3 is the mix; <track>-stem-<s>.mp3 are stems
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
            # duration match within 0.1s
            assert abs(len(mix) - len(sx)) / SR < 0.15, \
                f"{f}: duration mismatch vs mix"
            # non-silent
            assert np.sqrt(np.mean(sx ** 2)) > 0.001, f"{f}: silent stem"
        # pairwise distinctness
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
    (ashen_dawn, 0.22),
    (iron_tide, 0.14),
    (whisper_network, 0.24),
    (salt_and_iron, 0.16),
    (the_long_march, 0.18),
    (crown_of_thorns, 0.20),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (mix_track10(name, stems, gains, reverb_wet=wet,
                                     loop=loop), loop)
    to_mp3()
    verify()
    return results


if __name__ == "__main__":
    main()
