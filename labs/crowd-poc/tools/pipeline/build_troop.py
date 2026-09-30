"""ASSETS.md section 4 pipeline, steps 4 to 6, for one troop type.

  Step 4  Convert to GLB, 1 unit = 1 metre.
  Step 5  Optimise: class texture budget, poly budget, all three LOD tiers, shared skeleton.
  Step 6  Unify: shared colour grade and palette, so mixed sources look like one game.

Plus the animation bake that SPEC.md section 5.1 and ASSETS.md section 4.2 require: per-frame
per-joint skinning matrices written to a float texture, so the GPU skins every instance from a
texture fetch instead of the CPU touching bones.

Everything here is driven by BALANCE-style constants at the top, per CONSTITUTION.md section 1.2.
No budget number is buried in the middle of the code.

Run: python3 tools/pipeline/build_troop.py <config.json>
"""

from __future__ import annotations

import json
import math
import re
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gltf  # noqa: E402
import obj as objmod  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent

# Bones whose only purpose is finger or toe articulation. A crowd silhouette does not need them,
# and every bone costs a texel column and a matrix in the vertex shader. ASSETS.md section 4.1
# requires ONE shared skeleton; this is the crowd subset of it, and the same subset must be used by
# every troop, every gear set and every animation in the game.
CULL_PATTERN = re.compile(r"^(index|middle|pinky|ring|thumb)_\d")

# The shared skeleton itself, in parent-before-child order. Exported as a manifest entry so other
# assets can be rigged to the same thing instead of inventing a second one.
SHARED_SKELETON = [
    "root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
    "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
    "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
    "thigh_l", "calf_l", "foot_l", "ball_l", "ball_leaf_l",
    "thigh_r", "calf_r", "foot_r", "ball_r", "ball_leaf_r",
]

# Joint the weapon is bound to. Binding a prop to one joint with weight 1.0 is how a held object
# is attached under GPU skinning: the same baked matrix that moves the hand moves the rifle.
WEAPON_JOINT = "hand_r"


def log(msg: str) -> None:
    print(msg, flush=True)


# ---------------------------------------------------------------- mesh assembly


class Mesh:
    """A single-material triangle mesh with up to 4 joint influences per vertex."""

    def __init__(self, name: str):
        self.name = name
        self.pos: list[float] = []
        self.nrm: list[float] = []
        self.jnt: list[int] = []   # 4 per vertex
        self.wgt: list[float] = []  # 4 per vertex, summing to 1
        self.idx: list[int] = []

    @property
    def vertex_count(self) -> int:
        return len(self.pos) // 3

    @property
    def tri_count(self) -> int:
        return len(self.idx) // 3

    def add_vertex(self, p, n, influences) -> int:
        self.pos += [float(p[0]), float(p[1]), float(p[2])]
        self.nrm += [float(n[0]), float(n[1]), float(n[2])]
        # Keep the 4 largest influences and renormalise, because dropping one must not change
        # the total weight or the mesh shrinks.
        inf = sorted(influences, key=lambda t: -t[1])[:4]
        tot = sum(w for _, w in inf) or 1.0
        while len(inf) < 4:
            inf.append((0, 0.0))
        for j, w in inf:
            self.jnt.append(j)
            self.wgt.append(w / tot)
        return self.vertex_count - 1

    def add_tri(self, a: int, b: int, c: int) -> None:
        self.idx += [a, b, c]

    def bbox(self):
        lo = [min(self.pos[i::3]) for i in range(3)]
        hi = [max(self.pos[i::3]) for i in range(3)]
        return lo, hi


def body_to_mesh(g: gltf.Gltf, keep: list[str], keep_index: dict[str, int],
                 near: dict[str, str]) -> Mesh:
    """Flatten the source body into one mesh on the shared skeleton.

    The source is three primitives with three materials (skin, eyes, hair). They are merged into
    one material because each primitive with its own material is an extra draw call, and
    ASSETS.md section 5.3 makes the draw call count the thing being proved here. Merging is the
    step-5 decision that serves the crowd budget, and it is recorded in the manifest.
    """
    skin = g.skins[0]
    src_of_joint = skin.joints
    out = Mesh("troop_body")

    for m in g.meshes:
        for p in m.primitives:
            for v in range(p.vertex_count):
                pos = p.positions[v * 3 : v * 3 + 3]
                nrm = p.normals[v * 3 : v * 3 + 3] if p.normals else [0.0, 1.0, 0.0]
                inf = []
                for k in range(4):
                    w = p.weights[v * 4 + k] if p.weights else 0.0
                    if w <= 0.0:
                        continue
                    jname = g.nodes[src_of_joint[p.joints[v * 4 + k]]].name
                    if jname in keep_index:
                        inf.append((keep_index[jname], w))
                    else:
                        # Weight lived only on a culled finger bone. Promote it to the nearest kept
                        # ancestor so the hand still deforms instead of the vertex going limp.
                        anc = near[jname]
                        if anc in keep_index:
                            inf.append((keep_index[anc], w))
                if not inf:
                    inf = [(keep_index["pelvis"], 1.0)]
                out.add_vertex(pos, nrm, inf)
            base = out.vertex_count - p.vertex_count
            for i in range(p.tri_count):
                out.add_tri(base + p.indices[i * 3], base + p.indices[i * 3 + 1],
                            base + p.indices[i * 3 + 2])
    return out


def build_nearest_kept(g: gltf.Gltf, keep: set[str]) -> dict[str, str]:
    """For every culled bone, the closest ancestor that survives. Used to re-hang dropped weights."""
    parent: dict[int, int] = {}
    for i, n in enumerate(g.nodes):
        for c in n.children:
            parent[c] = i
    by_index = {i: g.nodes[i].name for i in range(len(g.nodes))}
    out: dict[str, str] = {}
    for i, n in enumerate(g.nodes):
        if n.name in keep:
            continue
        p = parent.get(i)
        while p is not None and by_index[p] not in keep:
            p = parent.get(p)
        out[n.name] = by_index[p] if p is not None else "pelvis"
    return out


# ---------------------------------------------------------------- step 4: scale


def normalise_scale(mesh: Mesh, target_height_m: float) -> dict:
    """Put the model at real-world scale and on the ground plane.

    ASSETS.md step 4: '1 unit equals 1 metre. Wrong scale is the most common imported-model
    defect.' The measured height drives the factor, so this is a measurement, not a guess.
    """
    lo, hi = mesh.bbox()
    h = hi[1] - lo[1]
    k = target_height_m / h
    for i in range(0, len(mesh.pos), 3):
        mesh.pos[i] *= k
        mesh.pos[i + 1] = mesh.pos[i + 1] * k - lo[1] * k
        mesh.pos[i + 2] *= k
    for i in range(0, len(mesh.nrm), 3):
        mesh.nrm[i] *= k
        mesh.nrm[i + 1] *= k
        mesh.nrm[i + 2] *= k
    lo2, hi2 = mesh.bbox()
    return {
        "measured_height_units": round(h, 6),
        "scale_factor_applied": round(k, 6),
        "target_height_m": target_height_m,
        "foot_offset_removed_units": round(lo[1], 6),
        "result_height_m": round(hi2[1] - lo2[1], 6),
        "result_min_y": round(lo2[1], 6),
    }


def similarity(k: float, ty: float) -> list[float]:
    """The affine map M such that scaling the mesh by k and lifting it by ty is equivalent to
    wrapping every skinning matrix in M . S . M^-1. Needed because the skin matrices are baked
    from the source rig, and the shipped vertices are in the corrected space.

    Laid out one row per line: uniform scale on the diagonal, translation in the last COLUMN.
    Writing the translation anywhere else is a shear, and a shear is not caught by the
    `M * inverse(M) == I` round trip because the two errors cancel. What exposes it is
    `M * S * inverse(M) == S` for an arbitrary S, which is checked in test_gltf_math.py.
    """
    return [
        k, 0.0, 0.0, 0.0,      # row 0
        0.0, k, 0.0, ty,       # row 1, translation y
        0.0, 0.0, k, 0.0,      # row 2
        0.0, 0.0, 0.0, 1.0,    # row 3
    ]


def similarity_inv(k: float, ty: float) -> list[float]:
    """Inverse of `similarity`. Undoing p -> (k*x, k*y + ty, k*z) is y -> (y - ty)/k, so the
    translation inverts to -ty/k, not -ty/k**2."""
    return [
        1.0 / k, 0.0, 0.0, 0.0,
        0.0, 1.0 / k, 0.0, -ty / k,
        0.0, 0.0, 1.0 / k, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]


# ---------------------------------------------------------------- step 5: decimation


def write_obj_with_weights(mesh: Mesh, path: Path) -> None:
    """Hand the mesh to Blender for decimation. OBJ for geometry, a sidecar for skin weights,
    because OBJ has no skinning. Vertex order is preserved so Blender's output lines up by index."""
    lines = ["# generated by build_troop.py, intermediate only"]
    for i in range(0, len(mesh.pos), 3):
        lines.append(f"v {mesh.pos[i]:.6f} {mesh.pos[i+1]:.6f} {mesh.pos[i+2]:.6f}")
    for i in range(0, len(mesh.nrm), 3):
        lines.append(f"vn {mesh.nrm[i]:.6f} {mesh.nrm[i+1]:.6f} {mesh.nrm[i+2]:.6f}")
    for i in range(0, len(mesh.idx), 3):
        a, b, c = mesh.idx[i] + 1, mesh.idx[i + 1] + 1, mesh.idx[i + 2] + 1
        lines.append(f"f {a}//{a} {b}//{b} {c}//{c}")
    path.write_text("\n".join(lines) + "\n")

    w = []
    for v in range(mesh.vertex_count):
        pairs = [[j, round(x, 6)] for j, x in
                 ((mesh.jnt[v * 4 + k], mesh.wgt[v * 4 + k]) for k in range(4))
                 if x > 1e-6]
        w.append({"v": v, "p": pairs})
    path.with_suffix(".weights.json").write_text(json.dumps({"verts": w}))


def read_decimated(obj_path: Path, weights_path: Path, keep_index: dict[str, int]) -> Mesh:
    """Read Blender's decimation output back with its skin weights.

    The OBJ reader preserves the file's vertex order, and Blender writes its evaluated mesh in the
    same order the weights are dumped in, so the two line up by index with no position guessing.
    """
    src = objmod.load(obj_path, preserve_order=True)
    data = json.loads(weights_path.read_text())
    per_vert = data["verts"]
    if len(per_vert) != src.vertex_count:
        raise ValueError(
            f"decimation output has {src.vertex_count} vertices but {len(per_vert)} weight rows"
        )
    out = Mesh("troop_body")
    for nv in range(src.vertex_count):
        p = src.positions[nv * 3 : nv * 3 + 3]
        n = src.normals[nv * 3 : nv * 3 + 3]
        inf = []
        for jname, w in per_vert[nv]:
            if jname in keep_index and w > 1e-4:
                inf.append((keep_index[jname], float(w)))
        if not inf:
            inf = [(keep_index["pelvis"], 1.0)]
        out.add_vertex(p, n, inf)
    for i in range(0, len(src.faces), 3):
        out.add_tri(src.faces[i], src.faces[i + 1], src.faces[i + 2])
    return out


# ---------------------------------------------------------------- animation bake


def bake_animation(body: gltf.Gltf, anim: gltf.Gltf, keep: list[str], clips: dict,
                   k: float, ty: float, fps: int) -> dict:
    """Write every joint's skinning matrix, for every frame of every clip, into one RGBA32F texture.

    Layout: width = 4 * jointCount (one texel per matrix column), height = total frames across all
    clips. Row 0 of clip c starts at rowFrame[c]. The vertex shader computes a row from a per
    instance (clip, phase) pair and fetches 4 texels per influence.

    The skinning matrix is plain glTF: `S_j(t) = worldJoint_j(t) * IBM_j`.

    An earlier version normalised against the clip's own first frame, `A_j(t) * A_j(0)^-1`, to
    force S_j(0) to the identity. That is wrong when the mesh and the animation were exported from
    different rest poses, which is the case here: 64 of 65 joints differ in rest position by 1-5 cm
    and the body file is authored in a T-pose while the animation's rest pose has the arms down at
    45 degrees. Forcing identity at frame 0 discarded the animation's rest pose entirely and left
    every unit standing in a T-pose with the arms barely moving. Normalising against A_j(0) makes
    the bake self-consistent and wrong.

    Plain glTF carries the mesh from its bind pose into the animation's rest pose, which is the
    pose that should be on screen. tools/pipeline/verify_bake.py checks that property directly.
    """
    skin = body.skins[0]
    by_name = {body.nodes[j].name: j for j in skin.joints}
    ibm_of = {body.nodes[j].name: skin.inverse_bind[i] for i, j in enumerate(skin.joints)}
    anim_world = gltf.world_matrices(anim)
    anim_by_name = {anim.nodes[j].name: j for j in anim.skins[0].joints}

    nclip = len(clips)
    jcount = len(keep)
    width = 4 * jcount

    def local_at(node_index: int, t: float, chan_by_node: dict) -> list[float]:
        """A node's local matrix at time t: the animated TRS if the clip drives it, else the
        value authored on the node. glTF animations are absolute, not additive, so there is no
        blending against a rest pose here."""
        n = anim.nodes[node_index]
        trs = (n.translation or [0.0, 0.0, 0.0],
               n.rotation or [0.0, 0.0, 0.0, 1.0],
               n.scale or [1.0, 1.0, 1.0])
        for c in chan_by_node.get(node_index, ()):
            nc = 4 if c.path == "rotation" else 3
            v = gltf.sample_linear(c.times, c.values, nc, t)
            if c.path == "translation":
                trs = (v, trs[1], trs[2])
            elif c.path == "rotation":
                trs = (trs[0], v, trs[2])
            else:
                trs = (trs[0], trs[1], v)
        if n.matrix is not None:
            return list(n.matrix)
        return gltf.compose(*trs)

    def world_at(t: float, chan_by_node: dict) -> list[list[float]]:
        """Top-down walk of the animation hierarchy. Memoised per call."""
        cache: dict[int, list[float]] = {}

        def go(i: int) -> list[float]:
            if i in cache:
                return cache[i]
            w = local_at(i, t, chan_by_node)
            for p, pn in enumerate(anim.nodes):
                if i in pn.children:
                    w = gltf.mat_mul(go(p), w)
                    break
            cache[i] = w
            return w

        return [go(i) for i in range(len(anim.nodes))]

    sim = similarity(k, ty)
    sim_i = similarity_inv(k, ty)

    frames: list[bytes] = []
    clip_info = {}
    row = 0
    max_deform = 0.0
    for cname, cdef in clips.items():
        a = next((x for x in anim.animations if x.name == cdef["source"]), None)
        if a is None:
            raise KeyError(f"animation {cdef['source']!r} not in the library")
        chan_by_node: dict[int, list] = {}
        for c in a.channels:
            chan_by_node.setdefault(c.node, []).append(c)
        dur = float(cdef.get("duration_s", max(max(x.times) for x in a.channels if x.times)))
        nframes = max(2, int(round(dur * fps)))
        row0 = row
        for f in range(nframes):
            t = dur * f / nframes
            wt = world_at(t, chan_by_node)
            buf = bytearray()
            for name in keep:
                s = gltf.mat_mul(wt[anim_by_name[name]], ibm_of[name])
                # Wrap in the scale/offset correction so the baked matrices agree with the
                # corrected vertex positions from step 4.
                s = gltf.mat_mul(sim, gltf.mat_mul(s, sim_i))
                if f > 0:
                    max_deform = max(max_deform, max(abs(s[i] - (1.0 if i % 5 == 0 else 0.0))
                                                     for i in range(16)))
                # Column-major, so the four texels the shader reads are the four GLSL mat4 columns.
                buf += struct.pack("<16f", *gltf.pack_matrix_column_major(s))
            frames.append(bytes(buf))
            row += 1
        clip_info[cname] = {"row_start": row0, "row_count": nframes, "duration_s": dur,
                            "loop": bool(cdef.get("loop", True)), "source": cdef["source"]}

    return {"width": width, "height": row, "joints": keep, "fps": fps, "clips": clip_info,
            "data": b"".join(frames), "max_deform": max_deform,
            "similarity": {"k": k, "ty": ty}}


# ---------------------------------------------------------------- writers


def write_glb(path: Path, mesh: Mesh, mat_name: str, joint_count: int, generator: str,
              maps: dict | None = None, base_colour=(0.24, 0.24, 0.26, 1.0),
              metallic=0.85, roughness=0.55) -> dict:
    """Write a skinned single-material GLB. The reader in src/ is deliberately just as narrow.

    `maps` holds PNG bytes for baseColour / normal / roughness. When it is omitted the material is
    a flat colour, which is what the weapon gets: its source is untextured solid-colour geometry in
    four materials, and four materials would be four draw calls for a rifle.
    """
    b = gltf.GltfBuilder(generator)
    pos = b.add_floats(mesh.pos, 3, 34962, minmax=True)
    nrm = b.add_floats(mesh.nrm, 3, 34962)
    jnt = b.add_joints(mesh.jnt, 4)
    wgt = b.add_floats(mesh.wgt, 4, 34962)
    idx = b.add_uints(mesh.idx, 1, 34963)

    pbr = {"metallicFactor": metallic, "roughnessFactor": roughness}
    if maps:
        pbr["baseColorTexture"] = {"index": b.embed_image(maps["base_colour"])}
        pbr["metallicRoughnessTexture"] = {"index": b.embed_image(maps["roughness"])}
    else:
        pbr["baseColorFactor"] = list(base_colour)
    mat = {"name": mat_name, "pbrMetallicRoughness": pbr, "doubleSided": False}
    if maps:
        mat["normalTexture"] = {"index": b.embed_image(maps["normal"]), "scale": 1.0}
    b.js["materials"] = [mat]

    b.js["meshes"] = [{"name": mesh.name, "primitives": [{
        "attributes": {"POSITION": pos, "NORMAL": nrm, "JOINTS_0": jnt, "WEIGHTS_0": wgt},
        "indices": idx, "material": 0, "mode": 4,
    }]}]
    b.js["skins"] = [{"name": "crowd", "joints": list(range(joint_count)), "skeleton": 1}]
    b.js["nodes"] = [
        {"name": "mesh", "mesh": 0, "skin": 0},
        {"name": "root", "children": [0]},
    ]
    b.write(path)
    return {"tris": mesh.tri_count, "verts": mesh.vertex_count, "bytes": path.stat().st_size}


# ---------------------------------------------------------------- weapon


def build_weapon(obj_path: Path, cfg: dict, keep_index: dict[str, int],
                 hand_pos: list[float]) -> Mesh:
    """Load the weapon, put it at real-world scale, and bind it to the hand joint.

    Read straight from the source OBJ, so no rig or animation is involved. Under GPU skinning a
    held object is a mesh whose every vertex has weight 1.0 on the hand joint, which means the
    baked hand matrix carries it with no per-instance CPU work at all.

    The weapon is placed in MESH space, not hand-local space: anchored at the hand joint's bind
    position, with the barrel aimed along a direction given in the config. Composing through the
    hand bone's own axes instead means the placement depends on how that particular bone was
    authored, which is not something an artist should have to know to put a rifle in a hand.
    """
    src = objmod.load(obj_path, preserve_order=True)
    lo, hi = objmod.bbox(src.positions)
    ext = [hi[i] - lo[i] for i in range(3)]
    long_axis = max(range(3), key=lambda i: ext[i])
    k = float(cfg["weapon"]["length_m"]) / ext[long_axis]

    j = keep_index[cfg["skeleton"]["weapon_joint"]]
    aim = [float(x) for x in cfg["weapon"]["aim"]]
    off = [float(x) for x in cfg["weapon"]["offset_m"]]
    rot = aim_rotation(aim)

    # translate(hand + offset) . aimRotation . scale(k) . zUpToYUp
    m = gltf.mat_mul(_translate([hand_pos[i] + off[i] for i in range(3)]),
                     gltf.mat_mul(rot, gltf.mat_mul(_scale(k), _zup_to_yup())))

    out = Mesh("troop_weapon")
    for v in range(src.vertex_count):
        p = src.positions[v * 3 : v * 3 + 3]
        n = src.normals[v * 3 : v * 3 + 3]
        out.add_vertex(gltf.transform_point(m, p), gltf.transform_dir(m, n), [(j, 1.0)])
    for i in range(0, len(src.faces), 3):
        out.add_tri(src.faces[i], src.faces[i + 1], src.faces[i + 2])
    return out


def aim_rotation(aim) -> list[float]:
    """The rotation taking the weapon's barrel axis (+X after the Z-up fix) onto `aim`.

    Builds an orthonormal right-handed basis with +X along the aim, so the result is a proper
    rotation and the weapon cannot end up mirrored.
    """
    n = math.sqrt(sum(v * v for v in aim)) or 1.0
    fwd = [v / n for v in aim]
    # The reference "up" has to be off-axis. A rifle held muzzle-down is a real pose, and aiming
    # straight down or straight up would otherwise collapse the basis onto a point.
    ref = [0.0, 1.0, 0.0]
    d = sum(ref[i] * fwd[i] for i in range(3))
    if abs(d) > 0.9:
        ref = [1.0, 0.0, 0.0]
        d = sum(ref[i] * fwd[i] for i in range(3))
    if abs(d) > 0.9:
        ref = [0.0, 0.0, 1.0]
        d = sum(ref[i] * fwd[i] for i in range(3))
    up = [ref[i] - fwd[i] * d for i in range(3)]
    nu = math.sqrt(sum(v * v for v in up))
    if nu < 1e-6:
        raise ValueError(f"aim {aim} cannot define an orthonormal basis")
    up = [v / nu for v in up]
    side = [fwd[1] * up[2] - fwd[2] * up[1],
            fwd[2] * up[0] - fwd[0] * up[2],
            fwd[0] * up[1] - fwd[1] * up[0]]
    # Row-major, one ROW per line. Each row picks one component from each basis vector, so that
    # column 0 is `fwd` and transform_dir(R, (1,0,0)) is the aim. Writing the three basis vectors
    # out as consecutive groups instead lays the matrix out column-major and silently aims the
    # weapon backwards, which is a plausible-looking result rather than an error.
    return [
        fwd[0], up[0], side[0], 0.0,
        fwd[1], up[1], side[1], 0.0,
        fwd[2], up[2], side[2], 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]


def _scale(k: float) -> list[float]:
    return [
        k, 0.0, 0.0, 0.0,
        0.0, k, 0.0, 0.0,
        0.0, 0.0, k, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]


def _translate(t) -> list[float]:
    """Row-major, translation in the last COLUMN."""
    return [
        1.0, 0.0, 0.0, t[0],
        0.0, 1.0, 0.0, t[1],
        0.0, 0.0, 1.0, t[2],
        0.0, 0.0, 0.0, 1.0,
    ]


def _zup_to_yup() -> list[float]:
    """Row-major (x, y, z) -> (x, z, -y). Blender exports OBJ Z-up; the runtime is Y-up.

    Row 1 picks z and row 2 picks -y, which is what makes transform_point use this correctly.
    """
    return [
        1.0, 0.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
        0.0, -1.0, 0.0, 0.0,
        0.0, 0.0, 0.0, 1.0,
    ]


# ---------------------------------------------------------------- orchestration


def main() -> int:
    cfg = json.loads((ROOT / "config" / "crowd.json").read_text())
    work = ROOT / "assets" / "originals"
    proc = ROOT / "assets" / "processed"
    proc.mkdir(parents=True, exist_ok=True)
    tmp = ROOT / "assets" / "processed" / ".tmp"
    tmp.mkdir(exist_ok=True)
    report: dict = {"troop": cfg["troop"]["id"], "steps": {}}

    # ---- step 1-2 are done by tools/fetch-assets.mjs; step 3 originals are hashed there.
    # Paths mirror the layout tools/extract-sources.mjs unpacks, and that tool fails loudly if any
    # of them moves, so a renamed source can never be silently skipped here.
    body_dir = work / "body" / "Universal Base Characters[Standard]"
    anim_dir = work / "body" / "Universal Animation Library 2[Standard]"
    body_path = body_dir / "Base Characters" / "Godot - UE" / "Superhero_Male_FullBody.gltf"
    anim_path = anim_dir / "Unreal-Godot" / "UAL2_Standard.glb"
    gun_path = work / "guns" / "OBJ" / cfg["weapon"]["source_obj"]
    for p in (body_path, anim_path, gun_path):
        if not p.is_file():
            log(f"MISSING SOURCE {p}  -- run tools/fetch-assets.mjs and tools/extract-sources.mjs")
            return 1

    body = gltf.load(body_path)
    anim = gltf.load(anim_path)
    keep = SHARED_SKELETON
    missing = [b for b in keep if b not in {body.nodes[j].name for j in body.skins[0].joints}]
    if missing:
        log(f"SHARED SKELETON mismatch, source is missing: {missing}")
        return 1
    keep_index = {b: i for i, b in enumerate(keep)}
    log(f"STEP 1-2 skeleton: {len(body.skins[0].joints)} source joints -> {len(keep)} shared joints")

    # ---- step 4: scale, and the two transforms that keep the bake consistent with it
    near = build_nearest_kept(body, set(keep))
    src_tris = sum(p.tri_count for m in body.meshes for p in m.primitives)
    body_mesh = body_to_mesh(body, keep, keep_index, near)
    k_meas = float(cfg["troop"]["height_m"]) / (body_mesh.bbox()[1][1] - body_mesh.bbox()[0][1])
    off_y = body_mesh.bbox()[0][1]
    scale_info = normalise_scale(body_mesh, float(cfg["troop"]["height_m"]))
    log(f"STEP 4 scale: {scale_info}")
    report["steps"]["4_convert"] = {"source_tris": src_tris, "merged_tris": body_mesh.tri_count,
                                    "scale": scale_info}

    # ---- step 5a: poly budget and LOD tiers, via Blender's decimate modifier
    tiers = {}
    for tier, targets in (("close", cfg["budgets"]["close_tris"]),
                          ("mid", cfg["budgets"]["mid_tris"])):
        body_tier = body_mesh
        if body_mesh.tri_count > targets["body"]:
            src_obj = tmp / f"body_{tier}_in.obj"
            write_obj_with_weights(body_mesh, src_obj)
            out_obj = tmp / f"body_{tier}_out.obj"
            out_w = tmp / f"body_{tier}_out.weights.json"
            rc = run_blender_decimate(src_obj, src_obj.with_suffix(".weights.json"),
                                      out_obj, out_w, targets["body"], keep)
            if rc != 0:
                log("DECIMATE FAILED")
                return 1
            body_tier = read_decimated(out_obj, out_w, keep_index)
        tiers[f"body_{tier}"] = body_tier
        log(f"STEP 5 body {tier}: {body_mesh.tri_count} -> {body_tier.tri_count} tris "
            f"(budget {targets['body']})")

    # The hand joint's bind position in mesh space is the inverse of its inverseBindMatrix.
    hand_name = cfg["skeleton"]["weapon_joint"]
    hand_bind = gltf.mat_inverse(body.skins[0].inverse_bind[
        [body.nodes[j].name for j in body.skins[0].joints].index(hand_name)])
    # Translation lives in the last COLUMN of a row-major matrix, i.e. indices 3, 7 and 11.
    hand_pos = [hand_bind[3], hand_bind[7], hand_bind[11]]
    log(f"STEP 5 weapon anchored to {hand_name} at "
        f"({hand_pos[0]:.4f}, {hand_pos[1]:.4f}, {hand_pos[2]:.4f}) m, "
        f"aim {cfg['weapon']['aim']}")
    weapon_full = build_weapon(gun_path, cfg, keep_index, hand_pos)
    for tier, targets in (("close", cfg["budgets"]["close_tris"]),
                          ("mid", cfg["budgets"]["mid_tris"])):
        w = weapon_full
        if weapon_full.tri_count > targets["weapon"]:
            src_obj = tmp / f"weapon_{tier}_in.obj"
            write_obj_with_weights(weapon_full, src_obj)
            out_obj = tmp / f"weapon_{tier}_out.obj"
            out_w = tmp / f"weapon_{tier}_out.weights.json"
            if run_blender_decimate(src_obj, src_obj.with_suffix(".weights.json"),
                                    out_obj, out_w, targets["weapon"], keep) != 0:
                return 1
            w = read_decimated(out_obj, out_w, keep_index)
        tiers[f"weapon_{tier}"] = w
        log(f"STEP 5 weapon {tier}: {weapon_full.tri_count} -> {w.tri_count} tris "
            f"(budget {targets['weapon']})")
    report["steps"]["5_optimise"] = {k: {"tris": v.tri_count, "verts": v.vertex_count}
                                      for k, v in tiers.items()}

    # ---- step 4/5 interaction: the bake must be wrapped in the same scale/offset correction
    bake = bake_animation(body, anim, keep,
                          {n: cfg["clips"][n] for n in ("idle", "walk")},
                          k_meas, -off_y * k_meas, int(cfg["clips"]["fps"]))
    log(f"STEP 5 bake: {len(keep)} joints x {bake['height']} frames -> "
        f"{bake['width']}x{bake['height']} RGBA32F, max deform at f>0 = {bake['max_deform']:.4f}")
    (proc / "anim_matrices.bin").write_bytes(bake["data"])
    header = {k: v for k, v in bake.items() if k != "data"}
    header["format"] = "RGBA32F, row-major 4x4 per joint, width = 4 * jointCount"
    (proc / "anim_matrices.json").write_text(json.dumps(header, indent=2))
    report["steps"]["5_bake"] = header

    # ---- step 5: shared skeleton, written out so nothing rigs to a second one
    (proc / "shared_skeleton.json").write_text(json.dumps({
        "name": "crowd_humanoid_v1",
        "joint_count": len(keep),
        "joints": keep,
        "max_influences": int(cfg["skeleton"]["max_influences"]),
        "culled_from_source": sorted(n for n in {body.nodes[j].name for j in body.skins[0].joints}
                                     if n not in set(keep)),
        "cull_reason": "finger bones: 65 source joints -> 25, each joint costs a texel column and a matrix per influenced vertex",
    }, indent=2))

    # ---- step 4: write the GLB tiers. Every runtime asset is a skinned GLB at 1 unit = 1 metre.
    body_maps = None
    tdir = proc
    need = ["body_basecolour.png", "body_normal.png", "body_roughness.png"]
    if all((tdir / n).is_file() for n in need):
        body_maps = {k: (tdir / n).read_bytes() for k, n in
                     (("base_colour", need[0]), ("normal", need[1]), ("roughness", need[2]))}
    else:
        log(f"NOTE textures not present yet, writing body tiers with a flat material: {need}")

    written = {}
    for tier in ("close", "mid"):
        for part in ("body", "weapon"):
            mesh = tiers[f"{part}_{tier}"]
            name = f"{cfg['troop']['id']}_{part}_{tier}.glb"
            maps = body_maps if part == "body" else None
            info = write_glb(proc / name, mesh, f"{part}_{tier}", len(keep),
                             "labs/crowd-poc tools/pipeline/build_troop.py", maps=maps)
            written[f"{part}_{tier}"] = {"file": name, **info}
            log(f"STEP 4 wrote {name}: {info['tris']} tris, {info['verts']} verts, "
                f"{info['bytes']/1024:.1f} KB")
    report["steps"]["4_convert"]["glb"] = written

    report["textures"] = json.loads((proc / "textures.json").read_text()) \
        if (proc / "textures.json").is_file() else {}
    (proc / "pipeline_report.json").write_text(json.dumps(report, indent=2))
    log("WROTE " + str(proc / "pipeline_report.json"))
    return 0


def run_blender_decimate(in_obj: Path, in_w: Path, out_obj: Path, out_w: Path,
                         target: int, joints: list[str]) -> int:
    import subprocess
    cmd = ["blender", "--background", "--factory-startup",
           "--python", str(HERE.parent / "blender" / "decimate.py"), "--",
           str(in_obj), str(in_w), str(out_obj), str(out_w), str(target), ",".join(joints)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    for line in r.stdout.splitlines():
        if line.startswith("DECIMATE"):
            print("  " + line, flush=True)
    if r.returncode != 0:
        print(r.stdout[-3000:], r.stderr[-3000:], flush=True)
    return r.returncode


if __name__ == "__main__":
    raise SystemExit(main())
