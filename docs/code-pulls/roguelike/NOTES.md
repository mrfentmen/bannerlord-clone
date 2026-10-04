# roguelike — NOTES

Source: `joozio/dungeon-of-opus` (MIT) — a complete roguelike in a
single 1,667-line `App.tsx`: procedural dungeons, 7 enemy types,
items, fog of war, boss fight. Copied with its license. React
rendering, but all game logic is pure functions above the UI.

## Systems (all pure functions, no framework in the logic)

- **Dungeon gen:** `generateDungeon(floor)` — room placement with
  `roomsOverlap` checks, `carveRoom` + `carveCorridor` (L-shaped),
  guaranteed start room and stairs room. Compact, correct, portable.
- **Visibility:** `hasLineOfSight` (Bresenham-style raycast) +
  `updateVisibility` — fog of war done right: tiles have
  seen/visible states.
- **Enemies:** `spawnEnemies` (floor-scaled, room-distributed),
  `moveEnemies` (turn-based pursuit), 7 types with distinct stats.
- **Combat:** `resolvePlayerAttack` / `resolveEnemyAttack` —
  damage, XP, level-ups (`checkLevelUp`), kill tracking.
- **Items:** `applyItem` — consumables affecting player, enemies,
  map, and rooms.
- **Minimap:** canvas-free ASCII minimap component — fog-aware,
  shows enemies only on visible tiles.

## Relevance to bannerlord-clone

Three directly reusable algorithms: room-and-corridor dungeon
generation (hideouts, dungeons, building interiors), line-of-sight /
fog of war (stealth, scouting, battle visibility), and the
turn-based enemy AI loop. The whole file is a masterclass in keeping
game logic framework-free — our client code should look like this.
