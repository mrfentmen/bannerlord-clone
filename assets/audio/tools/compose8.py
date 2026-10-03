"""Eighth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-7 moods already covered - do not duplicate):
  sandstorm, requiem, caravan-dawn, under-siege, traitors-gambit, oathbound.
Render: python3 compose8.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it). Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
from synth import Track, reverb_stereo, limiter, write_wav, SR

OUT = "/home/hatch/workspace/staging/music8/out"
MP3 = "/home/hatch/workspace/staging/music8/out/mp3"
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


# ============================================================ SANDSTORM
# Desert storm: blinding fury. E phrygian dominant, 125 BPM. 16 bars. Loop.
# E phrygian dominant: E F G# A B C D - the F and G# bite against the root.
def sandstorm():
    bpm = 125
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    windt = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    # phrygian dominant harmony: Em with F-natural rubs, G# color
    Em = [n("E2"), n("G2"), n("B2")]
    F = [n("F2"), n("A2"), n("C3")]
    C = [n("C2"), n("E2"), n("G2")]
    D = [n("D2"), n("F#2"), n("A2")]
    prog = [Em, F, Em, C, Em, D, Em, F] * 2

    # blinding swirl: wind bed over everything, surging mid-piece
    for i in range(bars):
        b = bar(i)
        windt.wind(b, 4, vel=0.5 if 4 <= i < 12 else 0.36)

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # fury kit: 8th kicks, backbeat snare, 16th hats, war-taiko hits
        for k in range(8):
            drums.kick(b + k * 0.5, vel=0.8)
        drums.snare(b + 1, vel=0.85)
        drums.snare(b + 3, vel=0.85)
        for k in range(16):
            drums.hat(b + k * 0.25, vel=0.3)
        drums.taiko(b + (i * 1.3 % 2), vel=0.7)
        if i % 4 == 0:
            drums.crash(b, vel=0.5)
        # grinding phrygian ostinato: root + flat-2 rub
        for k in range(8):
            m = root if k % 2 == 0 else root + 1  # E/F rub
            bass.bass(b + k * 0.5, m, 0.42, vel=0.9, cutoff=640)
    # original screaming desert line: phrygian-dominant runs, wide vibrato
    scream = [
        (0, "E5", 0.75), (0.75, "F5", 0.5), (1.5, "G#5", 0.75),
        (2.5, "A5", 0.5), (3, "B5", 1.0),
        (4, "C6", 0.5), (4.5, "B5", 0.5), (5, "A5", 0.5),
        (5.5, "G#5", 0.5), (6, "F5", 1.0), (7, "E5", 1.0),
        (8, "D5", 0.5), (8.5, "E5", 0.5), (9, "F5", 0.75),
        (10, "G#5", 1.25), (11.5, "A5", 0.5), (12, "B5", 2.0),
    ]
    for start in (bar(0), bar(8)):
        for off, note, d in scream:
            lead.lead(start + off, n(note), d, vel=0.85,
                      vibrato=7.0, vib_depth=14.0)

    stems = {"drums": drums, "bass": bass, "wind": windt, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("sandstorm", stems,
            {"drums": 1.0, "bass": 0.95, "wind": 0.75, "lead": 0.9}, True)


# ============================================================ REQUIEM
# Memorial for the fallen: solemn choir-like pads. A minor, 60 BPM. Arc.
def requiem():
    bpm = 60
    bars = 12
    total = bars * 4
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    Am = [n("A2"), n("C3"), n("E3"), n("A3")]
    F = [n("F2"), n("A2"), n("C3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3"), n("C4")]
    G = [n("G2"), n("B2"), n("D3"), n("G3")]
    # intro: Am alone; build: F, C; climax: G, Am; resolve: Am
    prog = [Am, Am, F, F, C, C, G, Am, Am, G, Am, Am]
    # velocity arc: soft intro -> full climax (bars 6-8) -> gentle resolve
    def arc_vel(i):
        if i < 2:
            return 0.32
        if i < 6:
            return 0.45 + i * 0.04
        if i < 9:
            return 0.72
        return 0.72 - (i - 8) * 0.14

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        # choir-like pads: stacked, slow attack, one chord per bar
        pads.pad(b, ch, 4, vel=v, attack=2.0, cutoff=2800)
        # deep toll roots on chord changes
        bass.bass(b, ch[0] - 12, 3.5, vel=v * 0.8, cutoff=220)
    # original lament: bells of the fallen, entering at bar 2
    lament = [
        (0, "A4", 3.0), (4, "G4", 3.0), (8, "F4", 4.0),
        (12, "E4", 3.0), (16, "D4", 3.0), (20, "C4", 4.0),
        (24, "B3", 3.0), (28, "C4", 3.0), (32, "A4", 6.0),
    ]
    for off, note, d in lament:
        lead.lead(bar(2) + off, n(note), d, vel=0.62,
                  vibrato=3.0, vib_depth=5.0)
    # funeral tolls: deep taiko at the movement joints
    for i, v in ((0, 0.35), (4, 0.45), (7, 0.6), (10, 0.4)):
        drums.taiko(bar(i), vel=v)
        drums.taiko(bar(i) + 2, vel=v * 0.6)

    stems = {"pads": pads, "bass": bass, "lead": lead, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("requiem", stems,
            {"pads": 0.9, "bass": 0.7, "lead": 0.85, "drums": 0.6}, False)


# ============================================================ CARAVAN-DAWN
# Morning trade caravan: hopeful movement. G major, 100 BPM. Arc.
def caravan_dawn():
    bpm = 100
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    pads = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    C = [n("C3"), n("E3"), n("G3")]
    Em = [n("E2"), n("G2"), n("B2")]
    D = [n("D2"), n("F#2"), n("A2")]
    prog = [G, C, Em, D] * 4

    def arc_vel(i):
        # dawn rises: quiet start, bright midday, soft dusk close
        if i < 3:
            return 0.45 + i * 0.1
        if i < 12:
            return 0.85
        return 0.85 - (i - 11) * 0.12

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # walking kit: kick on 1 and 3+, soft snare, swinging 8ths
        drums.kick(b, vel=0.6 * v)
        drums.kick(b + 2.5, vel=0.5 * v)
        drums.snare(b + 1, vel=0.45 * v)
        drums.snare(b + 3, vel=0.45 * v)
        for k in range(8):
            swing = 0.06 if k % 2 == 1 else 0.0
            drums.hat(b + k * 0.5 + swing, vel=0.24 * v)
        # walking bass: root, fifth, third, approach
        walk = [root, root + 7, ch[1], root + 9, root + 7, root, ch[1] + 12, root + 2]
        for k, m in enumerate(walk):
            bass.bass(b + k * 0.5, m, 0.42, vel=0.7 * v, cutoff=520)
        # bright arpeggio picking on the chord tones
        arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12,
               ch[2] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12]
        for k, m in enumerate(arp):
            pluckt.pluck(b + k * 0.5, m, 0.7, vel=0.42 * v)
        # warm dawn pads, one per 4 bars
        if i % 4 == 0:
            pads.pad(b, ch, 16, vel=0.4 * v, attack=2.0, cutoff=2200)
    # original hopeful caravan song: enters bar 4, peaks bar 10, rests home
    song = [
        (0, "D5", 1.0), (1, "B4", 1.0), (2, "G4", 1.5), (3.5, "A4", 0.5),
        (4, "B4", 1.0), (5, "D5", 1.0), (6, "E5", 2.0),
        (8, "G5", 1.0), (9, "F#5", 1.0), (10, "E5", 1.0), (11, "D5", 1.0),
        (12, "B4", 2.0), (14, "A4", 1.0), (15, "G4", 3.0),
    ]
    for off, note, d in song:
        lead.lead(bar(4) + off, n(note), d, vel=0.78,
                  vibrato=4.5, vib_depth=6.0)

    stems = {"drums": drums, "bass": bass, "pluck": pluckt,
             "pads": pads, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("caravan-dawn", stems,
            {"drums": 0.85, "bass": 0.9, "pluck": 1.0,
             "pads": 0.7, "lead": 0.9}, False)


# ============================================================ UNDER SIEGE
# City under bombardment: dread + defiance. C minor, 105 BPM. 16 bars. Loop.
def under_siege():
    bpm = 105
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    brass = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C2"), n("Eb2"), n("G2")]
    Ab = [n("Ab1"), n("C2"), n("Eb2")]
    Bb = [n("Bb1"), n("D2"), n("F2")]
    G = [n("G1"), n("B1"), n("D2")]
    prog = [Cm, Cm, Ab, Bb, Cm, Ab, G, Cm] * 2

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # bombardment: taiko shell-hits on irregular deterministic accents
        hit1 = (i * 2.1) % 4
        hit2 = (hit1 + 1.7) % 4
        drums.taiko(b + hit1, vel=0.95)
        drums.taiko(b + hit2, vel=0.65)
        # defiant drive: 8th kicks, snare backbeat, 8th hats
        for k in range(8):
            drums.kick(b + k * 0.5, vel=0.72)
        drums.snare(b + 1, vel=0.8)
        drums.snare(b + 3, vel=0.8)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.3)
        drums.crash(b + hit1, vel=0.4)
        # grinding bass under the shells
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.42, vel=0.85, cutoff=600)
        # dread pedal: low brass drone on the root, stabs off the hits
        brass.brass(b, root + 12, 3.5, vel=0.45)
        for m in ch:
            brass.brass(b + 1.5, m + 12, 1.0, vel=0.4)
            brass.brass(b + 3.5, m + 12, 1.0, vel=0.4)
    # original defiant rising line: the city will not fall
    defy = [
        (0, "C5", 1.0), (1, "Eb5", 1.0), (2, "G5", 1.5), (3.5, "F5", 0.5),
        (4, "Eb5", 1.0), (5, "D5", 1.0), (6, "C5", 2.0),
        (8, "Bb4", 1.0), (9, "C5", 1.0), (10, "D5", 1.0), (11, "Eb5", 1.0),
        (12, "G5", 1.5), (13.5, "F5", 0.5), (14, "Eb5", 1.0), (15, "D5", 1.0),
        (16, "C5", 3.0),
    ]
    for start in (bar(0), bar(8)):
        for off, note, d in defy:
            if start + off < bar(16):
                lead.lead(start + off, n(note), d, vel=0.85,
                          vibrato=5.5, vib_depth=9.0)

    stems = {"drums": drums, "bass": bass, "brass": brass, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("under-siege", stems,
            {"drums": 1.0, "bass": 0.95, "brass": 0.85, "lead": 0.9}, True)


# ============================================================ TRAITOR'S GAMBIT
# Espionage/infiltration: slinky tension. D minor, 90 BPM. 16 bars. Loop.
def traitors_gambit():
    bpm = 90
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    pluckt = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    Dm = [n("D2"), n("F2"), n("A2")]
    Bb = [n("Bb1"), n("D2"), n("F2")]
    Gm = [n("G1"), n("Bb1"), n("D2")]
    A = [n("A1"), n("C#2"), n("E2")]
    prog = [Dm, Bb, Gm, A] * 4

    for i, ch in enumerate(prog):
        b = bar(i)
        root = ch[0]
        # infiltration kit: syncopated kick, ghost snare, swung 16th hats
        drums.kick(b, vel=0.75)
        drums.kick(b + 2.75, vel=0.6)
        drums.snare(b + 1, vel=0.4)
        drums.snare(b + 3, vel=0.5)
        drums.snare(b + 3.75, vel=0.25)  # ghost
        for k in range(16):
            swing = 0.04 if k % 2 == 1 else 0.0
            drums.hat(b + k * 0.25 + swing, vel=0.22)
        if i % 8 == 7:
            drums.crash(b, vel=0.25)
        # slinking chromatic bass: root, approach from above and below
        walk = [root, root + 7, root + 6, root + 5, root + 4, root + 5,
                root + 7, root + 10]
        for k, m in enumerate(walk):
            bass.bass(b + k * 0.5, m, 0.4, vel=0.78, cutoff=540)
        # muted tension comping: short off-beat chops on chord tones
        for k, m in ((0.5, ch[1] + 12), (1.75, ch[2] + 12),
                     (2.5, ch[1] + 12), (3.25, ch[0] + 12)):
            pluckt.pluck(b + k, m, 0.55, vel=0.36)
    # original knife-in-the-dark motif: chromatic slither, whispered fall
    knife = [
        (0, "D5", 0.5), (0.75, "Eb5", 0.5), (1.5, "D5", 0.5),
        (2.25, "C#5", 0.75), (3.25, "D5", 0.75),
        (4.5, "F5", 0.5), (5, "E5", 0.5), (5.5, "Eb5", 0.5),
        (6.25, "D5", 1.0),
        (8, "A4", 0.75), (9, "Bb4", 0.5), (9.75, "A4", 0.75),
        (11, "G4", 1.0), (12.5, "F#4", 0.5), (13, "G4", 0.5),
        (14, "A4", 1.5),
    ]
    for v, start in enumerate((bar(0), bar(4), bar(8), bar(12))):
        for off, note, d in knife:
            m = n(note) + (12 if v == 3 and off >= 8 else 0)
            lead.lead(start + off, m, d, vel=0.78,
                      vibrato=7.0, vib_depth=10.0)

    stems = {"drums": drums, "bass": bass, "pluck": pluckt, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("traitors-gambit", stems,
            {"drums": 0.9, "bass": 0.95, "pluck": 0.85, "lead": 0.9}, True)


# ============================================================ OATHBOUND
# Swearing fealty: weighty ceremony. F major, 85 BPM. 12 bars. Arc.
def oathbound():
    bpm = 85
    bars = 12
    total = bars * 4
    brass = Track(bpm, total)
    pads = Track(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)
    lead = Track(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D2"), n("F2"), n("A2")]
    Bb = [n("Bb1"), n("D2"), n("F2")]
    C = [n("C2"), n("E2"), n("G2")]
    # the oath: statement, doubt, affirmation, sworn
    prog = [F, F, Dm, Dm, Bb, Bb, C, C, F, Bb, F, C]

    def arc_vel(i):
        if i < 2:
            return 0.4
        if i < 6:
            return 0.55 + i * 0.05
        if i < 10:
            return 0.9
        return 0.9 - (i - 9) * 0.2

    for i, ch in enumerate(prog):
        b = bar(i)
        v = arc_vel(i)
        root = ch[0]
        # weighty brass chords, full bar each
        for m in ch:
            brass.brass(b, m + 12, 3.8, vel=v * 0.7)
        # deep organ-like bed under the ceremony
        pads.pad(b, [m - 12 for m in ch], 4, vel=v * 0.5,
                 attack=1.5, cutoff=1800)
        # ceremonial roots
        bass.bass(b, root - 12, 3.5, vel=v * 0.75, cutoff=320)
        # solemn taiko punctuation
        drums.taiko(b, vel=v * 0.7)
        if i in (3, 7, 10):
            drums.taiko(b + 2, vel=v * 0.5)
    # original oath fanfare: the words of fealty, sworn and sealed
    # statement (bars 2-3), doubt (4-5), affirmation (6-8), sworn (9-11)
    oath = [
        (0, "F4", 1.5), (2, "A4", 1.5), (4, "C5", 2.0),
        (8, "Bb4", 1.5), (10, "A4", 1.0), (11, "G4", 1.0),
        (12, "A4", 2.0), (16, "C5", 2.0), (20, "D5", 2.0),
        (24, "C5", 2.0), (26, "Bb4", 1.5), (28, "A4", 1.5),
        (32, "F4", 3.0), (36, "C4", 3.5),
    ]
    for off, note, d in oath:
        lead.lead(bar(2) + off, n(note), d, vel=0.8,
                  vibrato=4.0, vib_depth=6.0)

    stems = {"brass": brass, "pads": pads, "bass": bass,
             "drums": drums, "lead": lead}
    for s in stems.values():
        s.trim()
    return ("oathbound", stems,
            {"brass": 0.95, "pads": 0.7, "bass": 0.85,
             "drums": 0.75, "lead": 0.9}, False)


# ============================================================ render
def mix_track8(name, stems, gains, reverb_wet=0.18, loop=False):
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
    (sandstorm, 0.14),
    (requiem, 0.26),
    (caravan_dawn, 0.18),
    (under_siege, 0.13),
    (traitors_gambit, 0.15),
    (oathbound, 0.22),
]


def main():
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        mix_track8(name, stems, gains, reverb_wet=wet, loop=loop)
    to_mp3()


if __name__ == "__main__":
    main()
