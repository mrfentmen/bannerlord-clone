# Local Agent 3: Ragdoll Death System (Havok Physics)

## PAX BRIEF 2026-10-01 — READ FIRST

You are running on the boss's personal computer. Your job: implement ragdoll physics for character deaths in the bannerlord-clone. When a unit dies, instead of (or in addition to) the baked `death` animation, the corpse should crumple with real physics.

I'm AFK. Ask no questions. Work autonomously until done. Make reasonable decisions and keep going.

## Verified facts (from research, 2026-10-01)

- The client is **Babylon.js 8** (`clients/campaign/`). Babylon v8 ships the **Havok physics plugin** (`@babylonjs/havok`) behind the Physics V2 API (`PhysicsAggregate`, `PhysicsBody`, `PhysicsShapeType`, constraints). This is the sanctioned path — do not pull in Cannon.js or Ammo.js.
- Babylon.js has **no built-in ragdoll**. The recipe (per Babylon forum, Cedric): one physics shape per bone bounding its mesh region, connected by joints between dynamic bodies.
- Reference implementations to study:
  - Babylon.js Playground ragdoll demo (search "babylon.js playground ragdoll havok") — minimal working example
  - `greywatch-game/greywatch` repo, `docs/deaths.md` — production `RagdollSystem`: HavokPlugin owned by one `PhysicsWorld`, three pooled consumers (corpses / shards / rubble), **one shared body budget** (their numbers: 80 corpse bodies, 48 shards, 30 chunks), physics steps only while a client reports `physicsActive()`
  - `pryme8/babylon-box3d` demo `ragdolls` — alternative engine, same joint approach (Box3D is MIT; only relevant if Havok proves unusable)
- Character models: `clients/campaign/public/models/` — soldier-animated.glb, female-operator.glb, operator-{viper,heron,lynx,magpie,jackal}.glb (all ~73-bone humanoid rigs, 38 clips each including `death`, `downed`, `hit`). Horse: `horse.glb` (quadruped — out of scope for v1, note as future work).
- Existing animation wiring: `clients/campaign/src/animations/AnimationController.ts`, `ClipMaps.ts`. Death currently plays the baked `death` clip.

## Mission

Build a `RagdollSystem` that takes over a character's skeleton with Havok physics on death.

### Step 1 — Spike (prove it works before integrating)
1. In a scratch scene (not the game): load `soldier-animated.glb`, play `idle`, then on a timer trigger ragdoll:
   - Create physics bodies for: pelvis, spine, head, upper arms (L/R), forearms (L/R), thighs (L/R), shins (L/R). Use **capsule** shapes where the bone is limb-like, **box/sphere** for pelvis/head/torso. Size each from the bone's world-space bounding info at bind pose.
   - Connect with **ball-and-socket or 6DoF constraints** at the joints, with angular limits approximating human range (don't let elbows bend backwards).
   - At trigger moment: stop the animation, copy each bone's current world transform into its body, set bodies dynamic. The mesh must be driven by the physics bodies each frame (bone follows body, not the reverse).
   - Acceptance: the body crumples to the ground and settles without exploding, stretching, or falling through the floor. Screenshot it mid-fall and at rest.

### Step 2 — Integrate with the game
1. Find where deaths are handled: search for the `death` clip usage in `AnimationController.ts` / battle code. The ragdoll trigger hooks into the same event.
2. Create `clients/campaign/src/physics/RagdollSystem.ts`:
   - Owns the Havok plugin instance (one per scene — check if physics is already initialized anywhere; if so, reuse it, don't create a second world).
   - `activateRagdoll(character)` / pooled body management. **Budget:** start at 24 simultaneous ragdolls; bodies beyond budget reuse the oldest corpse's slot (teleport it underground and recycle).
   - `physicsActive()` reporting so the physics world can sleep when no ragdoll is live (the greywatch pattern).
   - Blend: 150ms crossfade from animated pose to physics (l erp bone influences out as bodies take over) to avoid a visible pop.
3. Config flag: `ragdoll.enabled` (default ON), `ragdoll.maxBodies` (default 24). When disabled, fall back to the baked `death` clip — never break the game if Havok fails to load.

### Step 3 — Verify
1. `npx tsc --noEmit` clean. `npx vitest run` green — add unit tests for: budget recycling (25th death reuses a slot), constraint limits (no hyperextension in a 5-second sim), fallback when Havok unavailable.
2. `npm run build` exit 0.
3. Browser test: spawn 10 units, kill them all, screenshot the pile. Confirm: no explosions, no fall-through, frame rate acceptable (note the fps, don't claim a budget you didn't measure).
4. If the client has no physics init yet, you must add it: `@babylonjs/havok` wasm load at startup (async, non-blocking — game must start even if it fails).

### Step 4 — Land it
1. Confirm `origin/main` tip via GitHub API matches your local parent. Rebase if moved. **NEVER force-push.**
2. Commit: `feat(ragdoll): Havok ragdoll death system with pooled bodies`. Push directly to main (no PRs).
3. Post to the bus: `~/workspace/skills/relay-bus/bin/relay.py send "local-agent-3: ..."` — what landed, SHA, test results, screenshot description.

## Constraints
- Havok only (Babylon's sanctioned physics). No Cannon/Ammo/Box3D unless Havok is proven unloadable — document the proof if so.
- One physics world per scene. Never create a second.
- Pooled bodies with a hard budget. No per-death allocation in the hot path.
- Baked `death` clip stays as fallback. The game works with ragdoll on or off.
- Horses are out of scope for v1 — note quadruped ragdoll as future work in the code comments.
- Real verification only: your screenshots, your fps numbers, your test runs.

## Done criteria
- [ ] Spike proves crumple-and-settle with no explosion/stretch/fall-through (screenshots)
- [ ] `RagdollSystem.ts` integrated at the death event, pooled, budgeted, flaggable
- [ ] Baked death clip fallback works with ragdoll disabled
- [ ] tsc clean, vitest green (new tests), build exit 0
- [ ] 10-unit mass-death browser test screenshotted with fps noted
- [ ] Committed to main, bus notified with SHA
