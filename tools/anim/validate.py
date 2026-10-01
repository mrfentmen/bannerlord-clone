"""Validate a GLB character skin against the shared skeleton (skeleton.json).

Compares joint names, parent hierarchy, and order; reports missing / extra /
misordered joints and whether animation retargeting onto the shared skeleton
is possible (every shared joint either maps to a GLB joint or has a
documented synthesis fallback).

Usage: python validate.py <model.glb> [--skeleton skeleton.json]
"""
import json
import os
import sys

from pygltflib import GLTF2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rig  # noqa: E402


def _norm(name):
    """Strip vendor prefixes (mixamorig:), lowercase, drop separators."""
    n = (name or "").lower()
    for pre in ("mixamorig:", "mixamo:"):
        if n.startswith(pre):
            n = n[len(pre):]
    return n.replace("_", "").replace("-", "").replace(" ", "")


# Normalised GLB joint name -> shared skeleton joint name (anatomical best fit)
ALIASES = {
    "hips": "hips", "pelvis": "hips",
    "spine": "spine", "spine1": "chest", "spine2": "upper_chest",
    "neck": "neck", "head": "head",
    "leftshoulder": "clavicle.L", "leftarm": "shoulder.L",
    "leftforearm": "elbow.L", "lefthand": "hand.L",
    "rightshoulder": "clavicle.R", "rightarm": "shoulder.R",
    "rightforearm": "elbow.R", "righthand": "hand.R",
    "leftupleg": "hip.L", "leftleg": "knee.L",
    "leftfoot": "ankle.L", "lefttoebase": "toe.L",
    "rightupleg": "hip.R", "rightleg": "knee.R",
    "rightfoot": "ankle.R", "righttoebase": "toe.R",
}

# Shared joints with no GLB counterpart: how retargeting synthesizes them.
FALLBACKS = {
    "wrist.L": "slerp(elbow.L, hand.L, 0.5) in world space",
    "wrist.R": "slerp(elbow.R, hand.R, 0.5) in world space",
}


def _skin_joints(gltf):
    """Pick the skin with the most joints; return (joint node indices)."""
    if not gltf.skins:
        return []
    skin = max(gltf.skins, key=lambda s: len(s.joints))
    return skin.joints


def validate(glb_path, skeleton_path=None):
    skeleton_path = skeleton_path or os.path.join(HERE, "skeleton.json")
    skel = rig.load_skeleton(skeleton_path)
    shared = rig.joint_names(skel)
    shared_parents = {j["name"]: j["parent"] for j in skel["joints"]}

    gltf = GLTF2().load(glb_path)
    joint_nodes = _skin_joints(gltf)
    glb_names = [gltf.nodes[i].name for i in joint_nodes]
    # node index -> parent node index
    node_parent = {}
    for i, node in enumerate(gltf.nodes):
        for child in (node.children or []):
            node_parent[child] = i

    # map GLB joints -> shared joints
    glb_to_shared = {}
    unmapped_glb = []
    for gi, name in zip(joint_nodes, glb_names):
        key = _norm(name)
        if key in ALIASES:
            glb_to_shared[gi] = ALIASES[key]
        else:
            unmapped_glb.append(name)

    shared_to_glb = {v: k for k, v in glb_to_shared.items()}
    mapped_shared = set(shared_to_glb)

    missing = [j for j in shared
               if j not in mapped_shared and j not in FALLBACKS]
    synthesized = [j for j in shared
                   if j not in mapped_shared and j in FALLBACKS]
    extra = sorted(set(unmapped_glb))

    # hierarchy check: for each mapped joint, the GLB parent must map to the
    # nearest *mapped* shared ancestor (synthesized joints like wrist.L/R
    # are transparent: hand.L's GLB parent should map to elbow.L).
    def nearest_mapped_ancestor(sname):
        p = shared_parents[sname]
        while p is not None and p not in mapped_shared:
            p = shared_parents[p]
        return p

    hierarchy_errors = []
    for gi, sname in glb_to_shared.items():
        expected = nearest_mapped_ancestor(sname)
        gp = node_parent.get(gi)
        actual_parent = glb_to_shared.get(gp) if gp is not None else None
        if expected != actual_parent:
            hierarchy_errors.append(
                f"{sname}: nearest mapped shared ancestor {expected!r}, "
                f"GLB parent maps to {actual_parent!r}")

    # order check: mapped joints must appear parents-before-children in the
    # GLB joint list (needed for single-pass matrix composition)
    seen = set()
    order_errors = []
    for gi in joint_nodes:
        sname = glb_to_shared.get(gi)
        if sname is None:
            continue
        p = shared_parents[sname]
        if p is not None and p in mapped_shared and p not in seen:
            order_errors.append(
                f"{sname} appears before its parent {p} in the GLB joint list")
        seen.add(sname)

    retarget_possible = not missing and not hierarchy_errors and not order_errors

    return {
        "glb": glb_path,
        "skeleton": skel["name"],
        "shared_joints": len(shared),
        "glb_joints": len(joint_nodes),
        "mapped": len(mapped_shared),
        "missing": missing,
        "synthesized": {j: FALLBACKS[j] for j in synthesized},
        "extra_glb_joints": extra,
        "hierarchy_errors": hierarchy_errors,
        "order_errors": order_errors,
        "retarget_possible": retarget_possible,
        "joint_map": {gltf.nodes[k].name: v for k, v in glb_to_shared.items()},
    }


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    skel = argv[2] if len(argv) > 2 else None
    rep = validate(argv[1], skel)
    print(f"GLB: {rep['glb']}")
    print(f"Shared skeleton: {rep['skeleton']} "
          f"({rep['shared_joints']} joints) vs GLB skin ({rep['glb_joints']} joints)")
    print(f"Mapped joints: {rep['mapped']}")
    if rep["missing"]:
        print(f"MISSING ({len(rep['missing'])}): {', '.join(rep['missing'])}")
    if rep["synthesized"]:
        print("SYNTHESIZED fallbacks:")
        for j, how in rep["synthesized"].items():
            print(f"  {j}: {how}")
    if rep["extra_glb_joints"]:
        print(f"EXTRA GLB joints ({len(rep['extra_glb_joints'])}): "
              f"{', '.join(rep['extra_glb_joints'][:8])}"
              f"{' ...' if len(rep['extra_glb_joints']) > 8 else ''}")
    if rep["hierarchy_errors"]:
        print("HIERARCHY MISMATCHES:")
        for e in rep["hierarchy_errors"]:
            print(f"  {e}")
    if rep["order_errors"]:
        print("ORDER ERRORS:")
        for e in rep["order_errors"]:
            print(f"  {e}")
    print("RETARGETING:", "POSSIBLE" if rep["retarget_possible"] else "NOT POSSIBLE")
    return 0 if rep["retarget_possible"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
