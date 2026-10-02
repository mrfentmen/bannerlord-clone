# Procedural SFX Pack

All files in this folder are 44.1 kHz 16-bit mono WAV, generated entirely in
code with numpy (noise bursts, envelopes, simple filters, sine sweeps). No
external samples, no copyrighted material. Generator script: `gen_sfx.py`.
Every file verified: correct sample rate, non-zero RMS, under 2 MB.

## Weapons

| File | What it is | Suggested trigger |
|---|---|---|
| rifle-shot.wav | Sharp noise crack + low thump, 0.5 s | Infantry rifle fire |
| pistol-shot.wav | Shorter, brighter crack, 0.35 s | Sidearm fire, close quarters |
| shotgun-blast.wav | Heavy boom, longer decay, 0.8 s | Shotgun fire, breaching |
| explosion-near.wav | Deep rumble + sub thump, 2.5 s | Nearby artillery, grenade |
| explosion-far.wav | Muffled distant boom, slow attack, 3 s | Off-screen explosions, ambience |
| reload.wav | Two metallic clicks sequenced, 0.65 s | Weapon reload animation |
| sword-clash.wav | Inharmonic metallic ring + noise, 0.7 s | Melee hit, parry |
| arrow-whoosh.wav | Band-passed noise sweeping down, 0.5 s | Arrow/bolt in flight |

## Movement

| File | What it is | Suggested trigger |
|---|---|---|
| footstep-grass.wav | Soft lowpassed tap, 0.18 s | Walking on grass/plains |
| footstep-gravel.wav | Brighter tap with crackle, 0.18 s | Walking on dirt/road |
| footstep-wood.wav | Low wooden knock, 0.22 s | Walking on bridges/forts |

## UI

| File | What it is | Suggested trigger |
|---|---|---|
| ui-click.wav | Short 2 kHz blip, 0.08 s | Button press, menu select |
| ui-hover.wav | Soft 1.2 kHz blip, 0.14 s | Cursor hover, tooltip |

## Events

| File | What it is | Suggested trigger |
|---|---|---|
| war-horn.wav | Low sawtooth swell ~98 Hz, 1.8 s | Battle start, charge order |
| crowd-cheer.wav | Layered noise swell, 2.5 s | Victory, morale boost |
| crowd-gasp.wav | Quick inhale swell, 1.2 s | Ambush, sudden reversal |
| heal-chime.wav | Soft bell tones, 1.5 s | Healing, medic action |

## Ambience

| File | What it is | Suggested trigger |
|---|---|---|
| ambient-wind-loop.wav | 5 s brown-noise wind, seamless loop | Campaign map / idle background |

## Wiring notes

- Footsteps: pick grass/gravel/wood by the terrain tile under the unit.
- explosion-far: play at reduced volume with a random delay after
  explosion-near for depth.
- ambient-wind-loop: loop continuously on the campaign map; crossfade out
  when entering battle.
- war-horn: one-shot at battle start, before the first war-horn
  of crowd-cheer on victory.
