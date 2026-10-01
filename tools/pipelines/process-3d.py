#!/usr/bin/env python3
"""process-3d.py - 3D asset intake pipeline.

Takes a GLB file, validates it, analyzes it through the local MCP
gateway (3d-asset-processing-mcp, keyless), checks the result against
asset budgets, and records it in a manifest so every model carries:
stats, source, licence, and a commercial-use flag.

Hardening (task 4A):
- input validation lives in validate.py (GLB magic, size limits,
  asset budgets, licence checks)
- gateway calls go through gateway.py (health check, retries with
  exponential backoff, distinct error types)
- manifest writes are atomic (temp file + rename) so a crash can
  never leave a half-written manifest

Nothing ships publicly until licensing is resolved - the manifest marks
generated models licence "UNRESOLVED" and the pipeline refuses to mark
them cleared.

Usage:
  python3 tools/pipelines/process-3d.py <model.glb> --source <name> --licence <spdx|UNRESOLVED>
  python3 tools/pipelines/process-3d.py --self-test

Manifest: content/art/models/manifest.json (created if missing).
"""

import hashlib
import json
import os
import sys
import tempfile

from gateway import (GatewayError, GatewayToolError, GatewayUnreachable,
                     gateway_call, gateway_health)
from validate import (ValidationError, check_budgets, is_commercially_cleared,
                      validate_glb, validate_licence)

MANIFEST_PATH = os.path.join("content", "art", "models", "manifest.json")


def sha256_file(path, max_bytes=None):
    """SHA-256 of a file, streamed in chunks. Refuses to hash files
    larger than max_bytes (default: no limit) as a safety rail."""
    if max_bytes is not None and os.path.getsize(path) > max_bytes:
        raise ValidationError(
            f"refusing to hash oversized file: {path}")
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def analyze_model(path):
    """Validate a GLB, then run asset3d__analyze_model on it.

    Raises ValidationError for bad inputs, GatewayUnreachable when the
    gateway is down (with restart instructions), GatewayError for
    other gateway failures.
    """
    validate_glb(path)  # raises ValidationError with a plain reason
    if not gateway_health():
        raise GatewayUnreachable(
            "MCP gateway is not answering (see gateway.py for restart)")
    return gateway_call("asset3d__analyze_model",
                        {"input": {"source": os.path.abspath(path),
                                   "type": "file", "format": "glb"}})


def load_manifest(manifest_path=MANIFEST_PATH):
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as fh:
            try:
                return json.load(fh)
            except ValueError as e:
                raise ValidationError(
                    f"manifest is corrupt ({manifest_path}): {e}")
    return {"_comment": "3D model intake manifest. Generated models stay "
            "licence UNRESOLVED until the licensing question is settled - "
            "they must not ship publicly.",
            "assets": []}


def save_manifest(manifest, manifest_path=MANIFEST_PATH):
    """Atomic manifest write: temp file in the same directory, then
    rename. A crash mid-write leaves the old manifest intact."""
    directory = os.path.dirname(os.path.abspath(manifest_path))
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=directory, suffix=".tmp",
                                     prefix="manifest-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2)
            fh.write("\n")
        os.replace(tmp_path, manifest_path)
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def intake_model(path, source, licence, manifest_path=MANIFEST_PATH,
                 stats=None):
    """Validate, analyze, budget-check, and record a model.

    Returns the manifest entry. Raises ValidationError for bad inputs
    or over-budget models, GatewayError for gateway failures.
    """
    licence = validate_licence(licence)
    abspath = os.path.abspath(path)
    validate_glb(abspath)  # always validate, even with injected stats
    if stats is None:
        stats = analyze_model(abspath)
    data = stats.get("data", stats) if isinstance(stats, dict) else {}
    geom = data.get("geometry", {}) if isinstance(data, dict) else {}
    mats = data.get("materials", {}) if isinstance(data, dict) else {}
    flat_stats = {
        "vertices": geom.get("vertexCount"),
        "triangles": geom.get("triangleCount"),
        "meshes": geom.get("meshCount"),
        "textures": mats.get("textureCount"),
    }
    violations = check_budgets(flat_stats)
    if violations:
        raise ValidationError(
            "model exceeds asset budgets: " + "; ".join(violations))

    manifest = load_manifest(manifest_path)
    entry = {
        "id": os.path.splitext(os.path.basename(abspath))[0],
        "path": abspath,
        "source": source,
        "licence": licence,
        "commercially_cleared": is_commercially_cleared(licence),
        "sha256": sha256_file(abspath),
        "bytes": os.path.getsize(abspath),
        "stats": flat_stats,
    }
    manifest["assets"] = [a for a in manifest.get("assets", [])
                          if a.get("id") != entry["id"]] + [entry]
    save_manifest(manifest, manifest_path)
    return entry


def main(argv):
    if "--self-test" in argv:
        return 0 if self_test() else 1
    args = [a for a in argv[1:] if not a.startswith("--")]
    if not args:
        print("usage: process-3d.py <model.glb> --source <name> "
              "--licence <spdx|UNRESOLVED>", file=sys.stderr)
        return 2
    path = args[0]
    try:
        source = _flag(argv, "--source", "unknown")
        licence = _flag(argv, "--licence", "UNRESOLVED")
    except ValidationError as e:
        print(f"process-3d: FAILED: {e}", file=sys.stderr)
        return 2
    try:
        entry = intake_model(path, source, licence)
    except ValidationError as e:
        print(f"process-3d: FAILED: validation: {e}", file=sys.stderr)
        return 1
    except GatewayUnreachable as e:
        print(f"process-3d: FAILED: gateway down: {e}", file=sys.stderr)
        return 1
    except (GatewayError, GatewayToolError) as e:
        print(f"process-3d: FAILED: analysis: {e}", file=sys.stderr)
        return 1
    except OSError as e:
        print(f"process-3d: FAILED: io: {e}", file=sys.stderr)
        return 1
    print(f"process-3d: {entry['id']}: "
          f"{entry['stats']['vertices']} verts, "
          f"{entry['stats']['triangles']} tris, "
          f"licence={entry['licence']}, "
          f"cleared={entry['commercially_cleared']}")
    print(f"process-3d: manifest updated: {MANIFEST_PATH}")
    return 0


def _flag(argv, name, default):
    """Extract --name value from argv. Raises ValidationError (not
    IndexError) when the flag is present without a value."""
    if name not in argv:
        return default
    idx = argv.index(name)
    if idx + 1 >= len(argv) or argv[idx + 1].startswith("--"):
        raise ValidationError(f"flag {name} needs a value")
    return argv[idx + 1]


def _write_test_glb(path, size=32):
    """Write a minimal valid GLB (header declares its own length)."""
    import struct
    with open(path, "wb") as fh:
        fh.write(struct.pack("<4sII", b"glTF", 2, size))
        fh.write(b"\x00" * (size - 12))


def self_test():
    import tempfile
    failed = 0

    def check(cond, msg):
        nonlocal failed
        if not cond:
            print(f"SELF-TEST FAIL: {msg}")
            failed += 1

    # 1. manifest round-trip with injected stats (no gateway needed)
    with tempfile.TemporaryDirectory() as tmp:
        fake_glb = os.path.join(tmp, "test-model.glb")
        _write_test_glb(fake_glb)
        mp = os.path.join(tmp, "manifest.json")
        entry = intake_model(fake_glb, "chisel-test", "UNRESOLVED",
                             manifest_path=mp,
                             stats={"data": {
                                 "geometry": {"vertexCount": 100,
                                              "triangleCount": 50,
                                              "meshCount": 1},
                                 "materials": {"textureCount": 0}}})
        check(not entry["commercially_cleared"],
              "UNRESOLVED model must not be cleared")
        check(entry["stats"]["vertices"] == 100, "stats not recorded")
        check(os.path.isabs(entry["path"]), "manifest path not absolute")
        # re-intake same id replaces instead of duplicating
        intake_model(fake_glb, "chisel-test", "MIT", manifest_path=mp,
                     stats={"data": {
                         "geometry": {"vertexCount": 100,
                                      "triangleCount": 50,
                                      "meshCount": 1},
                         "materials": {"textureCount": 0}}})
        with open(mp, encoding="utf-8") as fh:
            assets = json.load(fh)["assets"]
        check(len(assets) == 1 and assets[0]["commercially_cleared"],
              "re-intake should replace and clear MIT")

        # over-budget model is rejected
        try:
            intake_model(fake_glb, "chisel-test", "MIT", manifest_path=mp,
                         stats={"data": {
                             "geometry": {"vertexCount": 10_000_000,
                                          "triangleCount": 50,
                                          "meshCount": 1},
                             "materials": {"textureCount": 0}}})
            check(False, "over-budget model should be rejected")
        except ValidationError:
            pass

        # corrupt manifest is reported, not crashed on
        with open(mp, "w") as fh:
            fh.write("{not json")
        try:
            load_manifest(mp)
            check(False, "corrupt manifest should raise")
        except ValidationError:
            pass

    # 2. sha256 is stable and hex
    h1 = sha256_file(__file__)
    h2 = sha256_file(__file__)
    check(h1 == h2 and len(h1) == 64, "sha256 unstable")

    # 3. _flag without a value raises ValidationError, not IndexError
    try:
        _flag(["prog", "--source"], "--source", "d")
        check(False, "--flag without value should raise")
    except ValidationError:
        pass

    if failed:
        print(f"self-test: {failed} case(s) failed")
        return False
    print("self-test: all cases passed")
    return True


if __name__ == "__main__":
    sys.exit(main(sys.argv))
