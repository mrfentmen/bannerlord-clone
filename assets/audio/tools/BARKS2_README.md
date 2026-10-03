# Voice barks pipeline — Batch 2 (combat/tactical + NPC flavor)

Extends the batch-1 pipeline (`../barks/barks.py`, same pattern). 117 mp3s total:

- **12 combat/tactical categories** × 3 voices × 3 variants = 108 mp3s
  - charge, rally, taunt, surrender, wounded, volley-fire, cavalry-flank,
    siege-attack, scout-report, follow-me, spread-out, hold-fire
- **3 NPC flavor categories** × 1 voice each × 3 variants = 9 mp3s
  - merchant-greet (briggs), tavern-rumor (paloma), quest-giver (vincent)

## Run it

```sh
cd ~/workspace/staging/barks2
python3 barks2.py                  # render all 117 -> out/barks/
python3 barks2.py --list           # print the script table, render nothing
python3 barks2.py --voices paloma --categories taunt,surrender
python3 barks2.py --force          # re-render existing mp3s
```

## Output layout (to be shipped to the client)

```
~/workspace/staging/barks2/out/barks/<voice>/<category>-<n>.mp3
```

Ship target (main agent integrates): `clients/campaign/public/audio/barks/<voice>/`
alongside the batch-1 files. No filename collisions with batch 1 (all new
category names).

## QC

117/117 passed: non-empty, ffprobe-decodable, duration 0.91–3.55s (within the
0.5–6.0s gate). Report at `out/barks/qc-report.json`.

## Notes for the integrator

- **TTS backend is intermittently flaky** ("truncated or empty audio" errors).
  `barks2.py` retries each render 4× with backoff, skips existing non-empty
  files, and continues past failures so re-running converges.
- **Script line changes from the original draft** (TTS backend rejected or
  mis-timed these):
  - `surrender-3`: "I surrender, hold fire!" → "We give up, cease fire!"
    (backend content filter rejected the exact phrase "I surrender")
  - `taunt-1`: "Is that all?" → "That your best?"
    (briggs voice persistently failed on the old line; renders fine for all voices now)
  - `charge-1`: "Charge! Into the breach!" → "Charge the breach!"
    (paloma's delivery ran 8.95s, over the 6.0s gate)
- Every line ≤ 8 words; no real people, parties, or places named.
