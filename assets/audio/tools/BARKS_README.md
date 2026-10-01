# Voice barks pipeline (ART_AND_AUDIO.md 8.4)

V1 voice: short single-line unit barks, no full dialogue. 3 voices x 11
categories x 3 line variants = 99 mp3s.

- **Voices** (`--voices`): `vincent` (gruff male squad leader),
  `briggs` (calm male rifleman), `paloma` (female scout).
  Voice ids are the exact `id` values from
  `/opt/hatch/skills/voice-selector/voice_source.json`.
- **Categories** (`--categories`): select, move, attack, advance, hold,
  retreat, victory, defeat, enemy_spotted, reloading, medic.

Every script line is <= 8 words and names no real people or parties.

## Run it

```sh
cd assets/audio/tools
python3 barks.py                  # render all 99 -> out/barks/
python3 barks.py --list           # print the script table, render nothing
python3 barks.py --voices vincent --categories attack,retreat
python3 barks.py --force          # re-render existing mp3s
```

## Output layout (shipped to the client)

```
clients/campaign/public/audio/barks/<voice>/<category>-<n>.mp3
```

e.g. `clients/campaign/public/audio/barks/vincent/attack-2.mp3`.

## QC

After rendering, every file is checked automatically: non-empty,
ffprobe-decodable, duration in [0.5, 6.0]s. Report at
`out/barks/qc-report.json`. The run exits non-zero if any file fails.

## Manifest

Per ART_AND_AUDIO.md section 9, every shipped mp3 has an entry in
`assets/audio-manifest.json` (source, author, licence, date, attribution,
sha256, bytes). Credits screen is generated from the manifest.

## Gameplay use

Pick a bark by faction voice mapping, e.g.:

```ts
// category "attack", random variant, voice "vincent"
const n = 1 + Math.floor(Math.random() * 3);
play(`audio/barks/vincent/attack-${n}.mp3`);
```
