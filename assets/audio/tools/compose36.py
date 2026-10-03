"""Thirty-sixth batch of original game music for the Bannerlord-clone web game.
New tracks (batches 1-35 moods already covered - do not duplicate):
  the-autumn-harvest, drums-of-the-ember-host, the-frost-fair,
  songs-of-the-long-road, the-copper-crown, thunder-of-the-cavalry.
Render: python3 compose36.py -> wav stems + mixes in out/
Then: ffmpeg to mp3 (script does it), then verify() QC. Pure numpy DSP, no samples.
All melodies are original compositions written for this batch."""
import os
import sys

import numpy as np

sys.path.insert(0, "/home/hatch/workspace/wt-travel/assets/audio/tools")
import compose27 as c27
from compose27 import VoiceTrack, Track, n
from synth import SR, midi_to_freq, adsr, lowpass, highpass, noise

OUT = "/home/hatch/workspace/staging/music36/out"
MP3 = "/home/hatch/workspace/staging/music36/out/mp3"
os.makedirs(OUT, exist_ok=True)
os.makedirs(MP3, exist_ok=True)
# point the shared render helpers at this batch's directories
c27.OUT = OUT
c27.MP3 = MP3


# ------------------------------------------------- new batch-36 instruments
def dulcimer_note(midi, dur, vel=1.0):
    """Hammered dulcimer: bright struck strings, shimmering partials."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    x = (0.55 * np.sin(2 * np.pi * f * t)
         + 0.30 * np.sin(2 * np.pi * 2.01 * f * t) * np.exp(-t * 2)
         + 0.16 * np.sin(2 * np.pi * 2.98 * f * t) * np.exp(-t * 3.5)
         + 0.08 * np.sin(2 * np.pi * 4.16 * f * t) * np.exp(-t * 5))
    x *= np.exp(-t * 3.0)
    snap = highpass(noise(n_), 5000) * np.exp(-t * 160) * 0.22
    return (x + snap) * vel * 0.5


def bell_note(midi, dur, vel=1.0):
    """Copper court bell: FM bell with inharmonic shimmer, long decay."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    f = midi_to_freq(midi)
    mod = np.sin(2 * np.pi * f * 1.483 * t) * np.exp(-t * 2.5)
    car = np.sin(2 * np.pi * f * t + 2.2 * mod)
    car += 0.4 * np.sin(2 * np.pi * f * 2.74 * t + 1.2 * mod) * np.exp(-t * 4)
    x = car * np.exp(-t * 2.4)
    return x * vel * 0.45


def fire_crackle(dur, vel=1.0, seed=0):
    """Ember bed: low fire rumble with random popping sparks. Deterministic."""
    rng = np.random.default_rng(3600 + seed)
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    rumble = lowpass(rng.standard_normal(n_), 320) * 0.6
    pops = np.zeros(n_)
    for _ in range(int(dur * 9)):
        s = rng.integers(0, max(n_ - 4000, 1))
        L = int(rng.uniform(600, 4000))
        env = np.exp(-np.arange(L) / (SR * rng.uniform(0.004, 0.03)))
        band = rng.uniform(1200, 6000)
        crack = highpass(rng.standard_normal(L), band) * env
        pops[s:s + L] += crack * rng.uniform(0.1, 0.5)
    return (rumble + pops) * vel * 0.4


def hoofbeat(dur=0.10, vel=1.0):
    """One hoof strike: dirt thump with a gritty transient."""
    n_ = int(dur * SR)
    t = np.arange(n_) / SR
    thump = np.sin(2 * np.pi * (110 - 60 * np.minimum(t / 0.06, 1.0)) * t)
    thump *= np.exp(-t * 70)
    grit = lowpass(noise(n_), 1600) * np.exp(-t * 140) * 0.7
    return (thump + grit) * vel * 0.7


class Voice36(VoiceTrack):
    def dulcimer(self, b, midi, dur_beats=2, **kw):
        self._place(dulcimer_note(midi, self._b2s(dur_beats), **kw), b)

    def bell(self, b, midi, dur_beats=8, **kw):
        self._place(bell_note(midi, self._b2s(dur_beats), **kw), b)

    def fire(self, b, dur_beats=4, seed=0, **kw):
        self._place(fire_crackle(self._b2s(dur_beats), seed=seed, **kw), b)

    def hoof(self, b, **kw):
        self._place(hoofbeat(**kw), b)


# ========================================================== THE-AUTUMN-HARVEST
# The sheaves are in and the barns are full: golden fields, full tables.
# A major, 98 BPM. 16 bars. Loop (sample-exact).
# A F#m D E.
def the_autumn_harvest():
    bpm = 98
    bars = 16
    total = bars * 4
    strings = Voice36(bpm, total)
    flute = Voice36(bpm, total)
    lyre = Voice36(bpm, total)
    bass = Track(bpm, total)
    drums = Track(bpm, total)

    def bar(i):
        return i * 4

    A = [n("A2"), n("C#3"), n("E3")]
    Fsm = [n("F#2"), n("A2"), n("C#3")]
    D = [n("D3"), n("F#3"), n("A3")]
    E = [n("E3"), n("G#3"), n("B3")]
    prog = [A, Fsm, D, E] * 4
    roots = [n("A1"), n("F#1"), n("D1"), n("E1")] * 4

    v = 0.88
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the gleaners' dance: warm string eighths
        step = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12,
                ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 12]
        for k in range(8):
            strings.strings(b + k * 0.5, step[k], 0.5, vel=v * 0.34)
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.24)
        # the harvest song across the fields
        flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.38)
        flute.flute(b + 2, ch[0] + 12, 2.0, vel=v * 0.34)
        # the threshing rhythm: lyre on off-beats
        lyre.lyre(b + 0.5, ch[0] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 1.5, ch[2] + 36, 1, vel=v * 0.26)
        lyre.lyre(b + 2.5, ch[1] + 36, 1, vel=v * 0.28)
        lyre.lyre(b + 3.5, ch[0] + 36, 1, vel=v * 0.26)
        # the full barns: rolling bass
        bass.bass(b, root, 1.8, vel=v * 0.52, cutoff=500)
        bass.bass(b + 2, root, 1.8, vel=v * 0.48, cutoff=500)
        # hand-drums and the stomping dance
        drums.taiko(b, vel=v * 0.46)
        drums.taiko(b + 2, vel=v * 0.42)
        drums.snare(b + 1, vel=v * 0.38)
        drums.snare(b + 3, vel=v * 0.38)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.20)

    # an original harvest-song: golden, unhurried, sure of itself
    harvest = [
        (0, "E4", 2), (2, "F#4", 2), (4, "A4", 4),
        (8, "B4", 2), (10, "A4", 2), (12, "F#4", 2), (14, "E4", 2),
        (16, "D4", 2), (18, "E4", 2), (20, "F#4", 4),
        (24, "E4", 2), (26, "D4", 2), (28, "C#4", 4),
        (32, "D4", 4), (36, "E4", 4),
        (40, "F#4", 2), (42, "A4", 2), (44, "B4", 4),
        (48, "A4", 2), (50, "F#4", 2), (52, "E4", 2), (54, "D4", 2),
        (56, "C#4", 4), (60, "D4", 4),
    ]
    for off, note, d in harvest:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"strings": strings, "flute": flute, "lyre": lyre,
             "bass": bass, "drums": drums}
    for s in stems.values():
        s.trim()
    return ("the-autumn-harvest", stems,
            {"strings": 0.86, "flute": 0.9, "lyre": 0.82,
             "bass": 0.9, "drums": 0.88}, True)


# ==================================================== DRUMS-OF-THE-EMBER-HOST
# Fire comes with them: torches in the night, the burning of the border towns.
# E minor, 138 BPM. 16 bars. Arc: sparks -> inferno -> embers.
# Em C G D.
def drums_of_the_ember_host():
    bpm = 138
    bars = 16
    total = bars * 4
    drums = Track(bpm, total)
    fire = Voice36(bpm, total)
    warhorn = Voice36(bpm, total)
    brass = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Em = [n("E3"), n("G3"), n("B3")]
    C = [n("C3"), n("E3"), n("G3")]
    G = [n("G2"), n("B2"), n("D3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [Em, C, G, D] * 4
    roots = [n("E1"), n("C1"), n("G1"), n("D1")] * 4

    def arc_vel(i):
        if i < 3:
            return 0.52 + i * 0.12    # sparks
        if i < 12:
            return 1.0                # inferno
        return 1.0 - (i - 12) * 0.18  # embers

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the ember-host marches: relentless drums
        drums.taiko(b, vel=v * 0.62)
        drums.taiko(b + 0.5, vel=v * 0.52)
        drums.taiko(b + 1, vel=v * 0.62)
        drums.taiko(b + 1.5, vel=v * 0.52)
        drums.taiko(b + 2, vel=v * 0.62)
        drums.taiko(b + 2.5, vel=v * 0.52)
        drums.taiko(b + 3, vel=v * 0.58)
        drums.taiko(b + 3.5, vel=v * 0.50)
        drums.kick(b + 0.25, vel=v * 0.55)
        drums.kick(b + 2.25, vel=v * 0.55)
        drums.snare(b + 1.25, vel=v * 0.46)
        drums.snare(b + 3.25, vel=v * 0.46)
        if i >= 3 and i < 12:
            for k in range(16):
                drums.hat(b + k * 0.25, vel=v * 0.22)
        if i == 3:
            drums.crash(b, vel=0.70)
        # the burning ground: ember crackle under everything
        fire.fire(b, 4, seed=i, vel=v * 0.55)
    # the burners' chant: wordless voices folded onto the horn stem
        if i >= 2 and i < 12:
            for m in ch:
                warhorn.choir(b, m - 12, 3.6, vel=v * 0.34)
        # the war-horn of the torches: long dreadful notes
        if i >= 2:
            warhorn.warhorn(b, ch[0] - 24, 4.0, vel=v * 0.42)
        # the fire takes the roof: brass stabs
        if i >= 3 and i < 12:
            brass.brass(b, ch[2], 0.5, vel=v * 0.48)
            brass.brass(b + 1, ch[0], 0.5, vel=v * 0.44)
            brass.brass(b + 2, ch[1], 0.5, vel=v * 0.48)
            brass.brass(b + 3, ch[2], 0.5, vel=v * 0.44)
        # the ground shakes: pounding roots
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.4, vel=v * 0.58, cutoff=400)

    # the torch-call: three sparks, then the blaze
    call = [
        (12, "E4", 2), (14, "E4", 2),
        (16, "G4", 4),
        (24, "A4", 2), (26, "G4", 2),
        (28, "F#4", 4),
        (36, "G4", 2), (38, "A4", 2),
        (40, "B4", 8),
    ]
    for off, note, d in call:
        v = arc_vel(int(off // 4))
        warhorn.warhorn(off, n(note) - 12, d, vel=v * 0.44)

    stems = {"drums": drums, "fire": fire, "warhorn": warhorn,
             "brass": brass, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("drums-of-the-ember-host", stems,
            {"drums": 0.95, "fire": 0.9, "warhorn": 0.88,
             "brass": 0.9, "bass": 0.9}, False)


# ============================================================= THE-FROST-FAIR
# Lanterns on ice: traders from three kingdoms, breath steaming, coins ringing.
# G major, 106 BPM. 16 bars. Loop (sample-exact).
# G Em C D.
def the_frost_fair():
    bpm = 106
    bars = 16
    total = bars * 4
    dulcimer = Voice36(bpm, total)
    strings = Voice36(bpm, total)
    flute = Voice36(bpm, total)
    celesta = Voice36(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    G = [n("G2"), n("B2"), n("D3")]
    Em = [n("E2"), n("G2"), n("B2")]
    C = [n("C3"), n("E3"), n("G3")]
    D = [n("D3"), n("F#3"), n("A3")]
    prog = [G, Em, C, D] * 4
    roots = [n("G1"), n("E1"), n("C1"), n("D1")] * 4

    v = 0.88
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the market bustle: dulcimer patter in eighths
        fig = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[2] + 24,
               ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[0] + 36]
        for k, m in enumerate(fig):
            dulcimer.dulcimer(b + k * 0.5, m, 1, vel=v * 0.40)
        # breath steaming: warm string pads against the cold
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.30)
        # the pipers on the ice
        flute.flute(b, ch[2] + 12, 2.0, vel=v * 0.40)
        flute.flute(b + 2, ch[0] + 12, 2.0, vel=v * 0.36)
        # coins ringing: celesta sparkle
        celesta.celesta(b + 1, ch[0] + 36, 1.6, vel=v * 0.18)
        celesta.celesta(b + 3, ch[2] + 36, 1.6, vel=v * 0.16)
        if i % 2 == 0:
            celesta.celesta(b + 2, ch[1] + 36, 1.6, vel=v * 0.14)
        # the sledges: measured bass steps
        bass.bass(b, root, 1.5, vel=v * 0.50, cutoff=460)
        bass.bass(b + 2, root, 1.5, vel=v * 0.46, cutoff=460)

    # an original frost-tune: bright boots on packed snow
    frost = [
        (0, "D4", 2), (2, "E4", 2), (4, "G4", 4),
        (8, "A4", 2), (10, "G4", 2), (12, "E4", 4),
        (16, "D4", 2), (18, "G4", 2), (20, "B4", 4),
        (24, "A4", 2), (26, "G4", 2), (28, "E4", 4),
        (32, "D4", 4), (36, "E4", 4),
        (40, "G4", 2), (42, "A4", 2), (44, "B4", 4),
        (48, "A4", 2), (50, "G4", 2), (52, "E4", 2), (54, "D4", 2),
        (56, "E4", 4), (60, "G4", 4),
    ]
    for off, note, d in frost:
        flute.flute(off, n(note), d, vel=v * 0.42)

    stems = {"dulcimer": dulcimer, "strings": strings, "flute": flute,
             "celesta": celesta, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("the-frost-fair", stems,
            {"dulcimer": 0.9, "strings": 0.86, "flute": 0.9,
             "celesta": 0.8, "bass": 0.9}, True)


# ==================================================== SONGS-OF-THE-LONG-ROAD
# Miles of open country: the column sings to keep the miles short.
# D major, 102 BPM. 16 bars. Loop (sample-exact).
# D Bm G A.
def songs_of_the_long_road():
    bpm = 102
    bars = 16
    total = bars * 4
    strings = Voice36(bpm, total)
    flute = Voice36(bpm, total)
    guitar = Track(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    D = [n("D3"), n("F#3"), n("A3")]
    Bm = [n("B2"), n("D3"), n("F#3")]
    G = [n("G2"), n("B2"), n("D3")]
    A = [n("A2"), n("C#3"), n("E3")]
    prog = [D, Bm, G, A] * 4
    roots = [n("D1"), n("B1"), n("G1"), n("A1")] * 4

    v = 0.88
    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        # the tramp of boots: walking string ostinato
        ost = [ch[0] + 12, ch[0] + 12, ch[2] + 12, ch[1] + 12,
               ch[0] + 12, ch[2] + 12, ch[1] + 12, ch[2] + 12]
        for k, m in enumerate(ost):
            strings.strings(b + k * 0.5, m, 0.5, vel=v * 0.36)
        # the campfire guitar: plucked arpeggios
        arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12,
               ch[0] + 24, ch[2] + 12, ch[1] + 12, ch[0] + 12]
        for k, m in enumerate(arp):
            guitar.pluck(b + k * 0.5, m, 1, vel=v * 0.42)
        # the marching column: kick and snare
        drums.kick(b, vel=v * 0.58)
        drums.snare(b + 1, vel=v * 0.46)
        drums.kick(b + 2, vel=v * 0.58)
        drums.snare(b + 3, vel=v * 0.46)
        for k in range(8):
            drums.hat(b + k * 0.5, vel=v * 0.22)
        # the long mile: walking bass
        walk = [root, ch[1] - 12, ch[2] - 12, ch[0] - 12]
        for k, m in enumerate(walk):
            bass.bass(b + k, m, 0.8, vel=v * 0.54, cutoff=520)

    # an original road-song: the horizon never hurries
    road = [
        (0, "A4", 4),
        (8, "G4", 2), (10, "F#4", 2), (12, "E4", 4),
        (16, "F#4", 2), (18, "G4", 2), (20, "A4", 4),
        (24, "D5", 4), (28, "B4", 4),
        (32, "A4", 2), (34, "G4", 2), (36, "F#4", 4),
        (40, "E4", 2), (42, "F#4", 2), (44, "G4", 4),
        (48, "A4", 4), (52, "F#4", 4),
        (56, "E4", 2), (58, "D4", 2), (60, "E4", 4),
    ]
    for off, note, d in road:
        flute.flute(off, n(note), d, vel=v * 0.44)

    stems = {"strings": strings, "flute": flute, "guitar": guitar,
             "drums": drums, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("songs-of-the-long-road", stems,
            {"strings": 0.86, "flute": 0.9, "guitar": 0.88,
             "drums": 0.9, "bass": 0.9}, True)


# ========================================================== THE-COPPER-CROWN
# Not gold, but worn with pride: the younger line holds its small court.
# F major, 86 BPM. 16 bars. Arc: the lesser court -> the gilded days ->
# the tarnish.
# F Dm Bb C.
def the_copper_crown():
    bpm = 86
    bars = 16
    total = bars * 4
    harpsi = Voice36(bpm, total)
    strings = Voice36(bpm, total)
    bell = Voice36(bpm, total)
    bass = Track(bpm, total)
    flute = Voice36(bpm, total)

    def bar(i):
        return i * 4

    F = [n("F2"), n("A2"), n("C3")]
    Dm = [n("D3"), n("F3"), n("A3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    C = [n("C3"), n("E3"), n("G3")]
    prog = [F, Dm, Bb, C] * 4
    roots = [n("F2"), n("D3"), n("Bb2"), n("C3")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.52 + i * 0.08    # the lesser court
        if i < 12:
            return 1.0                # the gilded days
        return 1.0 - (i - 12) * 0.16  # the tarnish

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the small court's music-master: harpsichord figures
        fig = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24,
               ch[2] + 24, ch[0] + 36, ch[1] + 24, ch[2] + 24]
        for k, m in enumerate(fig):
            harpsi.harpsi(b + k * 0.5, m, 1, vel=v * 0.40)
        # the borrowed splendor: strings hold the chords
        for m in ch:
            strings.strings(b, m + 12, 4.4, vel=v * 0.30)
        if i >= 4 and i < 12:
            emb = [ch[0] + 24, ch[2] + 24, ch[1] + 24, ch[0] + 24]
            for k, m in enumerate(emb):
                strings.strings(b + k, m, 1.0, vel=v * 0.32)
        # the copper bell: struck on every bar, proud and hollow
        bell.bell(b, ch[0] + 12, 8, vel=v * 0.34)
        if i >= 4 and i < 12:
            bell.bell(b + 2, ch[2] + 12, 6, vel=v * 0.26)
        # the treasurer counts: patient bass
        bass.bass(b, root - 24, 2.0, vel=v * 0.48, cutoff=200)
        bass.bass(b + 2, ch[2] - 24, 2.0, vel=v * 0.42, cutoff=200)

    # an original court-air: small, neat, and quietly defiant
    court = [
        (0, "C4", 4),
        (8, "A4", 2), (10, "G4", 2), (12, "A4", 4),
        (16, "Bb4", 4),
        (24, "A4", 2), (26, "G4", 2), (28, "F4", 4),
        (32, "G4", 6),
        (40, "A4", 2),
        (48, "C5", 4),
        (56, "Bb4", 8),
    ]
    for off, note, d in court:
        v = arc_vel(int(off // 4))
        flute.flute(off, n(note), d, vel=v * 0.44)

    stems = {"harpsi": harpsi, "strings": strings, "bell": bell,
             "bass": bass, "flute": flute}
    for s in stems.values():
        s.trim()
    return ("the-copper-crown", stems,
            {"harpsi": 0.9, "strings": 0.86, "bell": 0.85,
             "bass": 0.9, "flute": 0.9}, False)


# ==================================================== THUNDER-OF-THE-CAVALRY
# Hoofbeats in the dust: the squadrons come on at the gallop, sabres out.
# C minor, 132 BPM. 16 bars. Arc: the muster -> the charge -> the dust.
# Cm Ab Eb Bb.
def thunder_of_the_cavalry():
    bpm = 132
    bars = 16
    total = bars * 4
    hooves = Voice36(bpm, total)
    warhorn = Voice36(bpm, total)
    brass = Track(bpm, total)
    drums = Track(bpm, total)
    bass = Track(bpm, total)

    def bar(i):
        return i * 4

    Cm = [n("C3"), n("Eb3"), n("G3")]
    Ab = [n("Ab2"), n("C3"), n("Eb3")]
    Eb = [n("Eb3"), n("G3"), n("Bb3")]
    Bb = [n("Bb2"), n("D3"), n("F3")]
    prog = [Cm, Ab, Eb, Bb] * 4
    roots = [n("C1"), n("Ab1"), n("Eb1"), n("Bb1")] * 4

    def arc_vel(i):
        if i < 4:
            return 0.50 + i * 0.10    # the muster
        if i < 12:
            return 1.0                # the charge
        return 1.0 - (i - 12) * 0.16  # the dust settles

    for i, (ch, root) in enumerate(zip(prog, roots)):
        b = bar(i)
        v = arc_vel(i)
        # the gallop: triplet hoof strikes, nearer and nearer
        if i < 4:
            beats = [0, 2]
        else:
            beats = [0, 1, 2, 3]
        for k in beats:
            for sub in (0.0, 1.0 / 3.0, 2.0 / 3.0):
                hooves.hoof(b + k + sub, vel=v * 0.55)
        # the dust under the hooves: low rumble bed
        drums.taiko(b, vel=v * 0.50)
        drums.taiko(b + 2, vel=v * 0.46)
        if i >= 4 and i < 12:
            drums.snare(b + 1, vel=v * 0.44)
            drums.snare(b + 3, vel=v * 0.44)
            for k in range(8):
                drums.hat(b + k * 0.5, vel=v * 0.26)
        if i == 4:
            drums.crash(b, vel=0.70)
        # the cavalry horn: the charge is sounded
        if i >= 2:
            warhorn.warhorn(b, ch[0] - 12, 3.0, vel=v * 0.44)
        # the fanfare of sabres: brass stabs
        brass.brass(b, ch[0], 1.0, vel=v * 0.50)
        brass.brass(b + 2, ch[2], 1.0, vel=v * 0.46)
        if i >= 4 and i < 12:
            brass.brass(b + 1, ch[1], 0.5, vel=v * 0.44)
            brass.brass(b + 3, ch[0], 0.5, vel=v * 0.44)
        # the pounding of the charge: galloping bass roots
        for k in range(8):
            bass.bass(b + k * 0.5, root, 0.4, vel=v * 0.56, cutoff=430)

    # the charge-call: no turning back
    call = [
        (16, "C4", 2), (18, "C4", 2),
        (20, "Eb4", 4),
        (24, "F4", 2), (26, "G4", 2),
        (28, "Ab4", 4),
        (36, "G4", 2), (38, "F4", 2),
        (40, "Eb4", 8),
    ]
    for off, note, d in call:
        v = arc_vel(int(off // 4))
        brass.lead(off, n(note), d, vel=v * 0.52,
                   vibrato=5.5, vib_depth=7.0)

    stems = {"hooves": hooves, "warhorn": warhorn, "brass": brass,
             "drums": drums, "bass": bass}
    for s in stems.values():
        s.trim()
    return ("thunder-of-the-cavalry", stems,
            {"hooves": 0.9, "warhorn": 0.88, "brass": 0.9,
             "drums": 0.92, "bass": 0.9}, False)


# ============================================================ render
TRACKS = [
    (the_autumn_harvest, 0.16),
    (drums_of_the_ember_host, 0.24),
    (the_frost_fair, 0.16),
    (songs_of_the_long_road, 0.16),
    (the_copper_crown, 0.20),
    (thunder_of_the_cavalry, 0.24),
]


def main():
    results = {}
    for fn, wet in TRACKS:
        name, stems, gains, loop = fn()
        results[name] = (c27.mix_track27(name, stems, gains,
                                         reverb_wet=wet, loop=loop), loop)
    c27.to_mp3()
    c27.verify()
    return results


if __name__ == "__main__":
    main()
