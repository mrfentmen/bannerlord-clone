# Animation pipeline

`tools/anim/` is the production animation pipeline (MASTER_PLAN 4B, tasks
108-114). It turns source GLB animations and procedural fallbacks into GPU
bone textures the client can sample in a vertex shader, with every clip
decode-verified before it ships.

## Layout

| File | Purpose |
|---|---|
| `skeleton.json` | The shared skeleton: root + 24 animated joints, bind-pose translations. `validate.py` rejects any character GLB that does not fit it. |
| `gltf.py` | Minimal pure-Python GLB reader (nodes, skins, animations). No deps beyond numpy. |
| `validate.py` | Task 108: validate a character GLB against `skeleton.json`. Exit 0 = valid, 1 = rejected, 2 = unreadable. |
| `extract.py` | Task 109: sample named animations from a source GLB into shared-skeleton joint space. |
| `retarget.py` | Task 113: Mixamo and Quaternius joint-name maps, relative-rotation transfer, cull profiles. |
| `procedural.py` | Task 110: procedural run, crouch, aim-pose (plus idle, walk, block, knockdown) fallbacks. Bit-exact loops, zero licensing questions. |
| `bake.py` | Task 111: bake clips to RGBA16F bone textures; decode-verify each against the 4.88e-4 float16 bar. |
| `manifest.py` | Task 112: regenerate `CLIPS.md` from the bake sidecar. Never hand-edit `CLIPS.md`. |
| `run.py` | Task 114: pipeline driver. `run.py --ci` is the CI gate. |
| `tests/` | 18-test unittest suite. |
| `sources/` | Downloaded originals + `SOURCE_NOTES.md` (license records). |
| `dist/` | Pipeline outputs: `anim_bones.bin` (RGBA16F texture), `anim_bones.json` (clip table + hashes). |

## Quick start

```bash
python3 tools/anim/run.py          # full pipeline: extract -> bake -> verify -> manifest
python3 tools/anim/run.py --ci     # pipeline plus the test suite (the CI gate)
python3 tools/anim/run.py --tests-only
python3 tools/anim/validate.py path/to/character.glb [--rig mixamo|quaternius]
```

Requirements: Python 3, numpy. No other dependencies.

## How a clip flows

1. **Extract** (`extract.py`): the named animation is sampled at 30 fps.
   Joint rotations transfer by name through the rig map as
   `q_target = q_source_rest^-1 * q_source_anim`, so the source's rest-pose
   orientation never leaks in. Root motion is measured from the clip's own
   start pose (never the rest pose); locomotion loops are baked in-place,
   one-shots keep authored root motion.
2. **Procedural** (`procedural.py`): synthesized curves with integer cycle
   counts; loops are bit-exact by construction.
3. **Bake** (`bake.py`): forward kinematics on the shared-skeleton bind
   pose, `S(t) = W(t) * IBM`, quantized to float16. Texture is
   `4*25` texels wide, one row per frame, row-major — the same layout as the
   crowd-poc bake, but float16.
4. **Decode-verify** (`bake.py`): the file is read back from disk and every
   texel must satisfy `|decoded - exact| <= 4.88e-4 * max(1, |exact|)` (the
   float16 rounding bound). Every matrix must stay rigid, and every loop
   clip must close at its true loop point within 5 cm.
5. **Manifest** (`manifest.py`): `CLIPS.md` is rewritten from the sidecar.

## The retarget (task 113)

`Soldier.glb` (MIT, Mixamo rig) retargets onto the shared skeleton through
`retarget.MIXAMO_MAP`; `Quaternius_SWAT.glb` (CC0, CharacterArmature rig)
through `retarget.QUATERNIUS_MAP`. Finger joints, prop sockets, and armature
roots are culled by the rig profile (reported by `validate.py`, never
silent). Retargeted clips pass `validate.py` — that is the completion
criterion, and it is asserted in the test suite.

Two bugs this pipeline had to survive, recorded so nobody reintroduces them:

- **Scene scale:** the three.js example models carry a 0.01 scene-root
  scale (centimetres to metres). The first extractor dropped scale from its
  hierarchy walk and measured root motion 100x too large. Scale is part of
  every matrix the pipeline walks.
- **Loop-point vs last-frame:** the first loop-closure check compared the
  last baked frame against frame 0, which measures one frame of ordinary
  motion, not the loop pop. The check now probes the true loop point
  `t=duration` through each clip's `sample_fn`.

## CI

`.github/workflows/anim-ci.yml` runs `python3 tools/anim/run.py --ci` on
every change under `tools/anim/`. The crowd-poc's 9 node tests are untouched
by this pipeline and keep passing independently.
