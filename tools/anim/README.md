# Animation pipeline (`tools/anim/`)

End-to-end pipeline for character animation (ASSETS.md 4.1-4.2, TASKS.md Phase 3):
shared skeleton -> GLB validation -> clip extraction -> bone-texture baking
for GPU vertex-texture skinning -> procedural fallback clips.

## Files

| File | Purpose |
|---|---|
| `skeleton.json` | **The one shared skeleton** (24 joints, Y-up, 1 unit = 1 m, T-pose). Joint order is parents-before-children and doubles as the bone-texture joint order. |
| `rig.py` | Shared math: skeleton loading, quaternion ops (normalize, slerp, axis-angle, euler, quat->matrix), TRS composition, hierarchy + bind + inverse-bind matrices. |
| `validate.py` | Validate a GLB skin against `skeleton.json`: joint name mapping (Mixamo aliases), missing/extra joints, hierarchy and order checks, retargeting verdict. |
| `extract.py` | Read GLB animations, resample to fixed fps (linear interp / slerp), write a clip-library JSON covering every skin joint. |
| `bake.py` | Bake a clip to a bone texture PNG + JSON sidecar, with decode-and-compare verification. |
| `procedural.py` | Generate `walk` and `idle` clips for `skeleton.json` from sine kinematics (no mocap, no licensing questions) and bake them. |
| `png16.py` | Minimal 16-bit RGBA PNG codec. Pillow cannot write 16-bit RGBA, so this writes the chunks directly (filter 0 only). Float32 matrix data is quantized to float16, matching GPU half-float data textures. |
| `test_anim.py` | pytest suite (9 tests, all green). |
| `demo/` | Baked `walk` (96x30) and `idle` (96x60) bone textures + sidecars + `procedural_clips.json`. |

## Usage

```bash
cd tools/anim
# 1. validate a source model against the shared skeleton
python validate.py ../../clients/campaign/public/anims/Soldier.glb
# 2. extract its clips at 30 fps
python extract.py ../../clients/campaign/public/anims/Soldier.glb clips.json --fps 30
# 3. bake the first clip in the library to a bone texture
python bake.py clips.json skeleton.json out/soldier_idle
# 4. (re)generate + bake the procedural walk/idle clips
python procedural.py
# 5. run the tests
python -m pytest test_anim.py -q
```

## Validation results (2026-10-01)

`clients/campaign/public/anims/Soldier.glb` (Mixamo rig, 49-joint skin):
**retargeting POSSIBLE** - 22/24 shared joints map anatomically
(`mixamorig:LeftUpLeg` -> `hip.L`, `LeftLeg` -> `knee.L`, etc.); `wrist.L/R`
have no Mixamo counterpart and are synthesized as
`slerp(elbow, hand, 0.5)`; 27 extra finger joints are ignored.
`Xbot.glb`: also POSSIBLE.

## Bone texture layout (for the client dev)

- **Size**: width = `joint_count * 4` px, height = `frames` px.
  Walk: 96x30 (24 joints x 30 frames). Idle: 96x60.
- **Content**: one 4x4 model-space joint matrix = **4 RGBA texels**
  (texel = one matrix row, row-major). Pixel `(joint*4 + row, frame)`
  holds matrix row `row` of joint `joint` at `frame`.
- **Format**: 16-bit RGBA PNG, float32 data quantized to float16
  (round-trip error < 5e-3 on metre-scale matrices; bake verifies this).
- **Sidecar** (`<clip>.json`): `clip`, `fps`, `frames`, `loop`, `joints`
  (texture joint order), `texture` (dims + layout), `inverse_bind`
  (per-joint 4x4 inverse rest-pose matrices, row-major lists).

### Shader sketch (three.js / Babylon.js)

```glsl
// boneTex: DataTexture from the PNG (HalfFloatType, RGBAFormat)
// frame: current animation frame (float, wrap with mod for looping)
// joint: skin index attribute (must match skeleton.json order)
mat4 getBoneMatrix(sampler2D boneTex, float joints4, float frame, float joint) {
    float x = (joint * 4.0 + 0.5) / joints4;   // joints4 = joint_count*4
    float y = (frame + 0.5) / textureHeight;
    mat4 m;
    m[0] = texture2D(boneTex, vec2(x + 0.0/joints4, y));
    m[1] = texture2D(boneTex, vec2(x + 1.0/joints4, y));
    m[2] = texture2D(boneTex, vec2(x + 2.0/joints4, y));
    m[3] = texture2D(boneTex, vec2(x + 3.0/joints4, y));
    return transpose(m);  // texels hold matrix ROWS; GLSL mat4 is column-major
}
vec4 skinned = getBoneMatrix(...) * inverseBind[joint] * vec4(position, 1.0);
```

Note: matrices are stored row-major (one texel per row); GLSL `mat4`
constructs column-major, so transpose each fetched matrix (or store
transposed). `inverseBind` comes from the sidecar's `inverse_bind`
(a single small uniform/constant array, not per frame).

## Conventions

- Quaternions are glTF order **[x, y, z, w]** everywhere.
- Clip JSON stores **local** TRS per joint; bake composes the hierarchy.
- Procedural clips are authored in-place (no root translation); the client
  moves the instance transform.
- Retargeting a Mixamo GLB onto the shared skeleton: map joints via
  `validate.py`'s alias table, synthesize `wrist.L/R`, drop finger joints.
