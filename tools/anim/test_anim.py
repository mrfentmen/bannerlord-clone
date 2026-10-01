"""Real tests for the animation pipeline. No mocks: every test exercises the
actual modules against skeleton.json and the real Soldier.glb asset."""
import json
import os
import sys

import numpy as np
import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bake  # noqa: E402
import extract  # noqa: E402
import png16  # noqa: E402
import procedural  # noqa: E402
import rig  # noqa: E402
import validate  # noqa: E402

SKEL = os.path.join(HERE, "skeleton.json")
SOLDIER = os.path.join(HERE, "..", "..", "clients", "campaign",
                       "public", "anims", "Soldier.glb")


def test_skeleton_valid():
    skel = rig.load_skeleton(SKEL)
    joints = skel["joints"]
    assert len(joints) == 24
    names = [j["name"] for j in joints]
    assert len(set(names)) == 24, "joint names must be unique"
    assert skel["up_axis"] == "Y" and skel["unit"] == "metre"
    for j in joints:
        off = np.asarray(j["offset"], dtype=float)
        assert off.shape == (3,) and np.all(np.isfinite(off))
    # parents precede children (load_skeleton already asserts; double-check)
    idx = {n: i for i, n in enumerate(names)}
    for j in joints:
        if j["parent"]:
            assert idx[j["parent"]] < idx[j["name"]]
    # sanity: hips at ~1m, head top ~1.6m, ankles near ground
    world = rig.bind_matrices(skel)
    n = {name: i for i, name in enumerate(names)}
    assert world[n["hips"]][1, 3] == pytest.approx(0.98)
    assert world[n["head"]][1, 3] == pytest.approx(1.64)
    assert world[n["ankle.L"]][1, 3] == pytest.approx(0.05)


def test_validate_soldier_retarget_possible():
    rep = validate.validate(SOLDIER, SKEL)
    assert rep["retarget_possible"], rep
    assert rep["mapped"] >= 22
    assert rep["missing"] == []
    assert rep["hierarchy_errors"] == []
    assert rep["order_errors"] == []
    # the two unmapped shared joints must have documented fallbacks
    assert set(rep["synthesized"]) == {"wrist.L", "wrist.R"}


def test_extract_walk_clip():
    lib = extract.extract_library(SOLDIER, fps=30)
    names = [c["name"] for c in lib["clips"]]
    assert "Walk" in names
    walk = next(c for c in lib["clips"] if c["name"] == "Walk")
    assert walk["fps"] == 30 and walk["frames"] > 10
    assert len(walk["joints"]) == 49  # full Mixamo skin
    for jname, jd in walk["joints"].items():
        t = np.asarray(jd["translations"])
        q = np.asarray(jd["rotations"])
        assert t.shape == (walk["frames"], 3), jname
        assert q.shape == (walk["frames"], 4), jname
        assert np.allclose(np.linalg.norm(q, axis=1), 1.0, atol=1e-4), jname
        assert np.all(np.isfinite(t)) and np.all(np.isfinite(q))


def test_procedural_clips_loop():
    # integer cycle counts -> pose(u=0) == pose(u=1) for every joint
    for pose_fn in (procedural.walk_pose, procedural.idle_pose):
        joints = ["hips", "spine", "chest", "upper_chest", "neck", "head",
                  "clavicle.L", "shoulder.L", "elbow.L", "wrist.L", "hand.L",
                  "hip.L", "knee.L", "ankle.L", "toe.L"]
        for j in joints:
            dt0, e0 = pose_fn(j, 0.0)
            dt1, e1 = pose_fn(j, 1.0)
            assert np.allclose(dt0, dt1, atol=1e-12), (j, dt0, dt1)
            assert np.allclose(e0, e1, atol=1e-12), (j, e0, e1)


def test_procedural_walk_moves():
    # the walk must actually move: thigh swing amplitude > 0.3 rad
    _, clips = procedural.build_clips(SKEL)
    walk = clips["walk"]
    q = np.asarray(walk["joints"]["hip.L"]["rotations"])
    # rotation magnitude away from identity across the cycle
    ang = 2 * np.arccos(np.clip(np.abs(q[:, 3]), -1, 1))
    assert ang.max() > 0.3, "thigh barely swings"
    # anti-phase: hip.L and hip.R signed swing angles oppose each other.
    # (hip rotations are pure X-axis, so angle = 2*atan2(qx, qw))
    def signed_x_angle(q):
        return 2 * np.arctan2(q[:, 0], q[:, 3])

    qr = np.asarray(walk["joints"]["hip.R"]["rotations"])
    a_l = signed_x_angle(q)
    a_r = signed_x_angle(qr)
    assert np.mean(a_l * a_r) < -0.7 * np.mean(a_l ** 2), "legs not anti-phase"


def test_bake_roundtrip(tmp_path):
    skel = rig.load_skeleton(SKEL)
    _, clips = procedural.build_clips(SKEL)
    res = bake.bake_clip(clips["walk"], skel,
                         str(tmp_path / "walk"), verify_bake=True)
    assert res["verified"]
    assert res["width"] == 24 * 4 and res["height"] == 30
    img = png16.read_rgba16(res["png"])
    assert img.shape == (30, 96, 4)
    back = bake.unpack_texture(img, 24)
    err = np.max(np.abs(res["world"].astype(np.float64) - back))
    assert err <= bake.TOLERANCE


def test_sidecar_inverse_bind(tmp_path):
    skel = rig.load_skeleton(SKEL)
    _, clips = procedural.build_clips(SKEL)
    res = bake.bake_clip(clips["idle"], skel,
                         str(tmp_path / "idle"), verify_bake=False)
    with open(res["json"]) as f:
        side = json.load(f)
    assert side["joints"] == rig.joint_names(skel)
    assert side["frames"] == 60 and side["fps"] == 30
    bind = rig.bind_matrices(skel)
    for name, b in zip(side["joints"], bind):
        inv = np.array(side["inverse_bind"][name]).reshape(4, 4)
        assert np.allclose(inv @ b, np.eye(4), atol=1e-4), name


def test_png16_roundtrip():
    rng = np.random.RandomState(42)
    a = rng.uniform(-2, 2, (9, 25, 4)).astype(np.float32)
    p = "/tmp/test_anim_png16.png"
    png16.write_rgba16(p, a)
    b = png16.read_rgba16(p)
    assert b.shape == a.shape
    assert np.max(np.abs(a - b)) < 2e-3


def test_quat_helpers():
    q0 = rig.quat_from_axis_angle([1, 0, 0], 0.0)
    q1 = rig.quat_from_axis_angle([1, 0, 0], 1.2)
    assert np.allclose(rig.quat_slerp(q0, q1, 0.0), q0, atol=1e-9)
    assert np.allclose(rig.quat_slerp(q0, q1, 1.0), q1, atol=1e-9)
    mid = rig.quat_slerp(q0, q1, 0.5)
    assert abs(np.linalg.norm(mid) - 1.0) < 1e-9
    m = rig.compose_trs([1, 2, 3], [0, 0, 0, 1])
    assert np.allclose(m[:3, 3], [1, 2, 3])
    assert np.allclose(m[:3, :3], np.eye(3))
