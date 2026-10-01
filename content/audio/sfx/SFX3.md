# SFX Pack 3 — manifest

Third procedural sound-effects pack for the Bannerlord-style game. Packs 1
(SFX.md) and 2 (SFX2.md) cover the basics, tiered weapons, vehicles, ambience,
siege, campaign/UI, crowd states, and stingers. This pack adds Tier 3/4 era
weapons, battle intensity layers, more siege/weather/animals/tavern/campaign
sounds, UI feedback, and original music loops.

Per ART_AND_AUDIO.md section 9, every file carries: source, author, license,
date.

- source: original, procedurally generated on project VM (numpy synthesis)
- author: Milo audio synth
- license: CC0
- date: 2026-10-01

All files: 44.1kHz 16-bit mono WAV. Files marked LOOP play seamlessly.
Generator script: `gen_sfx.py`. Every file verified: correct sample rate,
non-zero RMS, under 2 MB.

## 1. Weapons, Tier 3/4 era (FEATURES.md era tiers)

| File | Trigger |
|---|---|
| sniper-rifle-shot.wav | Tier 3/4 sniper fires (long crack, 1.6 s) |
| smg-burst.wav | Tier 1 submachine-gun burst, close quarters |
| grenade-launcher-thump.wav | Grenade launcher fires (Tier 2/3) |
| antitank-missile-launch.wav | Tier 3 anti-tank missile launch |
| tank-cannon-near.wav | Nearby tank main-gun fire |
| shotgun-pump.wav | Shotgun pump action |
| pistol-suppressed.wav | Suppressed sidearm shot (Tier 3/4 stealth) |
| knife-stab.wav | Melee knife attack |

## 2. Battle layers (ART_AND_AUDIO.md 8.1: dynamic battle audio)

| File | Trigger |
|---|---|
| bullet-crack-overhead.wav | Supersonic cracks passing near the camera |
| ricochet-whine.wav | Bullet ricochet off hard cover |
| dirt-impact-thud.wav | Rounds striking dirt near the player |
| suppression-loop.wav | LOOP: sustained incoming-fire bed while suppressed |
| distant-battle-loop.wav | LOOP: far-off battle rumble bed |

## 3. Siege

| File | Trigger |
|---|---|
| breaching-charge-beep.wav | Breaching charge arming beeps |
| door-breach-blast.wav | Door/gate blown by breaching charge |
| catapult-release.wav | Siege engine release |
| ram-rolling-loop.wav | LOOP: siege tower / ram rolling |

## 4. Weather (ART_AND_AUDIO.md 8.3: weather sounds)

| File | Trigger |
|---|---|
| thunder-near.wav | Close lightning strike |
| thunder-distant.wav | Distant thunder rumble |
| wind-howl-loop.wav | LOOP: howling wind, storm/night |

## 5. Animals

| File | Trigger |
|---|---|
| horse-whinny.wav | Cavalry horse whinny |
| dog-bark.wav | Town/camp dog bark |
| crow-caw.wav | Battlefield/town crow |

## 6. Tavern

| File | Trigger |
|---|---|
| mug-clink.wav | Drinks served, toast |
| dice-roll.wav | Gambling in the tavern |
| tavern-laughter.wav | Crowd laughter swell |
| bar-piano-loop.wav | LOOP: original piano tune, bar background |

## 7. Campaign map

| File | Trigger |
|---|---|
| convoy-rumble-loop.wav | LOOP: vehicle convoy on the move |
| train-pass.wav | Train passing on rail lines |
| airplane-flyover.wav | Tier 4 aircraft flyover |
| radio-chatter-loop.wav | LOOP: garbled procedural radio chatter |
| helicopter-rotor-loop.wav | LOOP: Tier 4 helicopter rotor |

## 8. UI feedback

| File | Trigger |
|---|---|
| ui-confirm.wav | Confirm action, dialog accept |
| ui-cancel.wav | Cancel action, dialog dismiss |
| ui-error.wav | Invalid action, error buzz |
| ui-select.wav | Unit/card select tick |
| notification-ping.wav | New notification, message received |
| quest-complete-chime.wav | Quest objective complete |
| levelup-fanfare.wav | Troop/character levels up |

## 9. Music (original compositions, ART_AND_AUDIO.md 8.1)

| File | Trigger |
|---|---|
| battle-drums-low-loop.wav | LOOP: low-intensity battle drums |
| battle-drums-high-loop.wav | LOOP: high-intensity battle drums |
| campaign-pad-loop.wav | LOOP: slow atmospheric campaign pad |
| radio-music-loop.wav | LOOP: original tune for the in-game radio (8.2) |

## 10. Miscellaneous

| File | Trigger |
|---|---|
| footstep-mud.wav | Walking on mud/wet ground |
| footstep-metal.wav | Walking on metal decks/vehicles |
| door-open.wav | Door opens |
| door-close.wav | Door closes |
| car-door-slam.wav | Vehicle door slam |
| engine-start.wav | Vehicle engine cranking to life |
| air-raid-siren.wav | Air raid / town alert siren |
| gun-jam-click.wav | Weapon jammed, dry click |
