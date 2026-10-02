# Radio + music pipeline (task 4D)

Deterministic procedural radio-station pipeline for the game. Generates
the three stations the campaign client expects at
`clients/campaign/public/audio/radio/<id>.mp3` (see
`clients/campaign/src/audio/radio.ts`), loudness-normalizes them,
encodes MP3 delivery files, regenerates the manifest, and runs a CI gate
plus unit tests. Everything is numpy/scipy synthesis; no samples, no
external services, no licences to clear (all output is CC0, generated on
this VM).

## Quick start

```bash
python3 tools/radio/run.py --ci         # full pipeline
python3 tools/radio/run.py --synth      # regenerate WAV masters only
python3 tools/radio/run.py --normalize  # loudness pass only
python3 tools/radio/run.py --mp3        # MP3 encode only
python3 tools/radio/run.py --manifest   # rebuild radio-manifest.json only
python3 tools/radio/run.py --loops      # seamless-loop check only
python3 tools/radio/run.py --gate       # CI gate only
python3 tools/radio/run.py --tests      # unit tests only
```

## Stages

| Script | What it does |
|---|---|
| `synth.py` | Generates the three station WAV masters into `content/audio/radio/`. `STATION_SPECS` is the single source of truth (id, name, builder, seed, duration). |
| `loudness.py` | ITU-R BS.1770-4 integrated loudness (copied from tools/sfx so this pipeline is self-contained). |
| `normalize.py` | Normalizes masters toward -16 LUFS in place; writes per-file report to `content/audio/radio/LOUDNESS.md`. Idempotent. |
| `to_mp3.py` | Encodes masters to 128k MP3 with ffmpeg/libmp3lame into `clients/campaign/public/audio/radio/`. |
| `manifest.py` | Rebuilds `clients/campaign/public/audio/radio/radio-manifest.json` (duration, format, sha256 of WAV + MP3, LUFS, synthesis params). |
| `check_loops.py` | Verifies every station master is sample-seamless (same calibrated dual criteria as the SFX pipeline). |
| `check_audio.py` | CI gate: master/delivery coverage, manifest fields, 44.1 kHz/mono/16-bit, -14 LUFS ceiling on masters and decoded MP3s, loop seamlessness, MP3 duration match. |
| `tests/` | Unit tests (`test_radio_pipeline.py`). |

## Stations

| id | name | format |
|---|---|---|
| `station-street` | Street Radio | 92 BPM boom-bap loop (120 s): swung drums, sub bassline on Am-F-C-G, Rhodes-ish stabs, sparse vocal-chop accents, vinyl crackle. |
| `station-night` | Night Shift | Dark ambient loop (120 s): detuned saw pad with slow swell, pumping sub pulse, sparse pentatonic plucks with echo, risers into soft crashes. |
| `station-talk` | Corner Talk | Talk-radio texture (150 s): lo-fi keys bed under eight phrases of abstract DJ chatter, station-ID jingle twice. |

## Seamless loops

Same construction discipline as the SFX pipeline: every sustained
pitched component is quantized with `qfreq()` to complete an integer
number of cycles over the file duration (asserted at build time); noise
beds are synthesized in the frequency domain (random phases at DFT
bins), periodic by construction; transients decay to ~zero and wrap
circularly past the file end instead of being truncated. Time-domain
IIR filters on full-length periodic material use `steady_filter()`
(filter two concatenated copies, keep the second) so the filter startup
transient cannot put a click at the boundary. No crossfade is applied
and none is needed.

## The Corner Talk voice

The DJ "voice" is abstract vocal texture, not intelligible speech:
a 24-harmonic sawtooth through three parallel formant bandpass filters
(adult-male F1/F2/F3 per vowel), with 5.2 Hz vibrato, syllable-rate
amplitude cadence, and phrase-final pitch decline. It sits in the mix
like a radio heard across the room. Real DJ voice lines can replace
the texture phrase-for-phrase later; the mix slot (telephone-band
350-3400 Hz, phrases at fixed timestamps) is documented in RADIO.md.
