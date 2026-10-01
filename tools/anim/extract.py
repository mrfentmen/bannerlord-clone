"""Extract GLB animations into a clip library JSON at a fixed frame rate.

Reads animation samplers from the GLB binary blob, resamples translations
(linear) and rotations (slerp) to `fps`, and writes one JSON clip library:

  {name, fps, frames, loop, joints: {joint_name:
      {translations: [[x,y,z] x frames], rotations: [[x,y,z,w] x frames]}}}

Covers every joint of the model's largest skin; joints with no animation
channels hold their rest pose. Quaternions are glTF order [x, y, z, w].

Usage: python extract.py <model.glb> <out.json> [--fps 30]
"""
import json
import os
import sys

import numpy as np
from pygltflib import GLTF2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rig  # noqa: E402

_COMP = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4,
          "MAT3": 9, "MAT4": 16}
IDENTITY_Q = [0.0, 0.0, 0.0, 1.0]


def read_accessor(gltf, blob, idx):
    """Read accessor -> float64 numpy array shaped (count, ncomp)."""
    acc = gltf.accessors[idx]
    bv = gltf.bufferViews[acc.bufferView]
    ncomp = _NCOMP[acc.type]
    dt = np.dtype("<" + _COMP[acc.componentType])
    base = (bv.byteOffset or 0) + (acc.byteOffset or 0)
    stride = bv.byteStride or (ncomp * dt.itemsize)
    out = np.empty((acc.count, ncomp), dtype=np.float64)
    for i in range(acc.count):
        s = base + i * stride
        out[i] = np.frombuffer(blob[s:s + ncomp * dt.itemsize], dtype=dt)
    return out


def _resample_keys(times, values, out_times, kind):
    """Resample keyframed values. kind: 'vec' (lerp) or 'quat' (slerp)."""
    times = np.asarray(times, dtype=np.float64)
    out = []
    j = 0
    for t in out_times:
        while j < len(times) - 2 and times[j + 1] <= t:
            j += 1
        t0, t1 = times[j], times[j + 1]
        f = 0.0 if t1 <= t0 else (t - t0) / (t1 - t0)
        f = min(max(f, 0.0), 1.0)
        if kind == "quat":
            out.append(rig.quat_slerp(values[j], values[j + 1], f))
        else:
            out.append(values[j] + f * (values[j + 1] - values[j]))
    return np.array(out)


def extract_animation(gltf, blob, anim, joint_nodes, fps):
    # gather channels per (node, path)
    keys = {}
    duration = 0.0
    for ch in anim.channels:
        node = ch.target.node
        path = ch.target.path
        if path not in ("translation", "rotation"):
            continue  # scale animation unsupported; baked meshes use unit scale
        smp = anim.samplers[ch.sampler]
        if smp.interpolation not in ("LINEAR", "STEP"):
            raise ValueError(f"unsupported interpolation {smp.interpolation}")
        times = read_accessor(gltf, blob, smp.input)[:, 0]
        vals = read_accessor(gltf, blob, smp.output)
        if smp.interpolation == "STEP":
            # expand step keys: value holds until next key
            times = np.repeat(times, 2)[1:]
            vals = np.repeat(vals, 2, axis=0)[:-1]
        keys.setdefault(node, {})[path] = (times, vals)
        duration = max(duration, float(times[-1]))

    frames = int(round(duration * fps)) + 1
    out_times = np.arange(frames) / fps
    joints = {}
    for ji in joint_nodes:
        name = gltf.nodes[ji].name
        node = gltf.nodes[ji]
        rest_t = list(node.translation) if node.translation else [0.0, 0.0, 0.0]
        rest_q = list(node.rotation) if node.rotation else IDENTITY_Q
        ch = keys.get(ji, {})
        if "translation" in ch:
            t = _resample_keys(ch["translation"][0], ch["translation"][1],
                               out_times, "vec")
        else:
            t = np.tile(rest_t, (frames, 1))
        if "rotation" in ch:
            q = _resample_keys(ch["rotation"][0], ch["rotation"][1],
                               out_times, "quat")
        else:
            q = np.tile(rest_q, (frames, 1))
        joints[name] = {
            "translations": [[round(float(v), 6) for v in row] for row in t],
            "rotations": [[round(float(v), 6) for v in row] for row in q],
        }
    return {
        "name": anim.name or "clip",
        "fps": fps,
        "frames": frames,
        "loop": True,
        "joints": joints,
    }


def extract_library(glb_path, fps=30):
    gltf = GLTF2().load(glb_path)
    blob = gltf.binary_blob()
    skin = max(gltf.skins, key=lambda s: len(s.joints))
    lib = {"source": os.path.basename(glb_path), "fps": fps, "clips": []}
    for anim in gltf.animations:
        lib["clips"].append(
            extract_animation(gltf, blob, anim, skin.joints, fps))
    return lib


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    fps = 30
    if "--fps" in argv:
        fps = int(argv[argv.index("--fps") + 1])
    lib = extract_library(argv[1], fps)
    with open(argv[2], "w") as f:
        json.dump(lib, f)
    for c in lib["clips"]:
        print(f"clip {c['name']!r}: {c['frames']} frames @ {c['fps']}fps, "
              f"{len(c['joints'])} joints -> {argv[2]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
