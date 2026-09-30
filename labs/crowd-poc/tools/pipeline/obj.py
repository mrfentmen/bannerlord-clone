"""Minimal Wavefront OBJ reader, for the weapon source and for Blender's decimation output.

The weapon ships only as .blend, .fbx, .obj and .mtl. Blender's .blend loader is C++ but reading a
.blend without the Python layer is not practical, and the .fbx importer needs numpy. The .obj is
readable here in pure Python, which is all the weapon needs: it is untextured solid-colour
geometry, so no material data is lost.

Two behaviours matter to the caller and are easy to get wrong:

* `preserve_order=True` keeps the file's own vertex indices instead of compacting them. Blender's
  decimate modifier renumbers the evaluated mesh, so the decimation output's vertex N is Blender's
  vertex N. Preserving order is what lets the per-vertex skin weights be zipped back on by index
  instead of by guessed position.
* Exported by Blender, so Z is up. Callers convert deliberately rather than getting a model on its
  side. `load` does not convert; `bbox` is in the file's own Z-up space.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ObjMesh:
    name: str
    positions: list[float]  # flat xyz, length = vertex_count * 3
    normals: list[float]    # flat xyz, same length as positions
    faces: list[int]        # flat triangle indices into positions
    materials: dict[str, tuple[int, int]] = field(default_factory=dict)  # name -> (tri0, count)

    @property
    def vertex_count(self) -> int:
        return len(self.positions) // 3

    @property
    def tri_count(self) -> int:
        return len(self.faces) // 3


def load(path: str | Path, preserve_order: bool = True) -> ObjMesh:
    path = Path(path)
    pos: list[float] = []
    nrm: list[float] = []
    corners: list[tuple[int, int]] = []   # (vertex, normal) per face corner
    tri_mat: list[str] = []
    cur_mat = "default"
    name = path.stem

    for raw in path.read_text(errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        tag, _, rest = line.partition(" ")
        rest = rest.strip()

        if tag == "v":
            x, y, z = rest.split()[:3]
            pos += [float(x), float(y), float(z)]
        elif tag == "vn":
            x, y, z = rest.split()[:3]
            nrm += [float(x), float(y), float(z)]
        elif tag == "o":
            name = rest or name
        elif tag == "g":
            name = rest or name
        elif tag == "usemtl":
            cur_mat = rest
        elif tag == "f":
            parts_in = rest.split()
            if len(parts_in) < 3:
                raise ValueError(f"{path.name}: face with {len(parts_in)} corners")
            cs: list[tuple[int, int]] = []
            for tok in parts_in:
                p = tok.split("/")
                vi = int(p[0])
                ni = int(p[2]) if len(p) > 2 and p[2] else 0
                cs.append((vi - 1 if vi > 0 else len(pos) // 3 + vi,
                           ni - 1 if ni > 0 else (len(nrm) // 3 + ni if ni else -1)))
            # Fan-triangulate. The exporters in this pipeline emit convex n-gons only.
            for k in range(1, len(cs) - 1):
                corners += [cs[0], cs[k], cs[k + 1]]
                tri_mat.append(cur_mat)
    if not corners:
        raise ValueError(f"{path.name}: no faces")

    nverts = len(pos) // 3
    if preserve_order:
        out_p = pos
        remap = {i: i for i in range(nverts)}
    else:
        remap = {}
        out_p = []
        for vi, _ in corners:
            if vi not in remap:
                remap[vi] = len(out_p) // 3
                out_p += pos[vi * 3 : vi * 3 + 3]
    out_faces = [remap[vi] for vi, _ in corners]

    # One normal per vertex, preferring the one the first corner asked for, +Y as a fallback.
    out_n = [0.0] * len(out_p)
    have = [False] * (len(out_p) // 3)
    for vi, ni in corners:
        w = remap[vi]
        if not have[w] and 0 <= ni < len(nrm) // 3:
            out_n[w * 3 : w * 3 + 3] = nrm[ni * 3 : ni * 3 + 3]
            have[w] = True
    for i, ok in enumerate(have):
        if not ok:
            out_n[i * 3 : i * 3 + 3] = [0.0, 1.0, 0.0]

    mats: dict[str, list[int]] = {}
    for t, m in enumerate(tri_mat):
        mats.setdefault(m, []).append(t)
    return ObjMesh(name, out_p, out_n, out_faces, {m: (v[0], len(v)) for m, v in mats.items()})


def bbox(positions: list[float]) -> tuple[tuple[float, ...], tuple[float, ...]]:
    lo = tuple(min(positions[i::3]) for i in range(3))
    hi = tuple(max(positions[i::3]) for i in range(3))
    return lo, hi
