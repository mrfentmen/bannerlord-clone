# Brief — Pax (scene / 3D / action)

Read `.agent-specs/MISSION-4H.md` and `.agent-specs/divvy.md` first. You own:
`clients/campaign/src/scene/**`, `src/input/**`, `src/physics/**`, battle UI.

Work in this order. Do not start #3 before #1 works.

1. **Walk.** Port the FPS/TPS controller from `docs/code-pulls/babylon-controller`
   (ssatguru/BabylonJS-CharacterController, Apache-2.0 — kinematic, slope limits,
   step offset, camera collision, TPS↔FPS blend; head-bob + crouch from
   crazyramirez/BJS_Character_Controller_V2, MIT). Wire it into the campaign scene
   first: WASD + mouse, terrain collision. Then the battle scene.
   Files: `docs/code-pulls/babylon-controller/NOTES.md` has the full report.

2. **Drive.** Port the arcade vehicle model from `docs/code-pulls/vehicle-physics`
   (MIT): `kart.js` grip/drift/wall-collision model + `ai.js` drivers.
   One drivable car on the campaign map is the goal. Bikes come later
   (`docs/code-pulls/babylon-controller/NOTES.md`, bike section).

3. **Battle loop.** One fight end-to-end: enter battle → units move and fight →
   result → back to the map. Unit AI states from `docs/code-pulls/rts-battle`
   (`unit_base.gd` is the spec). You already built the battle scene, ragdoll,
   and biomes — wire the loop around them.

4. **Compound assault prototype** (sieges): breach a guarded compound — breaching
   charge/ram, room clearing. Refs: `docs/code-pulls/siege-combat` (notes),
   `docs/code-pulls/rts-battle`, model `clients/campaign/public/models/vendor/gravewake/catapult.glb`.

5. **Port scene files** from `rowan/campaign-client`: `scene/gltf.ts`,
   `scene/modelAssets.ts`, `scene/units/*`, `boot/bootFailure.ts`.
   (`git fetch origin rowan/campaign-client`, take those files, adapt to main.)

6. **City visuals:** traffic + pedestrians + town LOD (existing: `scene/pedestrians.ts`,
   `scene/townLod.ts`). Refs: `docs/code-pulls/city-sim/NOTES.md`.

Rules:
- `main.ts` is Buffy's. Export your entry points; ask for the hook line in your
  commit message instead of editing it.
- Verify: `cd clients/campaign && npx tsc --noEmit`; run vitest for files you touch.
- Fetch before push. Never force. One lane per commit.
