# SFX Pack 4 — manifest

Fourth procedural sound-effects pack for the Bannerlord-style game. Packs 1
(SFX.md), 2 (SFX2.md) and 3 (SFX3.md) cover the basics, tiered weapons,
vehicles, ambient beds, siege, campaign/UI, crowd states, and music. This
pack adds melee impact foley, shield blocks, vehicle engine state variants,
and scalable crowd-battle ambience beds.

Per ART_AND_AUDIO.md section 9, every file carries: source, author, license,
date.

- source: original, procedurally generated on project VM (numpy synthesis)
- author: Milo audio synth
- license: CC0
- date: 2026-10-01

All files: 44.1kHz 16-bit mono WAV, loudness-normalized to -16 LUFS
(see LOUDNESS.md). Files marked LOOP play seamlessly. Generator script:
`tools/sfx/synth.py` (recipes in `assets/audio/SFX_RECIPES.md`).

## 1. Melee impacts (MASTER_PLAN 4C task 115)

| File | Trigger |
|---|---|
| melee-impact-flesh.wav | Punch / unarmed strike lands on a body |
| melee-impact-armor.wav | Melee weapon strikes plate / hard armor |

## 2. Shield blocks (MASTER_PLAN 4C task 115)

| File | Trigger |
|---|---|
| shield-block-wood.wav | Attack blocked by a wooden shield |
| shield-block-metal.wav | Attack blocked by a metal / riot shield |

## 3. Vehicle engine variants (MASTER_PLAN 4C task 115)

Idle / rev states of the existing pack-2 engine loops. The base
`tank-engine.wav` / `truck-engine.wav` remain the cruise loops.

| File | Trigger |
|---|---|
| tank-engine-idle.wav | LOOP: tank engine idling |
| tank-engine-rev.wav | LOOP: tank engine under load / revving |
| truck-engine-idle.wav | LOOP: truck engine idling |
| truck-engine-rev.wav | LOOP: truck engine under load / revving |

## 4. Crowd-battle ambience, scalable intensity (MASTER_PLAN 4C task 116)

Three seamless layers; the client crossfades between them by live battle
intensity (wired to the 4E battle-ambience hook, `crowdGainFor`).

| File | Trigger |
|---|---|
| crowd-battle-low-loop.wav | LOOP: battle ambience, low intensity (skirmish) |
| crowd-battle-mid-loop.wav | LOOP: battle ambience, medium intensity (engagement) |
| crowd-battle-high-loop.wav | LOOP: battle ambience, high intensity (full battle) |

## Wiring notes

- melee-impact-flesh vs melee-impact-armor: pick by the target's armor
  class at hit time; fall back to flesh on unarmored targets.
- shield-block-wood vs shield-block-metal: pick by the defender's shield
  material; wood for militia/rebels, metal for faction troops.
- Engine state: idle when the vehicle is stationary, rev when it starts
  moving or takes a hit, cruise (`tank-engine.wav` / `truck-engine.wav`)
  at steady speed. Crossfade 0.4 s between states.
- Crowd-battle layers: crossfade low -> mid -> high as the live unit
  count rises; all three are the same length and phase-agnostic beds so
  any crossfade point works.
