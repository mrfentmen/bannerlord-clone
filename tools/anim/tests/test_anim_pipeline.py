"""Animation pipeline tests. Run: python3 tools/anim/run.py --tests-only"""

import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ANIM = HERE.parent
sys.path.insert(0, str(ANIM))

import bake as bake_mod  # noqa: E402
import extract as extract_mod  # noqa: E402
import gltf as gltf_mod  # noqa: E402
import manifest as manifest_mod  # noqa: E402
import procedural  # noqa: E402
import retarget  # noqa: E402
import validate as validate_mod  # noqa: E402

SWAT = ANIM / "sources" / "Quaternius_SWAT.glb"
SOLDIER = ANIM / "sources" / "Soldier.glb"
SKEL = ANIM / "skeleton.json"


def skeleton_joints():
    return [j["name"] for j in json.loads(SKEL.read_text())["joints"]]


class TestSkeleton(unittest.TestCase):
    def test_skeleton_shape(self):
        skel = json.loads(SKEL.read_text())
        joints = skel["joints"]
        self.assertEqual(len(joints), 25)          # root + 24 animated joints
        self.assertEqual(joints[0]["name"], "root")
        self.assertIsNone(joints[0]["parent"])
        names = {j["name"] for j in joints}
        for j in joints[1:]:
            self.assertIn(j["parent"], names)     # every parent resolves
        for j in joints:
            t = j["translation"]
            self.assertEqual(len(t), 3)
            self.assertTrue(all(np.isfinite(t)))

    def test_max_influences(self):
        skel = json.loads(SKEL.read_text())
        self.assertEqual(skel["max_influences"], 4)


class TestGltfParser(unittest.TestCase):
    def test_parse_soldier(self):
        g = gltf_mod.load(str(SOLDIER))
        names = [a.name for a in g.animations]
        for want in ("Idle", "Walk", "Run", "TPose"):
            self.assertIn(want, names)
        self.assertTrue(g.skins)

    def test_parse_swat(self):
        g = gltf_mod.load(str(SWAT))
        names = [a.name for a in g.animations]
        for want in ("CharacterArmature|Sword_Slash", "CharacterArmature|Death",
                     "CharacterArmature|HitRecieve", "CharacterArmature|Gun_Shoot"):
            self.assertIn(want, names)

    def test_rig_detection(self):
        self.assertEqual(retarget.detect_rig(gltf_mod.load(str(SOLDIER))), "mixamo")
        self.assertEqual(retarget.detect_rig(gltf_mod.load(str(SWAT))), "quaternius")


def _bogus_glb(path):
    """A minimal GLB whose one skin joint ('BogusBone') maps to nothing."""
    ibm = np.eye(4, dtype=np.float32).tobytes()
    joints = struct.pack("<4B", 0, 0, 0, 0)
    weights = np.array([1, 0, 0, 0], dtype=np.float32).tobytes()
    binary = ibm + joints + weights
    doc = {
        "asset": {"version": "2.0"},
        "nodes": [{"name": "BogusBone"}, {"name": "mesh", "mesh": 0}],
        "skins": [{"joints": [0], "inverseBindMatrices": 0}],
        "meshes": [{"primitives": [{"attributes": {"JOINTS_0": 1, "WEIGHTS_0": 2}}]}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 1, "type": "MAT4"},
            {"bufferView": 1, "componentType": 5121, "count": 1, "type": "VEC4"},
            {"bufferView": 2, "componentType": 5126, "count": 1, "type": "VEC4"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": 64},
            {"buffer": 0, "byteOffset": 64, "byteLength": 4},
            {"buffer": 0, "byteOffset": 68, "byteLength": 16},
        ],
        "buffers": [{"byteLength": len(binary)}],
    }
    js = json.dumps(doc).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binary))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(binary), 0x004E4942) + binary
    Path(path).write_bytes(out)


class TestValidate(unittest.TestCase):
    def test_swat_valid(self):
        code, errors, _ = validate_mod.validate(str(SWAT), rig="quaternius")
        self.assertEqual(code, 0, errors)

    def test_soldier_valid(self):
        code, errors, _ = validate_mod.validate(str(SOLDIER), rig="mixamo")
        self.assertEqual(code, 0, errors)

    def test_rejects_unknown_joints(self):
        with tempfile.TemporaryDirectory() as d:
            p = str(Path(d) / "bogus.glb")
            _bogus_glb(p)
            code, errors, _ = validate_mod.validate(p)
            self.assertEqual(code, 1)
            self.assertTrue(any("do not map" in e for e in errors), errors)


class TestRetarget(unittest.TestCase):
    def test_map_coverage(self):
        joints = skeleton_joints()
        # ball_leaf_* are terminal end markers: no source rig articulates
        # them, and ball_l/r have no Quaternius source joint.
        allowed = {"ball_l", "ball_r", "ball_leaf_l", "ball_leaf_r"}
        for rig in ("mixamo", "quaternius"):
            missing = retarget.check_coverage(rig, joints)
            self.assertTrue(set(missing) <= allowed, (rig, missing))

    def test_soldier_idle_retarget(self):
        g = extract_mod.load_source(SOLDIER)
        clip = extract_mod.extract_clip(g, "Idle", "mixamo", "idle",
                                        True, "MIT", "in-place")
        joints = skeleton_joints()
        for j in clip.joints:
            self.assertIn(j, joints)
        for must in ("pelvis", "spine_01", "thigh_l", "upperarm_r"):
            self.assertIn(must, clip.joints)
        self.assertTrue(clip.loop)

    def test_relative_transfer_ignores_rest_orientation(self):
        rest = np.array([0.0, 0.0, 0.0, 1.0])
        anim = procedural.euler_to_quat(0.3, 0.0, 0.0)
        rel = retarget.relative_rotation(rest, anim)
        np.testing.assert_allclose(rel, anim, atol=1e-12)
        # A rest orientation cancels out: anim == rest  ->  identity.
        rel2 = retarget.relative_rotation(anim, anim)
        np.testing.assert_allclose(np.abs(rel2), [0, 0, 0, 1], atol=1e-12)


class TestProcedural(unittest.TestCase):
    def test_loops_are_bit_exact(self):
        for clip in procedural.all_procedural():
            if not clip.loop or not hasattr(clip, "sample_fn"):
                continue
            a, b = clip.sample_fn(0.0), clip.sample_fn(clip.exact_duration)
            self.assertEqual(set(a["rot"]), set(b["rot"]))
            for j in a["rot"]:
                np.testing.assert_array_equal(a["rot"][j], b["rot"][j])
            np.testing.assert_array_equal(a["root"], b["root"])

    def test_oneshots_start_end_neutral(self):
        for clip in procedural.all_procedural():
            if clip.loop or not hasattr(clip, "sample_fn"):
                continue
            for t in (0.0, clip.exact_duration):
                s = clip.sample_fn(t)
                self.assertEqual(s["rot"], {}, (clip.name, t))
                np.testing.assert_array_equal(s["root"], np.zeros(3))

    def test_only_skeleton_joints(self):
        joints = set(skeleton_joints())
        for clip in procedural.all_procedural():
            self.assertTrue(set(clip.joints) <= joints, clip.name)


class TestBake(unittest.TestCase):
    def _clips(self):
        g = extract_mod.load_source(SWAT)
        attack = extract_mod.extract_clip(g, "CharacterArmature|Sword_Slash",
                                          "quaternius", "attack", False,
                                          "CC0", "as-authored")
        return [attack, procedural.block(), procedural.crouch()]

    def test_decode_error_within_float16_bar(self):
        with tempfile.TemporaryDirectory() as d:
            sidecar = bake_mod.bake(str(SKEL), self._clips(), d)
            self.assertLessEqual(sidecar["max_decode_rel_err"],
                                 sidecar["decode_bar"])
            self.assertAlmostEqual(sidecar["decode_bar"], 2.0 ** -11)

    def test_byte_reproducible(self):
        with tempfile.TemporaryDirectory() as d1, tempfile.TemporaryDirectory() as d2:
            s1 = bake_mod.bake(str(SKEL), self._clips(), d1)
            s2 = bake_mod.bake(str(SKEL), self._clips(), d2)
            self.assertEqual(s1["sha256"], s2["sha256"])

    def test_rejects_unknown_joint(self):
        bad = procedural.block()
        bad.frames[0]["rot"]["not_a_joint"] = np.array([0, 0, 0, 1.0])
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(bake_mod.BakeError):
                bake_mod.bake(str(SKEL), [bad], d)


class TestManifest(unittest.TestCase):
    def test_regeneration_deterministic_and_complete(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / "dist").mkdir()
            clips = [procedural.block(), procedural.crouch()]
            bake_mod.bake(str(SKEL), clips, d / "dist")
            p1 = manifest_mod.regenerate(d)
            t1 = p1.read_text()
            p2 = manifest_mod.regenerate(d)
            self.assertEqual(t1, p2.read_text())
            for clip in clips:
                self.assertIn(clip.name, t1)
                self.assertIn(clip.license, t1)


if __name__ == "__main__":
    unittest.main()
