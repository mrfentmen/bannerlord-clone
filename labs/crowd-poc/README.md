# Crowd rendering proof of concept (Phase 3)

Thin-instanced, GPU vertex-texture-skinned troops with three LOD tiers, plus the asset pipeline that
feeds them. No campaign, no AI, no terrain — this is the renderer in isolation, so a frame rate can
be attributed to the crowd and nothing else.

**Start with [`REPORT.md`](REPORT.md)** for the measured results, the verdict and the caveats.
[`ASSET_PIPELINE_NOTES.md`](ASSET_PIPELINE_NOTES.md) covers where the pipeline departs from
ASSETS.md and why. [`CHANGELOG_ROWS.md`](CHANGELOG_ROWS.md) holds entries for the root changelog.

## Status

| Target | Required | Median (5 repeats) | Result |
| --- | --- | --- | --- |
| 300 units at 60 fps | 60.0 | 60.0 (at the 60 Hz cap) | PASS |
| 1000 units at 30 fps | 30.0 | 34.2 (range 32.1–34.4 across sessions) | PASS on the median, 1.09–1.14x |

Two things to know before trusting the second row. The measuring machine is a 2015 MacBook Pro with
an integrated Iris 6100, *below* the mid-range bar in `MIDRANGE_HARDWARE.md`, so a pass is a
conservative lower bound rather than evidence about mid-range hardware. And every median cleared
30 fps while the worst individual repeat observed was 27.8 fps — the target holds on the median, not
on every run. See REPORT.md §1 and §3.

## Running it

```bash
npm install
npm run build:assets     # full six-step asset pipeline, ends in PIPELINE OK
npm run check:manifest   # re-hash every asset, fail on any uncredited file
npm run bundle           # typecheck + esbuild
npm run serve            # http://127.0.0.1:8127
```

Then open the viewer:

| URL | what it shows |
| --- | --- |
| `?mode=view&units=1000` | the crowd, animating, orbiting slowly |
| `?mode=view&units=1000&debug=1` | skin matrix forced to identity, for profiling |
| `?mode=bench&counts=100,300,1000` | frame rate, draw calls, triangles, per-tier split |

## Measuring it

```bash
node tools/benchmark.mjs --repeats 5 --counts 100,300,600,1000,1500,2000 --query "cam=30"
node tools/benchmark.mjs --repeats 3 --counts 300,1000 --query "cam=55"
node tools/benchmark.mjs --cpu-baseline --counts 32,64,128,256,512,1024
node tools/profile-vtf.mjs            # cost of the animation texture fetch
node tools/benchmark.mjs --impostor   # rebake and validate the far-tier atlas
node tools/benchmark.mjs --screenshot out.png --units 1000 --query "cam=30"
```

Always use `--repeats`. Single runs on this build read anywhere from 25.5 to 31.5 fps for the
identical 1,000-unit scene, which is enough to flip a PASS/FAIL verdict on its own. Output lands in
`results/`.

Useful query parameters: `cam` (camera distance in metres), `close` and `mid` (LOD thresholds in
metres, overriding the config), `perRow` (grid width), `debug` (1 = identity skin matrix).

## Tests

```bash
npm test        # 9 tests, reads the built artefacts
npm run verify  # typecheck + tests + manifest + benchmark
```

The tests read the built GLBs, the manifest and the animation header, then re-derive their own
expectations from those files. That is intentional: a test that reuses the pipeline's own helpers
cannot catch a wrong-but-self-consistent pipeline, which is how the first animation bake passed
while being wrong. `tools/pipeline/verify_gltf.py`, `verify_bake.py` and `test_gltf_math.py` cover
the Python side of the build.

## Layout

```
config/crowd.json          single source of truth: budgets, clips, LOD + its evidence, impostor
src/skinning.ts            GPU vertex-texture skinning shader
src/crowd-scene.ts         thin instances, per-frame LOD repartition
src/impostor-material.ts   atlas-sampling camera-facing far tier
src/bench.ts               warm-up, sampling, draw-call and triangle counters
src/cpu-baseline.ts        checksum-protected CPU skinning baseline
tools/build-assets.mjs     six-step pipeline orchestrator, writes the manifest
tools/benchmark.mjs        real-Chrome benchmark driver
tools/pipeline/            pure-Python glTF, OBJ and animation bake
assets/originals/          source packs, never modified
assets/processed/          everything the renderer loads
results/                   captured measurement output and screenshots
```

## Known gaps

Uncompressed GLB geometry, PNG rather than KTX2 textures, LOD by camera distance with no terrain
occlusion, no mipmaps on the impostor atlas, and no GPU timer query on the measuring machine. All
of them, and what to do about each, are in REPORT.md §9.
