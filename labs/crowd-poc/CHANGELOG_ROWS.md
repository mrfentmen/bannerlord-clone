# Proposed CHANGELOG.md entries

Rows for the root `CHANGELOG.md`, kept here because the brief for this work restricts writes to
`labs/crowd-poc/`. Copy them into the root file's **BUILT** and **DECISIONS** tables. Newest first,
matching the format the root file already uses.

## BUILT

| What changed | Why | Files |
| --- | --- | --- |
| Thin-instanced crowd renderer with GPU vertex-texture skinning, 3 LOD tiers, 1,000-unit scene at 34.2 fps median | PHASES.md Phase 3: 300 units at 60 fps, 1000 at 30 fps | `labs/crowd-poc/src/` |
| Shared 25-joint skeleton (65 source joints, 40 finger bones culled) with every body and prop rigged to it | ASSETS.md 4.1: one skeleton for all troops so animations transfer | `labs/crowd-poc/assets/processed/shared_skeleton.json` |
| Animation baked to a 100x135 RGBA32F matrix texture, 216,000 bytes, two clips | ASSETS.md step 5, GPU-friendly form for 1,000+ skinned units | `labs/crowd-poc/assets/processed/anim_matrices.bin` |
| LOD thresholds tuned by measurement: close 22 m, mid 35 m | ASSETS.md 4.3 and SPEC.md 5.1 require measured, not assumed, distances | `labs/crowd-poc/config/crowd.json` |
| Far-tier impostor atlas, 8 angles x 8 frames, 2048x2048 | ASSETS.md 5.2 far tier as a billboard | `labs/crowd-poc/src/impostor.ts` |
| Six-step asset pipeline with manifest, SHA-256 per file, and a build log | CONSTITUTION.md 5.1: no asset ships without a commercial-use licence on disk | `labs/crowd-poc/tools/build-assets.mjs` |
| 9 tests that read the built artefacts and re-derive their own expectations | so a wrong-but-self-consistent pipeline cannot pass its own tests | `labs/crowd-poc/tests/artifacts.test.mjs` |

## UNRESOLVED

| Issue | Steps to reproduce | Notes |
| --- | --- | --- |
| GLBs ship uncompressed geometry and PNG textures | `ls -la assets/processed/*.glb` | Close body is 2.6 MB. Needs Draco or meshopt plus KTX2/Basis once Blender's Python works on the build machine. See `ASSET_PIPELINE_NOTES.md` |
| LOD thresholds measured on below-mid-range hardware | `node tools/benchmark.mjs --repeats 5 --counts 1000 --query "cam=30"` | Must be re-tuned on the real target GPU; a faster GPU should support a larger close tier than 22 m |
| 1,000-unit result has 9-14% headroom on the median and misses on a bad run | same command | Every median cleared 30 fps (34.4, 34.2, 32.8, 32.1) but the worst single repeat seen was 27.8. The target holds on the median, not on every run. A production re-tune needs more repeats or a minimum-based rule |
| Five repeats are not enough to characterise the tail | `node tools/benchmark.mjs --repeats 5 ...` | The LOD sweep at 22 m showed a tight 34.3-34.5 spread and passed the "worst repeat clears target" clause; a later run at the same thresholds dipped to 27.8. The selection rule certifies margins a single bad run can erase | `config/crowd.json`, `tools/benchmark.mjs` |
| No terrain occlusion | open `?mode=view&units=1000` | LOD uses camera distance only. Cover, hills and buildings will change every threshold |
| Impostor atlas has no mipmaps | `node tools/benchmark.mjs --impostor` | Fine at these distances; will shimmer once units are seen from further away |
| No GPU timer query on this machine | any benchmark run | `gpuMs` is reported as `n/a`. Wall-clock frame time is the measured figure |

## DECISIONS

Format: `YYYY-MM-DD | Decision | Reason | Files affected`

| Date | Decision | Reason | Files affected |
| --- | --- | --- | --- |
| 2026-09-30 | Ship `closeMaxM` 22 m, not the visually better 25 m | 25 m passed on one run and failed on the next (median 28.6, worst 25.8). Thresholds are now chosen on a 5-run median with a 10% headroom rule, so the verdict cannot depend on which run got reported | `config/crowd.json` |
| 2026-09-30 | Judge LOD on a median of 5 fresh-browser repeats, one browser at a time | Two live WebGL pages split the GPU and halve the frame rate, so in-page repeats were measuring contention. A single run gave PASS and FAIL on the same build | `tools/benchmark.mjs`, `tools/main.ts` |
| 2026-09-30 | Animation baked as `S_j(t) = worldJoint_j(t) * IBM_j`, not delta-from-frame-0 | Source body is a T-pose and the animation rests in an A-pose, so frame 0 is not the identity. The first bake asserted it was and the assertion was wrong | `tools/pipeline/build_troop.py`, `tools/pipeline/verify_bake.py` |
| 2026-09-30 | Do not trust a green test that re-derives its expectations from the code under test | The frame-0 identity bug passed its own verifier. Tests now read the built GLBs and the source rig | `tests/artifacts.test.mjs` |
| 2026-09-30 | Report 60.0 fps as "at the refresh cap", never as throughput | Removing VSYNC made a 1-unit scene report 87 fps rising to 271 fps as work queued, which is not a throughput measurement | `tools/benchmark.mjs` |
| 2026-09-30 | Leave the working tree on the current branch, commit nothing | The repo was checked out on `agent-1-world-data` with `labs/` untracked while other agents work in the same tree. Committing or switching branches here risks capturing another agent's work | — |

## GENERATION COST

| Task | Notes |
| --- | --- |
| To be filled in | Record token spend per SPEC.md 8 at hand-off |
