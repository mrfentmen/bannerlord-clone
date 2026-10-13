# babylon-controller — NOTES

Found by code-hunt agent 3 (2026-10-03). Babylon.js-native character
controllers — these port cleaner than the three.js FPS controller in
`fps-controller/`, because the engine calls are already Babylon.

## CharacterController.ts — ssatguru/BabylonJS-CharacterController (Apache-2.0)

The one to build on. 243 stars, live, TypeScript, npm-published as
`babylonjs-charactercontroller`. Complete kinematic third/first-person
controller with **no physics engine** — movement is
`mesh.moveWithCollisions()`, ground is `scene.pickWithRay()`.

Actually in the source (grep-verified by the hunt agent):
- Slope limits, step/stair offset, smooth turning, turn-in-place
- **Elastic camera** — camera pulls in on collision, springs back
- **Camera collision** — saves/restores `checkCollisions` around the push-in
- **Third→first-person blend** — lerps `ArcRotateCamera.radius` to near-zero
  and back; this is our TPS↔FPS switch for free
- Slide, animation blending via an `ActionMap` (name → animation
  range → speed → key), serializable `CCSettings` for save/load
- `walk()`, `run()`, `jump()`, `fall()`, `strafeLeft/Right()`, `idle()`

**Missing:** head-bob and crouch (zero hits in source). Both are
~20-line additions in the frame callback — take them from
`character-controller.js` below.

Port: copy `CharacterController.ts` + `_babylonjs-esm-bridge.js`;
the Babylon APIs it uses are unchanged in Babylon 8. Our client
already uses `ArcRotateCamera`, so the camera work drops in.

## character-controller.js — crazyramirez/BJS_Character_Controller_V2 (MIT)

Reference implementation, not a dependency (187 KB single file,
expects global `BABYLON`). The only Babylon controller found with
the **full** feature list: jump, **crouch** (54 sites), **sprint**
(37), and **real head-bob** — kinetic locomotion bobbing at lines
3618-3636 (`bobFreq` 9.5 walk / 14.5 sprint, `bobAmpY` 0.016/0.032,
`bobAmpX` 0.009/0.020, exponential return to centre). Also: dynamic
FOV kick, double jump, air control, camera-follow lock.

Use: port the head-bob + crouch blocks into the ssatguru controller
above. The math is self-contained and ports verbatim.

## Also worth knowing (not pulled, URLs in agent report)

- `armomu/ergoudan` (MIT) — cleanest Havok `PhysicsCharacterController`
  based TPS, stair-climb raycasts, 30° slope limit. Take if we go Havok.
- `yamayuski/babylon-fps-shooter` (Apache-2.0) — minimal pointer-lock
  FPS wiring on `UniversalCamera`; same Vite+TS stack as ours.
- Full agent report: `~/workspace/agent-outputs/babylon-controller-finds.md`

## Bike physics — the honest picture

No open-source 3D JS/TS motorcycle implementation clears the license
bar. What exists (all MIT, documented in the agent report, not copied):
- `pmndrs/cannon-es` `RaycastVehicle.ts` — the Bullet raycast-vehicle
  algorithm in clean TS; the best-shaped source for a from-scratch port.
- `icurtis1/raycast-vehicle` — arcade assists that solve bike problems:
  `antiWheelie`, `uprightAssist` (cross-product righting torque faded
  by speed), `tiltClampAirborne`.
- `ArcaDone/UnityMotorbikeController` — the only real bike model
  (wheelie/lean/crash/gears as plain math, but Unity-locked).

**Babylon 8 ships no vehicle physics at all** (verified against
`@babylonjs/core@8.56.2`). Plan: bespoke two-wheel raycast model on
`scene.pickWithRay` + `PhysicsBody` impulses — port cannon-es's
algorithm, add the assist block, tune with the Unity feel constants.
