# rts-battle — NOTES

Source: `johnburbridge/swarm-dominion` (MIT) — a fast-paced RTS where
alien monster factions battle for territorial control (Godot 4,
GDScript). Code in this folder is the gameplay scripts (units,
autoload singletons, map systems, main), copied with its license.
Tests, scenes, and art were left out.

## Unit AI state machine

`unit_base.gd` (507 lines) — every unit runs a command state machine
in `_physics_process`:

- Commands: `move_to`, `attack_move_to`, `engage_unit`,
  `harvest_at` — one active command, explicit transitions.
- Processing: `_process_movement`, `_process_attacking`,
  `_process_attack_moving`, `_process_engaging`, `_process_harvesting`.
- Targeting: `_try_acquire_target` + `_is_valid_target` — auto-attack
  acquisition with faction/validity checks.
- Damage/death: `take_damage`, `_die`, stats loaded per unit type
  (`_load_stats`), team colors applied per faction.

This is the battle-scene unit brain in miniature: order → move →
acquire → engage → attack → die. Our battle sim needs the same
states for soldiers; the GDScript reads like pseudocode and ports
directly to Go or TS.

`mother_unit.gd` — spawner/producer unit: rally points, spawn queue,
emerge animation. The "barracks" pattern for battle reinforcements.

## Architecture

- `autoload/event_bus.gd` — global signal bus; systems communicate
  through events, not direct references. Same decoupling our client
  uses.
- `autoload/game_manager.gd`, `resource_manager.gd`,
  `selection_manager.gd` — singletons for game state, resources,
  and unit selection (RTS click-drag select).
- `systems/map_definition.gd` / `map_loader.gd` — data-driven maps:
  map as data file, loader builds the scene. Our ~10 biome templates
  should work the same way.
- `main.gd` — game flow glue.

## Relevance to bannerlord-clone

Battle scenes: unit command states, target acquisition, faction
colors, spawner units, data-driven maps. The `unit_base.gd` state
machine is the single most portable file here — it's essentially
the spec for our battle-unit AI.
