# SFX Pack 2 — manifest

Second procedural sound-effects pack for the Bannerlord-style game. Pack 1
(SFX.md) covers the basics; this pack adds tiered weapons, vehicles, ambient
beds, siege, campaign/UI, crowd states, and music stingers.

Per ART_AND_AUDIO.md section 9, every file carries: source, author, license,
date.

- source: original, procedurally generated on project VM (numpy synthesis)
- author: Milo audio synth
- license: CC0
- date: 2026-09-30

All files: 44.1kHz 16-bit mono WAV. Files marked LOOP play seamlessly.

## 1. Weapons by tier (FEATURES.md era tiers)

| File | Trigger |
|---|---|
| bolt-action-rifle.wav | Tier 1 infantry fires (bolt-action, 1950s) |
| assault-rifle-burst.wav | Tier 2 infantry 3-round burst |
| machine-gun-sustained.wav | Tier 2 machine gunner sustained fire |
| grenade-throw-explode.wav | Grenade throw then explosion |
| mortar-launch.wav | Mortar tube launch thump |
| mortar-whistle-impact.wav | Incoming mortar whistle then impact |
| rocket-launcher.wav | Rocket launch roar + detonation |
| artillery-cannon-distant.wav | Distant artillery fire |

## 2. Vehicles (ART_AND_AUDIO.md 8.3: engines differ by class)

| File | Trigger |
|---|---|
| motorcycle-engine.wav | LOOP: motorcycle idle/move |
| jeep-engine.wav | LOOP: jeep idle/move |
| truck-engine.wav | LOOP: truck idle/move |
| armored-carrier-engine.wav | LOOP: armored carrier idle/move |
| tank-engine.wav | LOOP: tank idle/move |
| horse-gallop.wav | LOOP: horse cavalry movement |

## 3. Ambient beds (ART_AND_AUDIO.md 8.3: ambience by size/time)

| File | Trigger |
|---|---|
| tavern-interior.wav | LOOP: inside a tavern/bar |
| blacksmith-shop.wav | LOOP: near a smithy/workshop |
| town-day-small.wav | LOOP: small town, daytime |
| city-night-large.wav | LOOP: large city, nighttime |
| rain-battle.wav | LOOP: battle in heavy rain |
| campfire-night.wav | LOOP: camp at night (fire + crickets) |
| battlefield-distant-rumble.wav | LOOP: near an active battlefield |

## 4. Siege

| File | Trigger |
|---|---|
| battering-ram-hit.wav | Battering ram strikes gate |
| wall-breach-collapse.wav | Wall section collapses |
| alarm-bell.wav | Siege alarm / town alert |
| fire-crackling-loop.wav | LOOP: burning building/area |

## 5. Campaign / UI

| File | Trigger |
|---|---|
| map-march-step.wav | Army marching on campaign map |
| coins-count.wav | Buying, selling, tax collection |
| paper-unfold.wav | Opening reports, letters, orders |
| radio-static-tune.wav | Tuning the in-game radio (8.2) |
| telephone-ring.wav | Field telephone rings (Tier 1 comms) |
| stamp-thunk.wav | Approving orders, documents |

## 6. Crowd (ART_AND_AUDIO.md 8.3 environmental cues)

| File | Trigger |
|---|---|
| crowd-murmur-unrest.wav | Town with low food / unrest rising |
| crowd-panic.wav | Outbreak, rout, or disaster panic |

## 7. Music stingers (original compositions)

| File | Trigger |
|---|---|
| victory-stinger.wav | Battle/campaign victory |
| defeat-stinger.wav | Battle/campaign defeat |
| tension-riser.wav | Rising tension before an event |
