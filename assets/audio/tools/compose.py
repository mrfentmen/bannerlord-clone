"""Compositions for the Bannerlord-clone web game.
Render: python3 compose.py  -> wav stems + mixes in out/
Then: ffmpeg to mp3."""
import os
import numpy as np
from synth import Track, reverb_stereo, limiter, write_wav, SR

OUT = os.path.join(os.path.dirname(__file__), "out")
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


# ============================================================ LOADING THEME
# Epic, D minor, 92 BPM. 20 bars. i - VI - III - VII main progression.
def loading_theme():
    bpm = 92
    bars = 20
    total = bars * 4
    drums = Track(bpm, total)    # taiko / toms / crash
    bass = Track(bpm, total)
    strings = Track(bpm, total)  # pads
    horn = Track(bpm, total)     # brass stabs + lead melody
    air = Track(bpm, total)      # wind bed

    Dm = [n("D3"), n("A3"), n("D4"), n("F4"), n("A4")]
    Bb = [n("Bb2"), n("F3"), n("Bb3"), n("D4"), n("F4")]
    F = [n("F2"), n("C3"), n("F3"), n("A3"), n("C4")]
    C = [n("C3"), n("G3"), n("C4"), n("E4"), n("G4")]

    def bar(i):
        return i * 4

    # intro: bars 0-3, pads swell + heartbeat taiko
    air.wind(0, total, vel=0.8)
    strings.pad(bar(0), Dm, 16, vel=0.9, attack=2.5)
    drums.taiko(bar(0), vel=0.55)
    drums.taiko(bar(2), vel=0.45)
    drums.crash(bar(0), vel=0.5)

    # build: bars 4-7
    for i, ch in enumerate([Dm, Dm, Bb, C]):
        b = bar(4 + i)
        strings.pad(b, ch, 4, vel=0.7, attack=0.4)
        drums.taiko(b, vel=0.9)
        drums.taiko(b + 1.5, vel=0.7)
        drums.taiko(b + 2.5, vel=0.85)
        drums.taiko(b + 3.5, vel=0.7)
        drums.tom(b + 3.75, freq=98, vel=0.5)
        root = ch[0] - 12
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.45, vel=0.85, cutoff=600)

    # main: bars 8-15
    melody = [
        (0, "D5", 2), (2, "F5", 1), (3, "E5", 1),
        (4, "D5", 2), (6, "C5", 1), (7, "D5", 1),
        (8, "F5", 3), (11, "E5", 1),
        (12, "D5", 2), (14, "C5", 2),
        (16, "D5", 2), (18, "F5", 1), (19, "G5", 1),
        (20, "A5", 3), (23, "G5", 1),
        (24, "F5", 2), (26, "E5", 1), (27, "D5", 1),
        (28, "E5", 4),
    ]
    for i, ch in enumerate([Dm, Bb, F, C, Dm, Bb, F, C]):
        b = bar(8 + i)
        strings.pad(b, ch, 4, vel=0.75, attack=0.3)
        root = ch[0] - 12
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.45, vel=0.9, cutoff=750)
        horn.brass(b, ch[2], 1.6, vel=0.8)
        horn.brass(b + 2, ch[3], 1.6, vel=0.8)
        drums.taiko(b, vel=0.95)
        drums.taiko(b + 1.5, vel=0.7)
        drums.taiko(b + 2.5, vel=0.9)
        drums.taiko(b + 3.5, vel=0.7)
        drums.tom(b + 2, freq=130, vel=0.65)
        drums.tom(b + 3.75, freq=98, vel=0.5)
    for off, note, d in melody:
        horn.lead(bar(8) + off, n(note), d * 0.96, vel=0.95)
    drums.crash(bar(8), vel=0.7)

    # outro: bars 16-19
    strings.pad(bar(16), Dm, 12, vel=0.8, attack=1.5)
    drums.taiko(bar(16), vel=0.6)
    drums.taiko(bar(17), vel=0.45)
    drums.taiko(bar(18), vel=0.5)
    horn.lead(bar(16), n("A4"), 3.8, vel=0.8)
    horn.lead(bar(18), n("D5"), 1.8, vel=0.85)
    drums.taiko(bar(19), vel=1.0)
    drums.crash(bar(19), vel=0.8)
    for mnote in Dm:
        horn.brass(bar(19), mnote, 3.6, vel=0.7)
    bass.bass(bar(19), n("D2"), 3.6, vel=0.9, cutoff=500)

    stems = {"drums": drums, "bass": bass, "strings": strings,
             "horn": horn, "air": air}
    for s in stems.values():
        s.trim()
    return "loading-theme", stems, {"drums": 1.0, "bass": 0.9, "strings": 0.85,
                                    "horn": 1.0, "air": 0.55}


# ============================================================ BATTLE THEME
# Driving, E minor, 140 BPM. 24 bars.
def battle_theme():
    bpm = 140
    bars = 24
    total = bars * 4
    drums = Track(bpm, total)
    bass = Track(bpm, total)
    lead = Track(bpm, total)   # riff + power chords
    fx = Track(bpm, total)     # crashes / riser-ish toms

    def bar(i):
        return i * 4

    # 4-bar drum build
    for i in range(4):
        b = bar(i)
        for k in range(4):
            drums.kick(b + k, vel=0.9)
            drums.hat(b + k, vel=0.5)
            drums.hat(b + k + 0.5, vel=0.35)
        if i >= 2:
            drums.snare(b + 1, vel=0.9)
            drums.snare(b + 3, vel=0.9)
        if i == 3:
            for k in range(8):
                drums.tom(b + k * 0.5, freq=150 - k * 8, vel=0.6)
    fx.crash(bar(0), vel=0.4)

    # 16-bar main riff: gallop bass + power-chord stabs + lead riff
    E, G, A, B, D = n("E2"), n("G2"), n("A2"), n("B2"), n("D3")
    roots = [E, E, G, A, E, E, B, D, E, E, G, A, B, B, D, D]
    riff = [  # lead riff per 4-bar phrase (beats, note, dur)
        (0, "E4", 0.75), (0.75, "E4", 0.5), (1.5, "G4", 0.75), (2.25, "E4", 0.5),
        (3, "A4", 1.0),
    ]
    for i, root in enumerate(roots):
        b = bar(4 + i)
        # drums: kick 1, 2.5, 3.5 / snare 2, 4 / hats 8ths
        drums.kick(b, vel=1.0)
        drums.kick(b + 1.5, vel=0.85)
        drums.kick(b + 2.5, vel=0.9)
        drums.snare(b + 1, vel=1.0)
        drums.snare(b + 3, vel=1.0)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=0.5 if k % 2 == 0 else 0.3)
        # gallop bass: 8th 8th 16th-16th per beat
        for beat in range(4):
            bb = b + beat
            bass.bass(bb, root, 0.42, vel=0.95, cutoff=1100)
            bass.bass(bb + 0.5, root, 0.2, vel=0.8, cutoff=1100)
            bass.bass(bb + 0.75, root, 0.2, vel=0.85, cutoff=1100)
        # power-chord stabs on beat 1 and 3.5
        for off in (0, 3.5):
            lead.brass(b + off, root + 24, 0.5, vel=0.75)
            lead.brass(b + off, root + 31, 0.5, vel=0.7)
        if i % 4 == 3:
            fx.crash(b, vel=0.5)
    # lead riff phrases over bars 4-7, 12-15 (two statements)
    for start_bar in (4, 12):
        for off, note, d in riff:
            lead.lead(bar(start_bar) + off, n(note), d, vel=1.0,
                      vibrato=6.0, vib_depth=8.0)
        # answer phrase, higher
        for off, note, d in riff:
            lead.lead(bar(start_bar + 2) + off, n(note) + 12, d, vel=0.9,
                      vibrato=6.0, vib_depth=8.0)

    # outro: bars 20-23, half-time hits then final
    for i in range(3):
        b = bar(20 + i)
        drums.kick(b, vel=1.0)
        drums.kick(b + 2, vel=0.9)
        drums.snare(b + 1, vel=1.0)
        drums.snare(b + 3, vel=1.0)
        drums.crash(b, vel=0.45)
        bass.bass(b, E, 1.8, vel=0.9, cutoff=900)
        lead.brass(b, E + 24, 1.8, vel=0.7)
        lead.brass(b, E + 31, 1.8, vel=0.65)
    b = bar(23)
    drums.kick(b, vel=1.0)
    drums.snare(b, vel=1.0)
    drums.crash(b, vel=0.85)
    drums.taiko(b, vel=0.9)
    bass.bass(b, E, 3.5, vel=1.0, cutoff=800)
    lead.brass(b, E + 24, 3.5, vel=0.8)
    lead.brass(b, E + 31, 3.5, vel=0.75)
    lead.brass(b, E + 36, 3.5, vel=0.7)

    stems = {"drums": drums, "bass": bass, "lead": lead, "fx": fx}
    for s in stems.values():
        s.trim()
    return "battle-theme", stems, {"drums": 1.0, "bass": 0.95, "lead": 0.9,
                                   "fx": 0.7}


# ============================================================ AMBIENT
# Sparse exploration bed, A minor, 60 BPM feel. 64 beats, seamless-ish loop.
def ambient():
    bpm = 60
    total = 64
    pads = Track(bpm, total)
    pluck = Track(bpm, total)
    texture = Track(bpm, total)  # wind + heartbeat taiko + sub drone

    Am9 = [n("A2"), n("E3"), n("B3"), n("C4"), n("G4")]
    Fmaj9 = [n("F2"), n("C3"), n("E3"), n("G3"), n("A3")]

    texture.wind(0, total, vel=0.9)
    texture.bass(0, n("A1"), total, vel=0.5, cutoff=220)

    pads.pad(0, Am9, 32, vel=0.85, attack=4.0)
    pads.pad(32, Fmaj9, 32, vel=0.8, attack=4.0)

    # heartbeat taiko, very soft
    for b in (0, 16, 32, 48):
        texture.taiko(b, vel=0.35)
        texture.taiko(b + 1.5, vel=0.22)

    # sparse pluck melody, A minor pentatonic
    line = [
        (4, "E4"), (10, "G4"), (14, "A4"), (20, "G4"),
        (26, "E4"), (30, "D4"), (36, "C4"), (42, "D4"),
        (46, "E4"), (52, "A4"), (56, "G4"), (60, "E4"),
    ]
    for b, note in line:
        pluck.pluck(b, n(note), 6, vel=0.8)

    stems = {"pads": pads, "pluck": pluck, "texture": texture}
    for s in stems.values():
        s.trim()
    return "ambient-exploration", stems, {"pads": 0.9, "pluck": 0.85,
                                          "texture": 0.7}


# ============================================================ render
def mix_track(name, stems, gains, reverb_wet=0.18):
    """Sum stems -> stereo mix with reverb + limiter. Saves mix + stems."""
    bufs = {}
    for sname, trk in stems.items():
        b = trk.buf.astype(np.float64) * gains.get(sname, 1.0)
        bufs[sname] = b
        write_wav(os.path.join(OUT, f"{name}-stem-{sname}.wav"),
                  limiter(b, ceiling=0.89))
    mix = sum(bufs.values())
    stereo = reverb_stereo(mix, wet=reverb_wet, decay=2.2)
    stereo = limiter(stereo, ceiling=0.89)
    path = os.path.join(OUT, f"{name}-mix.wav")
    write_wav(path, stereo)
    peak = float(np.max(np.abs(stereo)))
    rms = float(np.sqrt(np.mean(stereo ** 2)))
    dur = len(stereo) / SR
    print(f"{name}: {dur:.1f}s peak={peak:.3f} rms={rms:.3f} -> {path}")
    return path


def main():
    for fn, wet in ((loading_theme, 0.20), (battle_theme, 0.14),
                    (ambient, 0.30), (menu_theme, 0.22),
                    (victory_fanfare, 0.12), (defeat, 0.32)):
        name, stems, gains = fn()
        mix_track(name, stems, gains, reverb_wet=wet)


# ============================================================ MENU THEME
# Noble and restrained, D dorian, 80 BPM. 16 bars.
def menu_theme():
    bpm = 80
    bars = 16
    total = bars * 4
    strings = Track(bpm, total)
    horn = Track(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    Dm = [n("D3"), n("A3"), n("D4"), n("F4"), n("A4")]
    Bb = [n("Bb2"), n("F3"), n("Bb3"), n("D4"), n("F4")]
    Gm = [n("G2"), n("D3"), n("G3"), n("Bb3"), n("D4")]
    A = [n("A2"), n("E3"), n("A3"), n("C#4"), n("E4")]

    def bar(i):
        return i * 4

    prog = [Dm, Bb, Gm, A] * 2
    for i, ch in enumerate(prog):
        b = bar(i * 2)
        strings.pad(b, ch, 8, vel=0.7, attack=1.2)
        bass.bass(b, ch[0] - 12, 3.8, vel=0.7, cutoff=500)
        bass.bass(b + 4, ch[0] - 12, 3.8, vel=0.65, cutoff=500)
        drums.taiko(b, vel=0.4)
        horn.brass(b + 6, ch[2] + 12, 1.5, vel=0.45)

    melody = [
        (0, "D5", 3), (3, "E5", 1), (4, "F5", 4),
        (8, "E5", 2), (10, "D5", 2), (12, "C5", 4),
        (16, "D5", 3), (19, "A4", 1), (20, "Bb4", 4),
        (24, "A4", 2), (26, "G4", 2), (28, "A4", 4),
        (32, "D5", 3), (35, "E5", 1), (36, "F5", 2), (38, "G5", 2),
        (40, "A5", 4), (44, "G5", 4),
        (48, "F5", 2), (50, "E5", 2), (52, "D5", 2), (54, "C5", 2),
        (56, "D5", 8),
    ]
    for off, note, d in melody:
        horn.lead(off, n(note), d * 0.94, vel=0.85, vibrato=5.0, vib_depth=5.0)

    stems = {"strings": strings, "horn": horn, "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return "menu-theme", stems, {"strings": 0.85, "horn": 1.0, "bass": 0.8,
                                 "drums": 0.6}


# ============================================================ VICTORY FANFARE
# Triumphant, D major, 120 BPM. 8 bars.
def victory_fanfare():
    bpm = 120
    bars = 8
    total = bars * 4
    brass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("A3"), n("D4"), n("F#4")]
    G = [n("G2"), n("D3"), n("G3"), n("B3")]
    A = [n("A2"), n("E3"), n("A3"), n("C#4")]

    # snare roll build into bar 1
    for k in range(16):
        drums.snare(k * 0.25, vel=0.3 + 0.7 * k / 16)
    drums.crash(bar(1), vel=0.7)

    fanfare = [  # (bar, chord, hits)
        (1, D, [(0, "D5"), (0.5, "F#5"), (1, "A5"), (2, "D6", 2)]),
        (2, G, [(0, "D5"), (0.5, "G5"), (1, "B5"), (2, "D6", 2)]),
        (3, D, [(0, "A5", 1.5), (2, "F#5", 1), (3, "E5", 1)]),
        (4, A, [(0, "E5"), (0.5, "A5"), (1, "C#6"), (2, "E6", 2)]),
        (5, D, [(0, "D6", 3), (3, "C#6", 1)]),
        (6, G, [(0, "B5", 2), (2, "A5", 2)]),
        (7, D, [(0, "D6", 4)]),
    ]
    for bidx, ch, hits in fanfare:
        b = bar(bidx)
        drums.taiko(b, vel=0.9)
        drums.crash(b, vel=0.55)
        drums.snare(b + 2, vel=0.8)
        for h in hits:
            off, note = h[0], h[1]
            d = h[2] if len(h) > 2 else 0.45
            brass.brass(b + off, n(note), d, vel=0.95)
            brass.brass(b + off, n(note) - 4, d, vel=0.6)  # harmony 3rd below
        # low root
        drums.taiko(b + 2, vel=0.6)
    # final big hit
    b = bar(7)
    for mnote in D:
        brass.brass(b, mnote + 12, 3.8, vel=0.85)
    drums.crash(b, vel=0.85)
    drums.taiko(b, vel=1.0)

    stems = {"brass": brass, "drums": drums}
    for s in stems.values():
        s.trim()
    return "victory-fanfare", stems, {"brass": 1.0, "drums": 0.95}


# ============================================================ DEFEAT
# Somber, D minor, 60 BPM. 64 beats. Tolling drums, descending lead.
def defeat():
    bpm = 60
    total = 64
    strings = Track(bpm, total)
    lead = Track(bpm, total)
    texture = Track(bpm, total)

    Dm = [n("D3"), n("A3"), n("D4"), n("F4")]
    Bb = [n("Bb2"), n("F3"), n("Bb3"), n("D4")]
    Gm = [n("G2"), n("D3"), n("G3"), n("Bb3")]

    texture.wind(0, total, vel=0.7)
    texture.bass(0, n("D2"), 32, vel=0.55, cutoff=260)
    texture.bass(32, n("Bb1"), 32, vel=0.5, cutoff=260)
    texture.bass(0, n("A1"), total, vel=0.4, cutoff=200)

    strings.pad(0, Dm, 24, vel=0.75, attack=5.0)
    strings.pad(24, Bb, 20, vel=0.7, attack=5.0)
    strings.pad(44, Gm, 12, vel=0.7, attack=4.0)
    strings.pad(56, Dm, 8, vel=0.75, attack=3.0)

    # tolling taiko
    for b in (0, 16, 32, 48):
        texture.taiko(b, vel=0.5)
        texture.taiko(b + 8, vel=0.3)

    # sparse descending lament
    line = [
        (4, "A4", 6), (14, "G4", 6), (24, "F4", 6),
        (34, "E4", 6), (44, "D4", 8), (56, "A3", 7),
    ]
    for b, note, d in line:
        lead.lead(b, n(note), d, vel=0.7, vibrato=4.5, vib_depth=7.0)

    stems = {"strings": strings, "lead": lead, "texture": texture}
    for s in stems.values():
        s.trim()
    return "defeat", stems, {"strings": 0.9, "lead": 0.9, "texture": 0.75}


if __name__ == "__main__":
    main()
