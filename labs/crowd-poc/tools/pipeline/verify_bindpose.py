"""Check that the animation file's rest pose agrees with the body file's bind pose.

glTF skinning is `M_j(t) = worldJoint_j(t) * inverseBindMatrix_j`. If the animation's world
transforms at t=0 do not equal the body's rest world transforms, then M_j(0) != identity and the
mesh is visibly deformed at the start of every clip. The two files were exported separately, so
this has to be measured rather than assumed.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gltf  # noqa: E402


def main(body_path: str, anim_path: str) -> int:
    body = gltf.load(body_path)
    anim = gltf.load(anim_path)
    bw = gltf.world_matrices(body)
    aw = gltf.world_matrices(anim)

    bnames = {body.nodes[j].name: j for j in body.skins[0].joints}
    anames = {anim.nodes[j].name: j for j in anim.skins[0].joints}

    # The animation fully specifies TRS for every joint (all 195 channels), so read t=0 straight
    # off the samplers rather than evaluating the hierarchy at the default frame.
    t0 = {}
    for a in anim.animations:
        if a.name != "A_TPose":
            continue
        for c in a.channels:
            t0.setdefault(c.node, {})[c.path] = gltf.sample_linear(c.times, c.values,
                                                                   4 if c.path == "rotation" else 3, 0.0)

    worst, worst_bone = 0.0, ""
    ident_bad = 0
    for name in bnames:
        bi, ai = bnames[name], anames[name]
        # Recompute the anim world matrices with the t=0 TRS substituted in.
        local = gltf.compose(
            t0.get(ai, {}).get("translation", anim.nodes[ai].translation or [0, 0, 0]),
            t0.get(ai, {}).get("rotation", anim.nodes[ai].rotation or [0, 0, 0, 1]),
            t0.get(ai, {}).get("scale", anim.nodes[ai].scale or [1, 1, 1]),
        )
        parent = gltf.identity()
        for p, pn in enumerate(anim.nodes):
            if ai in pn.children:
                parent = aw[p]
                break
        w = gltf.mat_mul(parent, local)
        # The skin matrix that would be used at t=0. It must be the identity.
        m = gltf.mat_mul(w, body.skins[0].inverse_bind[body.skins[0].joints.index(bi)])
        dev = max(abs(m[k] - (1.0 if k % 5 == 0 else 0.0)) for k in range(16))
        if dev > worst:
            worst, worst_bone = dev, name
        if dev > 1e-4:
            ident_bad += 1

    print(f"joints checked            : {len(bnames)}")
    print(f"max |M_j(0) - identity|   : {worst:.6e}  (worst bone {worst_bone})")
    print(f"joints deviating > 1e-4   : {ident_bad}")
    print("VERDICT:", "consistent, no correction needed" if ident_bad == 0
          else "MISMATCH, a per-joint correction is required")

    # Sanity: does the rest of the body hierarchy differ between the two files?
    diffs = 0
    for name in bnames:
        if abs(bw[bnames[name]][12] - aw[anames[name]][12]) > 1e-6:
            diffs += 1
    print(f"joints whose rest world translation differs: {diffs}/{len(bnames)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
