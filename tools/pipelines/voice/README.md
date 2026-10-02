# Voice pipeline

Asset contract, ingestion, lookup, and coverage for dialogue voice lines.
Master-plan Tier 4, first audio slice. No third-party test dependencies;
run everything with the system Python 3.

## Files

- `contract.py` — sidecar JSON schema + validator. Every voice audio file
  gets a `<id>.voice.json` sidecar with per-line metadata (character,
  emotion, context tags) and technical facts (format, sample rate,
  loudness). Masters are 48 kHz WAV; delivery files are MP3/OGG.
  Line text follows Del's writing rules (plain ASCII, no em dashes).
- `ingest.py` — raw recording in, game-ready files out. Decodes anything
  ffmpeg reads, trims silence, normalizes to **-16 LUFS** integrated
  (ITU-R BS.1770 K-weighting + gating, peak-limited to -1 dBFS), writes a
  48 kHz WAV master and an MP3 delivery file plus the sidecar.
  `--transcript` enables silence-splitting a batch recording into
  per-line segments; the split only proceeds when the segment count
  matches the transcript line count, otherwise the file is flagged for
  manual review.
- `lookup.py` — `lookup(manifest, notable_id, topic, relationship)` returns
  the best-matching line set (+3 notable, +2 topic, +1 relationship,
  deterministic tie-break). Unknown notables fall back to the generic
  pool; an empty manifest returns a null result instead of raising.
- `coverage.py` — (notable, topic) coverage from `registry.json`.
  `--check baseline.json` exits 1 on regression; use in CI.
- `test_voice_pipeline.py` — 18 self-tests, all synthetic signals.
  `python3 test_voice_pipeline.py`

## Client playback hooks (for the campaign client)

`lookup()` returns `{sidecar_id, file, character, text, emotion}`. The
client dialogue UI should:

1. call lookup on line show, 2. play `file` while rendering `text` as the
   subtitle, 3. interrupt the audio when the player advances the dialogue,
   4. duck the ambient bed 6 dB while a line plays (see the ambient-mix
   task). The manifest lives at `content/audio/voices/manifest.json`
   once the full ingest pass is done.

## Curating the 81 existing voice batches

Each `<class>-<batch>.mp3` has a matching `.txt` transcript. To ingest:

```
python3 ingest.py content/audio/voices/infantry-2.mp3 \
  --out content/audio/voices \
  --character "Gruff Brick" --class infantry \
  --voice-id avocado_v2:vincent \
  --emotion urgent --tags combat,contact \
  --transcript content/audio/voices/infantry-2.txt \
  --id-prefix infantry-2
```

Character/voice-id per class come from `content/audio/voices/VOICES.md`.
Emotion and tags need a human read of the transcript lines; do not bulk
assign them. Files that fail the split gate are listed by ingest and
need manual segmentation.

## Registry

`registry.json` lists the notables the game needs lines for and the topics
each must cover. `coverage-baseline.json` is the CI floor. To refresh:

```
python3 coverage.py --manifest content/audio/voices/manifest.json \
  --registry registry.json --write-baseline coverage-baseline.json
```
