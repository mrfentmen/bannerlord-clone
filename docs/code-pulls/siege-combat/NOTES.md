# siege-combat — NOTES (design reference only)

Source: `Jaxsbr/toy-box-siege`, `src/systems/Combat.ts` (TypeScript,
159 lines + tests). **No license detected — code is NOT copied
here.** These are my own notes on the architecture. Reimplement,
don't copy.

## The design

Combat as pure functions over plain interfaces — no classes, no
framework:

- `CombatEntity` / `ShooterEntity` / `EnemyCombatEntity` /
  `ProjectileState` — flat data interfaces. HP, position, cooldown.
- `tryFire(shooter, ...)` — cooldown-gated firing with per-entity
  intervals (e.g. 3 s between shots).
- `moveProjectile` + `checkProjectileHit` — projectiles as data
  integrated per tick, hit tested against entities.
- `applyDamage`, `isDead` — damage is a function, death is a
  predicate. Trivially testable (and tested: `Combat.test.ts`).
- `getAOETargetRows` + `applyAOEDamage` — area-of-effect damage
  across grid rows.
- `applyKnockback`, `wallBlocks` — displacement and line-of-sight
  blocking by walls.

Every function takes state in and returns state out. The 159-line
file plus its tests is a complete spec for grid-based ranged combat.

## Relevance to bannerlord-clone

Sieges need exactly this: shooters on walls with cooldowns,
projectiles arcing to targets, AoE for catapults/explosives,
knockback, wall blocking. The pure-function style matches our
deterministic sim requirements — port the shape into Go, keep the
tests. Read alongside `deterministic-sim/` for the tick structure
it plugs into.
