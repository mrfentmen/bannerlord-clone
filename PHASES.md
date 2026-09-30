# PHASES.md

Build order. Do not start a phase until the previous phase's exit criteria are met, per CONSTITUTION.md section 7.

The order is chosen to prove the two riskiest things first, the cause-and-effect simulation and the crowd rendering, before building anything around them.

---

## PHASE 0: World Data Pipeline
**Goal:** real geography and settlements in a usable format.
- Choose the V1 region (a metro area plus surrounding towns and countryside is enough).
- Import roads, settlements, boundaries, elevation, and populations.
- Classify settlements into cities, towns, and villages by threshold rules applied to real data.
- Seed each settlement's starting fields (population, food production, sanitation baseline) from real data plus documented config constants.
- Load into Postgres.

- Because the game starts as all of America, the pipeline covers the whole country from the start: all 50 states plus D.C., assigned to the six sections in FACTIONS.md, with computed state profiles (population, food output, mining output, economic output, area, ports).
- Build the **first playable slice** (a few states from more than one side) on top of the full-country data, so the pipeline is proven at full scale but the game content stays manageable.

**Exit criteria:** a script outputs every settlement in the region and every state profile for the country with real data, verified against real figures for at least 10 spot-checked places, and the six sides show rating profiles roughly matching FACTIONS.md section 3 (checked, not forced).

## PHASE 1: Headless Simulation
**Goal:** prove the web of cause and effect works with no graphics.
- Implement the systems in CAUSE_EFFECT.md section 3 against Phase 0 data.
- Implement the cause log.
- Run multi-year simulations with no player, and with a scripted "dumb player" that makes bad choices.
- Tune constants in the config file against the runs.

- Include the four resources (money, gold, food, metal) and the march, supply, and attrition systems from CAUSE_EFFECT.md sections 8 and 9.
- Include basic ruler decisions so rulers march, raid, and trade in the headless run.

**Exit criteria:** all ten example chains in CAUSE_EFFECT.md sections 5 and 10 are observable in logs without scripting, and a "why" query on any collapsed town returns a real chain of at least five linked causes. Headless runs also show that no side dominates every run (checked across many seeds).

## PHASE 2: Campaign Map Client
**Goal:** a playable map over the proven simulation.
- **Lock visual direction first:** references, palette, typography, tone.
- 3D terrain and roads, towns as clickable 3D clusters, parties and caravans moving in real time.
- Town panel, market panel, party panel, and the Why panel.
- Go API and WebSocket connection (or the browser-sim option from SPEC.md section 9).
- Skeleton loading states everywhere.
- **Side and state selection screen** showing ratings, pros, cons, and biggest danger per side (FACTIONS.md).
- March planner showing travel time and cost before committing (MARCH_AND_WAR.md section 11).
- Ledger and resource warnings (ECONOMY.md section 10).

**Exit criteria:** a player can walk a party across the map, enter a town, buy and sell goods, see real stats, and watch prices and unrest respond over time, with the Why panel explaining at least one real event.

## PHASE 3: Crowd Rendering Proof of Concept
**Goal:** de-risk the hardest technical problem in isolation.
- Thin-instanced, GPU-skinned troops in an empty scene.
- Three-tier LOD with billboard far tier.
- Asset pipeline from ASSETS.md running end to end for one troop type.

**Exit criteria:** 300 units at 60 fps and 1,000 units at 30 fps on mid-range consumer hardware, not just the dev machine.

## PHASE 4: Battle Scene
**Goal:** a real, self-contained battle.
- Formation movement, engagement, morale, rout.
- Player-controlled character with the chosen combat model from DESIGN.md section 1.
- Terrain and cover.
- Snapshot loader and result write-back.

**Exit criteria:** two armies built from real party data fight to a resolved outcome that correctly reflects troop count, quality, morale, supply state, and terrain, and the result writes back with cause log entries.

## PHASE 5: Integration
**Goal:** connect campaign and battle into one loop.
- Party contact on the map triggers the battle scene with the right snapshot.
- Battle results update parties, towns, factions, and reputation.
- Sieges and town capture.

**Exit criteria:** in one session a player can trade, recruit, fight a battle, take a town, and see the consequences ripple (a garrison pulled from a road leads to a robbed caravan, for example) with the Why panel explaining them.

## PHASE 6: Governance and Depth
**Goal:** make ruling a town the deep, dangerous part of the game.
- Council votes, taxes, buildings, garrison orders, clinic and granary investment.
- Outbreak events with player response options (quarantine, medicine orders, sanitation).
- Companions governing towns, caravan management, faction AI.
- Full ruler roster, relations, defections, ransom, and succession (RULERS.md).
- Army gathering with influence costs, sieges, war declarations, peace terms, and vassalage (MARCH_AND_WAR.md).
- Character progression, perks, troop trees.

**Exit criteria:** a player can lose a town to a vote, lose one to plague, and save one from either, and each outcome traces cleanly through the cause log.

## PHASE 7: Content and Polish
**Goal:** flavor and finish, last because it is the most expensive to redo.
- LLM-generated town descriptions, character bios, and event text per SPEC.md section 8.
- Visual and audio pass, credits screen from the asset manifest.
- Performance tuning toward larger battles and a larger map.

**Exit criteria:** an end-to-end playable loop across a meaningful slice of the map with real content, ready for real playtesting.
