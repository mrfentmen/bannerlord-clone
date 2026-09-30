# Asset pipeline notes

Where this pipeline follows `ASSETS.md`, and the three places it does not.

## The six steps, and what ran

| ASSETS.md step | Status | Tool |
| --- | --- | --- |
| 1. Source from a public, commercially cleared pack | as written | `tools/fetch-assets.mjs` |
| 2. Record licence, author, URL, retrieval date, hash | as written | `tools/build-assets.mjs`, `tools/manifest-check.mjs` |
| 3. One shared skeleton, rig every body and prop to it | as written | `tools/pipeline/build_troop.py` |
| 4. Reduce to close/mid/far LODs, metres, feet at y=0 | **partly substituted** | see deviation 1 |
| 5. Convert and bake animation to a GPU-friendly form | **substituted** | see deviation 2 |
| 6. Normalise and record texture budgets | as written | `tools/blender/textures.py` |

Run the whole thing with `node tools/build-assets.mjs`. It prints `PIPELINE OK` only when every
step and every verifier passes. `node tools/manifest-check.mjs` is a separate, stricter gate: it
fails on an uncredited file in `assets/` and on a single byte of hash drift, and it refuses the
whole tree if any licence is not commercially cleared.

## Deviation 1: LOD reduction and export, not Blender's Python glTF importer

`ASSETS.md` step 4 and 5 describe Blender doing the reducing and the glTF export. Blender 4.5's
bundled NumPy does not import on macOS 12.7.6, and every Python path into `bpy` needs NumPy, so the
`bpy.ops.import_scene.gltf` and `bpy.ops.export_scene.gltf` operators were unavailable.

What was used instead:

- **Reduce**: `tools/blender/decimate.py`, called through Blender's own bundled `python`, so
  decimation still happens in Blender and still uses Blender's quadric error metric. Only the
  entry point differs; Blender's C++ layer is what does the work.
- **Normals, scale, y=0**: `tools/pipeline/gltf.py`, in pure Python, on the source mesh data.
- **glTF/GLB writing**: `tools/pipeline/gltf.py`, in pure Python.
- **Texture bake and grade**: `tools/blender/textures.py`, in Blender, unaffected.

The result is verified rather than assumed. `tools/pipeline/verify_gltf.py` reads each GLB back and
checks triangle counts against `config/crowd.json`, and `tools/pipeline/test_gltf_math.py` pins the
matrix maths with fixed reference cases.

### What this costs

The pure-Python writer emits uncompressed-geometry glTF with embedded PNG textures. That is
correct and loads fine, but it is not the shipping format:

- **No Draco or meshopt compression.** The close body GLB is 2.6 MB. At 2,600 troops of close-tier
  geometry that is a real memory cost, and it is the clearest gap in this work.
- **No KTX2/Basis.** Textures stay lossless PNG inside the GLB. They compress in transit and on
  disk, but they cost more VRAM than a transcoded KTX2 would, and they do not sample as fast.

Both should move into the main Blender-based pipeline once the project is on a machine where
Blender's Python works. They are recorded here rather than hidden.

## Deviation 2: animation is baked to a matrix texture, not vertex attributes

`ASSETS.md` step 5 says to bake animation to a GPU-friendly form. For 1,000+ skinned units that form
is a matrix texture sampled in the vertex shader, because per-vertex animated attributes would mean
uploading megabytes per frame. That choice is in the spec; it is the *source* that changed:

- The source animation is a glTF binary animation with per-frame node transforms.
- `tools/pipeline/build_troop.py` evaluates those transforms on the CPU, once, at build time.
- The result is `assets/processed/anim_matrices.bin`: a 100x135 RGBA32F texture, 216,000 bytes,
  holding 25 joints x 4 texels x 135 frames. Row-major in the file, column-major once uploaded,
  because WebGL's `texelFetch` is column-major and a transposed upload would be wrong.
- Clips: `idle` 75 frames over 2.5 s, `walk` 60 frames over 2.0 s, filling the texture exactly.

The bake is checked, not trusted. `tools/pipeline/verify_bake.py` confirms, against the source
animation, that:

| Check | Limit | Measured |
| --- | --- | --- |
| joint placement error | < 1e-5 m | 1.601e-7 m (walk) |
| rigidity, det(S) drift | < 1e-5 | 3.815e-6 (walk) |
| rig axis preservation | < 1e-4 | 9.405e-7 (walk) |
| clip loop closure | < 0.15 | 0.0807 (walk) |
| matrix magnitude | < 6.0 | under limit |

### The one bug worth remembering

The first bake asserted that every frame-0 matrix was the identity. It passed, and it was wrong.
The source body mesh is authored in a T-pose while the animation's rest pose is an A-pose, so
frame 0 is *not* identity and the check was measuring the wrong thing. The corrected bake stores
`S_j(t) = worldJoint_j(t) * IBM_j`, and the verifier now compares against the source rig's actual
rest pose. A green test that asserted the wrong invariant was the most expensive defect in this
build; `tests/artifacts.test.mjs` now re-derives its expectations from the artefacts rather than
from the pipeline's own helpers, so a wrong-but-consistent pipeline cannot pass its own tests.

## Impostor atlas: Babylon, not Blender

`bpy.ops.render.render` crashes the headless Blender build on this machine, so the far-tier atlas is
baked in Babylon (`src/impostor.ts`, driven by `node tools/benchmark.mjs --impostor`). This is
functionally the same operation — render 8 camera angles x 8 walk frames into a 2048x2048 atlas of
256 px cells — and the browser's real GPU is a better renderer for it than the crashing one was.

Result: 64/64 non-empty cells, 11.7% mean coverage, 624.6 KB. Coverage is low because the soldier
silhouettes genuinely occupy a small part of each cell; the check that matters is that all 64 cells
are non-empty, which is what `--impostor` fails on.

## Originals

Untouched, and never edited in place. Every pipeline step reads from `assets/originals/` and writes
to `assets/processed/`. The three source archives are hashed in `assets/manifest.json` so a silent
edit to an original fails `manifest-check.mjs`.
