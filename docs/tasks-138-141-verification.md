# Agent report: MASTER_PLAN 138 + 141 verification

Local agent 2, 2026-10-01. Branch `main`, all commits pushed directly to `main`.

## Verdict

Rowan's `4dd4a5c6` was structurally sound — the store logic, the panels, and his
unit tests were all real and pass — but both features were **wired to nothing at
their sources**. Both acceptance criteria are now met in code, in tests, and in a
browser.

Three further pre-existing defects were blocking `npm run build` and the entire
Playwright suite; those are fixed too.

## Commits (main)

| SHA | What |
| --- | --- |
| `2165880` | fixes: real kills/gold + a quick-battle board producer |
| `0a71218` | e2e smoke test for both panels + the four defects it exposed |
| `c95f5a4` | supply-line hex literals → status tokens (unblocked the design guard) |
| `854f27c` | weapon GLB runtime wiring: vitest + browser smoke test |

## Task 138 — "stats accumulate across campaigns"

**Verdict: partially met on arrival. Met now.**

Structurally correct: a store keyed `fentmen.lifetimestats.v1`, independent of
campaign save slots, so a new campaign cannot reset it. Battles, play time,
campaigns, seasons, treaties and schemes all fold correctly, and the values
survive a fresh load.

The gap: **kills and gold earned could never be non-zero.** `recordLifetimeBattle`
accepted `kills` and `goldEarned`, and main.ts called it with `{ won: true }` and
nothing else. The battle layer already reported everything needed —
`AfterActionView` carries `attackerLosses`, `defenderLosses` and `loot` — but
`onBattleEvent` collapsed it to the string `"victory"` / `"defeat"` before
main.ts could read it. The stats page then labelled the rows "awaiting battle
reports", which was honest about the symptom and wrong about the cause.

`onBattleEvent` now receives the view, and `battleReportFromAfterAction` maps it:
kills are the losses of the side the player was *not* on, losses are their own
side's, gold is loot and counts only on a win. Verified end to end — the panel
shows 378 kills / 2,730 gold across 21 seeded battles.

One note on Rowan's design, which I kept: `recordLifetimeBattle` still tolerates a
report with no view (counts the battle, drops the unmeasured parts) rather than
requiring one.

## Task 141 — "top 10 per mode"

**Verdict: board logic met on arrival; one of the three modes had no producer.**

The board code is correct and I did not change it: per-mode stores, sorted
descending, capped at 10, the 11th entry evicts the lowest, equal scores keep
insertion order (stable sort), and `submitScore` returns the rank taken or `-1`.
`battleScore` (10/kill + 100 win − 5/loss, floored at 0) and `tournamentScore`
(25/round + rating) are documented in the module header.

The gap: **the `quick-battle` board was never written to.** Only `arena.ts` and
`menu.ts` call `submitScore`, and `createModesMenu` is not mounted by any app
shell — so the arena and tournament producers are unreachable too. The panel note
conceded this ("quick-battle results follow once those bouts report back"), but
that left 1 of 3 required modes permanently empty and the other 2 dead.

Every campaign-map bout is a quick battle, so `onBattleEvent` now submits one via
`battleScore(kills, ownLosses, won)`. That needed own losses threaded through
`BattleReport`, which is what `battleReportFromAction` returns.

**Left unfixed, needs an owner:** arena and tournament still have no reachable
producer, because mounting `createModesMenu` is an app-shell decision, not a
leaderboard one. `submitScore("arena", …)` and the tournament submit are correct
and tested; they simply need something to call them.

## Also fixed — these blocked the build and the whole e2e suite

None of these were Rowan's; all three were red on `main` before this work.

1. **`npm run build` could not pass.** `build` runs `tsc --noEmit`, and 9 errors
   were live: unused bindings in `AnimationController`, `AudioAnimationBridge`,
   `ModelLoader`, and `blendIn`/`blendOut` being optional but compared as
   defined. Rowan's own claim of "tsc clean" was true when he measured it and had
   since been invalidated by `21df87d`.
2. **`models.test.ts` had two stacked failures.** It asserted a hardcoded `30`
   manifest entries against `48` actual, and used a non-recursive `readdirSync`, so
   the 10 weapon GLBs under `weapons/` read as missing files. Now lists
   recursively and asserts the count from disk.
3. **`build:e2e` never set `VITE_SIMULATION_SOURCE=fixture`.** `--mode fixtures`
   puts the fixture module in the bundle, but the config still defaulted to
   `http`, so every Playwright run died on "the world simulation sent something
   this client cannot read". One missing env var had the whole e2e suite red.
   `tools/check-no-fixtures.mjs` scans env *files*, so the production build stays
   clean — verified by rebuilding it.

## Browser verification

`tests/e2e/metaPanels.spec.ts` boots the real client, seeds both stores through
their own APIs, opens both panels, and screenshots each. Seeding goes through
`recordLifetimeBattle` / `submitScore` rather than hand-written JSON, so a change
to either storage key or record shape fails the test instead of quietly rendering
an empty panel.

Four defects only visible in a browser, all fixed:

- **The character maker (task 142) had no CSS at all.** Not one of its classes
  appeared in any stylesheet. It rendered unstyled in document flow underneath
  the map canvas, so every control was unclickable and **the game could not be
  started at all**. Added the missing rules, positioned over the canvas as
  `.start` is.
- **The HUD rail overflowed.** 24 rail buttons is ~1500 px — taller than any
  laptop viewport. It spilled past the fixed `.app` shell, gave `html` a scroll
  range, and the resulting page scroll dragged the whole absolutely-positioned
  HUD up, so panels opened clipped above the window. The rail now scrolls inside
  its column. (An overflow fix existed but was gated behind `ui-scale=150`.)
- **`.hud__right` had the grid `min-height: auto` problem**, so a ten-row board
  grew past the `1fr` row and clipped. `min-height: 0` lets it shrink;
  `.panel__body` already scrolled.
- The two spec helpers that drive the start screen were stale — the maker sits
  between faction select and the campaign mount, and neither went through it.

The spec now asserts the shell never scrolls and each panel sits fully inside the
viewport, because a screenshot will happily record a half-off-screen panel as
"rendered". That assertion is what caught the last two layout bugs.

Screenshots `20`–`24` in `clients/campaign/screenshots/`, numbered past the
existing `01`–`14` so they cannot collide with the small-screen set.

## Known bug, not fixed here

The first-launch graphics probe (`maybeAutoDetectQuality`) calls
`location.reload()` when it changes a construction-time key, which discards the
campaign that was just started — it lives only in memory, and the `autoQualityDone`
flag is written after the reload. A first-time player who picks a side, makes a
character and starts the game lands back on faction select. The new spec sets
`autoQualityDone` to step around it. This is a real defect and wants an owner; it
is orthogonal to 138/141.

## Phase 2

**Item 1, Hana's tier-systems — assessed, not mergeable.** The branch is 85
commits over a base **240 commits behind** `main`, and a trial merge in a
throwaway worktree conflicts in **23 files**: `sim/engine.go`, `model/fields.go`,
`model/entities.go`, `simrun/systems.go`, `systems/siege/siege.go`, plus the
campaign client, `world/notables.json` and the fixture provider. It carries
sweeping renames (`Ruler→Leader`, `Clan→Organization`, `Vassal→Affiliate`) and a
commit that deletes the rebellion system. This is not "review the diff and merge
if clean" — it is an integration project that needs an owner and a plan.
Nothing was merged; `main` was not touched.

**Item 2, weapon GLB runtime wiring — done.** The ten Quaternius weapons now have
proof they load:

- `src/scene/__tests__/weaponModels.test.ts` drives the real `ModelLibrary`
  against a real Babylon `Scene` (NullEngine) served over loopback from `public/`.
  Every weapon must spawn a node whose longest hierarchy axis matches its
  manifest `targetLengthM`, sitting on `y=0`. Also pins the glTF magic bytes, the
  container cache, and that a failed entry is evicted so a retry can work.
- `tests/e2e/weaponModels.spec.ts` proves the other half: that `vite preview`
  actually serves `/models/weapons/*.glb` at the URL the loader builds
  (`MODELS_BASE_URL` + a subdirectory `entry.file`), with a binary content-type.

Getting the first to run needed the `@babylonjs/loaders/glTF` side-effect import
the client does at boot, plus CORS on the test server — Babylon loads through
`XMLHttpRequest` and jsdom treats the test page as foreign. Without both, every
case failed with "Unable to load", which is precisely the failure class the test
exists to catch. The ten-weapon count is asserted first so an empty manifest
cannot make the per-weapon cases pass vacuously. Confirmed it catches a real
break: corrupting `ak74.glb` fails it, restoring passes it.

Stopped after item 2, as instructed. Item 3 (Ohio world-data swap) appears to
already be done by another agent — `51f9b27` "World data: deploy the Ohio River
Valley region".

## Verification (my runs, not the earlier claim)

- `npx tsc --noEmit` — clean
- `npx vitest run` — **1388/1388 across 139 files**
- `npm run build` — exit 0, production build confirmed free of fixture code
- `npm run build:e2e` — exit 0, fixtures present
- Playwright — `metaPanels` and `weaponModels` green

Rowan's commit claimed 1168/1168. The suite has since grown past that; the
`4dd4a5c6` delta itself checked out — his new test files run and pass, and they
are not vacuous.