# turf-territory — NOTES

Found by code-hunt agent 2 (2026-10-03). License-verified: every repo
below had its `LICENSE` file fetched AND its GitHub API `spdx_id`
cross-checked. GPL/AGPL/unlicensed repos (the whole FiveM/ESX
safehouse ecosystem: `qb-apartments`, `qb-houses`, `qbx_properties`,
`tomic_territories`, …) were all rejected — see the agent report's §4
rejected table for the full list so nobody re-searches them.

Full agent report: `~/workspace/agent-outputs/territory-property-finds.md`

## Turf war — take inkwave's zones.js

`zones.js` — `jaydendavisnc/inkwave` (MIT), Splatoon-style 4v4 browser
game. 425 lines, the whole zone-control rules engine: coverage
thresholds (take at 80%, neutralize at 40%), hold-countdown scoring,
penalty locks on losing a zone (0.75 × progress-lost), objective
rotation between centre and side zones, "about to flip" contest
warning, time-up and overtime rules. Imports **only** a ctx and a
config — no renderer, no three.js. ~90% copy-paste for Babylon:
rewrite two adapters (`G.level` mesh faces → Babylon mesh faces,
`G.paint` coverage grid → keep the CPU grid, drop the GPU atlas).

Adaptation notes for gang turf: replace "ink coverage" with "crew
presence / tag coverage" — gang members standing in a block, or
recently sprayed tags, fill the coverage grid. Countdown scoring
becomes per-block income while held; penalty becomes the rival's
retaliation window. `ZONES-config.js` is the complete tunable block
(take at 0.80, neutralize at 0.40, rates, penaltyK 0.75, …) — balance
is data, not code.

## Slow territory creep — OpenCiv's BorderGrowth.ts

`BorderGrowth.ts` — `RyanGrieb/OpenCiv` (MIT), Civ-5-like for the web.
112 lines, pure static math, ports verbatim to TS: culture-cost curve
(`FIRST_TILE_COST + (10 × tilesAcquired)^1.1`) and the weighted
candidate chooser (luxury/strategic/resource adjacency priorities).
The two models compose: OpenCiv's slow creep for gang **influence**
spreading block-to-block, inkwave's threshold capture for the actual
**takeover** event. Also see `City.captureBy()` in OpenCiv for the
"whole territory flips on conquest" pattern.

## Property / safehouses — the honest picture

**No permissively-licensed repo implements buyable property + stash
end-to-end.** Stated plainly. Best available split (documented in the
agent report, not copied — URLs there):
- `ch-bas/threejs-sims-house-builder` (MIT) — safehouse **interior**
  module: validated layout schema, named room zones, reducer with
  undo/redo, persistence, plan export. Zero three.js imports in the
  data layer — lift directly, rewrite only the geometry builders.
- `TeamDay-AI/business-tycoon` (MIT) — **premises economy**:
  purchase costs, placement validation, staffed-synergy bonuses,
  daily costs, loans, cashflow. Ports as TS economy math.
- `amilich/isometric-city` (MIT, 2,316★) — **land value + taxation**
  model: per-tile landValue, taxRate, zoning R/C/I, abandonment and
  recovery on demand swings. Pure TS simulation, renderer replaceable.

**The property purchase layer must be written:** ~50 lines —
`{id, type, price, ownerId, tier, interiorId, stash[], incomePerDay}`
plus buy/upgrade transactions. Model tunables on inkwave's config
style (data, not code).

## screeps/engine (ISC) — design reference

Room ownership via controller claim, upgrade level caps income
(spawn count), GCL curve gates how much territory you can hold.
Use as the design reference for the safehouse **upgrade tree**:
claim → upgrade controller → more income → progression gates more
territory. Not source to lift (MMO server internals).
