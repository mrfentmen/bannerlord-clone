#!/usr/bin/env python3
"""Radio + music pipeline synthesis (task 4D).

Generates the three radio stations the campaign client expects at
`clients/campaign/public/audio/radio/<id>.mp3` (see
`clients/campaign/src/audio/radio.ts`):

  station-street  "Street Radio"  92 BPM boom-bap bed + street-report chatter
  station-night   "Night Shift"   dark ambient / late-night electronic bed
  station-talk    "Corner Talk"   talk-radio texture over a lo-fi bed

The game is a modern urban strategy game, so the stations are modern
urban formats, not period music.

Everything is numpy/scipy synthesis; no samples, no external services, no
licences to clear. All output is CC0, generated on this VM. Every station
is deterministic: fixed seed -> identical bytes.

Seamless loops: every sustained pitched component is quantized with
qfreq() so it completes an integer number of cycles over the file
duration (asserted at build time); noise beds use the frequency-domain
random-phase technique (periodic by construction); all transients decay
to ~zero and none are placed near the file boundary. No crossfade is
applied and none is needed.

The DJ "voice" on Corner Talk is abstract vocal texture (formant-filtered
sawtooth with syllable cadence), not intelligible speech: it reads as a
radio voice in the background mix. Real DJ voice lines can be dropped
into the same slot later; see RADIO.md.

Output: 44.1 kHz 16-bit mono WAV masters in content/audio/radio/.
run.py converts to MP3 delivery files in the client's public/audio/radio/.

STATION_SPECS is the single source of truth for the manifest.
"""
import numpy as np
import os
import wave
from scipy.signal import butter, sosfilt

SR = 44100
TAU = 2 * np.pi

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, "..", "..")
CONTENT_OUT = os.path.join(REPO, "content", "audio", "radio")
PUBLIC_OUT = os.path.join(REPO, "clients", "campaign", "public", "audio", "radio")
os.makedirs(CONTENT_OUT, exist_ok=True)
os.makedirs(PUBLIC_OUT, exist_ok=True)


# ---------------------------------------------------------------- helpers

def secs(s):
    return int(round(s * SR))


def env_exp(n, tau):
    t = np.arange(n) / SR
    return np.exp(-t / tau)


def env_ad(n, a, d):
    t = np.arange(n) / SR
    e = np.ones(n)
    na = int(a * SR)
    if na > 0:
        e[:na] = np.linspace(0, 1, na)
    e[na:] = np.exp(-(t[na:] - a) / d)
    return e


def qfreq(f, dur):
    """Quantize f so it completes an integer number of cycles over dur."""
    if f <= 0:
        return 0.0
    return round(f * dur) / dur


def _check_integer_cycles(dur, **named_hz):
    for label, hz in named_hz.items():
        cycles = hz * dur
        assert abs(cycles - round(cycles)) < 1e-6, \
            f"{label}={hz}Hz over {dur}s is {cycles} cycles: not integer"


def _sos(kind, lo, hi=None):
    if kind == "band":
        return butter(2, [lo, hi], btype="band", fs=SR, output="sos")
    if kind == "low":
        return butter(2, lo, btype="low", fs=SR, output="sos")
    return butter(2, lo, btype="high", fs=SR, output="sos")


def bp_filter(x, lo, hi):
    return sosfilt(_sos("band", lo, hi), x)


def lp_filter(x, cutoff):
    return sosfilt(_sos("low", cutoff), x)


def hp_filter(x, cutoff):
    return sosfilt(_sos("high", cutoff), x)


def steady_filter(x, kind, lo, hi=None):
    """IIR-filter a periodic signal without the startup transient.

    A time-domain IIR filter starts from zero state, so its first
    samples differ from steady state: filtering a seamless loop this
    way puts a click at the file boundary. Filtering two concatenated
    copies and keeping the second one lets the transient die out in
    the first copy, so the output is periodic whenever the input is."""
    sos = _sos(kind, lo, hi)
    y2 = sosfilt(sos, np.concatenate([x, x]))
    return y2[len(x):]


def periodic_noise(n, rng, mag):
    """Exactly n-periodic noise: random phases at DFT bins, shaped
    magnitudes, inverse DFT. Periodic by construction."""
    nb = n // 2 + 1
    mag = np.asarray(mag, dtype=float)
    assert len(mag) == nb
    phases = rng.uniform(0, TAU, nb)
    X = mag * np.exp(1j * phases)
    X[0] = 0.0
    if n % 2 == 0:
        X[-1] = abs(X[-1])
    x = np.fft.irfft(X, n)
    mx = np.abs(x).max()
    return x / mx if mx > 1e-12 else x


def place(buf, x, at_s, dur_s=None):
    """Add transient x into buffer at offset at_s (seconds).

    When dur_s is given, the transient wraps circularly past the file
    end: a drum hit near the boundary has its tail continue at the file
    start, exactly as a real loop behaves. This keeps the loop seamless
    without thinning the groove near the boundary. Without dur_s (used
    for mid-file phrase assembly in talk_phrase), placement clips."""
    start = int(round(at_s * SR))
    if dur_s is None:
        end = min(len(buf), start + len(x))
        if start < len(buf) and end > start:
            buf[start:end] += x[:end - start]
        return
    n = len(buf)
    idx = (start + np.arange(len(x))) % n
    buf[idx] += x


def write_wav(name, x):
    x = np.nan_to_num(x)
    peak = np.abs(x).max()
    if peak > 0:
        x = x / peak * 0.9
    data = (x * 32767).astype(np.int16)
    path = os.path.join(CONTENT_OUT, name + ".wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    return path


# ---------------------------------------------------------------- drums

def kick_drum(rng, dur=0.32):
    n = secs(dur)
    t = np.arange(n) / SR
    f = 43.0 + 78.0 * np.exp(-t / 0.028)
    phase = TAU * np.cumsum(f) / SR
    body = np.sin(phase) * np.exp(-t / 0.085)
    click = rng.standard_normal(n) * np.exp(-t / 0.006) * 0.35
    return body + lp_filter(click, 3000) * 0.5


def snare_drum(rng, dur=0.22):
    n = secs(dur)
    t = np.arange(n) / SR
    tone = np.sin(TAU * 193 * t) * np.exp(-t / 0.055)
    noise = rng.standard_normal(n) * np.exp(-t / 0.045)
    return tone * 0.65 + bp_filter(noise, 1400, 5200) * 0.55


def hat_hit(rng, dur=0.05, cutoff=7600, gain=1.0):
    n = secs(dur)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-t / (dur / 3.2))
    return hp_filter(noise, cutoff) * 0.4 * gain


def open_hat(rng, dur=0.30):
    return hat_hit(rng, dur=dur, cutoff=6800, gain=0.8)


def crash_hit(rng, dur=1.8):
    n = secs(dur)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-t / 0.55)
    return hp_filter(noise, 4500) * 0.5


# ---------------------------------------------------------------- pitched

def bass_note(freq, dur_s, bright=0.35):
    """freq must already be qfreq'd. Decaying note, loop-safe."""
    n = secs(dur_s)
    t = np.arange(n) / SR
    x = (np.sin(TAU * freq * t)
         + bright * np.sin(TAU * 2 * freq * t)
         + 0.12 * np.sin(TAU * 3 * freq * t))
    return x * env_ad(n, 0.008, dur_s * 0.4)


def stab_chord(freqs, dur_s=0.55, trem_hz=None, file_dur=None):
    """Short Rhodes-ish chord stab. freqs qfreq'd; tremolo only when its
    cycles over file_dur are integer."""
    n = secs(dur_s)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        x += (np.sin(TAU * f * t)
              + 0.30 * np.sin(TAU * 2 * f * t)
              + 0.10 * np.sin(TAU * 3.01 * f * t))
    x /= max(len(freqs), 1)
    if trem_hz and file_dur:
        _check_integer_cycles(file_dur, trem=trem_hz)
        x *= 0.7 + 0.3 * np.sin(TAU * trem_hz * t)
    return x * env_ad(n, 0.01, dur_s * 0.35)


def pluck_note(freq, dur_s=1.4):
    """Sparse night pluck. freq qfreq'd."""
    n = secs(dur_s)
    t = np.arange(n) / SR
    x = (np.sin(TAU * freq * t)
         + 0.4 * np.sin(TAU * 2 * freq * t)
         + 0.18 * np.sin(TAU * 3 * freq * t)
         + 0.07 * np.sin(TAU * 4.2 * freq * t))
    return x * env_ad(n, 0.004, dur_s * 0.30)


# ---------------------------------------------------------------- vocal texture

# Typical adult-male formants (F1, F2, F3) per vowel, Hz.
FORMANTS = {
    "a": (730, 1090, 2440),
    "e": (530, 1840, 2480),
    "i": (270, 2290, 3010),
    "o": (570, 840, 2410),
    "u": (300, 870, 2240),
}
FORMANT_GAINS = (1.0, 0.55, 0.30)


def vocal_syllable(rng, f0, dur_s, vowel):
    """One abstract speech syllable: additive saw through parallel
    formant bandpass filters, with vibrato and a clean attack/decay so
    syllables concatenate without clicks."""
    n = secs(dur_s)
    if n < 64:
        return np.zeros(max(n, 0))
    t = np.arange(n) / SR
    vib = 1.0 + 0.035 * np.sin(TAU * 5.2 * t + rng.uniform(0, TAU))
    phase = TAU * np.cumsum(f0 * vib) / SR
    k = np.arange(1, 25)[:, None]
    exc = np.sum(np.sin(k * phase[None, :]) / k, axis=0)
    exc /= 24
    y = np.zeros(n)
    for F, g in zip(FORMANTS[vowel], FORMANT_GAINS):
        y += g * sosfilt(_sos("band", F - 90, F + 90), exc)
    y /= sum(FORMANT_GAINS)
    na = max(int(0.008 * SR), 1)
    nr = max(int(0.040 * SR), 1)
    env = np.ones(n)
    env[:na] = np.linspace(0, 1, na)
    env[-nr:] *= np.linspace(1, 0, nr)
    y = y * env
    peak = np.abs(y).max()
    if peak > 1e-9:
        y = y / peak * 0.5
    return y


def talk_phrase(rng, dur_s, f0_base=118.0, seed_note=""):
    """A phrase of abstract DJ chatter: syllables with phrase-final
    pitch decline, like a spoken statement."""
    out = np.zeros(secs(dur_s))
    vowels = list(FORMANTS)
    t = 0.0
    # phrase arc: how far through the phrase (for pitch contour)
    syls = []
    while t < dur_s - 0.25:
        syl_dur = float(rng.uniform(0.16, 0.30))
        gap = float(rng.uniform(0.02, 0.09))
        if t + syl_dur > dur_s:
            break
        syls.append((t, syl_dur))
        t += syl_dur + gap
    for i, (at, syl_dur) in enumerate(syls):
        arc = i / max(len(syls) - 1, 1)          # 0 -> 1 over the phrase
        f0 = f0_base * (1.06 - 0.16 * arc) * rng.uniform(0.97, 1.03)
        v = vowels[int(rng.integers(0, len(vowels)))]
        place(out, vocal_syllable(rng, f0, syl_dur, v), at)
    return out


# ---------------------------------------------------------------- stations

def build_street(seed=401):
    """Street Radio: 92 BPM boom-bap loop, 46 bars = exactly 120 s.

    Kick/snare/hats on a swung grid, sub bassline on an Am-F-C-G
    four-bar loop, Rhodes-ish stabs every 4th bar, sparse vocal-chop
    accents, vinyl crackle bed. All pitched material qfreq'd over 120 s;
    drums are decaying transients kept clear of the file boundary."""
    dur = 120.0
    rng = np.random.default_rng(seed)
    out = np.zeros(secs(dur))
    bpm = 92.0
    beat = 60.0 / bpm
    bar = 4 * beat
    n_bars = 46
    assert abs(n_bars * bar - dur) < 1e-9

    # --- drums: swung 8ths, kick/snare pattern varies per 4-bar cycle
    for b in range(n_bars):
        t0 = b * bar
        cyc = b % 4
        # kick: beats 1, 3, plus pickup variations
        kicks = [0, 2]
        if cyc == 1:
            kicks.append(3.5)
        elif cyc == 3:
            kicks += [2.75, 3.5]
        for kb in kicks:
            place(out, kick_drum(rng) * 0.95, t0 + kb * beat, dur_s=dur)
        # snare: beats 2 and 4
        for sb in (1, 3):
            place(out, snare_drum(rng) * 0.8, t0 + sb * beat, dur_s=dur)
        # hats: swung 8ths, open hat on the last 8th of every 2nd bar
        for h in range(8):
            swing = 0.06 * beat if h % 2 else 0.0
            place(out, hat_hit(rng, gain=0.5 + 0.3 * (h % 2 == 0)),
                  t0 + h * beat / 2 + swing, dur_s=dur)
        if b % 2 == 1:
            place(out, open_hat(rng), t0 + 3.5 * beat, dur_s=dur)

    # --- bassline: roots Am F C G, 8th-note groove with octave pops
    roots = [55.0, 43.65, 65.41, 49.0]          # A1 F1 C2 G1
    roots = [qfreq(r, dur) for r in roots]
    _check_integer_cycles(dur, **{f"root{i}": r for i, r in enumerate(roots)})
    for b in range(n_bars):
        root = roots[b % 4]
        t0 = b * bar
        for e in range(8):
            note = root * (2 if (e in (3, 6) and b % 2 == 0) else 1)
            place(out, bass_note(note, beat / 2 * 0.95) * 0.62,
                  t0 + e * beat / 2, dur_s=dur)

    # --- stabs: minor-7 chord on the first beat of every 4th bar
    chord = [qfreq(f, dur) for f in (220.0, 261.63, 329.63, 392.0)]
    for b in range(0, n_bars, 4):
        place(out, stab_chord(chord, trem_hz=6.0, file_dur=dur) * 0.34,
              b * bar, dur_s=dur)

    # --- vocal-chop accents: short formant blips, sparse
    for b in range(2, n_bars, 8):
        t0 = b * bar + 2.5 * beat
        v = ["a", "e", "o"][int(rng.integers(0, 3))]
        chop = vocal_syllable(rng, 165.0, 0.22, v)
        place(out, bp_filter(chop, 900, 3600) * 0.5, t0)

    # --- vinyl crackle bed
    n_crack = 900
    for _ in range(n_crack):
        at = rng.uniform(1.0, dur - 1.0)
        n = secs(0.004)
        imp = rng.standard_normal(n) * env_exp(n, 0.0008)
        place(out, imp * rng.uniform(0.02, 0.09), at)

    # --- glue: gentle lowpass on the music bus is per-element already;
    # light master compression via soft clip
    out = np.tanh(out * 1.1) * 0.9
    return out


def build_night(seed=402):
    """Night Shift: 120 s dark-ambient loop.

    Detuned saw pad on an Am9 voicing with a slow 3-cycle swell,
    pumping sub pulse, sparse pentatonic plucks with echo, risers every
    30 s into soft crashes, vinyl crackle. All sustained pitch qfreq'd
    over 120 s; transients decay clear of the boundary."""
    dur = 120.0
    rng = np.random.default_rng(seed)
    n = secs(dur)
    t = np.arange(n) / SR
    out = np.zeros(n)

    # --- pad: Am9-ish voicing, detuned pairs (detune re-quantized so the
    # beat frequency itself completes integer cycles -> seamless)
    pad_freqs = [110.0, 164.81, 196.0, 246.94, 293.66]
    pad_freqs = [qfreq(f, dur) for f in pad_freqs]
    detuned = [qfreq(f * 1.0035, dur) for f in pad_freqs]
    _check_integer_cycles(
        dur, **{f"pad{i}": f for i, f in enumerate(pad_freqs + detuned)})
    pad = np.zeros(n)
    for f in pad_freqs + detuned:
        pad += np.sin(TAU * f * t) + 0.4 * np.sin(TAU * 2 * f * t)
    pad /= len(pad_freqs) * 2
    swell = 0.72 + 0.28 * np.sin(TAU * 3 * t / dur + 1.1)   # 3 cycles: integer
    pad = steady_filter(pad * swell, "low", 1400) * 0.42
    out += pad

    # --- sub pulse: pumping 55 Hz-ish bed
    sub_f = qfreq(55.0, dur)
    pump = 0.55 + 0.45 * (0.5 + 0.5 * np.sin(TAU * 0.5 * t)) ** 2  # 60 cycles
    out += np.sin(TAU * sub_f * t) * pump * 0.30

    # --- sparse plucks with echo
    scale = [qfreq(f, dur) for f in (220.0, 261.63, 293.66, 329.63,
                                     392.0, 440.0)]
    pluck_times = [7.5, 19.0, 33.5, 52.0, 68.5, 84.0, 99.5, 112.0]
    for i, pt in enumerate(pluck_times):
        f = scale[int(rng.integers(0, len(scale)))]
        pk = pluck_note(f) * 0.30
        place(out, pk, pt, dur_s=dur)
        place(out, pk * 0.35, pt + 0.375, dur_s=dur)     # dotted-8th-ish echo taps
        place(out, pk * 0.14, pt + 0.75, dur_s=dur)

    # --- risers every 30 s into a soft crash
    for rs in (26.0, 56.0, 86.0):
        rn = secs(4.0)
        rt = np.arange(rn) / SR
        sweep_f = 180.0 * (1200.0 / 180.0) ** (rt / 4.0)
        sweep = np.sin(TAU * np.cumsum(sweep_f) / SR)
        noise = rng.standard_normal(rn)
        riser = (sweep * 0.4 + bp_filter(noise, 500, 3500) * 0.25)
        riser *= (rt / 4.0) ** 2
        place(out, riser * 0.35, rs)
        place(out, crash_hit(rng) * 0.30, rs + 4.0)

    # --- airy noise wash, exactly periodic
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    wash = periodic_noise(n, rng, 1.0 / (freqs + 40.0))
    wash = steady_filter(wash, "band", 300, 2400) * 0.05
    out += wash

    # --- vinyl crackle, sparse
    for _ in range(500):
        at = rng.uniform(1.0, dur - 1.0)
        cn = secs(0.004)
        imp = rng.standard_normal(cn) * env_exp(cn, 0.0008)
        place(out, imp * rng.uniform(0.015, 0.06), at)

    out = np.tanh(out * 1.2) * 0.9
    return out


def build_talk(seed=403):
    """Corner Talk: 150 s talk-radio texture.

    Quiet lo-fi music bed (soft keys, brushed hats, crackle) under eight
    phrases of abstract DJ chatter (formant-filtered sawtooth with
    syllable cadence and phrase-final pitch decline), plus a station-ID
    jingle twice. The voice is texture, not intelligible speech; it sits
    in the mix like a radio heard across the room."""
    dur = 150.0
    rng = np.random.default_rng(seed)
    out = np.zeros(secs(dur))

    # --- lo-fi bed: soft keys on Am F C G, 12 s per chord
    chords = [
        [220.0, 261.63, 329.63],   # Am
        [174.61, 220.0, 261.63],   # F
        [196.0, 261.63, 329.63],   # C-ish voicing
        [196.0, 246.94, 293.66],   # G
    ]
    chords = [[qfreq(f, dur) for f in ch] for ch in chords]
    _check_integer_cycles(
        dur, **{f"ch{i}{j}": f for i, ch in enumerate(chords)
                for j, f in enumerate(ch)})
    for ci in range(12):
        ch = chords[ci % 4]
        t0 = ci * 12.5
        n = secs(11.0)
        t = np.arange(n) / SR
        keys = np.zeros(n)
        for f in ch:
            keys += (np.sin(TAU * f * t) + 0.25 * np.sin(TAU * 2 * f * t))
        keys /= len(ch)
        # per-note envelope keeps it loop-safe (no sustained boundary cross)
        keys *= env_ad(n, 0.4, 4.0)
        place(out, lp_filter(keys, 2200) * 0.42, t0, dur_s=dur)

    # --- brushed hats: soft 8ths under the talk
    for h in range(int(dur / 0.42)):
        if h * 0.42 > dur - 1.0:
            break
        place(out, hat_hit(rng, dur=0.03, cutoff=6000, gain=0.22),
              h * 0.42, dur_s=dur)

    # --- crackle
    for _ in range(700):
        at = rng.uniform(1.0, dur - 1.0)
        cn = secs(0.004)
        imp = rng.standard_normal(cn) * env_exp(cn, 0.0008)
        place(out, imp * rng.uniform(0.015, 0.07), at, dur_s=dur)

    # --- talk phrases with pauses
    phrase_starts = [4.0, 24.0, 44.0, 64.0, 86.0, 106.0, 126.0, 141.0]
    phrase_durs = [11.0, 9.0, 12.0, 10.0, 11.0, 9.0, 10.0, 6.0]
    for ps, pd in zip(phrase_starts, phrase_durs):
        f0 = 118.0 * rng.uniform(0.94, 1.06)
        phrase = talk_phrase(rng, pd, f0_base=f0)
        # telephone-ish band to sit it in the mix
        phrase = bp_filter(phrase, 350, 3400) * 1.2
        place(out, phrase, ps)

    # --- station ID jingle at 0:01 and 1:15
    jingle_notes = [qfreq(f, dur) for f in (440.0, 523.25, 659.25,
                                            783.99, 880.0)]
    for js in (1.0, 75.0):
        for i, f in enumerate(jingle_notes):
            place(out, pluck_note(f, 0.9) * 0.35, js + i * 0.22)
        # tiny riser into the jingle
        rn = secs(0.8)
        rt = np.arange(rn) / SR
        riser = rng.standard_normal(rn) * (rt / 0.8)
        place(out, hp_filter(riser, 2000) * 0.10, js - 0.8)

    # --- duck the bed slightly under phrases (static mix choice);
    # harder soft-clip than the music stations: talk has a high crest
    # factor (quiet bed + syllable peaks) and must survive the -16 LUFS
    # normalization without peak-limiting.
    out = np.tanh(out * 1.9) * 0.9
    return out


STATION_SPECS = [
    {"id": "station-street", "name": "Street Radio", "fn": "build_street",
     "params": {"seed": 401}, "duration_s": 120.0,
     "description": "92 BPM boom-bap loop with street-report chatter accents",
     "category": "music", "loop": True},
    {"id": "station-night", "name": "Night Shift", "fn": "build_night",
     "params": {"seed": 402}, "duration_s": 120.0,
     "description": "Dark ambient late-night electronic bed",
     "category": "music", "loop": True},
    {"id": "station-talk", "name": "Corner Talk", "fn": "build_talk",
     "params": {"seed": 403}, "duration_s": 150.0,
     "description": "Talk-radio texture: abstract DJ chatter over lo-fi bed",
     "category": "talk", "loop": True},
]

BUILDERS = {
    "build_street": build_street,
    "build_night": build_night,
    "build_talk": build_talk,
}


def synthesize_all():
    made = {}
    for spec in STATION_SPECS:
        fn = BUILDERS[spec["fn"]]
        x = fn(**spec["params"])
        made[spec["id"]] = write_wav(spec["id"], x)
    return made


if __name__ == "__main__":
    made = synthesize_all()
    for name, path in made.items():
        print(f"WROTE {name}.wav -> {path}")
