"""Unit tests for the SFX pipeline (task 4C).

Covers: loudness measurement, periodic synthesis seamlessness,
loop-check calibration, manifest integrity, and the one-time repair.
"""
import json
import math
import os
import sys
import unittest
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from loudness import integrated_lufs
from check_loops import check_loop, ABS_FLOOR, REL_FACTOR

SFX_DIR = os.path.join(HERE, '..', '..', '..', 'content', 'audio', 'sfx')
MANIFEST = os.path.join(SFX_DIR, 'audio-manifest.json')


def read_wav(name):
    with wave.open(os.path.join(SFX_DIR, name), 'rb') as w:
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(float) / 32768.0


class TestLoudness(unittest.TestCase):
    def test_sine_reference(self):
        # full-scale 1 kHz sine measures about -3.01 LUFS (K-weighting)
        sr = 44100
        t = np.arange(sr) / sr
        x = np.sin(2 * np.pi * 1000 * t)
        lufs = integrated_lufs(x)
        self.assertAlmostEqual(lufs, -3.01, delta=0.5)

    def test_silence(self):
        lufs = integrated_lufs(np.zeros(44100))
        self.assertEqual(lufs, float('-inf'))

    def test_quieter_is_lower(self):
        sr = 44100
        t = np.arange(sr) / sr
        loud = np.sin(2 * np.pi * 440 * t)
        self.assertGreater(integrated_lufs(loud), integrated_lufs(loud * 0.1))


class TestPeriodicSynthesis(unittest.TestCase):
    def test_engine_loops_seamless(self):
        from synth import engine_loop, secs
        for params in [
                dict(seed=1, chug_hz=6.5, body_freq=42.0),
                dict(seed=2, chug_hz=13.0, body_freq=58.0),
        ]:
            x = engine_loop(dur=2.0, **params)
            step = abs(x[0] - x[-1])
            p999 = np.percentile(np.abs(np.diff(x)), 99.9)
            self.assertFalse(step > 0.02 and step > 3 * p999,
                             f'engine {params} boundary step {step}')

    def test_non_integer_cycles_rejected(self):
        from synth import engine_loop
        with self.assertRaises(AssertionError):
            engine_loop(seed=1, dur=2.0, chug_hz=6.7, body_freq=42.0)

    def test_crowd_loop_seamless(self):
        from synth import crowd_battle_loop
        x = crowd_battle_loop(seed=7, dur=6.0, voices=6, impact_count=3)
        step = abs(x[0] - x[-1])
        p999 = np.percentile(np.abs(np.diff(x)), 99.9)
        self.assertFalse(step > 0.02 and step > 3 * p999,
                         f'crowd boundary step {step}')

    def test_periodic_noise_is_periodic(self):
        from synth import periodic_noise
        rng = np.random.default_rng(0)
        n = 44100
        freqs = np.fft.rfftfreq(n, 1.0 / 44100)
        x = periodic_noise(n, rng, 1.0 / (freqs + 20.0))
        # boundary step must be an ordinary sample step, not a click
        step = abs(x[0] - x[-1])
        self.assertLess(step, 3 * np.percentile(np.abs(np.diff(x)), 99.9))


class TestLoopCheck(unittest.TestCase):
    def test_all_manifest_loops_pass(self):
        with open(MANIFEST) as f:
            man = json.load(f)
        loops = [c['file'].split('/')[-1] for c in man['cues'] if c['loop']]
        self.assertGreater(len(loops), 30)
        failures = []
        for name in loops:
            r = check_loop(os.path.join(SFX_DIR, name))
            if not r['ok']:
                failures.append(name)
        self.assertEqual(failures, [], f'loops with clicks: {failures}')

    def test_artificial_click_fails(self):
        # smooth bed (small natural steps) + injected splice click
        rng = np.random.default_rng(0)
        x = np.convolve(rng.standard_normal(44100), np.ones(64) / 64,
                        mode='same') * 0.5
        y = x.copy()
        y[0] += 0.5  # click at the splice point
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            path = f.name
        try:
            with wave.open(path, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(44100)
                w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
            r = check_loop(path)
            self.assertFalse(r['ok'], 'injected splice click was not caught')
        finally:
            os.unlink(path)

    def test_clean_sine_loop_passes(self):
        # integer-cycle sine: the ideal seamless loop
        n = 44100
        t = np.arange(n) / 44100
        x = 0.5 * np.sin(2 * np.pi * 440 * t)  # 440 cycles exactly
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            path = f.name
        try:
            with wave.open(path, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(44100)
                w.writeframes((x * 32767).astype(np.int16).tobytes())
            r = check_loop(path)
            self.assertTrue(r['ok'], f'clean loop failed: {r}')
        finally:
            os.unlink(path)


class TestManifest(unittest.TestCase):
    def test_manifest_covers_all_wavs(self):
        with open(MANIFEST) as f:
            man = json.load(f)
        wavs = {f for f in os.listdir(SFX_DIR) if f.endswith('.wav')}
        mf = {'audio/' + c['file'].split('/')[-1] for c in man['cues']}
        # manifest stores paths like content/audio/sfx/<name>
        mnames = {c['file'].split('/')[-1] for c in man['cues']}
        self.assertEqual(wavs, mnames)

    def test_required_fields(self):
        with open(MANIFEST) as f:
            man = json.load(f)
        required = {"name", "file", "duration_s", "sample_rate", "channels",
                    "bits", "loop", "category", "trigger", "license",
                    "source", "generator", "synthesis", "lufs", "sha256"}
        for c in man['cues']:
            self.assertTrue(required <= set(c), f'{c["name"]} missing fields')

    def test_no_hot_cues(self):
        with open(MANIFEST) as f:
            man = json.load(f)
        for c in man['cues']:
            if c['lufs'] != float('-inf'):
                self.assertLessEqual(c['lufs'], -14.0, c['name'])


class TestRepair(unittest.TestCase):
    def test_hermite_repair_removes_click(self):
        sys.path.insert(0, os.path.dirname(HERE))
        from repair import hermite_repair
        rng = np.random.default_rng(3)
        x = rng.standard_normal(44100) * 0.2
        x = np.convolve(x, np.ones(32) / 32, mode='same')  # smooth bed
        x[0] = 0.0   # force a boundary click like the legacy loops had
        x[-1] = -0.3
        y = hermite_repair(x)
        step = abs(y[0] - y[-1])
        self.assertLess(step, 0.02)
        # 99.99% of samples untouched
        self.assertEqual(np.count_nonzero(x - y), 2 * 128)


if __name__ == '__main__':
    unittest.main()
