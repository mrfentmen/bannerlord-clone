"""Shared rig math for the animation pipeline.

Conventions: Y-up, metres, glTF quaternion order [x, y, z, w],
4x4 matrices row-major as nested lists / numpy arrays.
"""
import json

import numpy as np


def load_skeleton(path):
    with open(path) as f:
        skel = json.load(f)
    joints = skel["joints"]
    index = {j["name"]: i for i, j in enumerate(joints)}
    # parents must come before children (also the bone-texture joint order)
    for i, j in enumerate(joints):
        p = j["parent"]
        if p is not None:
            assert p in index, f"unknown parent {p!r} of joint {j['name']!r}"
            assert index[p] < i, (
                f"parent {p!r} must precede child {j['name']!r} in skeleton.json")
    return skel


def joint_names(skel):
    return [j["name"] for j in skel["joints"]]


def parent_indices(skel):
    index = {j["name"]: i for i, j in enumerate(skel["joints"])}
    return [index[j["parent"]] if j["parent"] else -1 for j in skel["joints"]]


def rest_offsets(skel):
    return [np.asarray(j["offset"], dtype=np.float64) for j in skel["joints"]]


# ------------------------------------------------------------------ quats
def quat_normalize(q):
    q = np.asarray(q, dtype=np.float64)
    n = np.linalg.norm(q)
    return q / n if n > 1e-12 else np.array([0.0, 0.0, 0.0, 1.0])


def quat_from_axis_angle(axis, angle):
    axis = np.asarray(axis, dtype=np.float64)
    axis = axis / (np.linalg.norm(axis) or 1.0)
    s = np.sin(angle / 2.0)
    return quat_normalize([axis[0] * s, axis[1] * s, axis[2] * s, np.cos(angle / 2.0)])


def quat_from_euler(rx, ry, rz):
    """Intrinsic XYZ euler -> quaternion [x, y, z, w]."""
    qx = quat_from_axis_angle([1, 0, 0], rx)
    qy = quat_from_axis_angle([0, 1, 0], ry)
    qz = quat_from_axis_angle([0, 0, 1], rz)
    return quat_mul(quat_mul(qx, qy), qz)


def quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return quat_normalize([
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    ])


def quat_slerp(q0, q1, t):
    q0 = quat_normalize(q0)
    q1 = quat_normalize(q1)
    d = float(np.dot(q0, q1))
    if d < 0.0:
        q1 = -q1
        d = -d
    if d > 0.9995:
        return quat_normalize(q0 + t * (q1 - q0))
    th = np.arccos(np.clip(d, -1.0, 1.0))
    s = np.sin(th)
    return (np.sin((1 - t) * th) / s) * q0 + (np.sin(t * th) / s) * q1


def quat_to_mat3(q):
    x, y, z, w = quat_normalize(q)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def compose_trs(t, q, s=None):
    """4x4 matrix from translation, quaternion [x,y,z,w], optional scale."""
    m = np.eye(4)
    m[:3, :3] = quat_to_mat3(q)
    if s is not None:
        m[:3, :3] = m[:3, :3] * np.asarray(s, dtype=np.float64)
    m[:3, 3] = np.asarray(t, dtype=np.float64)
    return m


# --------------------------------------------------------------- hierarchy
def hierarchy_matrices(skel, local_mats):
    """Compose local 4x4s down the hierarchy -> model-space (world) matrices."""
    parents = parent_indices(skel)
    world = [None] * len(parents)
    for i, p in enumerate(parents):
        lm = np.asarray(local_mats[i], dtype=np.float64).reshape(4, 4)
        world[i] = lm if p < 0 else world[p] @ lm
    return world


def bind_matrices(skel):
    """Rest-pose model-space matrices from skeleton.json offsets."""
    locals_ = [compose_trs(off, [0, 0, 0, 1]) for off in rest_offsets(skel)]
    return hierarchy_matrices(skel, locals_)


def inverse_bind_matrices(skel):
    return [np.linalg.inv(m) for m in bind_matrices(skel)]
