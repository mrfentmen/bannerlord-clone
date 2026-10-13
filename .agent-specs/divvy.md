# Divvy — Buffy / Pax / Hana / Milo (2026-10-03)

Four workers, parallel, no overlap. Stay in your dirs. One lane per commit.

## Pax — scene / 3D / action
Dirs: `clients/campaign/src/scene/**`, `src/input/**`, `src/physics/**`,
battle UI + battle scenes, city/town 3D visuals, animations, scene-side model wiring.
Work: pull-list #1 controller, #2 driving, #4 battle systems, #11 compound assaults,
#18 motorcycles; port `rowan/campaign-client` scene files; his pax-100 leftovers.
Also: client combat pieces of `milo/tasks-101-200` (`scene/PlayerCombat.ts`).

## Hana — world data / audio / art
Dirs: `services/world-data/**`, `clients/campaign/public/{world,audio,textures,models,art}/**`,
`clients/campaign/src/audio/**`, `assets/audio/**`, `tools/**`.
Work: wire music + radio + SFX + ambience (library already on main); wire models,
HDRIs, PBR into data/scenes (with Pax for placement); port client audio code from
`milo/tasks-101-200` + `milo/world-ai`; content packs from `worker/local/battlesim-assets`;
keep wire deploys green; national map prep (do not run until the loop works).

## Milo — sim / server
Dirs: `services/simulation/**`.
Work, in order: (1) port save/load from `milo/save-load`; (2) port battle fixes from
`review/sim-core-2` (Buffy already staged the tests in a sandbox); (3) party/economy:
wages, food, morale, market prices, trucking; (4) quests + notables sim-side;
(5) factions/joining API for the "ethnicity raises or lowers the bar, never blocks" rule.

## Buffy — UI / data / campaign / integration
Dirs: `clients/campaign/src/{ui,data,world}/**`, `clients/campaign/src/main.ts` (owner),
deploy. Work: unblock the start (intro rework), wire menu buttons, campaign systems
(#3, #5-17, #19-28 client side), tier-systems port (UI/data parts), integration, keep
build green, push the others' work to main as it lands.

## Shared edges
- `main.ts`: Buffy owns it. Anyone else needs a hook line — ask, don't edit.
- Assets: add files, never move someone else's.
- Protocol: fetch before push, never force, one lane per commit, no drive-by edits.
