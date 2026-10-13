# crime-systems — NOTES

Found by code-hunt agent 1 (2026-10-03). All 8 finds are MIT,
each verified twice: GitHub API `license.spdx_id` AND the LICENSE
file text. Full agent report with 5 wanted finds, rejects table, and
method caveats: `~/workspace/agent-outputs/crime-systems-finds.md`

Source: `bridge-mind/leonida` — a complete browser GTA in
TypeScript (Three.js + Rapier). ★4, pushed 2026-09-02. Low stars,
highest code quality of anything in the hunt — star count is
meaningless here, read the files.

## ⚠️ License caveat

The repo's LICENSE file is MIT (`Copyright (c) 2026 BridgeMind`) and
governs the code — but the README self-describes as a *"Non-commercial
fan project for testing."* The wording is contradictory. Get
maintainer clarification before shipping anything commercial.

## wanted/ — the wanted/heat state machine

`machine.ts` (313 lines) is the prize: a **pure state machine with
zero engine imports** — takes `(dt, playerPos, seen)`, owns level,
state, heat, searchCenter, searchRadius, evasion, lastSeenPos/At, and
a pool of hotScenes. Fires hooks (`changed`, `cleared`,
`starsGained`, `searching`, `hotSceneReraised`). Unit-testable with
no scene. Copy near-verbatim; the only Babylon work is mapping hooks
to audio/UI.

Three states, and they're the right three:
- `none` → nothing.
- `responding` — a civilian phoned it in. Cops drive to the **crime
  scene**, not to the player. They don't know who did it.
- `active` — a cop has LOS. `lastSeenPos`/`lastSeenAt` stamped per tick.
- `searching` — auto-entered 3 s after last sighting. `searchCenter`
  = `lastSeenPos`, `searchRadius` grows up to `maxRadiusBase +
  30 × level`. **Losing the cops is a growing circle you must escape**,
  not a timer you watch: evasion counts at 1/1.5 speed *inside* the
  circle, full speed outside — so you must leave, not camp.

Three details most clones get wrong:
1. **Witness gating** — a crime only counts if a cop saw it, a
   civilian saw it, or you're already wanted. Unwitnessed crimes
   don't move the meter.
2. **Hot scenes** — crimes in a scene's mergeRadius refresh it; a scene
   survives 120 s and re-raises to 1 star if you walk back in — but
   only on outside→inside transition, so spawning in your own crime
   scene can't chain you into stars.
3. **Same-level witness check** — rejects witnesses with |y − crimeY|
   > 12, so a shot fired in an interior isn't seen by peds below.

Also: heat is a separate 0–100 meter feeding cop accuracy and dispatch
delay. Per-crime star tables (`stars` vs `starsWhenWanted`) with
per-type cooldowns.

## police-data.ts + police/ — the enforcement layer

- `police-data.ts` — `CRIME_TABLE` (12 crime types) + `DISPATCH_TABLE`
  (7 response tiers). The dispatch ladder sets cruiser count, SWAT
  vans, helicopters, roadblocks, spike strips, cop weapons, ramming,
  and shoot-vs-arrest per level — all data, not code.
- `dispatch.ts` — off-screen spawn-point finder + cruiser/SWAT/foot
  cop spawning.
- `CopBrain.ts` — foot-cop FSM: ride → approach → arrest → combat →
  standDown. (`SwatBrain.ts` in the repo is a 19-line subclass with
  higher accuracy — trivial to recreate.)
- `PoliceDriver.ts` — cruiser FSM: route → pursuit → hold → leave,
  A* over a road graph. Engine coupling goes through a `PedBrain` /
  `VehicleDriver` interface — re-implement the two driver types
  against Babylon entities.
- `Helicopter.ts` — orbit-at-altitude, spotlight, crash + explosion.
- `Roadblock.ts` — barricades + spike strips placed ahead of the
  player.
- `arrest.ts` — BUSTED contact timer → arrest, bail, respawn.
- `wanted/vision.ts` — throttled round-robin cop LOS raycasts. Swap
  `raycastInto` for `scene.pickWithRay`; `THREE.Frustum` →
  `BABYLON.Frustum.GetPlanes` + `isInFrustum`.

## missions/ — the heist framework + a real score

- `types.ts` — framework contract: `MissionDef` is data
  (`{id, name, contact, position, unlockedAfter, reward, repeatable,
  build(ctx) → Objective[]}`); `build()` returns a **fresh objective
  array per attempt**, so nothing leaks between retries. Zero engine
  imports — lift and re-implement `game` as a thin Babylon adapter.
- `objectives.ts` — reusable objective factories mapping 1:1 onto
  heist stages: `goto`, `enterVehicle`, `deliver`, `kill`,
  `survive`, `waitFor(event, predicate)` (event-driven — the hook for
  "crew member breaches the vault"), `timed(inner, seconds,
  failReason, showTimer)` (**the getaway clock as a decorator**),
  `lootGrab(counter, seconds, radius, text)`, `robStore`,
  `escapeWanted`, `reachWanted`, `intimidateOrKill`.
- `Runner.ts` — runs one attempt: start → step → pass/fail → cleanup.
  `MissionContext` exposes mutable `reward`, `fail(reason)`, and a
  **LIFO `onCleanup` stack** that runs on pass, fail *or* abort.
- `m8_theScore.ts` — a genuine heist: approach → breach → 20 s loot
  grab → `wanted.setLevel(5)` (**heat is set, not earned** — the
  getaway is a guaranteed 5-star chase, not a coin flip) → timed
  marina escape with an authored fail reason.
- `jobs.ts` — repeatable jobs; `jobRobbery` = `robStore()` →
  `escapeWanted()` → payout. The smallest complete crime loop — the
  best 30-line template to start from.
- `helpers.ts`, `Markers.ts`, `index.ts` — spawning, markers, GPS
  waypoints, availability, save/load, rewards, retry prompt.

## Bounty hunting — empty result, stated plainly

No permissively-licensed bounty system exists (contract on a named
NPC, track, capture/kill for a fee). Every implementation is a
GPL/unlicensed FiveM Lua resource. Build it from these parts: the
mission framework + job-board loop above, `timed()` for the capture
window, `custom()` + `waitFor()` for the "target flees to X" branch,
`intimidateOrKill()` for capture-or-kill, the reputation→payout
curve from `liberty-drive`'s `syndicate.js` (MIT, in the agent
report), and per-cop `MemoryRecord.lastSensedPosition` from yuka
(MIT) for a target who knows you're coming.

## Also worth knowing (not pulled, URLs in agent report)

- `Mugen87/yuka` (MIT, ★1373) — renderer-agnostic AI library: FSM,
  pursuit steering, vision, per-entity memory. The primitives behind
  cop AI, if you don't want leonida's drivers.
- `eldinor/yuka-babylonjs-examples` (MIT file vs ISC package.json —
  both on the allow-list) — the only Babylon-native pursuit demo;
  its `HideBehavior` is a genuine "search for the player" AI.
- `depixeled-chris/gta7` (MIT) — the cleanest minimal wanted loop
  (~30 lines, TS): skeleton; leonida is the flesh.
- `inkle/ink` + `inkjs` (MIT) — the heist **planning** stage nobody
  has code for: crew selection, entry points, branching briefing.
  Narrative engine, not a framework — drives a UI overlay.
- `linranff/GTA_SZ` (MIT, ★408, **Babylon.js** + TS) — no crime
  systems at all, but worth knowing as a Babylon open-world
  reference (city streaming, GLTF streaming, procedural facades).
