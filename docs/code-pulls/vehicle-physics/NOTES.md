# vehicle-physics — NOTES

Source: `bridge-mind/turbo-kart-rally` (MIT, 2026). Three.js kart racer.
Code in this folder is the actual source, copied with its license.
Three.js and Babylon.js vector APIs differ, but the physics is plain
math — porting is mostly `THREE.Vector3` → `BABYLON.Vector3`.

## kart.js — the vehicle model (916 lines)

Arcade grip model, not a full rigid-body sim. Core idea: separate
forward speed from lateral velocity, then kill lateral velocity with
exponential grip decay.

- `NORMAL_GRIP = 13` — lateral velocity decay rate (1/s). High grip =
  kart follows its nose. `DRIFT_GRIP = 2.6` while drifting = slide.
- Turning: base turn rate 2.15 rad/s at full lock, scaled by speed
  (full authority by 9 m/s), loses 16% at top speed.
- Drift: hop (vy 4.8, gravity 40) then hold drift; drift yaw steers
  wider than the body yaw (visual inward lean 0.42 rad). Drifting
  charges mini-turbo in 3 tiers (strengths 0.72 / 0.86 / 1.0).
- Boost: `BOOST_ACCEL = 60`, initial kick +5 m/s, overspeed decays at
  16/s (48/s offroad).
- Walls: restitution 0.35, friction 0.12. Respawn with 2.2 s invuln.
- Slopes: gravity factor 0.35 along the slope.
- `damp(a, b, lambda, dt)` helper = framerate-independent exponential
  approach; use everywhere instead of lerping by raw dt.

**Port target:** the driving model for cars/trucks. Our Kenney/KayKit
vehicle models need exactly this: an arcade feel, not a physics-engine
vehicle SDK.

## ai.js — AIDriver (477 lines)

Racing AI with personality. Each driver gets randomized traits:
lane bias, weave amount/frequency, aggression, drift love, look-ahead
multiplier, caution, reaction time, and skill-scaled input noise.
Behaviors: rocket-start by skill, drift targeting, item usage with
cooldowns, stuck detection with reverse recovery, wrong-way detection.
Difficulty presets scale skill 0–1 which drives reaction time
(`0.15 + (1-skill)*0.6`), noise amplitude, and drift target level.

**Port target:** AI drivers for traffic and chase/pursuit encounters.
The personality-randomization approach gives varied traffic for free.

## Other files

- `track.js` — spline track with progress/position queries; the
  `progress → world position` API is what AI and respawns use.
- `items.js` — pickup/weapon system (863 lines, includes status
  effects like shrink: scale 0.6, speed factor 0.74).
- `race.js` — race state machine (countdown → racing → finished).
- `input.js`, `config.js`, `camera.js` — chase camera with look-back.
