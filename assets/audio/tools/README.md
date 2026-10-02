# Audio generation tools

All game music and SFX are synthesized in-house with numpy DSP.
No samples, no licensed material, no recordings.

## Tools

- `synth.py` — the DSP engine (instruments, drums, reverb, limiter)
- `compose.py` — batch 1: menu, loading, battle, ambient-exploration, victory, defeat
- `compose5.py` — batch 5: tavern-rest, siege-assault, night-patrol, pursuit
- `sfx.py` — batch 1: 27 effects (weapons, vehicles, UI, foley, ambience, radio)
- `sfx2.py` — batch 2: 10 effects (coin, quest-complete, horn, crowd, helicopter…)

## Render

```sh
cd assets/audio/tools
python3 compose5.py   # wav mixes + stems -> out/
python3 sfx2.py       # wav effects -> out/sfx/
# then MP3:
ffmpeg -i out/tavern-rest-mix.wav -codec:a libmp3lame -b:a 192k out/tavern-rest-mix.mp3
```

Copy finished MP3s to `clients/campaign/public/audio/{music,sfx}/` and
regenerate `audio-manifest.json` (see the manifest script in the batch-5 notes).
