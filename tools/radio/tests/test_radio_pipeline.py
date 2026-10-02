"""Unit tests for the radio + music pipeline (task 4D).

Covers: loudness measurement, qfreq integer-cycle quantization,
seamless-loop construction, vocal texture sanity, manifest integrity,
MP3 delivery files, and synthesis determinism.
"""
import json
import os
import sys
import unittest
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from loudness import integrated_lufs
from check_loops import check_loop, ABS_FLOOR, REL_FACTOR
from synth import (STATION_SPECS, CONTENT_OUT, PUBLIC_OUT, qfreq,
                   vocal_syllable, talk_phrase, steady_filter)

MANIFEST = os.path.join(PUBLIC_OUT, "radio-manifest.json")


def read_wav_float(path):
    with wave.open(path, "rb") as w:
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0


class TestLoudness(unittest.TestCase):
    def test_sine_reference(self):
        sr = 44100
        t = np.arange(sr) / sr
        x = np.sin(2 * np.pi * 1000 * t)
        self.assertAlmostEqual(integrated_lufs(x), -3.01, delta=0.5)

    def test_silence(self):
        self.assertEqual(integrated_lufs(np.zeros(44100)), float("-inf"))

    def test_quieter_is_lower(self):
        sr = 44100
        t = np.arange(sr) / sr
        loud = np.sin(2 * np.pi * 440 * t)
        self.assertGreater(integrated_lufs(loud),
                           integrated_lufs(loud * 0.1))


class TestQfreq(unittest.TestCase):
    def test_integer_cycles(self):
        for dur in (120.0, 150.0):
            for f in (55.0, 43.65, 65.41, 110.0, 220.0, 440.0, 523.25):
                q = qfreq(f, dur)
                cycles = q * dur
                self.assertAlmostEqual(cycles, round(cycles), places=6,
                                       msg=f"f={f} dur={dur}")
                # inaudible deviation from the requested pitch
                self.assertLess(abs(q - f) / f, 0.01)

    def test_zero_and_negative(self):
        self.assertEqual(qfreq(0.0, 120.0), 0.0)
        self.assertEqual(qfreq(-5.0, 120.0), 0.0)


class TestSteadyFilter(unittest.TestCase):
    def test_copies_identical(self):
        # Two consecutive post-transient copies must be bit-identical:
        # the filter's zero-state startup transient is fully contained
        # in the first copy, so steady_filter output is truly periodic
        # whenever its input is.
        from scipy.signal import sosfilt
        from synth import _sos
        sr = 44100
        dur = 4.0
        n = int(sr * dur)
        t = np.arange(n) / sr
        f = qfreq(110.0, dur)
        x = np.sin(2 * np.pi * f * t)
        sos = _sos("low", 1400)
        y = sosfilt(sos, np.concatenate([x, x, x]))
        np.testing.assert_array_equal(y[n:2 * n], y[2 * n:3 * n])

    def test_no_added_boundary_click(self):
        # steady_filter must not add a boundary step beyond the input's
        # own natural sample step (naive sosfilt measured 0.126 here).
        sr = 44100
        dur = 4.0
        n = int(sr * dur)
        t = np.arange(n) / sr
        f = qfreq(110.0, dur)
        x = np.sin(2 * np.pi * f * t)
        y = steady_filter(x, "low", 1400)
        step_in = abs(x[0] - x[-1])
        step_out = abs(y[0] - y[-1])
        self.assertLess(step_out, step_in + 0.01)


class TestVocalTexture(unittest.TestCase):
    def test_syllable_not_silent(self):
        rng = np.random.default_rng(7)
        y = vocal_syllable(rng, 118.0, 0.25, "a")
        self.assertGreater(np.abs(y).max(), 0.01)

    def test_syllable_clean_edges(self):
        # attack/decay envelope: starts and ends near zero (no clicks
        # when concatenated)
        rng = np.random.default_rng(7)
        y = vocal_syllable(rng, 118.0, 0.25, "o")
        self.assertLess(abs(y[0]), 0.02)
        self.assertLess(abs(y[-1]), 0.02)

    def test_all_vowels(self):
        rng = np.random.default_rng(11)
        for v in ("a", "e", "i", "o", "u"):
            y = vocal_syllable(rng, 120.0, 0.2, v)
            self.assertGreater(np.abs(y).max(), 0.01, msg=v)

    def test_phrase_has_gaps(self):
        # phrases contain pauses between syllables (not a solid block)
        rng = np.random.default_rng(13)
        y = talk_phrase(rng, 8.0, f0_base=118.0)
        # at least 10% of samples near silence -> real syllable cadence
        quiet = np.mean(np.abs(y) < 0.02 * np.abs(y).max())
        self.assertGreater(quiet, 0.10)


class TestMasters(unittest.TestCase):
    def test_masters_exist_with_format(self):
        for spec in STATION_SPECS:
            path = os.path.join(CONTENT_OUT, spec["id"] + ".wav")
            self.assertTrue(os.path.exists(path), path)
            with wave.open(path, "rb") as w:
                self.assertEqual(w.getframerate(), 44100)
                self.assertEqual(w.getnchannels(), 1)
                self.assertEqual(w.getsampwidth(), 2)

    def test_durations(self):
        for spec in STATION_SPECS:
            path = os.path.join(CONTENT_OUT, spec["id"] + ".wav")
            with wave.open(path, "rb") as w:
                dur = w.getnframes() / w.getframerate()
            self.assertAlmostEqual(dur, spec["duration_s"], delta=0.05)

    def test_seamless(self):
        for spec in STATION_SPECS:
            path = os.path.join(CONTENT_OUT, spec["id"] + ".wav")
            r = check_loop(path)
            self.assertTrue(r["ok"],
                            f'{r["file"]}: step={r["step"]:.4f} '
                            f'p999={r["p999"]:.4f}')

    def test_lufs_target(self):
        for spec in STATION_SPECS:
            path = os.path.join(CONTENT_OUT, spec["id"] + ".wav")
            x = read_wav_float(path)
            l = integrated_lufs(x)
            self.assertLessEqual(l, -14.0)
            self.assertGreaterEqual(l, -17.5)


class TestDelivery(unittest.TestCase):
    def test_mp3s_exist(self):
        for spec in STATION_SPECS:
            path = os.path.join(PUBLIC_OUT, spec["id"] + ".mp3")
            self.assertTrue(os.path.exists(path), path)
            self.assertGreater(os.path.getsize(path), 1024)

    def test_mp3_ids_match_client(self):
        # the client hardcodes these three ids in radio.ts
        import re
        ts_path = os.path.join(os.path.dirname(HERE), "..", "..", "clients",
                               "campaign", "src", "audio", "radio.ts")
        with open(ts_path) as f:
            ts = f.read()
        for spec in STATION_SPECS:
            self.assertIn(f'id: "{spec["id"]}"', ts)


class TestManifest(unittest.TestCase):
    def test_manifest_valid(self):
        self.assertTrue(os.path.exists(MANIFEST))
        with open(MANIFEST) as f:
            man = json.load(f)
        ids = [s["id"] for s in man["stations"]]
        for spec in STATION_SPECS:
            self.assertIn(spec["id"], ids)

    def test_manifest_files_exist(self):
        with open(MANIFEST) as f:
            man = json.load(f)
        for s in man["stations"]:
            mp3 = os.path.join(PUBLIC_OUT, os.path.basename(s["file"]))
            wav = os.path.join(CONTENT_OUT, os.path.basename(s["master"]))
            self.assertTrue(os.path.exists(mp3), mp3)
            self.assertTrue(os.path.exists(wav), wav)


class TestDeterminism(unittest.TestCase):
    def test_synth_deterministic(self):
        # same seed -> identical first 5 seconds (full-file check is slow)
        import synth as S
        a = S.build_street(seed=401)[:5 * 44100]
        b = S.build_street(seed=401)[:5 * 44100]
        np.testing.assert_array_equal(a, b)

    def test_qfreq_stable(self):
        self.assertEqual(qfreq(55.0, 120.0), qfreq(55.0, 120.0))


if __name__ == "__main__":
    unittest.main()
