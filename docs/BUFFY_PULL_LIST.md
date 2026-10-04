# Missing systems — pull list for Buffy

**Setting: modern-day America.** This is a Mount & Blade-style game,
not medieval Calradia. Every section below is framed for the modern
setting: gangs not bandits, motorcycles not horses, syndicates not
kingdoms, bars not taverns, contractors not mercenaries, turf and
fronts not fiefs. When a reference repo is medieval/fantasy, the
notes say how the mechanic maps.

Status of each item verified against the repo on 2026-10-03 unless
noted. "In repo" means the code is already pulled and waiting —
wire it in. "Pull from GitHub" means clone it yourself; the exact
files are listed.

License rule: copy code only from repos with a detected OSI license.
Unlicensed repos get reimplemented from design notes, never copied.

## 1. Player controllers (VERIFIED missing — no FPS/TPS/character controller exists)

The game has orbit cameras only (`ArcRotateCamera` on campaign map
and battle overview). No WASD handling exists anywhere. The `src/input/`
system has bindings but nothing consumes them for movement.

### 1a. FPS/TPS controller — IN REPO (Babylon-native, preferred)
- `docs/code-pulls/babylon-controller/` — found by code-hunt agent 3,
  license-verified via GitHub API + LICENSE files.
- **Build on:** `ssatguru/BabylonJS-CharacterController` (Apache-2.0,
  243 stars, TypeScript, npm-published): complete kinematic
  controller, no physics engine needed. Slope limits, step offset,
  **elastic camera with collision**, animation blending, and a
  **third→first-person radius blend** — the TPS↔FPS switch for free.
  The Babylon APIs it uses are unchanged in Babylon 8.
- **Missing pieces** (no head-bob, no crouch): take from
  `crazyramirez/BJS_Character_Controller_V2` (MIT) in the same folder —
  the only Babylon controller with real head-bob (lines 3618-3636:
  sprint-scaled frequencies/amplitudes, exponential return to centre)
  plus crouch and sprint. Self-contained math, ports verbatim.
- Full agent report with two more verified options (Havok-based TPS,
  minimal pointer-lock FPS reference):
  `~/workspace/agent-outputs/babylon-controller-finds.md`

### 1b. FPS controller (three.js alternative) — IN REPO
- `docs/code-pulls/fps-controller/` (MIT, BridgeMind 2026): full
  controller with **recoil** and **ADS**, plus a complete weapon
  system (state machine, viewmodel, grenades).
- Use the Babylon-native 1a for the character; take the weapon system
  and recoil/ADS feel from here. The zombies repo also has enemies
  and a nav grid if needed:
  https://github.com/bridge-mind/claude-opus-5.5-zombies-game (MIT)

## 2. Driving mechanics (VERIFIED missing — vehicle models have no code)

Kenney/KayKit cars and trucks exist as models; nothing drives them.

### Driving — IN REPO
- `docs/code-pulls/vehicle-physics/` (MIT, BridgeMind 2026)
- `kart.js`: arcade grip model — lateral-velocity decay, drift with
  mini-turbo, hop, boost pads, wall collision (restitution 0.35),
  offroad slowdown, slope gravity. All plain math, ports to
  Babylon vectors directly.
- `ai.js`: `AIDriver` — personality-driven AI drivers (lane bias,
  aggression, skill-scaled reaction). Free traffic behavior.
- `track.js`: spline tracks with progress queries (for race/pursuit logic).
- Read `vehicle-physics/NOTES.md`. The constants table at the top of
  `kart.js` is the tuning surface.

### Tank mechanics — ADAPT, no direct pull found
- No MIT tank-specific repo in the sweep. Adapt `kart.js`:
  lower top speed, higher grip (no drift), add turret yaw independent
  of hull yaw, heavier wall response. The model (`tank-quaternius.glb`)
  is already in `clients/campaign/public/models/`.

## 3. Faction / campaign AI (staged references, nothing wired)

- `docs/code-pulls/mcts-ai/` (MIT) — parallel Monte Carlo Tree Search
  library (Rust). Implement `GameState` + `Evaluator`, get UCT/AlphaGo
  policies. The endgame for strategic faction decisions.
- `docs/code-pulls/strategy-ai/` (notes only, no license) — layered
  bots (random → greedy → alpha-beta → ISMCTS), determinization for
  hidden enemy armies, exact combat-odds math for auto-resolve.
- `docs/code-pulls/strategy-core/` (MIT) — Three Kingdoms strategy
  data model: factions, officers, cities, armies, diplomacy, tech +
  batch turn resolution. Closest structural relative to our Go sim.

## 4. Battle systems (staged references)

- `docs/code-pulls/rts-battle/` (MIT) — unit command state machine
  (move / attack-move / engage / harvest), target acquisition,
  spawner units, data-driven maps. `unit_base.gd` is the spec for
  battle-unit AI.
- `docs/code-pulls/siege-combat/` (notes only) — pure-function ranged
  combat: cooldowns, projectiles, AoE, knockback, wall blocking.
  Port the shape into Go with tests.

## 5. NPC dialogue (VERIFIED missing — no conversation system)

Diplomacy data exists (`src/diplomacy/`), but there is no NPC
conversation system.

- `docs/code-pulls/dialogue-graph/` (notes only, no license) —
  conversations as immutable graph data (nodes + linear/branch/end
  exits), session walker, validation tests. Author conversations as
  JSON; persuasion checks plug into branch exits.

## 6. Dungeons / interiors / visibility (staged reference)

- `docs/code-pulls/roguelike/` (MIT) — room-and-corridor dungeon gen,
  Bresenham line-of-sight, fog of war, 7 enemy types, items,
  XP/leveling. All pure functions. For hideouts, building interiors,
  scouting and stealth.

## 7. Town economy & traffic (staged reference)

- `docs/code-pulls/city-sim/` (notes only) — tile economy (zoning,
  tax, happiness, power), per-tile road traffic load, instanced
  traffic/pedestrian rendering split.

## 8. Deterministic sim patterns (staged reference)

- `docs/code-pulls/deterministic-sim/` (notes only) — 30 Hz fixed-tick
  sim separated from renderer, input sanitization at the boundary,
  injectable RNG, bots writing into the same input channel as players.

## 9. Art pipeline (in repo, needs wiring / tooling)

- **PBR materials** — `clients/campaign/public/textures/vendor/pbr/`
  (CC0): 10 surfaces, albedo/normal/roughness/AO. Plug into
  Babylon `PBRMaterial`. Doc: `textures/README.md`.
- **HDRI skies** — `clients/campaign/public/textures/vendor/hdris/`
  (CC0): 12 skies (day/dawn/sunset/night/overcast/storm) for IBL +
  skybox and time-of-day lighting.
- **FBX conversion (BLOCKED)** — 967 FBX files staged under
  `clients/campaign/public/models/vendor/` are not browser-ready and
  not in the manifest. No converter available in the sandbox
  (FBX2glTF URLs dead, no assimp). Needs a real FBX→GLB pipeline
  before these are usable.

## 10. Open backlog (from project state, not re-verified today)

- Real battle-sim wiring (milo's lane).
- Go sim quest/diplomacy reintegration.
- Side-select/start flow — fix claimed, never verified on the boss's device.
- Market trading, party management, march planning — untested end to end.

## 11. Compound assaults (sieges, modernized) (VERIFIED missing client-side)

The Go sim has `services/simulation/cmd/apiserver/campaign/siege.go`,
but the client has zero siege files. Modernized: assaulting fortified
gang compounds, cartel mansions, guarded warehouses — breaching,
room clearing, and siege engines become battering rams / breaching
charges / armored vehicles.

- `docs/code-pulls/siege-combat/` (notes only) — ranged combat spec:
  cooldowns, projectiles, AoE, knockback, wall blocking.
- `docs/code-pulls/rts-battle/` (MIT) — unit assault states for
  attackers/defenders on walls.
- Art: `clients/campaign/public/models/vendor/gravewake/` has
  `catapult.glb` (siege engine model, MIT) already in the repo.
- GitHub: https://github.com/Jaxsbr/toy-box-siege (no license —
  reimplement from the notes, don't copy).

## 12. Bandits / street gangs (VERIFIED missing client-side)

The Go sim has `campaign/bandits.go`; the client has nothing. In
modern America these are street gangs — they should roam, raid, and
have hideouts to clear (`clan/hideout.ts` exists for the player side).

- `docs/code-pulls/rts-battle/` (MIT) — `unit_base.gd` target
  acquisition and engage states work for gang AI.
- `docs/code-pulls/roguelike/` (MIT) — `spawnEnemies` (floor-scaled,
  room-distributed spawning) is the pattern for gang hideout
  population.
- **Turf war rules engine** — `docs/code-pulls/turf-territory/` (MIT,
  inkwave): complete zone-control rules — coverage-threshold flips,
  hold-countdown scoring, penalty locks, objective rotation.
  Adapt "ink coverage" to crew presence / tag coverage; countdown
  becomes per-block income. `ZONES-config.js` for tunables.
- **Slow territory creep** — `BorderGrowth.ts` (MIT, OpenCiv, same
  folder): cost-curved influence spreading, block to block. Compose
  with inkwave: creep for influence, threshold capture for takeover.

## 13. Small towns / rural communities (villages, modernized) (VERIFIED missing entirely)

Towns exist (`ui/panels/TownPanel.ts`, `scene/townLod.ts`). The smaller
settlements — Bannerlord's food/recruit-producing villages that get
raided — do not exist anywhere. Modernized: suburbs, exurbs, truck
stops, rural towns.

- `docs/code-pulls/city-sim/` (notes only) — tile economy: production,
  growth, and raiding effects on output.
- `docs/code-pulls/strategy-core/` (MIT) — `city.rs`: city data model
  with facilities and upgrade costs; adapt down for villages.

## 14. Syndicate management (kingdoms, modernized) (VERIFIED missing entirely)

Seven factions exist, but there is no organization layer: no policies,
no lieutenant council, no succession, no internal splits. Modernized:
you run a syndicate/crew, not a kingdom — lieutenants instead of
vassals, sit-downs instead of councils, power struggles instead of
civil wars.

- `docs/code-pulls/strategy-core/` (MIT) — `model.rs` has factions,
  diplomacy relations, and pending diplomacy orders; the closest
  working model of what this layer looks like.
- `docs/code-pulls/mcts-ai/` + `docs/code-pulls/strategy-ai/` —
  for AI lords voting and scheming instead of scripted behavior.

## 15. Crafting (VERIFIED missing entirely)

No smithing/crafting system. No pull found in the sweep — this one
needs a design, not a repo. Bannerlord's smithing (smelt → refine →
forge → sell) ports naturally to a modern setting (chop shop /
gunsmithing).

## 16. Main storyline / campaign questline (VERIFIED missing)

Quest tracking exists (`questTracker/`), the sim has quest templates —
but there is no campaign questline, no main story threading the
sandbox together. Bannerlord's campaign mode is what turns the
sandbox into a game.

- `docs/code-pulls/dialogue-graph/` (notes only) — quest
  conversations as data.
- `docs/code-pulls/strategy-core/` (MIT) — `events.rs`/`incidents.rs`:
  how a strategy game fires story events off world state.
- This is mostly content + design, not a code pull. Needs a writer's
  room, not a repo.

## 17. Day/night cycle (VERIFIED missing entirely)

No time-of-day system. The art for it is already pulled and waiting:

- `clients/campaign/public/textures/vendor/hdris/` (CC0, in repo):
  12 skies — clear day, dawn, sunset, night, overcast, storm.
- Wire the campaign clock to crossfade/swap HDRIs; PBR materials
  (`vendor/pbr/`) respond to the IBL automatically. Streetlights at
  night not included — that's a follow-up.

## 18. Mounted / motorcycle combat (VERIFIED missing mechanics)

Horse gait animations and death/ragdoll handoff exist
(`animations/HorseGaits.ts`), plus `Horse.fbx` (KayKit, staged) —
but there are no riding mechanics: no mount/dismount, no mounted
movement or combat. In modern America this is motorcycles.

Code-hunt agent 3's honest finding: **no open-source 3D JS/TS
motorcycle implementation clears the license bar**, and **Babylon 8
ships no vehicle physics at all** (verified against
`@babylonjs/core@8.56.2`). So the bike is a bespoke build:
- **Algorithm:** port `pmndrs/cannon-es` `RaycastVehicle.ts` (MIT,
  673 lines of clean TS) — replace its raycast with Babylon
  `scene.pickWithRay`; it already loops over wheel count, so 2 wheels work.
- **Assists:** take the arcade block from `icurtis1/raycast-vehicle`
  (MIT): `antiWheelie`, `uprightAssist` (cross-product righting torque
  faded by speed — the standard trick for keeping a two-wheeler up
  while letting it lean and crash), `tiltClampAirborne`.
- **Feel constants:** `ArcaDone/UnityMotorbikeController` (MIT, C#) —
  wheelie/lean/crash/gear math as plain floats; transliterate, don't port
  the WheelCollider parts.
- Full analysis: `docs/code-pulls/babylon-controller/NOTES.md` (bike section)
  and `~/workspace/agent-outputs/babylon-controller-finds.md`.
- Rider uses the controller (section 1a); mount/dismount is an
  interaction + animation blend.

## 19. Crew mustering (armies, modernized) (VERIFIED missing entirely)

No multi-party crews. Bannerlord lets you call vassals to your
banner and lead an army; here every party acts alone.
`court/vassals.ts` exists, but nothing musters them. Modernized:
call your lieutenants and allied crews for a big hit.

- `docs/code-pulls/strategy-core/` (MIT) — `model.rs` already has
  `army_movements: Vec<ArmyMovement>`: the data shape for armies on
  the campaign map. `commands.rs` batch resolution fits army orders.
- `docs/code-pulls/rts-battle/` (MIT) — multi-unit command and
  control once the army reaches the field.

## 20. Turf & fronts (fiefs, modernized) (VERIFIED missing entirely)

No ownership. Bannerlord's core reward loop — get granted a fief,
manage it, defend it — doesn't exist. Towns exist but nobody owns
them. Modernized: gang turf, legitimate business fronts (car wash,
bar, garage) that launder money and can be attacked.

- `docs/code-pulls/strategy-core/` (MIT) — `city.rs` with ownership,
  facilities, and upgrade costs; the fief model with the serial
  numbers filed off.
- `docs/code-pulls/city-sim/` (notes only) — what ownership does to
  a settlement's economy (tax, growth, garrison cost).

## 21. Private contractor work (mercenaries, modernized) (VERIFIED missing entirely)

No way to sign on as hired muscle for a faction — a whole Bannerlord
career path (and the natural on-ramp for new players) is absent.
Modernized: private military contractor / hired-gun gigs.

- Mostly design + sim work: contract terms, pay per battle, relation
  effects, defection. `docs/code-pulls/strategy-core/` diplomacy
  model covers the relation side.

## 22. Bars & clubs (taverns, modernized) (VERIFIED missing entirely)

No social hubs. In Bannerlord the tavern is where you recruit
troops, find companions, hear rumors, and play board games.
Modernized: bars, clubs, and diners — recruit muscle, meet fixers,
hear street rumors, run poker games.

- `docs/code-pulls/dialogue-graph/` (notes only) — tavern keeper
  and patron conversations as data.
- `docs/code-pulls/roguelike/` (MIT) — interior generation for the
  tavern space itself.
- `espionage/rumors.ts` exists — rumors have a home; they need a
  place to be heard.

## 23. Ownable businesses (workshops, modernized) (PARTIALLY EXISTS)

`economy/workshops.ts` exists — buy/improve/collect income — but the
types are medieval (`smithy | brewery | tannery | weaver | mill`).
How Bannerlord does it: each workshop converts inputs → outputs
(brewery: grain→beer, tannery: hides→leather), tied to what the
bound villages produce; income scales with town prosperity.

Modernized business types to add:
- **Legit:** liquor store, jewelry store, pawn shop, restaurant,
  garage, car wash, dispensary, warehouse
- **Fronts (gang-tied):** chop shop (stolen cars→parts), underground
  casino, grow house
- Each needs a production chain: inputs in, product out, staffed or
  not. A jewelry store needs gold supply; a chop shop needs boosted
  cars (ties to gang jobs, §24); a brewery needs grain (ties to
  rural production, §25).
- Rival gangs can torch your businesses (ties to turf wars);
  police can raid fronts (ties to heat).

Refs: extend `economy/workshops.ts` (keep buy/improve/income, add
types + input/output chains). `docs/code-pulls/city-sim/` for
production→prosperity math. `docs/code-pulls/strategy-core/`
`city.rs` for facility models. **Code-hunt agent 2 findings**
(full report `~/workspace/agent-outputs/territory-property-finds.md`):
no permissively-licensed repo does buyable property + stash
end-to-end (whole FiveM/ESX ecosystem is GPL-3.0 — rejected). Best
split: `TeamDay-AI/business-tycoon` (MIT) — premises purchase costs,
placement validation, staffed-synergy bonuses, daily costs, loans;
`amilich/isometric-city` (MIT) — per-tile landValue, taxRate,
zoning R/C/I, abandonment/recovery. The purchase layer
(`{id, type, price, ownerId, tier, stash[], incomePerDay}` + buy/
upgrade transactions) must be written — see
`docs/code-pulls/turf-territory/NOTES.md`.

## 24. Jobs board (VERIFIED missing entirely)

No job system at all. Bannerlord has village notables and town
quest-givers; modernized this becomes a jobs board with two tracks:

**Gang jobs** (per gang, per city — reputation-gated):
- Drug run (drive package across town, heat risk)
- Protection collection (visit fronts, persuade/intimidate)
- Hit (assassination — `espionage/assassination.ts` exists)
- Boost cars (steal specific vehicles → feeds chop shops, §23)
- Lookout / wheelman for heists

**Civilian jobs** (per city, tied to its income identity, §25):
- Dockworker (port cities), fisherman (coastal), truck driver
  (hauling goods between cities — ties to `economy/caravans.ts`),
  bouncer (bars/clubs, §22), taxi driver, warehouse shift,
  farmhand (rural towns)

Jobs pay cash + build rep with the employer gang/business. Gang
jobs raise police heat; civilian jobs are the clean-money path.
Both feed the economy: truckers move real goods, dockworkers
unload real cargo.

Refs: `docs/code-pulls/dialogue-graph/` for job-giver conversations;
`docs/code-pulls/roguelike/` enemy/item scaling for job difficulty
tiers. No direct code pull found — needs design + the above pieces.

## 25. City income identity (VERIFIED missing — design gap)

Every city needs a **distinct economic engine** — the thing that
keeps it alive. Right now towns are interchangeable. How Bannerlord
does it: villages produce specific raw goods by type, towns refine
and trade them, prosperity follows production. If villages get
raided, the town starves.

Modernized per-city identities (Ohio River Valley):
- **Port city** — docks, shipping, fishing; dockworker/fisherman jobs
- **Industrial city** — factories, warehouses; manufacturing jobs
- **Tourist city** — casinos, hotels, nightlife; hospitality jobs
- **Agricultural towns** — farms producing grain/produce; farmhand jobs
- **College town** — student economy, bars, cheap housing

The loop: rural production → city refinement → businesses sell →
prosperity rises → more jobs → more income. Break any link (gang
war shuts the docks, raid hits the farms) and the city declines:
prices spike (`economy/prices.ts` + `shortages.ts` exist), jobs dry
up, gangs get desperate. This is what makes each city feel different
and gives the player reasons to protect — or exploit — them.

Refs: `docs/code-pulls/city-sim/` (production→prosperity→raid
effects), `docs/code-pulls/strategy-core/` (city facilities),
`economy/caravans.ts` + `supplyLines.ts` (goods movement between
cities already exists).

## 26. Police / wanted / heat system (CODE IN REPO)

Code-hunt agent 1's best find: `bridge-mind/leonida` (MIT) — a
complete browser GTA in TypeScript. `docs/code-pulls/crime-systems/`
contains the whole enforcement stack:

- **`wanted/machine.ts`** (313 lines, **zero engine imports**) — the
  prize. Pure state machine: `responding` (cops go to the crime
  scene, not the player — they don't know who did it) / `active`
  (LOS stamped per tick) / `searching` (growing search circle from
  `lastSeenPos` — losing the cops is a circle you must escape, not a
  timer you watch; hiding inside counts at 1/1.5 speed, so you must
  *leave*). Witness gating (unwitnessed crimes don't count), hot
  scenes (re-raise on outside→inside transition only), same-level
  witness checks. Heat is a separate 0–100 meter feeding cop accuracy
  and dispatch delay. Copy near-verbatim; map hooks to audio/UI.
- **`police-data.ts`** — `CRIME_TABLE` (12 crime types, per-crime
  `stars` vs `starsWhenWanted` + cooldowns) and `DISPATCH_TABLE`
  (7 tiers: cruisers, SWAT, helicopters, roadblocks, spike strips,
  ramming, shoot-vs-arrest — all data, not code).
- **`police/`** — CopBrain foot-cop FSM (ride → approach → arrest →
  combat → standDown), PoliceDriver cruiser FSM (A* over a road
  graph — re-implement the two driver interfaces against Babylon
  entities), Helicopter, Roadblock, arrest.ts (BUSTED timer → arrest,
  bail, respawn). `vision.ts` — swap `raycastInto` for
  `scene.pickWithRay`.
- Also in the agent report (not pulled): yuka AI primitives (MIT,
  pursuit/vision/memory), Babylon-native pursuit demo (MIT),
  minimal wanted loop (MIT, ~30 lines).

⚠️ **License caveat:** leonida's LICENSE is MIT but its README says
"non-commercial fan project" — get maintainer clarification before
shipping anything commercial.

Full report: `~/workspace/agent-outputs/crime-systems-finds.md`

## 27. Heist framework (CODE IN REPO)

Same repo, `docs/code-pulls/crime-systems/missions/`:

- **`types.ts`** — data-driven `MissionDef`
  (`{id, name, contact, position, unlockedAfter, reward, repeatable,
  build(ctx) → Objective[]}`); `build()` returns a fresh objective
  array per attempt so nothing leaks between retries. Zero engine
  imports — lift and re-implement `game` as a thin Babylon adapter.
- **`objectives.ts`** — reusable factories mapping 1:1 onto heist
  stages: `goto`, `enterVehicle`, `deliver`, `kill`, `survive`,
  `waitFor(event, predicate)` (event-driven — the hook for "crew
  member breaches the vault"), `timed(inner, seconds, failReason,
  showTimer)` (**the getaway clock as a decorator**),
  `lootGrab(counter, seconds, radius, text)`, `robStore`,
  `escapeWanted`, `reachWanted`, `intimidateOrKill`.
- **`Runner.ts`** — runs one attempt with a **LIFO `onCleanup` stack**
  that fires on pass, fail *or* abort (spawned guards/vehicles tear
  down without leaks).
- **`m8_theScore.ts`** — a genuine heist: approach → breach → 20 s
  loot grab → `wanted.setLevel(5)` (**heat is set, not earned** — the
  getaway is a guaranteed 5-star chase, not a coin flip) → timed
  marina escape with an authored fail reason.
- **`jobs.ts`** — repeatable jobs; `jobRobbery` = `robStore()` →
  `escapeWanted()` → payout. The smallest complete crime loop — the
  best 30-line template to start from.
- Heist **planning** (crew selection, entry points, branching
  briefing): no code exists for this stage — use `inkle/ink` + `inkjs`
  (MIT) to drive a narrative overlay; its choices write to
  `MissionContext.reward` and set flags the execution stage reads.
- Crew roles as code (hacker opens vaults, driver skill checks) and
  the payout-split screen: **must be written** — every implementation
  lives in GPL FiveM resources (rejected).

## 28. Bounty hunting (VERIFIED empty — build from parts)

Code-hunt agent 1's honest result: **no permissively-licensed bounty
system exists anywhere** — contract on a named NPC, track them down,
capture/kill for a fee. Every implementation is a GPL/unlicensed
FiveM Lua resource. Build it from pulled parts:

- Mission framework + job-board loop (`crime-systems/missions/`) —
  availability gate → contact marker → objective array → reward →
  `repeatable`.
- `timed()` for the capture window; `custom()` + `waitFor()` for the
  "target flees to X" branch; `intimidateOrKill()` (already in
  `objectives.ts`) for capture-or-kill.
- Reputation→payout curve from `liberty-drive`'s `syndicate.js`
  (MIT, in the agent report): `floor((baseReward + reputation × 12)
  × timeBonusRatio)`.
- Tracking: per-cop `MemoryRecord.lastSensedPosition` from yuka
  (MIT) for a target who knows you're coming.
