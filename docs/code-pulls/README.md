# Code pulls — reusable game systems from the awesome-ai-games sweep

Pulled 2026-10-03 from AI-built open-source 3D games
(AgentsLoop/awesome-opus-5.5-games list). These are **systems**, not art:
vehicle physics, deterministic sim architecture, city simulation design,
game AI, strategy models, battle AI, dialogue, roguelike algorithms.
Staged here for porting into the bannerlord-clone; nothing is wired in yet.

## Systems (round 1)

### 1. vehicle-physics/ — arcade vehicle physics + racing AI (MIT, code included)
From `bridge-mind/turbo-kart-rally` (three.js kart racer, quality 9.3/10).
Full working arcade vehicle model: grip-based turning, drift with
mini-turbo boost, hop, boost pads, wall collision, offroad slowdown,
slope gravity. Plus `AIDriver`: personality-driven racing AI.
**Use for:** driving model for cars/trucks, AI drivers for
traffic/chase sequences. See `vehicle-physics/NOTES.md`.

### 2. deterministic-sim/ — fixed-tick authoritative sim pattern (design notes only)
From `amsminn/gpt-6-astra-smash-karts` (Next.js + TS vehicular combat).
30 Hz fixed-tick `GameRoom` fully separated from the renderer:
sanitized inputs, serial-numbered snapshots, bot players as
first-class citizens.
**Use for:** reference when hardening the Go sim's tick/input/snapshot
design. See `deterministic-sim/NOTES.md`.

### 3. city-sim/ — tile city simulation design (design notes only)
From `codersusu/game-city-skylines` ("SEABRIGHT", Unity C# city builder,
quality 9/10). Tile-grid city sim: zoning, economy, happiness, traffic
flow, power; presentation split into instanced traffic/pedestrians.
**Use for:** town economy/traffic design reference.
See `city-sim/NOTES.md`.

## Systems (round 2)

### 4. mcts-ai/ — parallel Monte Carlo Tree Search library (MIT, code included)
From `patricker/treant` (Rust). Lock-free, parallel MCTS: implement
`GameState` + `Evaluator` traits, get UCT/AlphaGo tree policies,
transposition tables, and `playout_parallel_for(duration, threads)`.
**Use for:** campaign-map faction AI — the endgame for strategic
decision-making. Seeded RNG option fits our determinism requirements.
See `mcts-ai/NOTES.md`.

### 5. strategy-core/ — strategy game data model + turn resolution (MIT, code included)
From `zhubby/Shogun` (Rust/Bevy Three Kingdoms strategy). `GameState`
with factions, cities, officers, roads, army movements, diplomacy,
technologies, events; `resolve_command_batch` turn resolution;
`AiProvider` snapshot boundary for AI.
**Use for:** closest structural relative to our campaign layer —
field coverage, batch-resolve pattern, AI seam. See
`strategy-core/NOTES.md`.

### 6. rts-battle/ — RTS unit AI state machine (MIT, code included)
From `johnburbridge/swarm-dominion` (Godot 4 RTS, alien factions).
Unit command states (move / attack-move / engage / harvest), target
acquisition, damage/death, spawner units, event bus, data-driven maps.
**Use for:** battle-scene unit AI — `unit_base.gd` is essentially the
spec for our battle-unit brain. See `rts-battle/NOTES.md`.

### 7. roguelike/ — complete roguelike algorithms (MIT, code included)
From `joozio/dungeon-of-opus` (TypeScript, single 1,667-line file).
Room-and-corridor dungeon gen, Bresenham line-of-sight + fog of war,
7 enemy types, items, XP/leveling, ASCII minimap — all pure functions.
**Use for:** hideout/dungeon interiors, scouting visibility, stealth.
See `roguelike/NOTES.md`.

### 8. strategy-ai/ — game-AI toolkit: alpha-beta to ISMCTS (design notes only)
From `Toribash67/sengoku_jidai` (TypeScript strategy). Layered bots
(random → greedy → alpha-beta → information-set MCTS), determinization
for hidden info, weighted evaluation, exact combat-odds distributions,
worker-based search.
**Use for:** faction AI blueprint; `determinize` + ISMCTS is how our
campaign AI reasons about unseen enemy armies. See
`strategy-ai/NOTES.md`.

### 9. dialogue-graph/ — immutable dialogue graph model (design notes only)
From `YuutaTsubasa/ProjectRondo` (C#). Conversations as immutable
graph data: nodes + exits-as-discriminated-union
(linear/branch/end), session walker, validation tests.
**Use for:** our dialogue system — conversations as JSON data files,
small client walker. See `dialogue-graph/NOTES.md`.

### 10. siege-combat/ — pure-function ranged combat (design notes only)
From `Jaxsbr/toy-box-siege` (TypeScript, 159 lines + tests).
Cooldown-gated shooters, projectile integration, AoE damage,
knockback, wall blocking — all pure functions over flat data.
**Use for:** siege combat spec; port the shape into Go with the tests.
See `siege-combat/NOTES.md`.

## Systems (round 3)

### 11. fps-controller/ — FPS player controller + weapons (MIT, code included)
From `bridge-mind/claude-opus-5.5-zombies-game` (three.js browser FPS).
Full controller: yaw/pitch look, crouch, sprint, jump/fall, head-bob,
recoil accumulation/recovery, ADS transition — plus vitals, input
class, and a complete weapon system (state machine, viewmodel,
grenades). Framework-free logic; ports to Babylon directly.
**Use for:** the missing FPS controller; adapt for TPS with a
chase camera. See `fps-controller/NOTES.md`.

## License status

- Code copied (OSI license positively identified, license file kept):
  `vehicle-physics` (MIT), `mcts-ai` (MIT), `strategy-core` (MIT),
  `rts-battle` (MIT), `roguelike` (MIT), `fps-controller` (MIT).
  Keep copyright notices on redistribution.
- Design notes only (no license detected — reimplement, don't copy):
  `deterministic-sim`, `city-sim`, `strategy-ai`, `dialogue-graph`,
  `siege-combat`.

Full per-system license notes in `LICENSES.md`.
