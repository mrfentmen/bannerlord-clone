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

### 1a. FPS controller — IN REPO
- `docs/code-pulls/fps-controller/` (MIT, BridgeMind 2026)
- Full controller: yaw/pitch look, crouch, sprint, jump/fall,
  head-bob, **recoil** (accumulates and recovers), **ADS**
  (aim-down-sights transition), plus vitals, input class, and a
  complete weapon system (state machine, viewmodel, grenades).
- Read `fps-controller/NOTES.md` for the porting guide
  (controller logic is framework-free; only ViewModel is three.js-specific).
- GitHub (if you want the rest of the game — enemies, nav grid):
  https://github.com/bridge-mind/claude-opus-5.5-zombies-game (MIT)

### 1b. TPS controller — ADAPT, no direct pull found
- No MIT-licensed TPS controller turned up in the sweep.
- Build from 1a: keep its yaw/pitch + movement, put the camera
  behind the character, render the character instead of the viewmodel.
- Chase-camera pattern: `docs/code-pulls/vehicle-physics/camera.js`
  (MIT, in repo).

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

- `docs/code-pulls/vehicle-physics/` (MIT) — adapt `kart.js`:
  two-wheel handling (lean into turns instead of drift), wheelie/
  stoppie optional.
- Rider uses the FPS/TPS controller (section 1); bike is the vehicle
  (section 2). Mount/dismount is an interaction + animation blend.

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
`city.rs` for facility models.

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
