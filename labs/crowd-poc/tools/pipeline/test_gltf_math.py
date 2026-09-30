"""Tests for the matrix math in gltf.py.

These exist because the pipeline's real bugs were in here, not in the logic around it:

  * `compose` put the translation in the last ROW instead of the last COLUMN, and had the
    off-diagonal quaternion signs transposed. Both produce a rotation that is still orthogonal, so
    nothing raises. The mesh renders, deformed.
  * `mat_inverse` reduced [m | I] to [I | m^-1] and then returned the left block, i.e. the
    identity, for every input. Nothing raised. The animation bake silently stopped normalising
    against the clip's first frame.

A matrix library that fails quietly is worse than one that raises, so each of these is checked
against an independent construction rather than against itself.

Run: python3 tools/pipeline/test_gltf_math.py
"""

import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gltf  # noqa: E402

IDENT = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]
TOL = 1e-9
failures: list[str] = []


def det3(m):
    return (m[0] * (m[5] * m[10] - m[6] * m[9])
            - m[1] * (m[4] * m[10] - m[6] * m[8])
            + m[2] * (m[4] * m[9] - m[5] * m[8]))


def check(name: str, got, want, tol: float = TOL) -> None:
    err = max(abs(g - w) for g, w in zip(got, want)) if isinstance(got, list) else abs(got - want)
    if err > tol:
        failures.append(f"{name}: max err {err:.3e} > {tol:.1e}")


def rodrigues(axis, deg):
    """Explicit axis-angle rotation matrix, built independently of compose()."""
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    x, y, z = axis
    n = math.sqrt(x * x + y * y + z * z)
    x, y, z = x / n, y / n, z / n
    C = [[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
         [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
         [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]]
    # Row-major 4x4: each of the first three rows is a ROW of C plus a zero translation column.
    return ([C[0][0], C[0][1], C[0][2], 0.0]
            + [C[1][0], C[1][1], C[1][2], 0.0]
            + [C[2][0], C[2][1], C[2][2], 0.0]
            + [0.0, 0.0, 0.0, 1.0])


def quat_from_axis(axis, deg):
    t = math.radians(deg) / 2
    n = math.sqrt(sum(v * v for v in axis))
    return [v / n * math.sin(t) for v in axis] + [math.cos(t)]


def main() -> int:
    # ---- compose: translation goes in the last column
    M = gltf.compose([1.0, 2.0, 3.0], [0.0, 0.0, 0.0, 1.0], [1.0, 1.0, 1.0])
    check("identity rotation + translation", M,
          [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3, 0, 0, 0, 1])

    # ---- compose: rotation matches Rodrigues about every axis, both signs
    for axis in ((1, 0, 0), (0, 1, 0), (0, 0, 1)):
        for deg in (-150, -37, 0, 11, 90, 179):
            q = quat_from_axis(axis, deg)
            got = gltf.compose([0, 0, 0], q, [1, 1, 1])
            check(f"compose {axis} {deg}deg", got, rodrigues(axis, deg), 1e-9)

    # ---- compose: scale composes with rotation
    got = gltf.compose([0, 0, 0], [0, 0, 0, 1], [2.0, 3.0, 4.0])
    check("compose scale", got, [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0, 0, 0, 0, 1])

    # ---- transform_point agrees with an explicit row-major evaluation
    q = quat_from_axis((0, 1, 0), 63)
    M = gltf.compose([0.5, -1.25, 2.0], q, [1, 1, 1])
    for p in ((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1), (0.3, -0.7, 1.1)):
        want = [sum(M[r * 4 + c] * p[c] for c in range(3)) + M[r * 4 + 3] for r in range(3)]
        check(f"transform_point {p}", gltf.transform_point(M, p), want)
        wantd = [sum(M[r * 4 + c] * p[c] for c in range(3)) for r in range(3)]
        check(f"transform_dir {p}", gltf.transform_dir(M, p), wantd)

    # ---- mat_mul: identity, associativity, and matrix-vector agreement
    random.seed(1234)

    def rand_affine():
        R = gltf.compose([0, 0, 0], quat_from_axis(
            (random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1)), 40), [1, 1, 1])
        t = [random.uniform(-2, 2) for _ in range(3)]
        for r in range(3):
            R[r * 4 + 3] = t[r]
        return R

    A, B, C = rand_affine(), rand_affine(), rand_affine()
    check("mat_mul identity left", gltf.mat_mul(gltf.identity(), A), A)
    check("mat_mul identity right", gltf.mat_mul(A, gltf.identity()), A)
    check("mat_mul associativity", gltf.mat_mul(gltf.mat_mul(A, B), C),
          gltf.mat_mul(A, gltf.mat_mul(B, C)))
    p = (0.4, -1.2, 2.2)
    check("mat_mul matches chained transform", gltf.transform_point(gltf.mat_mul(A, B), p),
          gltf.transform_point(A, gltf.transform_point(B, p)))

    # ---- mat_inverse: the round trip, on rigid and on fully random matrices
    check("inverse of identity", gltf.mat_inverse(gltf.identity()), gltf.identity())
    M = gltf.compose([3.0, -4.0, 5.0], quat_from_axis((0.3, -0.7, 0.2), 51), [1, 1, 1])
    check("inverse of rigid transform", gltf.mat_mul(M, gltf.mat_inverse(M)), gltf.identity(), 1e-9)
    worst = 0.0
    for _ in range(400):
        X = [random.uniform(-2, 2) for _ in range(16)]
        for i in range(4):
            X[i * 4 + i] += 4.0
        worst = max(worst, max(abs(gltf.mat_mul(X, gltf.mat_inverse(X))[i] - IDENT[i])
                               for i in range(16)))
    if worst > 1e-8:
        failures.append(f"mat_inverse round trip on 400 random matrices: {worst:.3e}")

    # A singular matrix must raise, not return something.
    try:
        gltf.mat_inverse([0.0] * 16)
        failures.append("mat_inverse did not raise on a singular matrix")
    except ValueError:
        pass

    # ---- transpose and column-major packing round trip
    M = gltf.compose([1, 2, 3], quat_from_axis((1, 1, 1), 33), [2, 3, 4])
    check("pack/transpose round trip", gltf.transpose4(gltf.pack_matrix_column_major(M)), M)
    # The packed form is what the shader feeds to mat4(c0,c1,c2,c3), so a packed column must be
    # a true column of the row-major matrix.
    packed = gltf.pack_matrix_column_major(M)
    check("packed col 1 is a column", [packed[4 + r] for r in range(4)],
          [M[0 * 4 + 1], M[1 * 4 + 1], M[2 * 4 + 1], M[3 * 4 + 1]])

    # ---- sample_linear: endpoints, midpoint, and quaternion normalisation
    times = [0.0, 1.0, 2.0]
    vals = [0, 0, 0, 1, 0, 0, 0, 1, 10, 0, 0, 1]  # three 4-tuples
    check("sample before start", gltf.sample_linear(times, vals, 4, -5.0), [0, 0, 0, 1])
    check("sample at start", gltf.sample_linear(times, vals, 4, 0.0), [0, 0, 0, 1])
    check("sample midpoint scalar", gltf.sample_linear(times, [0, 1, 2, 3], 1, 0.5), [0.5])
    check("sample after end", gltf.sample_linear(times, vals, 4, 99.0), [10, 0, 0, 1])
    q = gltf.sample_linear([0.0, 1.0], [0, 0, 0, 1, 0, 0, 0.6, 0.8], 4, 0.5)
    n = math.sqrt(sum(v * v for v in q))
    if abs(n - 1.0) > 1e-9:
        failures.append(f"sample_linear quaternion not normalised: |q| = {n}")

    # ---- build_troop.similarity: a uniform scale plus a translation, not a shear.
    # sim * sim^-1 being the identity is NOT sufficient to catch a shear, because the two errors
    # cancel. What exposes it is conjugation: sim * S * sim^-1 must stay rigid for rigid S.
    # Note it is deliberately NOT asserted to equal S. Conjugation expresses the same motion in
    # the rescaled coordinate system, so it equals S only when S is the identity.
    import build_troop as BT

    def rigidity(m):
        d = abs(det3(m) - 1.0)
        o = max(abs(sum(m[k * 4 + i] * m[k * 4 + j] for k in range(3)) - (1.0 if i == j else 0.0))
                for i in range(3) for j in range(3))
        return max(d, o)
    k, ty = 0.989236, 0.009407
    sim, sim_i = BT.similarity(k, ty), BT.similarity_inv(k, ty)
    check("similarity * similarity_inv", gltf.mat_mul(sim, sim_i), gltf.identity(), 1e-12)
    check("similarity translation in last column", [sim[3], sim[7], sim[11]], [0.0, ty, 0.0])
    check("similarity bottom row is affine", [sim[12], sim[13], sim[14], sim[15]], [0.0, 0.0, 0.0, 1.0])
    check("similarity acts as scale+lift", gltf.transform_point(sim, (1.0, 2.0, 3.0)),
          [k, 2 * k + ty, 3 * k], 1e-12)
    for label, S in (("identity", gltf.identity()), ("A", A), ("B", B), ("C", C)):
        conv = gltf.mat_mul(sim, gltf.mat_mul(S, sim_i))
        if rigidity(conv) > 1e-9:
            failures.append(f"sim*S*sim_inv not rigid for {label}: {rigidity(conv):.3e}")
        # Conjugation must fix the identity, which is what keeps the bind pose intact.
        if label == "identity":
            check("conjugation of identity is identity", conv, gltf.identity(), 1e-12)
    # And it must be a genuine change of basis: conjugation is a homomorphism, so conjugating two
    # motions in sequence equals conjugating their product.
    S1, S2 = A, B
    seq = gltf.mat_mul(gltf.mat_mul(sim, gltf.mat_mul(S1, sim_i)),
                       gltf.mat_mul(sim, gltf.mat_mul(S2, sim_i)))
    direct = gltf.mat_mul(sim, gltf.mat_mul(gltf.mat_mul(S1, S2), sim_i))
    check("conjugation is a change of basis", seq, direct, 1e-9)

    # ---- the weapon-placement helpers. These are small matrices written by hand, and a
    # transposed or bottom-row translation is a plausible-looking wrong result rather than a crash.
    # aim_rotation must send local +X onto the aim; _translate must translate; _scale must scale;
    # _zup_to_yup must take (x,y,z) to (x,z,-y).
    for aimv in ([0.0, 0.0, 1.0], [0.0, 0.12, 1.0], [1.0, 0.0, 0.0], [0.0, -1.0, 0.0], [0.3, 0.0, -0.9]):
        R = BT.aim_rotation(aimv)
        got = gltf.transform_dir(R, (1.0, 0.0, 0.0))
        want = [v / (sum(x * x for x in aimv) ** 0.5) for v in aimv]
        check(f"aim_rotation sends +X to {aimv}", got, want, 1e-9)
        if rigidity(R) > 1e-9:
            failures.append(f"aim_rotation not a rotation for {aimv}: {rigidity(R):.3e}")
    check("_translate", gltf.transform_point(BT._translate([1.0, -2.0, 3.0]), (0, 0, 0)), [1, -2, 3])
    check("_translate leaves directions alone",
          gltf.transform_dir(BT._translate([1.0, -2.0, 3.0]), (1, 0, 0)), [1, 0, 0])
    check("_scale", gltf.transform_point(BT._scale(2.5), (1.0, 2.0, 3.0)), [2.5, 5.0, 7.5])
    check("_zup_to_yup", gltf.transform_point(BT._zup_to_yup(), (1.0, 2.0, 3.0)), [1.0, 3.0, -2.0])
    if rigidity(BT._zup_to_yup()) > 1e-9:
        failures.append("_zup_to_yup is not a rotation")

    if failures:
        print("MATRIX MATH FAILED")
        for f in failures:
            print("  -", f)
        return 1
    print("MATRIX MATH OK  (compose, mat_mul, mat_inverse, transpose, pack, sample_linear)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
