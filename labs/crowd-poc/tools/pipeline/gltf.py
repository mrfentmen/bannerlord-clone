"""Minimal glTF 2.0 / GLB reader and writer. Pure Python, no third-party dependencies.

Why this exists rather than Blender's importer: Blender 4.5's bundled numpy cannot load on
macOS 12.7.6 (it needs LAPACK symbols Apple added after Monterey), so every Python-side importer
in Blender is dead on this machine. See ASSET_PIPELINE_NOTES.md. Blender's C++ layer still works
and is used for decimation; only the importers are bypassed.

Strictness is deliberate. Anything this module does not understand raises, rather than being
silently skipped, because a silently mis-read skin matrix produces a mesh that renders wrong and
a benchmark that measures the wrong thing.
"""

from __future__ import annotations

import base64
import json
import struct
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote

# glTF componentType -> (struct char, byte width)
COMPONENT = {
    5120: ("b", 1),  # BYTE
    5121: ("B", 1),  # UNSIGNED_BYTE
    5122: ("h", 2),  # SHORT
    5123: ("H", 2),  # UNSIGNED_SHORT
    5125: ("I", 4),  # UNSIGNED_INT
    5126: ("f", 4),  # FLOAT
}
COMPONENT_NAME = {5120: "i8", 5121: "u8", 5122: "i16", 5123: "u16", 5125: "u32", 5126: "f32"}

# glTF type -> component count
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}

TARGET = {
    34962: 34962,  # ARRAY_BUFFER
    34963: 34963,  # ELEMENT_ARRAY_BUFFER
}


def _read_bytes(uri: str, base_dir: Path) -> bytes:
    if uri.startswith("data:"):
        return base64.b64decode(uri.split(",", 1)[1])
    p = base_dir / unquote(uri)
    if not p.is_file():
        raise FileNotFoundError(f"glTF buffer not found: {p}")
    return p.read_bytes()


def glb_split(data: bytes) -> tuple[dict, bytes]:
    """Split a .glb into its JSON chunk and its single binary chunk."""
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("not a GLB file")
    version, total = struct.unpack_from("<II", data[4:12])
    if version != 2:
        raise ValueError(f"GLB version {version} is not supported, expected 2")
    off = 12
    js = None
    binary = b""
    while off < min(total, len(data)):
        length, kind = struct.unpack_from("<II", data, off)
        chunk = data[off + 8 : off + 8 + length]
        if kind == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif kind == 0x004E4942:
            binary = chunk
        off += 8 + length + ((4 - length % 4) % 4 if length % 4 else 0)
    if js is None:
        raise ValueError("GLB has no JSON chunk")
    return js, binary


@dataclass
class Accessor:
    index: int
    type: str
    componentType: int
    count: int
    ncomp: int
    normalized: bool
    min: list | None
    max: list | None
    values: list  # flat python list, row-major


@dataclass
class Primitive:
    positions: list
    normals: list | None
    joints: list | None
    weights: list | None
    indices: list
    material: int | None
    vertex_count: int

    @property
    def tri_count(self) -> int:
        return len(self.indices) // 3


@dataclass
class Mesh:
    name: str
    primitives: list[Primitive]


@dataclass
class Node:
    name: str
    children: list[int] = field(default_factory=list)
    # Local transform, always resolved to a 4x4 row-major list of 16 floats.
    matrix: list[float] | None = None
    translation: list[float] | None = None
    rotation: list[float] | None = None
    scale: list[float] | None = None
    mesh: int | None = None
    skin: int | None = None

    def local_matrix(self) -> list[float]:
        if self.matrix is not None:
            return list(self.matrix)
        return compose(
            self.translation or [0.0, 0.0, 0.0],
            self.rotation or [0.0, 0.0, 0.0, 1.0],
            self.scale or [1.0, 1.0, 1.0],
        )


@dataclass
class Skin:
    name: str
    joints: list[int]
    inverse_bind: list[list[float]]  # one 4x4 row-major per joint
    skeleton: int | None


@dataclass
class AnimChannel:
    node: int
    path: str  # translation | rotation | scale
    times: list[float]
    values: list  # flat; rotation is quaternions


@dataclass
class Animation:
    name: str
    channels: list[AnimChannel]


@dataclass
class Gltf:
    json: dict
    binary: bytes
    accessors: list[Accessor]
    meshes: list[Mesh]
    nodes: list[Node]
    skins: list[Skin]
    animations: list[Animation]
    base_dir: Path

    def node_index_by_name(self, name: str) -> int:
        for i, n in enumerate(self.nodes):
            if n.name == name:
                return i
        raise KeyError(f"no node named {name!r}")


# ---------------------------------------------------------------- 4x4 math
# Row-major throughout this module: element (r, c) is m[r * 4 + c].
#
# glTF stores MAT4 data COLUMN-major, so anything read from a file is transposed on the way in by
# `transpose4`. Anything written to the animation texture is transposed on the way out by
# `pack_matrix_column_major`, because GLSL's mat4(a, b, c, d) takes columns. Mixing those two up
# produces a matrix that is the transpose of the intended one, which renders as a plausible but
# wrong deformation rather than an error.


def identity() -> list[float]:
    return [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]


def transpose4(m: list[float]) -> list[float]:
    return [m[c * 4 + r] for r in range(4) for c in range(4)]


def pack_matrix_column_major(m: list[float]) -> list[float]:
    """Row-major 4x4 -> the 16 floats in column-major order, ready to be four RGBA texels."""
    return [m[r * 4 + c] for c in range(4) for r in range(4)]


def mat_mul(a: list[float], b: list[float]) -> list[float]:
    out = [0.0] * 16
    for r in range(4):
        for c in range(4):
            out[r * 4 + c] = (
                a[r * 4 + 0] * b[0 * 4 + c]
                + a[r * 4 + 1] * b[4 + c]
                + a[r * 4 + 2] * b[8 + c]
                + a[r * 4 + 3] * b[12 + c]
            )
    return out


def compose(t, q, s) -> list[float]:
    """Row-major TRS. Translation lands in the last COLUMN (indices 3, 7, 11).

    The quaternion term is the standard right-handed form, so q = (axis*sin(a/2), cos(a/2)) is a
    rotation of +a about that axis. `tools/pipeline/test_gltf_math.py` checks all three axes against
    explicit Rodrigues matrices, because a sign slip here yields a mirrored or transposed rotation
    that still looks like a plausible mesh.
    """
    x, y, z, w = q
    x2, y2, z2 = x + x, y + y, z + z
    xx, xy, xz = x * x2, x * y2, x * z2
    yy, yz, zz = y * y2, y * z2, z * z2
    wx, wy, wz = w * x2, w * y2, w * z2
    sx, sy, sz = s
    return [
        (1 - (yy + zz)) * sx, (xy - wz) * sx, (xz + wy) * sx, t[0],
        (xy + wz) * sy, (1 - (xx + zz)) * sy, (yz - wx) * sy, t[1],
        (xz - wy) * sz, (yz + wx) * sz, (1 - (xx + yy)) * sz, t[2],
        0.0, 0.0, 0.0, 1.0,
    ]



def mat_inverse(m: list[float]) -> list[float]:
    """General 4x4 inverse by Gauss-Jordan on the augmented matrix [m | I].

    The reduction turns [m | I] into [I | m^-1], so the answer is the RIGHT block. Returning the
    left block instead yields the identity for every input, which then quietly turns
    `A_j(t) * inverse(A_j(0))` into plain `A_j(t)` and deforms the mesh instead of failing.
    tools/pipeline/test_gltf_math.py checks the round trip on random matrices.
    """
    a: list[list[float]] = []
    for r in range(4):
        row: list[float] = []
        for c in range(4):
            row.append(m[r * 4 + c])
        for c in range(4):
            row.append(1.0 if r == c else 0.0)
        a.append(row)

    for col in range(4):
        pivot = col
        best = abs(a[col][col])
        for r in range(col + 1, 4):
            if abs(a[r][col]) > best:
                best, pivot = abs(a[r][col]), r
        if best < 1e-12:
            raise ValueError("singular matrix, cannot invert")
        a[col], a[pivot] = a[pivot], a[col]
        d = a[col][col]
        for c in range(8):
            a[col][c] /= d
        for r in range(4):
            if r == col:
                continue
            f = a[r][col]
            if f == 0.0:
                continue
            for c in range(8):
                a[r][c] -= f * a[col][c]

    out: list[float] = []
    for r in range(4):
        for c in range(4):
            out.append(a[r][c + 4])  # right block, where the inverse now lives
    return out


def transform_point(m: list[float], p) -> list[float]:
    x, y, z = p
    return [
        m[0] * x + m[1] * y + m[2] * z + m[3],
        m[4] * x + m[5] * y + m[6] * z + m[7],
        m[8] * x + m[9] * y + m[10] * z + m[11],
    ]


def transform_dir(m: list[float], p) -> list[float]:
    x, y, z = p
    return [
        m[0] * x + m[1] * y + m[2] * z,
        m[4] * x + m[5] * y + m[6] * z,
        m[8] * x + m[9] * y + m[10] * z,
    ]


# ---------------------------------------------------------------- reader


def load(path: str | Path) -> Gltf:
    path = Path(path)
    data = path.read_bytes()
    if path.suffix == ".glb":
        js, binary = glb_split(data)
    else:
        js = json.loads(data.decode("utf-8"))
        binary = b""
    return _build(js, binary, path.parent)


def _load_buffers(js: dict, glb_bin: bytes, base_dir: Path) -> list[bytes]:
    """Resolve every buffer to bytes. A .glb supplies buffer 0 inline; a .gltf reads its URIs."""
    out: list[bytes] = []
    for i, b in enumerate(js.get("buffers", [])):
        if i == 0 and glb_bin:
            out.append(glb_bin)
        elif "uri" in b:
            out.append(_read_bytes(b["uri"], base_dir))
        else:
            raise ValueError(f"buffer {i} has no uri and no inline GLB chunk")
    return out


def _accessor_values(js: dict, buffers: list[bytes], idx: int) -> Accessor:
    a = js["accessors"][idx]
    ct = a["componentType"]
    if ct not in COMPONENT:
        raise ValueError(f"accessor {idx}: unsupported componentType {ct}")
    type_ = a["type"]
    if type_ not in NCOMP:
        raise ValueError(f"accessor {idx}: unsupported type {type_}")
    ncomp = NCOMP[type_]
    ch, width = COMPONENT[ct]
    count = a["count"]
    fmt = "<" + ch * ncomp

    if "sparse" in a:
        raise ValueError(f"accessor {idx}: sparse accessors are not supported")
    if "bufferView" not in a:
        vals = [0.0] * (count * ncomp)
    else:
        bv = js["bufferViews"][a["bufferView"]]
        if bv.get("byteStride"):
            raise ValueError(f"accessor {idx}: byteStride {bv['byteStride']} is not supported")
        binary = buffers[bv.get("buffer", 0)]
        start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        need = count * ncomp * width
        if start + need > len(binary):
            raise ValueError(f"accessor {idx}: reads past end of buffer {bv.get('buffer', 0)}")
        vals = list(struct.unpack_from("<" + ch * (count * ncomp), binary, start))

    if a.get("normalized"):
        # Only the integer types the specs allow to be normalised appear here.
        scale = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}[ct]
        signed = ct in (5120, 5122)
        mx = (2 ** (8 * width * 1) / 2 - 1) if signed else (2 ** (8 * width) - 1)
        vals = [max(v / mx, -1.0) for v in vals]

    return Accessor(idx, type_, ct, count, ncomp, bool(a.get("normalized")),
                    a.get("min"), a.get("max"), vals)


def _build(js: dict, glb_bin: bytes, base_dir: Path) -> Gltf:
    buffers = _load_buffers(js, glb_bin, base_dir)
    accessors = [_accessor_values(js, buffers, i) for i in range(len(js.get("accessors", [])))]

    meshes: list[Mesh] = []
    for m in js.get("meshes", []):
        prims = []
        for pr in m["primitives"]:
            if pr.get("mode", 4) != 4:
                raise ValueError(f"mesh {m.get('name')!r}: only TRIANGLES mode is supported")
            attrs = pr["attributes"]
            need = ("POSITION",)
            for n in need:
                if n not in attrs:
                    raise ValueError(f"mesh {m.get('name')!r}: missing {n}")
            pos = accessors[attrs["POSITION"]]
            nrm = accessors[attrs["NORMAL"]].values if "NORMAL" in attrs else None
            jnt = accessors[attrs["JOINTS_0"]].values if "JOINTS_0" in attrs else None
            wgt = accessors[attrs["WEIGHTS_0"]].values if "WEIGHTS_0" in attrs else None
            idx = accessors[pr["indices"]].values if "indices" in pr else list(range(pos.count))
            if len(idx) % 3:
                raise ValueError(f"mesh {m.get('name')!r}: index count {len(idx)} is not a multiple of 3")
            prims.append(Primitive(pos.values, nrm, jnt, wgt, [int(i) for i in idx],
                                   pr.get("material"), pos.count))
        meshes.append(Mesh(m.get("name", ""), prims))

    nodes: list[Node] = []
    for n in js.get("nodes", []):
        nodes.append(
            Node(
                name=n.get("name", ""),
                children=list(n.get("children", [])),
                matrix=transpose4(n["matrix"]) if "matrix" in n else None,
                translation=n.get("translation"),
                rotation=n.get("rotation"),
                scale=n.get("scale"),
                mesh=n.get("mesh"),
                skin=n.get("skin"),
            )
        )

    skins: list[Skin] = []
    for s in js.get("skins", []):
        ibm_idx = s.get("inverseBindMatrices")
        if ibm_idx is None:
            ibm = [identity() for _ in s["joints"]]
        else:
            flat = accessors[ibm_idx].values
            if len(flat) != 16 * len(s["joints"]):
                raise ValueError("skin: inverseBindMatrices count does not match joint count")
            # glTF stores these column-major; the rest of this module is row-major.
            ibm = [transpose4(flat[i * 16 : i * 16 + 16]) for i in range(len(s["joints"]))]
        skins.append(Skin(s.get("name", ""), list(s["joints"]), ibm, s.get("skeleton")))

    animations: list[Animation] = []
    for a in js.get("animations", []):
        chans = []
        for c in a["channels"]:
            smp = a["samplers"][c["sampler"]]
            interp = smp.get("interpolation", "LINEAR")
            if interp != "LINEAR":
                raise ValueError(f"animation {a.get('name')!r}: interpolation {interp} is not supported")
            times = accessors[smp["input"]].values
            vals = accessors[smp["output"]].values
            chans.append(AnimChannel(c["target"]["node"], c["target"]["path"], times, vals))
        animations.append(Animation(a.get("name", ""), chans))

    return Gltf(js, b"".join(buffers), accessors, meshes, nodes, skins, animations, base_dir)


# ---------------------------------------------------------------- animation sampling


def sample_linear(times: list[float], values: list, ncomp: int, t: float):
    """Linear interpolation with endpoint clamping. Quaternions are nlerp'd, which is correct
    for keyframes a few frames apart and avoids the sign/overshoot bugs of lerping directly."""
    if not times:
        raise ValueError("empty animation sampler")
    if t <= times[0]:
        return values[0:ncomp]
    if t >= times[-1]:
        v = (len(times) - 1) * ncomp
        return values[v : v + ncomp]
    lo, hi = 0, len(times) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if times[mid] <= t:
            lo = mid
        else:
            hi = mid
    span = times[hi] - times[lo]
    u = 0.0 if span <= 0 else (t - times[lo]) / span
    a = values[lo * ncomp : lo * ncomp + ncomp]
    b = values[hi * ncomp : hi * ncomp + ncomp]
    if ncomp == 4:  # quaternion
        if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) < 0:
            b = [-v for v in b]
        out = [a[i] + (b[i] - a[i]) * u for i in range(4)]
        n = (sum(v * v for v in out) ** 0.5) or 1.0
        return [v / n for v in out]
    return [a[i] + (b[i] - a[i]) * u for i in range(ncomp)]


def world_matrices(g: Gltf) -> list[list[float]]:
    """Resolve every node's world matrix from the node hierarchy. One pass, memoised."""
    cache: dict[int, list[float]] = {}

    def resolve(i: int) -> list[float]:
        if i in cache:
            return cache[i]
        n = g.nodes[i]
        local = n.local_matrix()
        parent = identity()
        for p, pn in enumerate(g.nodes):
            if i in pn.children:
                parent = resolve(p)
                break
        w = mat_mul(parent, local)
        cache[i] = w
        return w

    for i in range(len(g.nodes)):
        resolve(i)
    return [cache[i] for i in range(len(g.nodes))]


# ---------------------------------------------------------------- writer


def _gltf_type(ncomp: int) -> str:
    """glTF spells a single component SCALAR. Emitting "VEC1" produces a file that is not valid
    glTF and that stricter readers reject, which is how the index accessor broke the TS reader."""
    return "SCALAR" if ncomp == 1 else f"VEC{ncomp}"


class GltfBuilder:
    """Writes a single-mesh, single-skin .glb with everything this project needs and nothing else.

    Deliberately narrow: it refuses to be extended into a general-purpose exporter, because the
    runtime reader in this repo is equally narrow and the two are meant to stay in step.
    """

    def __init__(self, generator: str):
        self.js = {
            "asset": {"version": "2.0", "generator": generator},
            "scene": 0,
            "scenes": [{"nodes": [0]}],
            "nodes": [],
            "meshes": [],
            "accessors": [],
            "bufferViews": [],
            "buffers": [],
            "materials": [],
            "samplers": [],
            "textures": [],
            "images": [],
            "skins": [],
        }
        self.chunks: list[bytes] = []
        self.offset = 0
        self.minmax = [(None, None)]

    def _align(self, n: int = 4) -> None:
        pad = (n - self.offset % n) % n
        if pad:
            self.chunks.append(b"\0" * pad)
            self.offset += pad

    def add_buffer(self, data: bytes, target: int | None = None) -> int:
        self._align(4)
        off = self.offset
        self.chunks.append(data)
        self.offset += len(data)
        bv = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            bv["target"] = target
        self.js["bufferViews"].append(bv)
        return len(self.js["bufferViews"]) - 1

    def add_accessor(self, bv: int, comp: int, ncomp: int, count: int,
                     type_: str, minmax: tuple | None = None) -> int:
        a = {"bufferView": bv, "componentType": comp, "count": count, "type": type_}
        if minmax and minmax[0] is not None:
            a["min"], a["max"] = list(minmax[0]), list(minmax[1])
        self.js["accessors"].append(a)
        return len(self.js["accessors"]) - 1

    def add_floats(self, vals: list, ncomp: int, target: int = 34962, minmax: bool = False) -> int:
        assert len(vals) % ncomp == 0
        data = struct.pack("<" + "f" * len(vals), *vals)
        bv = self.add_buffer(data, target)
        mm = None
        if minmax:
            rows = [vals[i : i + ncomp] for i in range(0, len(vals), ncomp)]
            lo = [min(r[k] for r in rows) for k in range(ncomp)]
            hi = [max(r[k] for r in rows) for k in range(ncomp)]
            mm = (lo, hi)
        return self.add_accessor(bv, 5126, ncomp, len(vals) // ncomp, _gltf_type(ncomp), mm)

    def add_uints(self, vals: list, ncomp: int, target: int = 34962) -> int:
        data = struct.pack("<" + "I" * len(vals), *vals)
        bv = self.add_buffer(data, target)
        return self.add_accessor(bv, 5125, ncomp, len(vals) // ncomp, _gltf_type(ncomp))

    def add_ushorts(self, vals: list, ncomp: int, target: int = 34962) -> int:
        data = struct.pack("<" + "H" * len(vals), *vals)
        bv = self.add_buffer(data, target)
        return self.add_accessor(bv, 5123, ncomp, len(vals) // ncomp, _gltf_type(ncomp))

    def add_joints(self, vals: list, ncomp: int = 4) -> int:
        return self.add_ushorts(vals, ncomp, 34962)

    def embed_image(self, png: bytes) -> int:
        bv = self.add_buffer(png, None)
        self.js["images"].append({"bufferView": bv, "mimeType": "image/png"})
        idx = len(self.js["images"]) - 1
        self.js["samplers"].append({"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497})
        self.js["textures"].append({"sampler": len(self.js["samplers"]) - 1, "source": idx})
        return len(self.js["textures"]) - 1

    def write(self, path: str | Path) -> None:
        binary = b"".join(self.chunks)
        self.js["buffers"] = [{"byteLength": len(binary)}]
        js = json.dumps(self.js, separators=(",", ":")).encode("utf-8")
        js += b" " * ((4 - len(js) % 4) % 4)
        total = 12 + 8 + len(js) + 8 + len(binary)
        out = b"glTF" + struct.pack("<II", 2, total)
        out += struct.pack("<II", len(js), 0x4E4F534A) + js
        out += struct.pack("<II", len(binary), 0x004E4942) + binary
        Path(path).write_bytes(out)
