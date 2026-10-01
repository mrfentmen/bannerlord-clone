# SFX pipeline (task 4C)

Deterministic procedural sound-effects pipeline for the game. Generates
pack-4 cues, loudness-normalizes the whole catalog, verifies every loop is
sample-seamless, regenerates the manifest, and runs a CI gate plus unit
tests. Everything is numpy synthesis; no external services, no licences
to clear (all output is CC0, generated on this VM).

## Quick start

```bash
python3 tools/sfx/run.py --ci        # full pipeline
python3 tools/sfx/run.py --synth      # regenerate pack-4 cues only
python3 tools/sfx/run.py --normalize  # loudness pass only
python3 tools/sfx/run.py --manifest   # rebuild audio-manifest.json only
python3 tools/sfx/run.py --loops      # seamless-loop check only
python3 tools/sfx/run.py --gate       # CI gate only
python3 tools/sfx/run.py --tests      # unit tests only
```

## Stages

| Script | What it does |
|---|---|
| `synth.py` | Generates the 11 pack-4 cues into `content/audio/sfx/`. `CUE_SPECS` is the single source of truth (name, builder, params, trigger, category). |
| `loudness.py` | ITU-R BS.1770-4 integrated loudness (K-weighting, 400 ms blocks, 75% overlap, dual gates). |
| `normalize.py` | Normalizes all 116 cues toward -16 LUFS in place; writes per-file report to `content/audio/sfx/LOUDNESS.md`. Idempotent. |
| `manifest.py` | Rebuilds `content/audio/sfx/audio-manifest.json` (duration, format, sha256, LUFS, loop/category/trigger from the SFX*.md docs, synthesis params). |
| `check_loops.py` | Verifies every manifest-flagged loop is sample-seamless (task 118). |
| `check_audio.py` | CI gate: wav/manifest coverage, required fields, 44.1 kHz/mono/16-bit, LUFS ceiling (-14), loop seamlessness. |
| `repair.py` | ONE-TIME remediation, not part of CI. Repaired boundary clicks in 8 legacy loops (see below). |
| `tests/` | 14 unit tests (`test_sfx_pipeline.py`). |

## Seamless loops (task 118)

New loops are synthesized to be *exactly periodic*: every component
completes an integer number of cycles over the loop duration (asserted at
build time), and noise beds are synthesized in the frequency domain
(random phases at DFT bins), which is periodic by construction. No
crossfade is needed and none is applied.

The check (`check_loops.py`) measures the boundary step `|x[0]-x[-1]|`
against two calibrated criteria; a file fails only if it violates both:

- absolute: step > 0.02 (-34 dBFS) - audible even in a quiet bed;
- relative: step > 3x the file's own p99.9 sample step - anomalous for
  its texture (dense bright beds have large natural steps).

The earlier cross-correlation approach was abandoned during calibration:
it misfires on periodic content, and measuring honestly showed 13 of the
34 shipped loops had real single-sample boundary clicks (up to 0.40),
including 5 of the 11 new ones. All were fixed: the 8 legacy loops with a
C1 Hermite-spline boundary repair (`repair.py`, ~6 ms interpolated, rest
of file bit-identical), the 5 new ones by re-synthesizing them with the
periodic construction. 34/34 loops now pass.

## Loudness (task 117)

All cues normalized toward -16 LUFS integrated (BS.1770-4). Files that
cannot reach -16 without clipping sit below it (peak-limited); a few
high-crest-factor ambience beds are flagged for review rather than
crushed. Per-file numbers live in `content/audio/sfx/LOUDNESS.md`.

## CI

`.github/workflows/sfx-ci.yml` (add with a workflow-scoped token; the
usual OAuth token cannot push workflow files):

```yaml
name: sfx-ci
on: [push, pull_request]
jobs:
  sfx:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install numpy
      - run: python3 tools/sfx/run.py --ci
```

## Recipes

Human-readable synthesis recipes for every cue: `assets/audio/SFX_RECIPES.md`.
