"""Minimal pure-Python glTF 2.0 / GLB reader for the animation pipeline.

Only what the pipeline needs: node hierarchy, skins (joints + inverse bind
matrices), meshes (joint/weight attributes for validation), and animations
(sampled to per-node TRS curves). No dependencies beyond the standard library
and numpy. Raises GltfError with a plain-English message on malformed input.
"""

import json
import struct

import numpy as np


class GltfError(Exception):
    pass


_COMP = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
_TYPE_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


class AccessorData:
    def __init__(self, array, count):
        self.array = array  # flat float64 array
        self.count = count


class Node:
    def __init__(self, raw, index):
        self.index = index
        self.name = raw.get("name", f"node_{index}")
        self.children = raw.get("children", [])
        self.translation = np.array(raw.get("translation", [0.0, 0.0, 0.0]), dtype=np.float64)
        self.rotation = np.array(raw.get("rotation", [0.0, 0.0, 0.0, 1.0]), dtype=np.float64)
        self.scale = np.array(raw.get("scale", [1.0, 1.0, 1.0]), dtype=np.float64)
        self.has_matrix = "matrix" in raw
        self.matrix = np.array(raw["matrix"], dtype=np.float64).reshape(4, 4).T if self.has_matrix else None
        # Local matrix in our convention: row-major 4x4, translation in last column.
        # glTF stores column-major, hence the transpose above.


class Skin:
    def __init__(self, joints, ibms):
        self.joints = joints          # node indices
        self.inverse_bind = ibms      # (n,4,4) float64, row-major, translation last column


class AnimChannel:
    def __init__(self, node, path, times, values, interpolation):
        self.node = node
        self.path = path              # "translation" | "rotation" | "scale"
        self.times = times            # (k,) float64
        self.values = values          # (k,3) or (k,4) float64
        self.interpolation = interpolation


class Animation:
    def __init__(self, name, channels):
        self.name = name
        self.channels = channels

    @property
    def duration(self):
        tmax = 0.0
        for ch in self.channels:
            if len(ch.times):
                tmax = max(tmax, float(ch.times[-1]))
        return tmax


class Gltf:
    def __init__(self, doc, binary):
        self.doc = doc
        self.binary = binary
        self.nodes = [Node(n, i) for i, n in enumerate(doc.get("nodes", []))]
        self.parent = {}
        for i, n in enumerate(self.nodes):
            for c in n.children:
                self.parent[c] = i
        self.skins = []
        for s in doc.get("skins", []):
            ibm = self._accessor(s["inverseBindMatrices"])
            # glTF MAT4 is column-major; convert to row-major (transpose each).
            ibms = ibm.array.reshape(-1, 4, 4).transpose(0, 2, 1)
            self.skins.append(Skin(s["joints"], ibms))
        self.animations = []
        for a in doc.get("animations", []):
            channels = []
            for ch in a.get("channels", []):
                sampler = a["samplers"][ch["sampler"]]
                times = self._accessor(sampler["input"]).array
                out_acc = doc["accessors"][sampler["output"]]
                ncomp = _TYPE_COUNT[out_acc["type"]]
                values = self._accessor(sampler["output"]).array.reshape(-1, ncomp)
                channels.append(AnimChannel(
                    ch["target"]["node"], ch["target"]["path"],
                    times, values, sampler.get("interpolation", "LINEAR")))
            self.animations.append(Animation(a.get("name", "anim"), channels))
        self.meshes = doc.get("meshes", [])

    def _accessor(self, index):
        a = self.doc["accessors"][index]
        bv = self.doc["bufferViews"][a["bufferView"]]
        ctype = _COMP.get(a["componentType"])
        if ctype is None:
            raise GltfError(f"unsupported componentType {a['componentType']}")
        ncomp = _TYPE_COUNT[a["type"]]
        boff = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        count = a["count"] * ncomp
        arr = np.frombuffer(self.binary, dtype=np.dtype(ctype).newbyteorder("<"),
                            count=count, offset=boff)
        return AccessorData(np.array(arr, dtype=np.float64), a["count"])

    def animation_by_name(self, name):
        for a in self.animations:
            if a.name == name:
                return a
        raise GltfError(f"animation {name!r} not found "
                        f"(have: {[a.name for a in self.animations]})")


def load(path):
    """Load a .glb file. (The pipeline only deals in GLB, never loose .gltf.)"""
    data = open(path, "rb").read()
    if len(data) < 12 or struct.unpack("<I", data[0:4])[0] != 0x46546C67:
        raise GltfError(f"{path}: not a GLB file")
    _ver, length = struct.unpack("<II", data[4:12])
    if length != len(data):
        raise GltfError(f"{path}: GLB length field {length} != file size {len(data)}")
    off = 12
    doc, binary = None, b""
    while off < len(data):
        clen, ctype = struct.unpack("<II", data[off:off + 8])
        chunk = data[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:      # JSON
            doc = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:    # BIN
            binary = chunk
        off += 8 + clen
    if doc is None:
        raise GltfError(f"{path}: GLB has no JSON chunk")
    return Gltf(doc, binary)


# ---------------------------------------------------------------------------
# Sampling: evaluate an animation to per-node local TRS at time t.


def _sample_channel(ch, t):
    times, vals = ch.times, ch.values
    if len(times) == 0:
        return None
    if t <= times[0]:
        return vals[0]
    if t >= times[-1]:
        return vals[-1]
    if ch.interpolation == "STEP":
        i = int(np.searchsorted(times, t, side="right")) - 1
        return vals[i]
    if ch.interpolation == "CUBICSPLINE":
        raise GltfError("CUBICSPLINE interpolation is not supported by the pipeline sampler")
    # LINEAR
    i = int(np.searchsorted(times, t, side="right")) - 1
    t0, t1 = times[i], times[i + 1]
    f = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
    v = vals[i] * (1.0 - f) + vals[i + 1] * f
    if ch.path == "rotation":
        n = np.linalg.norm(v)
        v = v / n if n > 1e-12 else np.array([0.0, 0.0, 0.0, 1.0])
    return v


def sample_animation(gltf, anim, t):
    """Return {node_index: {'translation': v3, 'rotation': quat, 'scale': v3}}.

    Starts from each animated node's rest pose and applies the sampled
    channels on top. Nodes with no channels are absent from the result.
    """
    pose = {}
    for ch in anim.channels:
        node = gltf.nodes[ch.node]
        entry = pose.get(ch.node)
        if entry is None:
            entry = {"translation": node.translation.copy(),
                     "rotation": node.rotation.copy(),
                     "scale": node.scale.copy()}
            pose[ch.node] = entry
        v = _sample_channel(ch, t)
        if v is not None:
            entry[ch.path] = v
    return pose
