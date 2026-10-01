#!/usr/bin/env python3
"""Validate a character GLB against the shared skeleton.

Every shipped character GLB must pass this check or it is rejected. It works
for any rig: joint names either match the skeleton exactly or are translated
through a retarget map (--rig mixamo|quaternius, or --map with your own
JSON name->joint table).

Checks:
  1. The file is a parseable GLB with at least one skin.
  2. Every skin joint resolves to a shared-skeleton joint, or is culled by
     the rig profile (fingers, armature roots, end markers -- reported, never
     silent). Anything else is REJECTED.
  3. No vertex is influenced by more than max_influences joints (4).
  4. Every inverse bind matrix is rigid (orthonormal rotation, det +/-1).
  5. (warning only) animated nodes that resolve to no skeleton joint.

Exit 0: valid. Exit 1: rejected. Exit 2: the file could not be read at all.

Run: python3 tools/anim/validate.py <model.glb> [--rig mixamo|quaternius] [--map map.json]
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import gltf as gltf_mod  # noqa: E402
import retarget  # noqa: E402


def load_skeleton():
    return json.loads((HERE / "skeleton.json").read_text())


def _influence_count(g, prim):
    """Max number of nonzero-weight joint influences per vertex."""
    attrs = prim.get("attributes", {})
    per_vertex = None
    i = 0
    while f"JOINTS_{i}" in attrs:
        weights = g._accessor(attrs[f"WEIGHTS_{i}"]).array.reshape(-1, 4)
        nz = np.count_nonzero(weights > 1e-9, axis=1)
        per_vertex = nz if per_vertex is None else per_vertex + nz
        i += 1
    return per_vertex


def validate(path, rig=None, extra_map=None):
    skel = load_skeleton()
    joints = [j["name"] for j in skel["joints"]]
    max_inf = skel["max_influences"]
    errors, warnings = [], []

    try:
        g = gltf_mod.load(path)
    except gltf_mod.GltfError as e:
        return 2, [f"unreadable: {e}"], []

    name_map = dict(retarget.RIG_MAPS.get(rig, {})) if rig else {}
    if extra_map:
        name_map.update(json.loads(Path(extra_map).read_text()))

    def resolve(name):
        if name in joints:
            return name
        return name_map.get(name)

    if not g.skins:
        errors.append("no skins: an unrigged mesh cannot be a character")
    for si, skin in enumerate(g.skins):
        unmapped = []
        for j in skin.joints:
            if resolve(g.nodes[j].name) is None:
                unmapped.append(g.nodes[j].name)
        culled = [n for n in unmapped if rig and retarget.is_culled(rig, n)]
        rejected = [n for n in unmapped if n not in culled]
        if culled:
            shown = ", ".join(culled[:4]) + ("..." if len(culled) > 4 else "")
            warnings.append(f"skin {si}: {len(culled)} joints culled by the "
                            f"{rig} profile (no baked animation): {shown}")
        if rejected:
            shown = ", ".join(rejected[:8]) + ("..." if len(rejected) > 8 else "")
            errors.append(f"skin {si}: {len(rejected)} joints do not map to "
                          f"the shared skeleton: {shown}")
        for i, ibm in enumerate(skin.inverse_bind):
            r = ibm[:3, :3]
            det = float(np.linalg.det(r))
            ortho = float(np.max(np.abs(r.T @ r - np.eye(3))))
            if abs(abs(det) - 1.0) > 1e-4 or ortho > 1e-4:
                errors.append(f"skin {si} joint {g.nodes[skin.joints[i]].name}: "
                              f"inverse bind matrix not rigid (det={det:.4f})")

    for mi, mesh in enumerate(g.meshes):
        for pi, prim in enumerate(mesh.get("primitives", [])):
            per_vertex = _influence_count(g, prim)
            if per_vertex is not None and per_vertex.size:
                worst = int(per_vertex.max())
                if worst > max_inf:
                    errors.append(f"mesh {mi} prim {pi}: vertex with {worst} "
                                  f"influences, max is {max_inf}")

    for anim in g.animations:
        for ch in anim.channels:
            nname = g.nodes[ch.node].name
            if resolve(nname) is None:
                culled = rig and retarget.is_culled(rig, nname)
                warnings.append(f"animation {anim.name!r} drives "
                                f"{'culled' if culled else 'unmapped'} node "
                                f"{nname!r} (no baked animation for it)")
                break

    return (1 if errors else 0), errors, warnings


def main(argv=None):
    ap = argparse.ArgumentParser(description="Validate a character GLB against skeleton.json")
    ap.add_argument("model", help="character .glb file")
    ap.add_argument("--rig", choices=["mixamo", "quaternius"],
                    help="retarget map for joint names")
    ap.add_argument("--map", dest="map_file",
                    help="JSON file with extra {source_name: skeleton_joint} entries")
    ap.add_argument("--json", action="store_true", help="machine-readable report")
    args = ap.parse_args(argv)

    rig = args.rig or retarget.detect_rig_safe(args.model)
    code, errors, warnings = validate(args.model, rig=rig, extra_map=args.map_file)

    if args.json:
        print(json.dumps({"file": args.model, "rig": rig, "valid": code == 0,
                          "errors": errors, "warnings": warnings}, indent=2))
    else:
        print(f"{args.model}: rig={rig or 'exact-names'}")
        for w in warnings:
            print(f"  WARN  {w}")
        for e in errors:
            print(f"  FAIL  {e}")
        print("  VALID" if code == 0 else "  REJECTED")
    return code


if __name__ == "__main__":
    sys.exit(main())
