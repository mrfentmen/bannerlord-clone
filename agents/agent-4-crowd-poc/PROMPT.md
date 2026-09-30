# Agent 4 — Crowd Rendering Proof of Concept

Paste everything below the line into a fresh agent session.

---

## Your job

Prove that hundreds of animated, instanced troops can render at frame rate — **in an empty scene, alone.**

No simulation. No campaign map. No gameplay. Just an empty 3D scene, a bunch of units, and a frame counter.

## Why you exist

`PHASES.md` says the build order proves the two riskiest things first. You are one of them. Crowd rendering is the hardest technical problem in this project, and the docs are right to isolate it.

You are also the **only agent that can start with zero dependencies.** Agent 1 needs datasets, Agent 2 needs a decision, Agent 3 needs Agent 1's export. You need a 3D scene and a stopwatch. Start today.

If this does not hit its target, that is enormously valuable information, and the right time to find out is now — before the battle scene, the art pipeline, and the unit design are all built on the assumption that it works.

## Your folder

Write **only** inside `labs/crowd-poc/`.

You may **read** anything in the repo. You may **not** edit any other folder, any design doc, or another agent's prompt.

## Your branch

```bash
git checkout -b agent-4-crowd-poc
```

## Read these first, in this order

1. `CONSTITUTION.md` — section 5 (assets and licences) and section 7 (prove it, don't assume).
2. `PHASES.md` — Phase 3 only.
3. `TASKS.md` — Phase 3 section. That is your checklist.
4. `SPEC.md` — **section 5.1 in detail.** It specifies your technique. Section 10 for budgets.
5. `ASSETS.md` — the whole file. You run its pipeline end to end.
6. `ART_AND_AUDIO.md` — the shared skeleton and silhouette requirements.
7. `TESTING_AND_BALANCE.md` — section 8, the mid-range hardware definition.
8. `GLOSSARY.md` — LOD, thin instances, GPU skinning, in this project's own words.

## What to build

From `SPEC.md` section 5.1 and `TASKS.md` Phase 3:

- A **thin-instanced** scene with every troop mesh type, targeting a **handful of draw calls regardless of unit count**.
- **GPU vertex-texture skinning** — animations baked to textures. No per-instance CPU bone skinning past a few dozen units; the CPU cannot do it and you should prove that rather than trust it.
- **Three LOD tiers**: close (full skeletal mesh), mid (simplified mesh), far (billboard impostor).
- **Distance thresholds tuned by testing, not assumed.** This is called out in `SPEC.md` twice, which means someone has been burned by it before.
- The **asset pipeline from `ASSETS.md` running end to end for one troop type** — all six steps, including step 6 (unify).

## Two things that are easy to skip and must not be

### The asset pipeline is part of the proof

`PHASES.md` Phase 3 requires the pipeline to run end to end for **one troop type**, not just the renderer. A renderer that hits frame rate on a model nobody could legally ship has proved nothing.

So: source a real model, check its licence, save the licence copy, add the manifest entry, convert to GLB at **1 unit equals 1 metre**, apply the texture and poly budgets from `ASSETS.md` section 5, rig to the **one shared skeleton**, bake animation textures, generate all three LOD tiers, then render it.

Read `ASSETS.md` section 1.1 first — the Sketchfab situation has changed and free-download availability needs re-verifying. Prefer sources with explicit CC0 terms.

### Mid-range hardware means mid-range hardware

The exit criterion says "**not just the dev machine**" in so many words. `RISKS.md` and `TESTING_AND_BALANCE.md` section 8 both flag that the mid-range target is undefined.

So define it — CPU, GPU, and RAM class — record the definition, and measure on hardware that actually meets it. A benchmark on a high-end machine reported as if it were mid-range is worse than no benchmark, because it will be trusted.

If you can only measure on one machine, say exactly what that machine is and report the result as unverified for the mid-range target.

## Constraints

- **Report real measured numbers.** Frame rate, draw calls, triangle counts, instance counts. Pasted output, not estimates.
- Profile before optimising, and state what the actual bottleneck was.
- No fake numbers, no "should be fine at scale", no extrapolation presented as measurement.
- Assets: commercial-use licences only, with a saved licence copy and a manifest entry (`ASSETS.md` section 2). The manifest check is part of the build.
- Keep originals unedited; ship compressed formats.
- Don't add polling or timers where a callback works. Clean up anything you create.

## Exit criteria

From `PHASES.md` Phase 3:

> **300 units at 60 fps and 1,000 units at 30 fps on mid-range consumer hardware, not just the dev machine.**

## Report back with

1. The exact hardware you measured on — CPU, GPU, RAM.
2. The real benchmark command and its **actual output** pasted in.
3. A table: unit count, fps, draw calls, triangles, per tier.
4. The LOD distance thresholds you chose, and the test that chose them.
5. The asset pipeline walkthrough for the one troop type, with the manifest entry.
6. **The honest verdict.** If it does not hit 300 at 60 on real mid-range hardware, say so plainly with the numbers and the bottleneck. A clear "no, and here is why" is the most valuable result this agent can produce.
