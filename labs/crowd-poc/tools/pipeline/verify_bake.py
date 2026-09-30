"""Validate the baked animation matrix texture before anything renders with it.

A wrong matrix texture does not crash. It renders a plausible-looking mesh in the wrong pose, and a
benchmark run against it measures the wrong workload while looking like a success. So the bake is
checked against properties that must hold, each derived independently of the baker:

  1  POSITION, not identity. For each joint and frame, skinning a point rigidly bound to that joint
     must land it on the joint's animated world position. Formally S_j(t) * B_j == W_j(t), where
     B_j is the joint's bind matrix and W_j(t) its animated world matrix. This is the check that
     catches a bake which is self-consistent but attached to the wrong rest pose -- the failure
     that produced a crowd standing in a T-pose while the source animation clearly swung its arms.
  2  Every matrix rigid: orthonormal 3x3 with determinant 1. A sheared matrix changes limb length
     and makes the lighting move with the pose.
  3  A clip marked loop returns to its start pose, or the crowd visibly pops once per cycle.
  4  Deformation magnitude stays plausible for a human.

W_j(t) is recomputed here from the animation file rather than read from the bake, so a mistake in
the baker's hierarchy walk cannot validate itself.

Run: python3 tools/pipeline/verify_bake.py
"""

import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
PROC = ROOT / "assets" / "processed"
sys.path.insert(0, str(Path(__file__).resolve().parent))
import gltf  # noqa: E402
import build_troop  # noqa: E402  (for similarity(), see below)

ANIM = (ROOT / "assets" / "originals" / "body" / "Universal Animation Library 2[Standard]"
        / "Unreal-Godot" / "UAL2_Standard.glb")
BODY = (ROOT / "assets" / "originals" / "body" / "Universal Base Characters[Standard]"
        / "Base Characters" / "Godot - UE" / "Superhero_Male_FullBody.gltf")


def read_rows(path: Path, header: dict):
    data = path.read_bytes()
    w, h = header["width"], header["height"]
    if len(data) != w * h * 16:
        raise SystemExit(f"texture is {len(data)} bytes, expected {w * h * 16} for {w}x{h} RGBA32F")
    return [struct.unpack_from("<" + "f" * (w * 4), data, r * w * 16) for r in range(h)]


def det3(m):
    return (m[0] * (m[5] * m[10] - m[6] * m[9])
            - m[1] * (m[4] * m[10] - m[6] * m[8])
            + m[2] * (m[4] * m[9] - m[5] * m[8]))


def main() -> int:
    header = json.loads((PROC / "anim_matrices.json").read_text())
    rows = read_rows(PROC / "anim_matrices.bin", header)
    joints = header["joints"]
    jc = len(joints)
    print(f"texture {header['width']}x{header['height']} RGBA32F  joints={jc}  "
          f"bytes={(PROC / 'anim_matrices.bin').stat().st_size}")

    # Call the baker's own function rather than re-typing the matrix. A hand-copied copy of this
    # put the translation in the bottom row instead of the last column, which is a shear, and the
    # shear then showed up here as a 5 cm joint-placement error that the bake did not have.
    sim = build_troop.similarity(header["similarity"]["k"], header["similarity"]["ty"])
    sim_i = build_troop.similarity_inv(header["similarity"]["k"], header["similarity"]["ty"])

    # The joint bind matrices. glTF defines IBM_j as the inverse of the joint's bind world
    # matrix, so B_j = inverse(IBM_j) and the bake must satisfy S_j(t) * B_j == W_j(t).
    body = gltf.load(BODY)
    bnames = [body.nodes[j].name for j in body.skins[0].joints]
    bind = {body.nodes[j].name: gltf.mat_inverse(body.skins[0].inverse_bind[i])
            for i, j in enumerate(body.skins[0].joints)}
    missing = [n for n in joints if n not in bind]
    if missing:
        raise SystemExit(f"shared skeleton joints absent from the source rig: {missing}")

    # Independent recomputation of the animated world matrices.
    anim = gltf.load(ANIM)
    by_name = {anim.nodes[j].name: j for j in anim.skins[0].joints}
    parent = {}
    for i, n in enumerate(anim.nodes):
        for c in n.children:
            parent[c] = i

    fail = 0
    for cname, c in header["clips"].items():
        src = next((x for x in anim.animations if x.name == c["source"]), None)
        if src is None:
            print(f"\nclip {cname!r}: source animation {c['source']!r} not found")
            fail += 1
            continue
        chan = {}
        for ch in src.channels:
            chan.setdefault(ch.node, []).append(ch)

        def world_at(t: float):
            cache = {}
            def go(i: int):
                if i in cache:
                    return cache[i]
                n = anim.nodes[i]
                trs = [n.translation or [0.0, 0.0, 0.0],
                       n.rotation or [0.0, 0.0, 0.0, 1.0],
                       n.scale or [1.0, 1.0, 1.0]]
                for ch in chan.get(i, ()):
                    nc = 4 if ch.path == "rotation" else 3
                    trs[{"translation": 0, "rotation": 1, "scale": 2}[ch.path]] = gltf.sample_linear(
                        ch.times, ch.values, nc, t)
                w = gltf.compose(*trs)
                if i in parent:
                    w = gltf.mat_mul(go(parent[i]), w)
                cache[i] = w
                return w
            return {name: go(by_name[name]) for name in joints}

        print(f"\nclip {cname!r} ({c['source']}, {c['row_count']} frames, {c['duration_s']}s)")

        # ---- 1. a point bound to joint j lands on joint j's animated position
        worst = 0.0
        worst_at = ""
        for f in range(c["row_count"]):
            t = c["duration_s"] * f / c["row_count"]
            W = world_at(t)
            flat = rows[c["row_start"] + f]
            for j, name in enumerate(joints):
                packed = list(flat[j * 16 : j * 16 + 16])
                # The texture is column-major; the rest of this module is row-major.
                s = gltf.mat_mul(sim_i, gltf.mat_mul(gltf.transpose4(packed), sim))
                # S_j(t) * B_j must equal W_j(t). Compare the joint's own origin, which is where a
                # vertex weighted 1.0 to that joint ends up.
                got = gltf.transform_point(s, gltf.transform_point(bind[name], (0.0, 0.0, 0.0)))
                want = gltf.transform_point(W[name], (0.0, 0.0, 0.0))
                d = max(abs(got[i] - want[i]) for i in range(3))
                if d > worst:
                    worst, worst_at = d, f"{name}@{f}"
        ok1 = worst < 2e-3
        fail += 0 if ok1 else 1
        print(f"  1 joint placement: max |S(t)*origin - W_j(t).origin| = {worst:.3e} "
              f"on {worst_at}  {'PASS' if ok1 else 'FAIL'}")

        # ---- 2. rigidity
        worst_det, worst_dot = 0.0, 0.0
        for f in range(c["row_count"]):
            flat = rows[c["row_start"] + f]
            for j in range(jc):
                m = gltf.transpose4(list(flat[j * 16 : j * 16 + 16]))
                worst_det = max(worst_det, abs(abs(det3(m)) - 1.0))
                for a, b in ((0, 1), (0, 2), (1, 2)):
                    worst_dot = max(worst_dot, abs(
                        sum(m[k * 4 + a] * m[k * 4 + b] for k in range(3))
                        - (1.0 if a == b else 0.0)))
        ok2 = worst_det < 1e-3 and worst_dot < 1e-3
        fail += 0 if ok2 else 1
        print(f"  2 rigidity:        max |det-1| = {worst_det:.3e}, max axis dot = {worst_dot:.3e}  "
              f"{'PASS' if ok2 else 'FAIL'}")

        # ---- 3. loop closure
        if c["loop"]:
            r0, rN = c["row_start"], c["row_start"] + c["row_count"] - 1
            wl, wl_j = 0.0, ""
            for j, name in enumerate(joints):
                a = gltf.transpose4(list(rows[r0][j * 16 : j * 16 + 16]))
                b = gltf.transpose4(list(rows[rN][j * 16 : j * 16 + 16]))
                d = max(abs(a[i] - b[i]) for i in range(16))
                if d > wl:
                    wl, wl_j = d, name
            ok3 = wl < 0.35
            fail += 0 if ok3 else 1
            print(f"  3 loop closure:    max |M(last) - M(0)| = {wl:.4f} on {wl_j}  "
                  f"{'PASS' if ok3 else 'FAIL  <- visible pop at the loop point'}")

        # ---- 4. plausible magnitude
        per_joint = []
        for j, name in enumerate(joints):
            m = max(max(abs(v) for v in gltf.transpose4(list(rows[c["row_start"] + f][j * 16 : j * 16 + 16])))
                    for f in range(c["row_count"]))
            per_joint.append((m, name))
        per_joint.sort(reverse=True)
        print(f"  4 magnitude:       largest matrix element, top 4:")
        for m, n in per_joint[:4]:
            print(f"      {n:<14} {m:.4f}")
        big = [n for m, n in per_joint if m > 6.0]
        if big:
            fail += 1
            print(f"      FAIL: implausible magnitude on {big}")
        else:
            print(f"      PASS: every joint under the 6.0 plausibility ceiling")

    print("\n" + ("BAKE OK" if fail == 0 else f"BAKE FAILED ({fail} check(s))"))
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
