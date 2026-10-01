"""Bake clips to RGBA float16 bone textures, then decode-verify every clip.

Texture layout (matches the crowd-poc convention, but float16):
  * width  = 4 * joint_count texels  (one RGBA texel per matrix column)
  * height = total frames across all clips, stacked in manifest order
  * row-major in the file; each joint contributes the 4 columns of
    S_j(t) = W_j(t) * IBM_j  (animated world matrix times inverse bind matrix)
  * S is stored column by column: texel (4*j + c) holds column c of S_j.

The decode bar: float16 rounds each texel with a maximum relative error of
2^-11 = 4.88e-4. decode_verify() reads the file back from disk and requires
every texel to satisfy
    |decoded - exact| <= 4.88e-4 * max(1, |exact|)
No clip ships unverified.
"""

import hashlib
import json
import struct
from pathlib import Path

import numpy as np

FLOAT16_REL_ERR = 2.0 ** -11  # 4.8828e-04, the float16 rounding bar
RIGIDITY_TOL = 5e-3           # looser than float64 checks: float16 noise budget
LOOP_TOL_M = 0.05             # loop clips must close within 5 cm per joint


class BakeError(Exception):
    pass


def load_skeleton(path):
    skel = json.loads(Path(path).read_text())
    joints = [j["name"] for j in skel["joints"]]
    parent = {}
    rest_t = {}
    for j in skel["joints"]:
        if j["parent"] is not None:
            parent[j["name"]] = j["parent"]
        rest_t[j["name"]] = np.array(j["translation"], dtype=np.float64)
    return joints, parent, rest_t


def _quat_to_mat(q):
    x, y, z, w = q
    n = x * x + y * y + z * z + w * w
    s = 2.0 / n if n > 1e-12 else 0.0
    return np.array([
        [1 - s * (y * y + z * z), s * (x * y - z * w), s * (x * z + y * w)],
        [s * (x * y + z * w), 1 - s * (x * x + z * z), s * (y * z - x * w)],
        [s * (x * z - y * w), s * (y * z + x * w), 1 - s * (x * x + y * y)],
    ])


def _local_matrix(t, q):
    m = np.eye(4)
    m[:3, :3] = _quat_to_mat(q)
    m[:3, 3] = t
    return m


def compute_bind(skel_joints, parent, rest_t):
    """bind_world[j] and ibm[j] for the shared skeleton rest pose."""
    bind = {}
    order = []
    # parents before children: skeleton.json is already topologically sorted.
    for j in skel_joints:
        local = _local_matrix(rest_t[j], np.array([0.0, 0.0, 0.0, 1.0]))
        bind[j] = (bind[parent[j]] @ local) if j in parent else local
        order.append(j)
    ibm = {j: np.linalg.inv(bind[j]) for j in skel_joints}
    return bind, ibm


def frame_matrices(joints, parent, rest_t, ibm, frame):
    """S_j = W_j * IBM_j for one frame dict. Single code path for bake+verify."""
    ident = np.array([0.0, 0.0, 0.0, 1.0])
    world = {}
    out = np.zeros((len(joints), 4, 4))
    for ji, j in enumerate(joints):  # skeleton.json is topologically sorted
        t = rest_t[j].copy()
        q = frame["rot"].get(j, ident)
        if j == "root":
            t = t + frame["root"]
        local = _local_matrix(t, q)
        world[j] = (world[parent[j]] @ local) if j in parent else local
        out[ji] = world[j] @ ibm[j]
    return out


def compute_matrices(skel_path, clips):
    """Exact float64 S_j(t) = W_j(t) * IBM_j for every clip frame.

    Returns (mats, layout) where mats is (total_frames, n_joints, 4, 4) and
    layout maps clip name -> (row_start, row_count).
    """
    joints, parent, rest_t = load_skeleton(skel_path)
    _bind, ibm = compute_bind(joints, parent, rest_t)
    for clip in clips:
        unknown = [j for j in clip.joints if j not in rest_t]
        if unknown:
            raise BakeError(f"clip {clip.name!r} uses unknown joints: {unknown}")
    total = sum(len(c.frames) for c in clips)
    mats = np.zeros((total, len(joints), 4, 4))
    layout = {}
    row = 0
    for clip in clips:
        start = row
        for f in clip.frames:
            mats[row] = frame_matrices(joints, parent, rest_t, ibm, f)
            row += 1
        layout[clip.name] = (start, len(clip.frames))
    return mats, layout


def write_texture(path, mats):
    """Quantize to float16 and write row-major RGBA16F bytes."""
    frames, nj, _, _ = mats.shape
    tex = np.zeros((frames, nj * 4, 4), dtype=np.float16)
    for j in range(nj):
        s = mats[:, j]                       # (frames, 4, 4)
        for c in range(4):
            tex[:, j * 4 + c, :] = s[:, :, c].astype(np.float16)
    Path(path).write_bytes(tex.tobytes())
    return tex


def read_texture(path, width, height):
    data = Path(path).read_bytes()
    expect = width * height * 4 * 2
    if len(data) != expect:
        raise BakeError(f"{path}: {len(data)} bytes, expected {expect} "
                        f"for {width}x{height} RGBA16F")
    arr = np.frombuffer(data, dtype=np.float16).reshape(height, width, 4)
    return arr.astype(np.float64)


def _check_rigid(m, where):
    r = m[:3, :3]
    det = float(np.linalg.det(r))
    ortho = float(np.max(np.abs(r.T @ r - np.eye(3))))
    if abs(det - 1.0) > RIGIDITY_TOL:
        raise BakeError(f"{where}: det(R) = {det:.6f}, not rigid")
    if ortho > RIGIDITY_TOL:
        raise BakeError(f"{where}: R^T R != I (max dev {ortho:.2e})")


def decode_verify(skel_path, clips, bin_path, width, height):
    """Recompute the exact matrices independently and check the file on disk.

    Returns a report dict. Raises BakeError on any failure.
    """
    joints, _parent, _rest = load_skeleton(skel_path)
    exact, layout = compute_matrices(skel_path, clips)
    tex = read_texture(bin_path, width, height)

    max_rel = 0.0
    frames, nj = exact.shape[0], exact.shape[1]
    for fi in range(frames):
        for j in range(nj):
            s = exact[fi, j]
            d = np.column_stack([tex[fi, j * 4 + c] for c in range(4)])
            denom = np.maximum(1.0, np.abs(s))
            rel = np.max(np.abs(d - s) / denom)
            max_rel = max(max_rel, float(rel))
            _check_rigid(d, f"frame {fi} joint {joints[j]}")
    if max_rel > FLOAT16_REL_ERR:
        raise BakeError(f"float16 decode error {max_rel:.3e} exceeds bar {FLOAT16_REL_ERR:.3e}")

    # Loop closure on the exact matrices. The check probes the TRUE loop
    # point t=duration (via each clip's sample_fn), not the last baked frame:
    # the last frame legitimately sits one frame-interval before the loop
    # point, so comparing it against frame 0 would measure ordinary motion.
    joints, parent, rest_t = load_skeleton(skel_path)
    _bind, ibm = compute_bind(joints, parent, rest_t)
    for clip in clips:
        if not clip.loop:
            continue
        if clip.sample_fn is None:
            raise BakeError(f"loop clip {clip.name!r} has no sample_fn")
        m0 = frame_matrices(joints, parent, rest_t, ibm, clip.frames[0])
        mD = frame_matrices(joints, parent, rest_t, ibm,
                            clip.sample_fn(clip.exact_duration))
        gap = float(np.max(np.abs(mD[:, :3, 3] - m0[:, :3, 3])))
        if gap > LOOP_TOL_M:
            raise BakeError(f"loop clip {clip.name!r} does not close: {gap:.3f} m")

    return {"max_decode_rel_err": max_rel,
            "decode_bar": FLOAT16_REL_ERR,
            "frames": frames, "joints": nj}


def bake(skel_path, clips, out_dir):
    """Full bake: compute, write float16 texture + sidecar, decode-verify."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    joints, _p, _r = load_skeleton(skel_path)
    nj = len(joints)
    width = 4 * nj

    exact, layout = compute_matrices(skel_path, clips)
    height = exact.shape[0]
    bin_path = out_dir / "anim_bones.bin"
    write_texture(bin_path, exact)

    report = decode_verify(skel_path, clips, bin_path, width, height)

    sha = hashlib.sha256(bin_path.read_bytes()).hexdigest()
    sidecar = {
        "format": "RGBA16F bone texture, row-major, 4 texels per joint "
                  "(one per matrix column), S_j(t) = W_j(t) * IBM_j",
        "format_version": 1,
        "skeleton": "shared_humanoid_v1",
        "width": width,
        "height": height,
        "joint_count": nj,
        "joints": joints,
        "fps": 30,
        "sha256": sha,
        "decode_bar": FLOAT16_REL_ERR,
        "max_decode_rel_err": report["max_decode_rel_err"],
        "clips": {},
    }
    for clip in clips:
        start, count = layout[clip.name]
        sidecar["clips"][clip.name] = {
            "row_start": start,
            "row_count": count,
            "duration_s": round(count / 30, 3),
            "loop": clip.loop,
            "source": clip.source,
            "license": clip.license,
            "root_policy": clip.root_policy,
        }
    (out_dir / "anim_bones.json").write_text(json.dumps(sidecar, indent=2) + "\n")
    return sidecar
