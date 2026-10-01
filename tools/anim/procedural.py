"""Procedural animation clips for the shared skeleton (skeleton.json).

Sine-based kinematics, no mocap data, no licensing questions:
  walk - 30fps, 30 frames (1s, 2 steps): hips bob/sway, thighs swing in
         anti-phase, knees flex during swing, ankles compensate, arms
         counter-swing, spine counter-rotates.
  idle - 30fps, 60 frames (2s): breathing sway in the chest, subtle arm
         drift, slow head turn. Arms rest slightly lowered from T-pose.

All motion uses integer cycle counts over the clip length, so frame 0 ==
the frame after the last (perfect loops, loop=True).

Usage: python procedural.py [--out tools/anim/demo]
  writes walk.png/.json + idle.png/.json baked bone textures.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bake  # noqa: E402
import rig  # noqa: E402

FPS = 30


def _clip(name, frames, joint_pose_fn, skel):
    """joint_pose_fn(joint_name, phase01) -> (dt_xyz, (rx, ry, rz))."""
    names = rig.joint_names(skel)
    offsets = {j["name"]: np.asarray(j["offset"]) for j in skel["joints"]}
    joints = {}
    for name_j in names:
        trans, rots = [], []
        for f in range(frames):
            dt, (rx, ry, rz) = joint_pose_fn(name_j, f / frames)
            trans.append([round(float(v), 6)
                          for v in offsets[name_j] + np.asarray(dt)])
            rots.append([round(float(v), 6)
                         for v in rig.quat_from_euler(rx, ry, rz)])
        joints[name_j] = {"translations": trans, "rotations": rots}
    return {"name": name, "fps": FPS, "frames": frames,
            "loop": True, "joints": joints}


def walk_pose(j, u):
    """u in [0,1) over the 1s cycle. Character faces +Z, Y-up, T-pose rest."""
    p = 2 * np.pi * u
    s, s2 = np.sin(p), np.sin(2 * p)
    swing_l = -0.50 * s            # thigh L forward/back
    swing_r = -0.50 * np.sin(p + np.pi)
    knee_l = 0.15 + 0.60 * max(0.0, np.sin(p - 3.6))
    knee_r = 0.15 + 0.60 * max(0.0, np.sin(p + np.pi - 3.6))

    if j == "hips":
        return ([0.025 * s, 0.035 * np.sin(2 * p + 0.6), 0.0],
                (0.05, 0.06 * s, 0.0))
    if j == "spine":
        return ([0, 0, 0], (0.03 + 0.02 * s2, -0.05 * s, 0.0))
    if j == "chest":
        return ([0, 0, 0], (0.02, -0.06 * s, 0.0))
    if j == "upper_chest":
        return ([0, 0, 0], (0.0, -0.04 * s, 0.0))
    if j == "neck":
        return ([0, 0, 0], (0.0, 0.03 * s, 0.0))
    if j == "head":
        return ([0, 0, 0], (-0.02, 0.02 * s, 0.0))
    if j in ("clavicle.L", "clavicle.R"):
        m = 1 if j.endswith(".L") else -1
        return ([0, 0, 0], (0.0, 0.0, m * 0.04 * s))
    if j in ("shoulder.L", "shoulder.R"):
        m = 1 if j.endswith(".L") else -1
        ph = p if m == 1 else p + np.pi
        return ([0, 0, 0],
                (0.03 * np.sin(ph), -0.35 * np.sin(ph), m * 0.06))
    if j in ("elbow.L", "elbow.R"):
        m = 1 if j.endswith(".L") else -1
        ph = p if m == 1 else p + np.pi
        return ([0, 0, 0], (0.0, -0.28 - 0.12 * np.sin(ph), 0.0))
    if j in ("wrist.L", "wrist.R", "hand.L", "hand.R"):
        return ([0, 0, 0], (0, 0, 0))
    if j in ("hip.L", "hip.R"):
        swing = swing_l if j.endswith(".L") else swing_r
        return ([0, 0, 0], (swing, 0.0, 0.0))
    if j in ("knee.L", "knee.R"):
        bend = knee_l if j.endswith(".L") else knee_r
        return ([0, 0, 0], (bend, 0.0, 0.0))
    if j in ("ankle.L", "ankle.R"):
        m = 1 if j.endswith(".L") else -1
        swing = swing_l if m == 1 else swing_r
        bend = knee_l if m == 1 else knee_r
        return ([0, 0, 0], (-(swing + bend) * 0.55 + 0.08, 0.0, 0.0))
    if j in ("toe.L", "toe.R"):
        m = 1 if j.endswith(".L") else -1
        ph = (p if m == 1 else p + np.pi) - 4.2
        return ([0, 0, 0], (0.18 * max(0.0, np.sin(ph)), 0.0, 0.0))
    return ([0, 0, 0], (0, 0, 0))


def idle_pose(j, u):
    q = 2 * np.pi * u
    s = np.sin(q)
    if j == "hips":
        return ([0, 0.008 * s, 0], (0, 0, 0))
    if j == "spine":
        return ([0, 0, 0], (0.012 * s, 0, 0))
    if j == "chest":
        return ([0, 0.006 * s, 0], (0.025 * s, 0, 0))
    if j == "upper_chest":
        return ([0, 0, 0], (0.02 * np.sin(q + 0.4), 0, 0))
    if j == "neck":
        return ([0, 0, 0], (0.015 * np.sin(2 * q), 0.02 * s, 0))
    if j == "head":
        return ([0, 0, 0], (0, 0.045 * s, 0))
    if j in ("shoulder.L", "shoulder.R"):
        m = 1 if j.endswith(".L") else -1
        return ([0, 0, 0], (0, -0.03 * np.sin(q + 0.5), m * -0.12))
    if j in ("elbow.L", "elbow.R"):
        return ([0, 0, 0], (0, -0.16 - 0.02 * s, 0))
    if j in ("clavicle.L", "clavicle.R"):
        return ([0, 0, 0], (0.008 * s, 0, 0))
    return ([0, 0, 0], (0, 0, 0))


def build_clips(skeleton_path=None):
    skel = rig.load_skeleton(skeleton_path or
                             os.path.join(HERE, "skeleton.json"))
    walk = _clip("walk", 30, walk_pose, skel)
    idle = _clip("idle", 60, idle_pose, skel)
    return skel, {"walk": walk, "idle": idle}


def main(argv):
    out = os.path.join(HERE, "demo")
    if "--out" in argv:
        out = argv[argv.index("--out") + 1]
    os.makedirs(out, exist_ok=True)
    skel, clips = build_clips()
    results = {}
    for name, clip in clips.items():
        print(f"baking procedural clip {name!r} "
              f"({clip['frames']} frames @ {clip['fps']}fps)")
        results[name] = bake.bake_clip(clip, skel,
                                       os.path.join(out, name))
    lib_path = os.path.join(out, "procedural_clips.json")
    with open(lib_path, "w") as f:
        json.dump({"source": "procedural.py (sine kinematics, no mocap)",
                   "clips": [clips["walk"], clips["idle"]]}, f)
    print("wrote", lib_path)
    ok = all(r["verified"] for r in results.values())
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
