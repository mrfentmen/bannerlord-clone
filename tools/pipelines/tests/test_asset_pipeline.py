#!/usr/bin/env python3
"""Unit tests for the hardened 3D asset pipeline (task 4A).

Covers validate.py (GLB validation, budgets, licences), gateway.py
(retry behavior, error types), and the refactored process-3d.py
(manifest round-trip, budget rejection, atomic writes).

No network, no gateway needed - gateway internals are tested with
monkeypatched _post_once. Run with:
  python3 tools/pipelines/run.py --ci
"""

import json
import os
import struct
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINES = os.path.dirname(HERE)
sys.path.insert(0, PIPELINES)

import gateway
import importlib.util
import validate

_spec = importlib.util.spec_from_file_location(
    "process_3d", os.path.join(PIPELINES, "process-3d.py"))
process_3d = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(process_3d)


def write_glb(path, size=64, magic=b"glTF", version=2, declare_size=None):
    """Write a minimal GLB with a consistent header."""
    declared = declare_size if declare_size is not None else size
    with open(path, "wb") as fh:
        fh.write(struct.pack("<4sII", magic, version, declared))
        fh.write(b"\x00" * (size - 12))


class TestValidateGlb(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def p(self, name="m.glb"):
        return os.path.join(self.tmp.name, name)

    def test_valid_glb_returns_size(self):
        p = self.p()
        write_glb(p, size=64)
        self.assertEqual(validate.validate_glb(p), 64)

    def test_missing_file(self):
        with self.assertRaises(validate.ValidationError):
            validate.validate_glb(self.p("nope.glb"))

    def test_wrong_extension(self):
        p = self.p("m.obj")
        write_glb(p)
        with self.assertRaises(validate.ValidationError):
            validate.validate_glb(p)

    def test_bad_magic(self):
        p = self.p()
        write_glb(p, magic=b"NOPE")
        with self.assertRaises(validate.ValidationError):
            validate.validate_glb(p)

    def test_wrong_version(self):
        p = self.p()
        write_glb(p, version=1)
        with self.assertRaises(validate.ValidationError):
            validate.validate_glb(p)

    def test_length_mismatch(self):
        p = self.p()
        write_glb(p, size=64, declare_size=999)
        with self.assertRaises(validate.ValidationError):
            validate.validate_glb(p)

    def test_too_small(self):
        p = self.p()
        with open(p, "wb") as fh:
            fh.write(b"tiny")
        with self.assertRaises(validate.ValidationError):
            validate.validate_glb(p)

    def test_too_large(self):
        p = self.p()
        write_glb(p, size=64)
        # monkeypatch the limit down so we don't write 50MB
        old = validate.MAX_FILE_BYTES
        validate.MAX_FILE_BYTES = 32
        try:
            with self.assertRaises(validate.ValidationError):
                validate.validate_glb(p)
        finally:
            validate.MAX_FILE_BYTES = old


class TestBudgets(unittest.TestCase):
    def test_within_budget_ok(self):
        stats = {"vertices": 1000, "triangles": 2000,
                 "meshes": 4, "textures": 2}
        self.assertEqual(validate.check_budgets(stats), [])

    def test_over_budget_flagged(self):
        stats = {"vertices": 500_000, "triangles": 10,
                 "meshes": 1, "textures": 0}
        v = validate.check_budgets(stats)
        self.assertEqual(len(v), 1)
        self.assertIn("vertices", v[0])

    def test_none_stats_skipped(self):
        stats = {"vertices": None, "triangles": None,
                 "meshes": None, "textures": None}
        self.assertEqual(validate.check_budgets(stats), [])

    def test_negative_stat_invalid(self):
        stats = {"vertices": -5, "triangles": 10,
                 "meshes": 1, "textures": 0}
        v = validate.check_budgets(stats)
        self.assertEqual(len(v), 1)
        self.assertIn("invalid", v[0])


class TestLicence(unittest.TestCase):
    def test_empty_rejected(self):
        with self.assertRaises(validate.ValidationError):
            validate.validate_licence("")
        with self.assertRaises(validate.ValidationError):
            validate.validate_licence("   ")

    def test_path_traversal_rejected(self):
        with self.assertRaises(validate.ValidationError):
            validate.validate_licence("../../etc")

    def test_known_licence_accepted(self):
        self.assertEqual(validate.validate_licence("MIT"), "MIT")
        self.assertEqual(validate.validate_licence("CC0-1.0"), "CC0-1.0")

    def test_cleared_logic(self):
        self.assertTrue(validate.is_commercially_cleared("MIT"))
        self.assertTrue(validate.is_commercially_cleared("CC0-1.0"))
        self.assertFalse(validate.is_commercially_cleared("UNRESOLVED"))
        self.assertFalse(validate.is_commercially_cleared("UNKNOWN"))
        self.assertFalse(validate.is_commercially_cleared("MADE-UP-1.0"))


class TestGatewayRetry(unittest.TestCase):
    def test_unreachable_not_retried(self):
        calls = []

        def boom(tool, args, timeout):
            calls.append(1)
            raise gateway.GatewayUnreachable("down")

        old = gateway._post_once
        gateway._post_once = boom
        try:
            with self.assertRaises(gateway.GatewayUnreachable):
                gateway.gateway_call("t", {}, retries=3)
        finally:
            gateway._post_once = old
        self.assertEqual(len(calls), 1)  # no retries for unreachable

    def test_tool_error_not_retried(self):
        calls = []

        def boom(tool, args, timeout):
            calls.append(1)
            raise gateway.GatewayToolError("bad args")

        old = gateway._post_once
        gateway._post_once = boom
        try:
            with self.assertRaises(gateway.GatewayToolError):
                gateway.gateway_call("t", {}, retries=3)
        finally:
            gateway._post_once = old
        self.assertEqual(len(calls), 1)

    def test_transient_retried_then_succeeds(self):
        calls = []

        def flaky(tool, args, timeout):
            calls.append(1)
            if len(calls) < 3:
                raise gateway.GatewayTimeout("slow")
            return {"ok": True}

        old = gateway._post_once
        old_sleep = gateway.time.sleep
        gateway._post_once = flaky
        gateway.time.sleep = lambda s: None  # no real waiting in tests
        try:
            result = gateway.gateway_call("t", {}, retries=3)
        finally:
            gateway._post_once = old
            gateway.time.sleep = old_sleep
        self.assertEqual(result, {"ok": True})
        self.assertEqual(len(calls), 3)

    def test_transient_gives_up(self):
        calls = []

        def always_slow(tool, args, timeout):
            calls.append(1)
            raise gateway.GatewayTimeout("slow")

        old = gateway._post_once
        old_sleep = gateway.time.sleep
        gateway._post_once = always_slow
        gateway.time.sleep = lambda s: None
        try:
            with self.assertRaises(gateway.GatewayTimeout):
                gateway.gateway_call("t", {}, retries=2)
        finally:
            gateway._post_once = old
            gateway.time.sleep = old_sleep
        self.assertEqual(len(calls), 3)  # 1 initial + 2 retries

    def test_env_override(self):
        old = os.environ.get("MCP_GATEWAY_URL")
        os.environ["MCP_GATEWAY_URL"] = "http://example:9999/mcp/"
        try:
            self.assertEqual(gateway.gateway_url(),
                             "http://example:9999/mcp/")
        finally:
            if old is None:
                del os.environ["MCP_GATEWAY_URL"]
            else:
                os.environ["MCP_GATEWAY_URL"] = old
        self.assertEqual(gateway.gateway_url(),
                         gateway.DEFAULT_GATEWAY_URL)


class TestIntake(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.glb = os.path.join(self.tmp.name, "hero.glb")
        write_glb(self.glb, size=64)
        self.manifest = os.path.join(self.tmp.name, "manifest.json")

    def stats(self, verts=1000, tris=2000):
        return {"data": {
            "geometry": {"vertexCount": verts, "triangleCount": tris,
                         "meshCount": 2},
            "materials": {"textureCount": 1}}}

    def test_round_trip(self):
        entry = process_3d.intake_model(
            self.glb, "test", "MIT", manifest_path=self.manifest,
            stats=self.stats())
        self.assertTrue(entry["commercially_cleared"])
        self.assertTrue(os.path.isabs(entry["path"]))
        with open(self.manifest, encoding="utf-8") as fh:
            assets = json.load(fh)["assets"]
        self.assertEqual(len(assets), 1)

    def test_unresolved_not_cleared(self):
        entry = process_3d.intake_model(
            self.glb, "test", "UNRESOLVED", manifest_path=self.manifest,
            stats=self.stats())
        self.assertFalse(entry["commercially_cleared"])

    def test_over_budget_rejected(self):
        with self.assertRaises(validate.ValidationError):
            process_3d.intake_model(
                self.glb, "test", "MIT", manifest_path=self.manifest,
                stats=self.stats(verts=5_000_000))

    def test_bad_glb_rejected_before_analysis(self):
        bad = os.path.join(self.tmp.name, "bad.glb")
        with open(bad, "wb") as fh:
            fh.write(b"not a glb at all................")
        with self.assertRaises(validate.ValidationError):
            process_3d.intake_model(
                bad, "test", "MIT", manifest_path=self.manifest,
                stats=self.stats())

    def test_atomic_write_no_tmp_left(self):
        process_3d.intake_model(
            self.glb, "test", "MIT", manifest_path=self.manifest,
            stats=self.stats())
        leftovers = [f for f in os.listdir(self.tmp.name)
                     if f.startswith("manifest-") and f.endswith(".tmp")]
        self.assertEqual(leftovers, [])

    def test_corrupt_manifest_reported(self):
        with open(self.manifest, "w") as fh:
            fh.write("{broken")
        with self.assertRaises(validate.ValidationError):
            process_3d.load_manifest(self.manifest)


if __name__ == "__main__":
    unittest.main()
