# fps-controller — NOTES

Source: `bridge-mind/claude-opus-5.5-zombies-game` (MIT, 2026) —
"Dead Signal: Exclusion Zone", a three.js + TypeScript browser FPS.
Code in this folder is the player + weapons + input slice
(1,603 lines), copied with its license. Same org as the kart-racer
pull; same clean style.

## Player controller

`Player.ts` (194 lines) — full FPS character state, framework-free:

- `pos` / `vel` vectors, `yaw` / `pitch` look angles.
- Stances: `crouched`, `sprinting`, `grounded`, `moving`, `speed2d`.
- `height` (stand vs crouch), `stepPhase` / `stepDist` for head-bob
  and footstep timing, `airTime` for jump/fall.
- **Recoil:** `recoilPitch` / `recoilYaw` accumulate on fire and
  recover over time — applied on top of the player's look angles.
  This is what makes guns feel like guns.
- **ADS:** `aiming` flag + `adsT` 0..1 transition, driven by the
  weapon system (field-of-view tighten + sensitivity scale).

`Vitals.ts` (117 lines) — health/stamina/etc. via `createVitals()`,
separate from the controller. Good separation: movement never
touches health directly.

`Input.ts` (204 lines) — the `Input` class: keyboard/mouse capture,
action mapping. Pairs with our existing `src/input/` registry —
ours has bindings but nothing consumes them for movement; this
shows the consumer side.

## Weapons

- `WeaponSystem.ts` (276 lines) — weapon state machine, fire logic,
  ammo, switching.
- `WeaponState.ts` (187 lines) — per-weapon data: damage, fire rate,
  spread, recoil.
- `ViewModel.ts` (533 lines) — first-person gun rendering: sway,
  bob, ADS positioning, muzzle flash placement.
- `Grenades.ts` (92 lines) — throwable arc + explosion.

## Porting to Babylon.js

The math is plain (yaw/pitch/positions) — no three.js in the
controller logic itself. Our client already has an `input/` system
with actions, mouse bindings, touch, and gamepad; wire this
controller's update into it. `ViewModel.ts` is the only
three-specific file (rendering); the state machine ports as-is.

## Relevance to bannerlord-clone

This is the missing FPS controller, with weapons. For TPS, the
same controller drives a third-person rig: keep the yaw/pitch +
movement, put the camera behind the character (see
`vehicle-physics/camera.js` chase camera for the pattern), and
render the character model instead of the viewmodel.
