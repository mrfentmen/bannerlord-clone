# Art pipeline — README

Faction insignia, loading screens, canonical palette, post-processing recipe.
Covers ART_AND_AUDIO.md items: faction colors/insignia on uniforms + vehicles
(line 65), insignia/flags in UI and on the map (line 50), the color palette
checklist (line 25), and the post-processing recipe (line 28).

## What's here

| File | What it is |
|---|---|
| `generate-banners.py` | Procedural banner/insignia generator (PIL). Deterministic: seed from faction id. Outputs 512x512 PNG + SVG per faction. |
| `POST_PROCESSING.md` | Era color grade (lift/gamma/gain per channel), film grain, vignette, bloom — concrete values per quality tier (low/med/high). |
| `../public/art/banners/<faction-id>.png` | Shipped banners (also `.svg` — use SVG in UI where scaling matters). |
| `../public/art/loading/*.webp` | AI-generated loading screens, 2048x1152, era grade baked in. No real people, no real logos. |

## Usage

Regenerate all six section banners:

```sh
python3 tools/art/generate-banners.py --out clients/campaign/public/art/banners
```

One faction:

```sh
python3 tools/art/generate-banners.py lone_star_frontier --out /tmp/one
```

Unknown id? It tells you the six valid ones:
`pacific_compact, mountain_alliance, great_lakes_union, southern_compact, lone_star_frontier, atlantic_corridor`.

## Canonical palette

The project's canonical colors live in `PALETTE` inside `generate-banners.py`
(per-faction primary/secondary/accent) and `STATUS` (good/warning/critical).
If the client needs them at runtime, import that table — don't hand-copy hex
values into a second source of truth.

## Adding a faction

Add an entry to `PALETTE` with a `charge` from
{stripes, chevron, circle, tower, star, bolt} and re-run. The field shape
(shield / roundel / banner) is picked by hashing the faction id, so new
factions get a stable, distinct look automatically.

## Loading screens

Generated with the media pipeline (see `ART_README` history in git). To make
more, keep the same constraints: 16:9, modern-America campaign vibe, era
grade (warm highlights / cool shadows), no real people, no real logos, no
text. Drop them in `clients/campaign/public/art/loading/`.
