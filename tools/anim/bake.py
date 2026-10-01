"""Bake an animation clip to bone textures for GPU vertex-texture skinning.

For each frame, every joint's local TRS is composed down the hierarchy into
a model-space 4x4 matrix. The matrices are packed row-major into an RGBA
texture: one matrix = 4 texels (one texel per row), so the texture is
(joints*4) pixels wide and (frames) pixels tall. Data is float32 quantized
to float16, stored as 16-bit RGBA PNG (see png16.py).

A JSON sidecar ships alongside: clip name, fps, joint order, texture size,
and the inverse bind-pose matrices (from skeleton.json rest offsets) so the
shader can do:  skinned = boneTex[frame*nJoints + j] * inverseBind[j] * pos.

bake_clip() also verifies by decoding the texture back and comparing every
matrix to the source within tolerance.

Usage: python bake.py <clip.json> <skeleton.json> <out_prefix>
  writes <out_prefix>.png + <out_prefix>.json
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import png16  # noqa: E402
import rig  # noqa: E402

TOLERANCE = 5e-3  # float16 quantization bound for metre-scale matrices


def bake_matrices(clip, skel):
    """(frames, joints, 4, 4) model-space matrices from clip TRS data."""
    names = rig.joint_names(skel)
    n_frames = clip["frames"]
    mats = np.zeros((n_frames, len(names), 4, 4))
    missing = []
    for j, name in enumerate(names):
        jd = clip["joints"].get(name)
        if jd is None:
            missing.append(name)
            t = np.zeros((n_frames, 3))
            q = np.tile([0, 0, 0, 1], (n_frames, 1))
        else:
            t = np.asarray(jd["translations"], dtype=np.float64)
            q = np.asarray(jd["rotations"], dtype=np.float64)
        assert t.shape == (n_frames, 3), (name, t.shape)
        assert q.shape == (n_frames, 4), (name, q.shape)
        for f in range(n_frames):
            mats[f, j] = rig.compose_trs(t[f], q[f])
    if missing:
        print(f"warning: {len(missing)} joints missing from clip, "
              f"using identity: {', '.join(missing[:6])}"
              f"{' ...' if len(missing) > 6 else ''}")
    # compose down the hierarchy
    parents = rig.parent_indices(skel)
    world = np.zeros_like(mats)
    for j, p in enumerate(parents):
        world[:, j] = mats[:, j] if p < 0 else world[:, p] @ mats[:, j]
    return world


def pack_texture(world):
    """(F, J, 4, 4) -> (F, J*4, 4) RGBA float32 image, row-major."""
    f, j = world.shape[0], world.shape[1]
    return world.reshape(f, j * 4, 4).astype(np.float32)


def unpack_texture(img, n_joints):
    f = img.shape[0]
    return img.reshape(f, n_joints, 4, 4).astype(np.float64)


def verify(world, png_path, n_joints):
    img = png16.read_rgba16(png_path)
    back = unpack_texture(img, n_joints)
    err = np.max(np.abs(world.astype(np.float64) - back))
    ok = err <= TOLERANCE
    print(f"verify: max matrix error {err:.2e} "
          f"(tolerance {TOLERANCE:.0e}) -> {'OK' if ok else 'FAIL'}")
    return ok, err


def bake_clip(clip, skel, out_prefix, verify_bake=True):
    names = rig.joint_names(skel)
    world = bake_matrices(clip, skel)
    img = pack_texture(world)
    png_path = out_prefix + ".png"
    png16.write_rgba16(png_path, img)

    inv_bind = rig.inverse_bind_matrices(skel)
    sidecar = {
        "clip": clip["name"],
        "fps": clip["fps"],
        "frames": clip["frames"],
        "loop": clip.get("loop", True),
        "joints": names,
        "joint_count": len(names),
        "texture": {
            "file": os.path.basename(png_path),
            "width": img.shape[1],
            "height": img.shape[0],
            "format": "RGBA16 (float32 quantized to float16)",
            "layout": "row-major: one 4x4 matrix = 4 RGBA texels "
                      "(texel = matrix row); texel x of joint j, frame f "
                      "at pixel (j*4 + x, f)",
        },
        "inverse_bind": {
            n: [round(float(v), 6) for v in m.reshape(16)]
            for n, m in zip(names, inv_bind)
        },
        "skeleton": skel["name"],
    }
    json_path = out_prefix + ".json"
    with open(json_path, "w") as f:
        json.dump(sidecar, f, indent=1)
    print(f"baked {clip['name']!r}: {clip['frames']} frames x "
          f"{len(names)} joints -> {img.shape[1]}x{img.shape[0]} px")

    ok = True
    if verify_bake:
        ok, _ = verify(world, png_path, len(names))
    return {"png": png_path, "json": json_path,
            "width": img.shape[1], "height": img.shape[0],
            "verified": ok, "world": world}


def main(argv):
    if len(argv) < 4:
        print(__doc__)
        return 2
    with open(argv[1]) as f:
        lib = json.load(f)
    clip = lib["clips"][0] if "clips" in lib else lib
    skel = rig.load_skeleton(argv[2])
    res = bake_clip(clip, skel, argv[3])
    return 0 if res["verified"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
