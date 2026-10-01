#!/usr/bin/env python3
"""process-3d.py — 3D asset intake pipeline.

Takes a GLB file, analyzes it through the local MCP gateway
(3d-asset-processing-mcp, keyless), and records the result in a manifest so
every model carries: stats, source, licence, and a commercial-use flag.

Nothing ships publicly until licensing is resolved — the manifest marks
generated models licence "UNRESOLVED" and the pipeline refuses to mark them
cleared.

Usage:
  python3 tools/pipelines/process-3d.py <model.glb> --source <name> --licence <spdx|UNRESOLVED>
  python3 tools/pipelines/process-3d.py --self-test

Manifest: content/art/models/manifest.json (created if missing).
"""

import hashlib
import json
import os
import sys
import urllib.request

GATEWAY = "http://127.0.0.1:8931/mcp/"
MANIFEST_PATH = os.path.join("content", "art", "models", "manifest.json")


def gateway_call(tool, args, timeout=60):
    """Call one MCP gateway tool, return the parsed result dict."""
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
         "params": {"name": tool, "arguments": args}}
    ).encode()
    req = urllib.request.Request(
        GATEWAY, data=body,
        headers={"Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", "replace")
    payload = None
    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            try:
                payload = json.loads(line[5:].strip())
                break
            except ValueError:
                continue
    if payload is None:
        try:
            payload = json.loads(raw)
        except ValueError:
            raise RuntimeError(f"unparseable gateway response: {raw[:200]!r}")
    if payload.get("error"):
        raise RuntimeError(f"gateway error: {payload['error']}")
    result = payload["result"]
    chunks = result.get("content", []) if isinstance(result, dict) else []
    texts = [c.get("text", "") for c in chunks if isinstance(c, dict)]
    for t in texts:
        try:
            return json.loads(t)
        except (ValueError, TypeError):
            continue
    raise RuntimeError(f"no JSON payload in tool result for {tool}")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def analyze_model(path):
    """Run asset3d__analyze_model on a GLB, return the stats dict."""
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    return gateway_call("asset3d__analyze_model",
                        {"input": {"source": os.path.abspath(path),
                                   "type": "file", "format": "glb"}})


def load_manifest(manifest_path=MANIFEST_PATH):
    if os.path.isfile(manifest_path):
        with open(manifest_path, encoding="utf-8") as fh:
            return json.load(fh)
    return {"_comment": "3D model intake manifest. Generated models stay "
            "licence UNRESOLVED until the licensing question is settled — "
            "they must not ship publicly.",
            "assets": []}


def save_manifest(manifest, manifest_path=MANIFEST_PATH):
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")


def intake_model(path, source, licence, manifest_path=MANIFEST_PATH,
                 stats=None):
    """Analyze a model and record it in the manifest. Returns the entry."""
    stats = stats if stats is not None else analyze_model(path)
    data = stats.get("data", stats) if isinstance(stats, dict) else {}
    geom = data.get("geometry", {}) if isinstance(data, dict) else {}
    mats = data.get("materials", {}) if isinstance(data, dict) else {}
    manifest = load_manifest(manifest_path)
    entry = {
        "id": os.path.splitext(os.path.basename(path))[0],
        "path": path,
        "source": source,
        "licence": licence,
        "commercially_cleared": licence not in ("UNRESOLVED", "UNKNOWN"),
        "sha256": sha256_file(path),
        "bytes": os.path.getsize(path),
        "stats": {
            "vertices": geom.get("vertexCount"),
            "triangles": geom.get("triangleCount"),
            "meshes": geom.get("meshCount"),
            "textures": mats.get("textureCount"),
        },
    }
    manifest["assets"] = [a for a in manifest["assets"]
                          if a.get("id") != entry["id"]] + [entry]
    save_manifest(manifest, manifest_path)
    return entry


def main(argv):
    if "--self-test" in argv:
        return 0 if self_test() else 1
    args = [a for a in argv[1:] if not a.startswith("--")]
    if not args:
        print(__doc__.strip().splitlines()[-4], file=sys.stderr)
        print("usage: process-3d.py <model.glb> --source <name> --licence <spdx|UNRESOLVED>",
              file=sys.stderr)
        return 2
    path = args[0]
    source = _flag(argv, "--source", "unknown")
    licence = _flag(argv, "--licence", "UNRESOLVED")
    try:
        entry = intake_model(path, source, licence)
    except Exception as e:  # noqa: BLE001 - report plainly
        print(f"process-3d: FAILED: {e}", file=sys.stderr)
        return 1
    print(f"process-3d: {entry['id']}: "
          f"{entry['stats']['vertices']} verts, "
          f"{entry['stats']['triangles']} tris, "
          f"licence={entry['licence']}, "
          f"cleared={entry['commercially_cleared']}")
    print(f"process-3d: manifest updated: {MANIFEST_PATH}")
    return 0


def _flag(argv, name, default):
    return argv[argv.index(name) + 1] if name in argv else default


def self_test():
    import tempfile
    failed = 0

    # 1. manifest round-trip with injected stats (no gateway needed)
    with tempfile.TemporaryDirectory() as tmp:
        fake_glb = os.path.join(tmp, "test-model.glb")
        with open(fake_glb, "wb") as fh:
            fh.write(b"glTF" + b"\x00" * 100)
        mp = os.path.join(tmp, "manifest.json")
        entry = intake_model(fake_glb, "chisel-test", "UNRESOLVED",
                             manifest_path=mp,
                             stats={"data": {
                                 "geometry": {"vertexCount": 100,
                                              "triangleCount": 50,
                                              "meshCount": 1},
                                 "materials": {"textureCount": 0}}})
        if entry["commercially_cleared"]:
            print("SELF-TEST FAIL: UNRESOLVED model must not be cleared")
            failed += 1
        if entry["stats"]["vertices"] != 100:
            print("SELF-TEST FAIL: stats not recorded")
            failed += 1
        # re-intake same id replaces instead of duplicating
        intake_model(fake_glb, "chisel-test", "MIT", manifest_path=mp,
                     stats={"data": {
                         "geometry": {"vertexCount": 100,
                                      "triangleCount": 50,
                                      "meshCount": 1},
                         "materials": {"textureCount": 0}}})
        with open(mp, encoding="utf-8") as fh:
            assets = json.load(fh)["assets"]
        if len(assets) != 1 or not assets[0]["commercially_cleared"]:
            print("SELF-TEST FAIL: re-intake should replace and clear MIT")
            failed += 1

    # 2. sha256 is stable and hex
    h1 = sha256_file(__file__)
    h2 = sha256_file(__file__)
    if h1 != h2 or len(h1) != 64:
        print("SELF-TEST FAIL: sha256 unstable")
        failed += 1

    if failed:
        print(f"self-test: {failed} case(s) failed")
        return False
    print("self-test: all cases passed")
    return True


if __name__ == "__main__":
    sys.exit(main(sys.argv))
