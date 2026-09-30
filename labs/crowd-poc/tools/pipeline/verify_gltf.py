"""Verify the pure-Python glTF layer against the two real source files.

Run: python3 tools/pipeline/verify_gltf.py <body.gltf> <anim.glb>
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gltf  # noqa: E402


def main(body_path: str, anim_path: str) -> int:
    body = gltf.load(body_path)
    print(f"body: {len(body.meshes)} meshes, {len(body.nodes)} nodes, {len(body.skins)} skins")

    total_tris = 0
    for m in body.meshes:
        for p in m.primitives:
            total_tris += p.tri_count
            print(f"  mesh {m.name!r}: verts={p.vertex_count} tris={p.tri_count} "
                  f"mat={p.material} joints={'yes' if p.joints else 'no'} "
                  f"weights={'yes' if p.weights else 'no'}")
    print(f"  TOTAL TRIS = {total_tris}")

    skin = body.skins[0]
    print(f"  skin {skin.name!r}: {len(skin.joints)} joints")
    joint_names = [body.nodes[j].name for j in skin.joints]
    print(f"  first joints: {joint_names[:8]}")
    print(f"  last  joints: {joint_names[-6:]}")

    # Model must be Y-up, standing on y=0, and its height tells us the scale to normalise to.
    ys = [p.positions[i + 1] for m in body.meshes for p in m.primitives
          for i in range(0, len(p.positions), 3)]
    xs = [p.positions[i] for m in body.meshes for p in m.primitives
          for i in range(0, len(p.positions), 3)]
    zs = [p.positions[i + 2] for m in body.meshes for p in m.primitives
          for i in range(0, len(p.positions), 3)]
    print(f"  bbox  x[{min(xs):.4f},{max(xs):.4f}] "
          f"y[{min(ys):.4f},{max(ys):.4f}] z[{min(zs):.4f},{max(zs):.4f}]")
    print(f"  height = {max(ys) - min(ys):.5f} units, feet at y={min(ys):.5f}")

    # Weights must be normalised per vertex, or LBS will shrink the mesh.
    p0 = body.meshes[-1].primitives[0]
    sums = [sum(p0.weights[i : i + 4]) for i in range(0, len(p0.weights), 4)]
    print(f"  weight sums: min={min(sums):.5f} max={max(sums):.5f} "
          f"maxdev={max(abs(s - 1.0) for s in sums):.2e}")
    jmax = max(p0.joints)
    print(f"  max joint index used = {jmax} (skin has {len(skin.joints)})")

    anim = gltf.load(anim_path)
    print(f"anim: {len(anim.animations)} animations, {len(anim.nodes)} nodes, {len(anim.skins)} skins")
    ajoints = [anim.nodes[j].name for j in anim.skins[0].joints]
    print(f"  anim skin joints = {len(ajoints)}")
    missing = [n for n in joint_names if n not in set(ajoints)]
    extra = [n for n in ajoints if n not in set(joint_names)]
    print(f"  joints in body not in anim: {missing}")
    print(f"  joints in anim not in body: {extra}")
    if anim.skins[0].inverse_bind != body.skins[0].inverse_bind:
        same = all(
            abs(x - y) < 1e-6
            for a, b in zip(anim.skins[0].inverse_bind, body.skins[0].inverse_bind)
            for x, y in zip(a, b)
        )
        print(f"  inverseBindMatrices identical: {same}")

    for name in ("A_TPose", "Idle_No_Loop", "Walk_Carry_Loop"):
        a = next((x for x in anim.animations if x.name == name), None)
        if a is None:
            print(f"  MISSING animation {name}")
            continue
        tmax = max((max(c.times) for c in a.channels if c.times), default=0)
        print(f"  anim {name!r}: {len(a.channels)} channels, duration={tmax:.3f}s")

    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        # Without this the script died on sys.argv[1] with a bare IndexError, which says nothing
        # about what it wanted.
        print(__doc__.strip(), file=sys.stderr)
        raise SystemExit(2)
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
