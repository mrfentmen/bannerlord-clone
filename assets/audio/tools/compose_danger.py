"""Danger-pulse: a tension layer that sits under the music when the party
has critical warnings. D minor, 100 BPM, 8 bars, seamless loop.
Taiko pulse + low drone + dissonant string swells.
Render: python3 compose_danger.py -> out/danger-pulse-mix.wav"""
import os
import numpy as np
from synth import Track, reverb_stereo, limiter, write_wav, SR, secs

OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)

NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def n(name):
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


def danger_pulse():
    bpm = 100
    bars = 8
    beats = bars * 4

    drums = Track(bpm, beats)
    drone = Track(bpm, beats)
    swells = Track(bpm, beats)

    # Taiko heartbeat: bar starts strong, answers on 3.5, grows each 2 bars
    for bar in range(bars):
        b0 = bar * 4
        grow = 0.75 + 0.25 * (bar / (bars - 1))
        drums.taiko(b0, vel=1.0 * grow)
        drums.taiko(b0 + 2.5, vel=0.7 * grow)
        drums.kick(b0 + 1, vel=0.55 * grow)
        drums.kick(b0 + 3, vel=0.55 * grow)
        # 8th-note tick undercurrent, enters at bar 3
        if bar >= 2:
            for e in range(8):
                drums.hat(b0 + e * 0.5, vel=0.28)
    # fill into the loop point
    for i, f in enumerate([110, 98, 110, 130]):
        drums.tom(beats - 4 + i, freq=f, vel=0.6)

    # Low drone: D2 pedal with A2 fifth, swells per 2 bars
    for bar in range(0, bars, 2):
        drone.bass(bar * 4, n("D2"), 8, vel=0.5, cutoff=320.0)
        drone.bass(bar * 4, n("A2"), 8, vel=0.35, cutoff=300.0)

    # Dissonant string swells: D5/Eb5 cluster, every 2 bars, slow attack
    for bar in range(0, bars, 2):
        swells.pad(bar * 4 + 2, [n("D5"), n("Eb5"), n("A5")], 6,
                   vel=0.30, cutoff=1800.0, attack=1.6)
    # final bar: brass stab on the downbeat of the loop restart feels wrong for
    # a loop; instead a low brass swell that crests INTO the loop point
    swells.brass(beats - 4, n("D3"), 4, vel=0.5)

    stems = {"drums": drums.trim(), "drone": drone.trim(), "swells": swells.trim()}
    gains = {"drums": 1.0, "drone": 0.9, "swells": 0.85}
    bufs = {}
    for sname, trk in stems.items():
        b = trk.buf.astype(np.float64) * gains[sname]
        bufs[sname] = b
        write_wav(os.path.join(OUT, f"danger-pulse-stem-{sname}.wav"),
                  limiter(b, ceiling=0.89))
    mix = sum(bufs.values())
    stereo = reverb_stereo(mix, wet=0.12, decay=1.4)
    stereo = limiter(stereo, ceiling=0.89)
    # seamless loop: crossfade the tail into the head ON THE FINAL SIGNAL,
    # so reverb tails wrap around instead of smearing the splice.
    xf = int(0.75 * SR)
    tail = stereo[-xf:].copy()
    stereo = stereo[:-xf]
    fade_in = np.linspace(0, 1, xf)
    fade_out = np.linspace(1, 0, xf)
    if stereo.ndim > 1:
        fade_in = fade_in[:, None]
        fade_out = fade_out[:, None]
    stereo[:xf] = stereo[:xf] * fade_in + tail * fade_out
    path = os.path.join(OUT, "danger-pulse-mix.wav")
    write_wav(path, stereo)
    peak = float(np.max(np.abs(stereo)))
    rms = float(np.sqrt(np.mean(stereo ** 2)))
    print(f"danger-pulse: {len(stereo)/SR:.1f}s peak={peak:.3f} rms={rms:.3f} -> {path}")
    # loop check: endpoint continuity
    jump = float(np.max(np.abs(stereo[-64:] - stereo[:64])))
    print(f"loop endpoint jump: {jump:.4f}")
    return path


if __name__ == "__main__":
    danger_pulse()
