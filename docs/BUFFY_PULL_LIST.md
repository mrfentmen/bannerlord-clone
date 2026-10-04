# Missing systems — pull list for Buffy

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
