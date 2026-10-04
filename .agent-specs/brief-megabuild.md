# MEGABUILD — Pax + Hana: build the whole game, never stop

Boss order 2026-10-03. The game must leave demo state and become a real game.
Three of us are on it — Pax, Hana, Buffy — and we do not stop until
`BUFFY_1000_TASKS.md` is fully built out. A working demo is not done. A sliced
loop is not done. Done is the task list checked off end to end.

Read `.agent-specs/MISSION-4H.md`, `.agent-specs/divvy.md`, and your own brief
(`brief-pax.md` / `brief-hana.md`) first. This file supersedes the numbered
lists in the briefs.

Master task source: `BUFFY_1000_TASKS.md` — 1000 numbered tasks in sections
A–J. Work your sections top-down. Tick the task off in that file **in the same
commit as the work**, and log the completion in `CHANGELOG.md`.

## The one rule that matters

Every task lands as a real implementation. No mocks, no stubs, no placeholder
code, no "coming soon" copy, no hardcoded stand-ins for real data. If a task
cannot be done without faking it, skip it, note why in the commit message, and
move to the next task — do not ship a facade.

## Pax — scene / battle / action

You own `clients/campaign/src/scene/**`, `src/input/**`, `src/physics/**`,
battle UI. Sections A (battle UI 1–100) and F (models & animations 601–750) of
`BUFFY_1000_TASKS.md` are yours, plus your list in
`.agent-specs/pax-100-tasks.md` (finish it — ragdoll, finger fix, animation
fixes, battle scene, performance). Then, in order:

1. Deployment & setup (tasks 1–20): zone meshes, ghost placement, timer,
   ready-up, camera preset. This is the front door of every battle.
2. Battle HUD (21–50): health, morale, formation, minimap feed, kill feed.
3. Orders & command (51–75): select, move, attack, hold, ability triggers.
4. After-action (76–100): casualties, loot, XP, return to campaign map.
5. Unit behaviors in the battle scene (251–300): advance, skirmish, charge,
   hold, rout — drive the Go sim's states, render what it returns.
6. Damage & combat rendering (301–340): hit reactions, blood, deaths, ragdoll.
7. Morale & routing visuals (341–360): flee paths, panic spreading.
8. Models & animations (601–750): finish your 100-list first, then weapon
   props (731–750) and civilians & variety (701–730).
9. Siege equipment models into scenes (681–700), then the compound assault
   prototype becomes a real battle type, not a prototype.
10. Weather + time-of-day rendering in the battle scene (the sim already
    reports both — see task 100 commit 8bc2ea6).
11. Vehicles: finish the drivable car, then the bike (your brief #2).
12. City visuals: traffic + pedestrians + town LOD (your brief #6).

## Hana — audio / world data / assets

You own `services/world-data/**`,
`clients/campaign/public/{world,audio,textures,models,art}/**`,
`clients/campaign/src/audio/**`, `assets/audio/**`, `tools/**`. Sections E
(audio 501–600) and D (world data 401–500) of `BUFFY_1000_TASKS.md` are yours.
In order:

1. Battle SFX wiring (501–530): every weapon fire, impact, reload, death,
   order barks — the library exists in `assets/audio/`, wire it.
2. UI SFX wiring (531–550): panel open/close, trade, error, toggle ticks.
3. Music system (551–570): campaign/battle/town states, intensity crossfade,
   stingers on battle start and end.
4. Ambient & foley (571–590): per-biome ambience, town interiors, weather.
5. Voice & radio (591–600): radio station programming off
   `public/audio/radio/*`, bark lines for notables and orders.
6. Audio settings: volumes, mute, and the settings panel hooks (Buffy owns the
   panel file — send the settings keys in a commit message, do not edit UI).
7. World data (401–500): settlements, roads & travel, factions & territory,
   events & encounters — keep the wire deploys green while you work it.
8. National map expansion prep (51 states, 19,484 places) stays staged until
   the playable loop is green, per your brief — then run it.
9. Manifests: every model, texture, PBR surface and HDRI in
   `public/models/**` and `public/textures/**` gets a manifest entry with
   licence (check `LICENSES.md`), size, and load priority. Flag anything
   over 10 MB.
10. Content packs from `worker/local/battlesim-assets`: voices, SFX, concept
    art — landed into the library and wired.

## Buffy — start flow / integration / meta

Start screen → character creation → spawn-in (end to end), `main.ts`
integration, meta/saves/launch state. Continuing in parallel.

## Shared rules

- Fetch `origin main` before you start and before every push. Never force.
- Push per completed unit. One lane per commit. Commit message names the task
  numbers it completes.
- `main.ts`, `src/ui/panels/StartScreen.ts`, `CharacterMaker.ts` are Buffy's.
  `src/scene/**` is Pax's. `src/audio/**` + assets are Hana's. Export entry
  points and ask for hooks in commit messages instead of crossing lanes.
- Verify before you claim done: `cd clients/campaign && npx tsc --noEmit` and
  vitest for files you touched; `go test ./...` in `services/simulation` when
  you touch Go. Paste the passing output in the commit body.
- Blocked longer than 30 minutes: skip the task, note the blocker in the
  commit, take the next one. Do not stall the list.
