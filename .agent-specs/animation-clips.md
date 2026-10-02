# Animation Clip Mapping (Pax task 39)

All 5 operator models have 38 animation clips. This is the canonical mapping.

## Movement
- `idle` - standing idle
- `walk` - walking
- `run` - running
- `sprint` - sprinting
- `crouch_idle` - crouching idle
- `crouch_walk` - crouching walk
- `prone_idle` - prone idle
- `prone_crawl` - prone crawl

## Aiming (weapon ready)
- `aim_idle` - aiming idle
- `aim_walk` - aiming walk
- `aim_run` - aiming run
- `aim_sprint` - aiming sprint
- `aim_crouch_idle` - aiming crouch idle
- `aim_crouch_walk` - aiming crouch walk

## Ready (weapon lowered but alert)
- `ready_idle` - ready idle
- `ready_walk` - ready walk
- `ready_run` - ready run
- `ready_sprint` - ready sprint
- `ready_crouch_idle` - ready crouch idle
- `ready_crouch_walk` - ready crouch walk

## Combat
- `shoot` - firing weapon
- `reload` - reloading
- `melee` - melee attack
- `throw` - throwing (grenade)
- `hit` - hit reaction

## Jumping / Sliding
- `jump_start` - jump takeoff
- `jump_loop` - airborne
- `jump_land` - landing
- `slide_start` - slide start
- `slide_loop` - sliding
- `slide_exit` - slide end

## Downed / Death
- `death` - death (falls, then ragdoll takes over)
- `downed` - downed/incapacitated
- `revive_kneel` - reviving someone (kneeling)
- `revived` - being revived

## Interaction
- `interact` - generic interact
- `pickup` - picking up item
- `heal` - healing self/other

## Missing (no clip available)
- `block` - uses idle with arms (no dedicated clip)
- `cheer` - uses idle (no dedicated clip)
- `surrender` - uses cheer/idle (no dedicated clip)

See AnimationController.ts for the state machine that maps these to game states.
