# Animation pipeline

## Status: started 2026-10-01. No pipeline existed before this.

## Why procedural, not skeletal

Our troop and structure models come out of the Forge/TRELLIS generator as
single static meshes: zero animations, zero skeletons, zero skins (verified
2026-10-01 across the whole batch). Hand-rigging AI-generated meshes is not
practical, and there is no mocap or keyframe library in the repo.

So the pipeline animates the whole-model transform instead of bones: bob,
sway, lean, lunge, flinch, fall. At crowd scale (hundreds of units on screen)
that is what the eye actually reads as alive. This is the standard approach
for strategy-game crowds, and it runs at essentially zero cost per unit.

## Pieces

1. **Input: the battlefeed.** `services/simulation/internal/battlefeed/feed.go`
   already samples the battle over time "so the client can animate the fight."
   Each `FrameUnit` carries `id, x, y, status, hp_frac, morale, suppression`.
   Status vocabulary comes from the sim: `fighting, broken, routed,
   surrendered, destroyed`.
2. **Animator: `content/animation/troop-animator.ts`.** Pure TypeScript, zero
   dependencies, no Babylon import. The client feeds it per-unit sim state
   each frame; it returns position/rotation offsets applied on top of the
   client's base transform.
3. **Wiring: campaign client (Rowan's lane).** The client owns scene nodes,
   computes per-unit speed from frame deltas, maps aimed-fire events to the
   `firing` flag, calls `flinch(id)` on hit events, and applies the offsets.
   The animator never touches the scene graph.

## Clip catalog (procedural)

| Clip | Trigger | Read |
|---|---|---|
| idle | fighting, speed near 0 | breathing bob |
| advance | fighting, moving | stride bob, hip sway, slight lean |
| run | fighting, speed > 2.6 m/s | bigger bob, hard lean |
| attack | fighting, idle, firing | rhythmic recoil kick |
| cower | broken | crouch, hunch, tremble |
| rout | routed | panicked fast bob, weave |
| surrender | surrendered | kneel, torso tipped back |
| death | destroyed or hp 0 | falls over once, holds the pose while the sim reports destroyed (the sim is authoritative; destroyed is terminal) |

Suppression adds a proportional crouch on top of any fighting clip.
`flinch(id)` adds a decaying hit reaction on top of any clip.

Stride phase advances by distance traveled, not wall-clock time, so footstep
frequency always matches ground speed. Each unit gets a deterministic phase
offset from its id hash, so crowds never move in sync.

## Contract

`UnitAnimInput { id, x, y, heading, speed, status, hpFrac, suppression, firing }`
-> `UnitAnimOutput { dx, dy, dz, yaw, pitch, roll, clip }`.
Units are meters, radians, seconds, Y-up. The client adds the offsets to the
base transform it already owns.

## Future path

If rigged assets ever arrive (hand-built or a future generator), the clip
names and this contract do not change. Only the animator internals get
swapped for real skeletal playback. Nothing downstream breaks.

## Out of scope for now

Facial animation, lip sync, per-finger detail, cloth sim. Shader-based motion
(flag wave, tent flutter) is a separate small piece and can reuse the same
per-unit time/phase approach when structures get their pass.
