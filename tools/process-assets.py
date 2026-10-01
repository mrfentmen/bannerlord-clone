#!/usr/bin/env python3
"""
Asset build pipeline - ASSETS.md steps 4-6 (Convert, Optimise, Unify).

Steps 1-3 already exist: tools/fetch-assets.py, tools/manifest-check.py,
tools/build-inventory.py. This tool takes a source GLB and produces
game-ready assets:

    audit   - check scale (1 unit = 1 metre), tri count and texture
              resolution against the ASSETS.md section 5 budgets
    process - normalise scale so 1 unit = 1 m, write processed GLB
    lod     - generate MID tier (vertex-clustering decimation, ~35% of
              source tris) and FAR tier (billboard impostor rendered by a
              small software rasterizer: PNG + quad GLB + JSON descriptor)

    --update-manifest - append entries for processed files to
              assets/manifest.json (fields per ASSETS.md 2.1)

No Blender required. No mocks: every number reported is measured from
the actual file bytes.
"""
import argparse
import base64
import hashlib
import io
import json
import math
import os
import struct
import sys
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image
from pygltflib import (
    GLTF2, Accessor, Attributes, Buffer, BufferView, Image as GltfImage,
    Material, Mesh, Node, PbrMetallicRoughness, Primitive, Sampler, Scene,
    Texture, TextureInfo,
)
from pygltflib.utils import ImageFormat

REPO = Path(__file__).resolve().parents[1]

# ---------------------------------------------------------------------------
# Class specs from ASSETS.md sections 3 and 5.
# h_* are metres (1 unit = 1 metre, ASSETS.md step 4). tris_* are the section
# 5.2 close-tier triangle budgets. tex_* are the section 5.1 max texture
# resolutions per slot (base colour / normal / roughness-metallic).
# ---------------------------------------------------------------------------
CLASS_SPEC = {
    "building": {
        "h_min": 2.5, "h_ref": 5.0, "h_max": 30.0, "dim": "height",
        "tris_close": 5000,
        "tex": {"base": 1024, "rough": 512},
    },
    "vehicle": {
        "h_min": 1.2, "h_ref": 2.2, "h_max": 5.0, "dim": "height",
        "tris_close": 15000,
        "tex": {"base": 1024, "normal": 1024, "rough": 512},
    },
    "weapon": {
        "h_min": 0.2, "h_ref": 0.9, "h_max": 2.0, "dim": "longest",
        "tris_close": 3000,
        "tex": {"base": 512, "normal": 512, "rough": 256},
    },
    "prop": {
        "h_min": 0.1, "h_ref": 0.8, "h_max": 2.5, "dim": "height",
        "tris_close": 500,
        "tex": {"base": 256, "normal": 256},
    },
    "environment": {
        "h_min": 1.0, "h_ref": 6.0, "h_max": 20.0, "dim": "height",
        "tris_close": 2000,
        "tex": {"base": 512},
    },
    "character_body": {
        "h_min": 1.5, "h_ref": 1.8, "h_max": 2.2, "dim": "height",
        "tris_close": 12000,
        "tex": {"base": 1024, "normal": 1024, "rough": 512},
    },
    # Gear and heads are worn relative to a body: no absolute scale gate and
    # no standalone tri budget (they are budgeted inside the 12k troop total).
    "character_gear": {"h_min": None, "tris_close": None, "tex": {"base": 512, "normal": 512, "rough": 256}},
    "character_head": {"h_min": None, "tris_close": None, "tex": {"base": 512, "normal": 512}},
}

_COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2),
         5125: ("I", 4), 5126: ("f", 4)}
_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


# ---------------------------------------------------------------------------
# glTF reading helpers (world-space, no Blender)
# ---------------------------------------------------------------------------
def _buffer_bytes(gltf, buffer_index, base_dir):
    buf = gltf.buffers[buffer_index]
    if buf.uri:  # external .bin
        p = Path(base_dir) / buf.uri
        return p.read_bytes()
    blob = gltf.binary_blob()
    if blob is None:
        raise ValueError("no binary data (not a GLB and no buffer uri)")
    return bytes(blob)


def read_accessor(gltf, index, base_dir):
    """Read an accessor as float64/int64 numpy, honouring byteStride."""
    acc = gltf.accessors[index]
    bv = gltf.bufferViews[acc.bufferView]
    raw = _buffer_bytes(gltf, bv.buffer, base_dir)
    fmt, size = _COMP[acc.componentType]
    ncomp = _NCOMP[acc.type]
    if acc.sparse is not None:
        raise ValueError("sparse accessors not supported")
    start = (bv.byteOffset or 0) + (acc.byteOffset or 0)
    stride = bv.byteStride or ncomp * size
    out = np.empty((acc.count, ncomp), dtype=np.float64)
    for i in range(acc.count):
        chunk = raw[start + i * stride: start + i * stride + ncomp * size]
        out[i] = struct.unpack("<" + fmt * ncomp, chunk)
    if acc.componentType == 5126:
        return out
    return out.astype(np.int64)


def _quat_to_mat(q):
    x, y, z, w = q
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def node_local_matrix(node):
    if node.matrix is not None and len(node.matrix) == 16:
        return np.array(node.matrix, dtype=np.float64).reshape(4, 4).T
    m = np.eye(4)
    if node.scale is not None:
        m[:3, :3] = m[:3, :3] @ np.diag(node.scale)
    if node.rotation is not None:
        m[:3, :3] = _quat_to_mat(node.rotation) @ m[:3, :3]
    if node.translation is not None:
        m[:3, 3] = node.translation
    return m


def iter_world_meshes(gltf, base_dir):
    """Yield (node_index, world_matrix, mesh) for every mesh instance."""
    out = []
    scenes = gltf.scenes or []
    seen = set()

    def walk(ni, parent):
        if ni in seen:
            return
        seen.add(ni)
        node = gltf.nodes[ni]
        world = parent @ node_local_matrix(node)
        if node.mesh is not None:
            out.append((ni, world, gltf.meshes[node.mesh]))
        for child in node.children or []:
            walk(child, world)

    for sc in scenes:
        for root in sc.nodes or []:
            walk(root, np.eye(4))
    if not scenes:  # no scenes: walk every root-level node
        children = {c for n in gltf.nodes for c in (n.children or [])}
        for i, n in enumerate(gltf.nodes):
            if i not in children:
                walk(i, np.eye(4))
    return out


def primitive_arrays(gltf, prim, world, base_dir):
    """World-space position/normal/uv/index arrays for one primitive."""
    pos = read_accessor(gltf, prim.attributes.POSITION, base_dir)
    n = len(pos)
    w3 = world[:3, :3]
    wp = (w3 @ pos.T).T + world[:3, 3]
    nrm = None
    if prim.attributes.NORMAL is not None:
        raw_n = read_accessor(gltf, prim.attributes.NORMAL, base_dir)
        invt = np.linalg.inv(w3).T if abs(np.linalg.det(w3)) > 1e-12 else np.eye(3)
        nrm = (invt @ raw_n.T).T
        ln = np.linalg.norm(nrm, axis=1, keepdims=True)
        nrm = np.divide(nrm, np.where(ln == 0, 1, ln))
    uv = None
    if prim.attributes.TEXCOORD_0 is not None:
        uv = read_accessor(gltf, prim.attributes.TEXCOORD_0, base_dir)
    if prim.indices is not None:
        idx = read_accessor(gltf, prim.indices, base_dir).ravel().astype(np.int64)
    else:
        idx = np.arange(n, dtype=np.int64)
    return wp, nrm, uv, idx


def model_stats(glb_path):
    """Measured stats: tri count, world bbox, per-texture resolutions."""
    glb_path = Path(glb_path)
    gltf = GLTF2().load(str(glb_path))
    base_dir = str(glb_path.parent)
    tris = 0
    mn = np.full(3, np.inf)
    mx = np.full(3, -np.inf)
    prim_count = 0
    for _ni, world, mesh in iter_world_meshes(gltf, base_dir):
        for prim in mesh.primitives:
            wp, _n, _u, idx = primitive_arrays(gltf, prim, world, base_dir)
            tris += len(idx) // 3
            prim_count += 1
            if len(wp):
                mn = np.minimum(mn, wp.min(axis=0))
                mx = np.maximum(mx, wp.max(axis=0))
    textures = texture_report(gltf, base_dir)
    return {
        "tris": int(tris),
        "prims": prim_count,
        "bbox_min": mn.tolist(),
        "bbox_max": mx.tolist(),
        "size": (mx - mn).tolist(),
        "height": float(mx[1] - mn[1]),
        "textures": textures,
    }


def texture_report(gltf, base_dir):
    """Per material slot: list of (width, height) for referenced textures."""
    slots = {}  # slot -> set of (w, h)

    def note(slot, tex_index):
        if tex_index is None:
            return
        try:
            tex = gltf.textures[tex_index]
            img = gltf.images[tex.source]
        except (IndexError, TypeError):
            return
        try:
            data = image_bytes(gltf, img, base_dir)
            with Image.open(io.BytesIO(data)) as im:
                slots.setdefault(slot, set()).add(im.size)
        except Exception:
            slots.setdefault(slot, set()).add(("unreadable",))

    for mat in gltf.materials or []:
        pbr = mat.pbrMetallicRoughness
        if pbr is not None:
            if pbr.baseColorTexture is not None:
                note("base", pbr.baseColorTexture.index)
            if pbr.metallicRoughnessTexture is not None:
                note("rough", pbr.metallicRoughnessTexture.index)
        if mat.normalTexture is not None:
            note("normal", mat.normalTexture.index)
    return {k: sorted(v) for k, v in slots.items()}


def image_bytes(gltf, img, base_dir):
    if img.bufferView is not None:
        bv = gltf.bufferViews[img.bufferView]
        raw = _buffer_bytes(gltf, bv.buffer, base_dir)
        start = bv.byteOffset or 0
        return raw[start: start + bv.byteLength]
    if img.uri:
        # data: uri or external file next to the glb
        if img.uri.startswith("data:"):
            return base64.b64decode(img.uri.split(",", 1)[1])
        return (Path(base_dir) / img.uri).read_bytes()
    raise ValueError("image has neither bufferView nor uri")


def embed_external_textures(gltf, base_dir):
    """Embed external texture files into the GLB so outputs are self-contained.

    Returns the number of images embedded.
    """
    blob = bytearray(gltf.binary_blob() or b"")
    embedded = 0
    for img in gltf.images or []:
        if img.bufferView is not None:
            continue
        if not img.uri or img.uri.startswith("data:"):
            continue
        try:
            data = image_bytes(gltf, img, base_dir)
        except OSError:
            continue  # leave dangling URIs alone; audit will flag them
        blob += b"\0" * (-len(blob) % 4)
        offset = len(blob)
        blob += data
        gltf.bufferViews.append(BufferView(buffer=0, byteOffset=offset,
                                           byteLength=len(data)))
        img.bufferView = len(gltf.bufferViews) - 1
        img.uri = None
        img.mimeType = ("image/png" if data[:8] == b"\x89PNG\r\n\x1a\n"
                        else "image/jpeg")
        embedded += 1
    if embedded:
        gltf.set_binary_blob(bytes(blob))
        if gltf.buffers:
            gltf.buffers[0].byteLength = len(blob)
    return embedded


def first_base_texture(gltf, base_dir):
    """Return (png_bytes, uv_present) for the first base-colour texture found."""
    for mat in gltf.materials or []:
        pbr = mat.pbrMetallicRoughness
        if pbr is not None and pbr.baseColorTexture is not None:
            tex = gltf.textures[pbr.baseColorTexture.index]
            img = gltf.images[tex.source]
            return image_bytes(gltf, img, base_dir)
    return None


# ---------------------------------------------------------------------------
# audit: ASSETS.md step 4 gate - scale, tri budget, texture budget
# ---------------------------------------------------------------------------
def audit_cmd(glb, class_name):
    spec = CLASS_SPEC[class_name]
    stats = model_stats(glb)
    size = stats["size"]
    dim = stats["height"] if spec.get("dim", "height") == "height" else max(size)
    dim_name = spec.get("dim", "height")
    violations = []
    notes = []
    lines = [f"audit: {glb}  (class {class_name})",
             f"  tris: {stats['tris']} in {stats['prims']} primitives",
             f"  bbox size (m): {size[0]:.3f} x {size[1]:.3f} x {size[2]:.3f}"]

    # scale gate: 1 unit = 1 metre
    h_min = spec.get("h_min")
    if h_min is None:
        notes.append("scale gate skipped (part worn relative to a body)")
    else:
        lines.append(f"  {dim_name}: {dim:.3f} m  (class range {spec['h_min']}-{spec['h_max']} m)")
        if dim < spec["h_min"] or dim > spec["h_max"]:
            s = spec["h_ref"] / dim if dim > 0 else 0
            violations.append(
                f"SCALE: {dim_name} {dim:.3f} m outside class range "
                f"[{spec['h_min']}, {spec['h_max']}] m - run `process` "
                f"(suggested scale factor x{s:.3f} to reference {spec['h_ref']} m)")

    # tri budget gate (section 5.2, close tier)
    tris_close = spec.get("tris_close")
    if tris_close is None:
        notes.append("tri budget checked at troop assembly (12k total)")
    else:
        lines.append(f"  tri budget (close): {stats['tris']} / {tris_close}")
        if stats["tris"] > tris_close:
            violations.append(
                f"TRIS: {stats['tris']} exceeds close-tier budget {tris_close} "
                f"for class {class_name}")

    # texture budget gate (section 5.1)
    tex_budget = spec.get("tex", {})
    for slot, sizes in stats["textures"].items():
        budget = tex_budget.get(slot)
        for wh in sizes:
            if len(wh) != 2 or wh[0] == "unreadable":
                violations.append(f"TEXTURE: unreadable image in slot '{slot}'")
                continue
            w, h = wh
            mx = max(w, h)
            lines.append(f"  texture '{slot}': {w}x{h}" +
                         (f" (budget {budget})" if budget else " (no budget for slot)"))
            if budget and mx > budget:
                violations.append(
                    f"TEXTURE: slot '{slot}' is {w}x{h}, exceeds {budget}px "
                    f"budget for class {class_name}")
    if not stats["textures"]:
        notes.append("no textures referenced (untextured material)")

    for n in notes:
        lines.append(f"  note: {n}")
    if violations:
        lines.append("VIOLATIONS:")
        for v in violations:
            lines.append(f"  - {v}")
        print("\n".join(lines))
        return 2
    lines.append("PASS: within all budgets")
    print("\n".join(lines))
    return 0


# ---------------------------------------------------------------------------
# process: bake scale normalisation into node transforms (step 4)
# ---------------------------------------------------------------------------
def bake_scale(gltf, factor):
    """Multiply `factor` into every scene-root node transform."""
    if abs(factor - 1.0) < 1e-9:
        return 0
    changed = 0
    roots = set()
    for sc in gltf.scenes or []:
        roots.update(sc.nodes or [])
    if not roots:
        children = {c for n in gltf.nodes for c in (n.children or [])}
        roots = {i for i in range(len(gltf.nodes)) if i not in children}
    for i in sorted(roots):
        node = gltf.nodes[i]
        if node.matrix is not None and len(node.matrix) == 16:
            m = node.matrix
            for col in (0, 4, 8):  # scale basis vectors (column-major)
                m[col] *= factor
                m[col + 1] *= factor
                m[col + 2] *= factor
        else:
            s = node.scale or [1.0, 1.0, 1.0]
            node.scale = [s[0] * factor, s[1] * factor, s[2] * factor]
        changed += 1
    return changed


def process_cmd(glb, class_name, out_dir):
    spec = CLASS_SPEC[class_name]
    glb = Path(glb)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    gltf = GLTF2().load(str(glb))
    stats = model_stats(glb)
    size = stats["size"]
    dim = stats["height"] if spec.get("dim", "height") == "height" else max(size)
    h_min = spec.get("h_min")
    factor = 1.0
    if h_min is not None and dim > 0 and (dim < spec["h_min"] or dim > spec["h_max"]):
        factor = spec["h_ref"] / dim
    changed = bake_scale(gltf, factor)
    tex_embedded = embed_external_textures(gltf, str(glb.parent))
    out_path = out_dir / glb.name
    gltf.save(str(out_path))
    mods = []
    if abs(factor - 1.0) >= 1e-9:
        mods.append(f"scale x{factor:.4f} baked into node transforms (1 unit = 1 m)")
    else:
        mods.append("scale already 1 unit = 1 m, no change")
    if tex_embedded:
        mods.append(f"{tex_embedded} external texture(s) embedded")
    after = model_stats(out_path)
    print(f"process: {glb} -> {out_path}")
    print(f"  scale factor: x{factor:.4f} ({changed} root nodes)")
    print(f"  height: {dim:.3f} m -> {after['height']:.3f} m")
    print(f"  tris unchanged: {stats['tris']} -> {after['tris']}")
    return {"path": out_path, "scale_factor": factor,
            "modifications": "; ".join(mods)}


# ---------------------------------------------------------------------------
# LOD MID: vertex-clustering mesh decimation in numpy (step 5)
# ---------------------------------------------------------------------------
def collect_soup(glb_path):
    """All world-space primitives merged into one indexed triangle soup."""
    glb_path = Path(glb_path)
    gltf = GLTF2().load(str(glb_path))
    base_dir = str(glb_path.parent)
    positions, uvs, indices = [], [], []
    offset = 0
    for _ni, world, mesh in iter_world_meshes(gltf, base_dir):
        for prim in mesh.primitives:
            wp, _n, uv, idx = primitive_arrays(gltf, prim, world, base_dir)
            if len(wp) == 0:
                continue
            positions.append(wp)
            uvs.append(uv if uv is not None else np.zeros((len(wp), 2)))
            indices.append(idx + offset)
            offset += len(wp)
    if not positions:
        raise ValueError(f"{glb_path}: no geometry found")
    pos = np.vstack(positions)
    uv = np.vstack(uvs)
    idx = np.vstack([i.reshape(-1, 3) for i in indices]).reshape(-1, 3)
    return pos, uv, idx


def vertex_cluster_decimate(pos, idx, uv, target_tris, max_iter=24):
    """Grid-cluster vertices; binary-search the grid so tris ~= target.

    Returns (new_pos, new_idx, new_uv, actual_tris). Deterministic.
    """
    src_tris = len(idx)
    if src_tris <= target_tris:
        return pos, idx, uv, src_tris
    lo, hi = 2, 4096  # grid cells along the longest axis
    best = None
    extent = (pos.max(axis=0) - pos.min(axis=0))
    longest = extent.max() or 1.0
    for _ in range(max_iter):
        res = (lo + hi) // 2
        cell = longest / res
        if cell <= 0:
            break
        key = np.floor((pos - pos.min(axis=0)) / cell).astype(np.int64)
        # ravel cluster ids deterministically
        _, inv = np.unique(key, axis=0, return_inverse=True)
        ncl = inv.max() + 1
        # cluster representatives = centroids
        cnt = np.bincount(inv, minlength=ncl).astype(np.float64)
        cx = np.bincount(inv, weights=pos[:, 0], minlength=ncl) / cnt
        cy = np.bincount(inv, weights=pos[:, 1], minlength=ncl) / cnt
        cz = np.bincount(inv, weights=pos[:, 2], minlength=ncl) / cnt
        ux = np.bincount(inv, weights=uv[:, 0], minlength=ncl) / cnt
        uy = np.bincount(inv, weights=uv[:, 1], minlength=ncl) / cnt
        new_idx = inv[idx]
        # drop degenerate triangles
        keep = (new_idx[:, 0] != new_idx[:, 1]) & \
               (new_idx[:, 1] != new_idx[:, 2]) & \
               (new_idx[:, 0] != new_idx[:, 2])
        tri = new_idx[keep]
        if len(tri):
            # dedupe identical triangles (sorted vertex order)
            srt = np.sort(tri, axis=1)
            _, uidx = np.unique(srt, axis=0, return_index=True)
            tri = tri[np.sort(uidx)]
        ntris = len(tri)
        # compact vertex list to used clusters only
        used = np.unique(tri) if ntris else np.zeros(0, dtype=np.int64)
        remap = np.full(ncl, -1, dtype=np.int64)
        remap[used] = np.arange(len(used))
        new_pos = np.stack([cx[used], cy[used], cz[used]], axis=1)
        new_uv = np.stack([ux[used], uy[used]], axis=1)
        new_idx = remap[tri]
        cand = (new_pos, new_idx, new_uv, ntris)
        if best is None or abs(ntris - target_tris) < abs(best[3] - target_tris):
            best = cand
        if ntris > target_tris:
            hi = res  # too many tris: coarsen grid
        else:
            lo = res  # too few tris: refine grid
        if hi - lo <= 1:
            break
    return best


def averaged_normals(pos, idx):
    nrm = np.zeros_like(pos)
    v0, v1, v2 = pos[idx[:, 0]], pos[idx[:, 1]], pos[idx[:, 2]]
    fn = np.cross(v1 - v0, v2 - v0)
    for k in range(3):
        np.add.at(nrm, idx[:, k], fn)
    ln = np.linalg.norm(nrm, axis=1, keepdims=True)
    return np.divide(nrm, np.where(ln == 0, 1, ln))


def build_glb(path, pos, nrm, uv, idx, texture_png=None, name="mesh"):
    """Write an indexed-triangle GLB."""
    pos = np.ascontiguousarray(pos, dtype=np.float32)
    nrm = np.ascontiguousarray(nrm, dtype=np.float32)
    uv = np.ascontiguousarray(uv, dtype=np.float32)
    idx = np.ascontiguousarray(idx.reshape(-1), dtype=np.uint32)
    blob = pos.tobytes() + nrm.tobytes() + uv.tobytes() + idx.tobytes()
    views, offs = [], 0
    for arr in (pos, nrm, uv, idx):
        nbytes = arr.nbytes
        views.append(BufferView(buffer=0, byteOffset=offs, byteLength=nbytes,
                                target=34962 if arr is not idx else 34963))
        offs += nbytes
    gltf = GLTF2()
    gltf.buffers.append(Buffer(byteLength=0))  # fixed up after texture embed
    gltf.bufferViews.extend(views)
    gltf.accessors.extend([
        Accessor(bufferView=0, componentType=5126, count=len(pos),
                 type="VEC3", min=pos.min(axis=0).tolist(),
                 max=pos.max(axis=0).tolist()),
        Accessor(bufferView=1, componentType=5126, count=len(nrm), type="VEC3"),
        Accessor(bufferView=2, componentType=5126, count=len(uv), type="VEC2"),
        Accessor(bufferView=3, componentType=5125, count=len(idx), type="SCALAR"),
    ])
    mat_index = 0
    if texture_png is not None:
        tstart = len(blob)
        blob += texture_png
        gltf.bufferViews.append(BufferView(buffer=0, byteOffset=tstart,
                                           byteLength=len(texture_png)))
        gltf.images.append(GltfImage(bufferView=len(gltf.bufferViews) - 1,
                                     mimeType="image/png", name="colormap"))
        gltf.textures.append(Texture(source=0))
        gltf.samplers.append(Sampler())
        mat = Material(name="colormap")
        mat.pbrMetallicRoughness = PbrMetallicRoughness(
            baseColorTexture=TextureInfo(index=0))
        gltf.materials.append(mat)
    else:
        gltf.materials.append(Material(name="flat"))
    gltf.meshes.append(Mesh(primitives=[Primitive(
        attributes=Attributes(POSITION=0, NORMAL=1, TEXCOORD_0=2),
        indices=3, material=mat_index, mode=4)])
    )
    gltf.nodes.append(Node(mesh=0, name=name))
    gltf.scenes.append(Scene(nodes=[0]))
    gltf.scene = 0
    gltf.buffers[0].byteLength = len(blob)
    gltf.set_binary_blob(blob)
    gltf.save(str(path))
    return path


# ---------------------------------------------------------------------------
# LOD FAR: billboard impostor from a small software rasterizer (step 5)
# ---------------------------------------------------------------------------
def render_billboard(pos, idx, uv, tex_image, size=256,
                     view_dir=(1.0, 0.55, 1.0)):
    """Orthographic 3/4 view, z-buffered, lambert-shaded, RGBA output.

    Returns (PIL image, footprint_width_m, footprint_height_m).
    """
    fwd = np.array(view_dir, dtype=np.float64)
    fwd /= np.linalg.norm(fwd)
    up = np.array([0.0, 1.0, 0.0])
    right = np.cross(up, fwd)
    right /= np.linalg.norm(right)
    up2 = np.cross(fwd, right)
    cam = np.stack([right, up2, fwd])  # rows: x, y, depth
    pc = (cam @ pos.T).T
    # fit to frame with margin, keep aspect
    mn, mx = pc[:, :2].min(axis=0), pc[:, :2].max(axis=0)
    span = np.maximum(mx - mn, 1e-6)
    margin = 0.06
    scale = (size * (1 - 2 * margin)) / span.max()
    # screen coords (y down)
    sx = (pc[:, 0] - mn[0]) * scale + size * margin
    sy = size * (1 - margin) - (pc[:, 1] - mn[1]) * scale
    depth = pc[:, 2]
    img = np.zeros((size, size, 4), dtype=np.uint8)
    zbuf = np.full((size, size), np.inf)
    tex = np.asarray(tex_image.convert("RGB"), dtype=np.float64) / 255.0
    th, tw = tex.shape[:2]
    light = np.array([0.5, 0.8, 0.6])
    light /= np.linalg.norm(light)
    v0 = pos[idx[:, 0]]
    v1 = pos[idx[:, 1]]
    v2 = pos[idx[:, 2]]
    # face normals in world space for lambert shading
    fn = np.cross(v1 - v0, v2 - v0)
    fl = np.linalg.norm(fn, axis=1, keepdims=True)
    fn = np.divide(fn, np.where(fl == 0, 1, fl))
    shade = 0.35 + 0.65 * np.clip(fn @ light, 0, 1)  # (T,)
    # per-triangle screen verts
    tx = sx[idx]  # (T,3)
    ty = sy[idx]
    tdep = depth[idx]
    tuv = uv[idx]  # (T,3,2)
    for t in range(len(idx)):
        xs, ys = tx[t], ty[t]
        x0, x1 = int(max(xs.min(), 0)), int(min(xs.max(), size - 1))
        y0, y1 = int(max(ys.min(), 0)), int(min(ys.max(), size - 1))
        if x1 < x0 or y1 < y0:
            continue
        # barycentric setup (twice the signed area)
        d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
        if abs(d) < 1e-9:
            continue
        yy, xx = np.mgrid[y0:y1 + 1, x0:x1 + 1]
        w0 = ((ys[1] - ys[2]) * (xx - xs[2]) + (xs[2] - xs[1]) * (yy - ys[2])) / d
        w1 = ((ys[2] - ys[0]) * (xx - xs[2]) + (xs[0] - xs[2]) * (yy - ys[2])) / d
        w2 = 1.0 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        z = w0 * tdep[t, 0] + w1 * tdep[t, 1] + w2 * tdep[t, 2]
        region_z = zbuf[y0:y1 + 1, x0:x1 + 1]
        vis = inside & (z < region_z)
        if not vis.any():
            continue
        uu = (w0 * tuv[t, 0, 0] + w1 * tuv[t, 1, 0] + w2 * tuv[t, 2, 0])
        vv = (w0 * tuv[t, 0, 1] + w1 * tuv[t, 1, 1] + w2 * tuv[t, 2, 1])
        px = np.clip((uu * tw).astype(int), 0, tw - 1)
        py = np.clip(((1.0 - vv) * th).astype(int), 0, th - 1)
        alb = tex[py, px]  # (H,W,3)
        col = np.clip(alb * shade[t], 0, 1)
        ys_idx, xs_idx = np.where(vis)
        img[y0 + ys_idx, x0 + xs_idx, :3] = (col[ys_idx, xs_idx] * 255).astype(np.uint8)
        img[y0 + ys_idx, x0 + xs_idx, 3] = 255
        region_z[vis] = z[vis]
    pil = Image.fromarray(img, "RGBA")
    # footprint in metres: the projected extent on the camera plane
    return pil, float(span[0]), float(span[1])

# ---------------------------------------------------------------------------
# lod: MID decimation + FAR billboard for one source GLB
# ---------------------------------------------------------------------------
def lod_cmd(glb, out_dir):
    glb = Path(glb)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = glb.stem
    pos, uv, idx = collect_soup(glb)
    src_tris = len(idx)
    if uv is None:
        uv = np.zeros((len(pos), 2))

    # ---- MID tier: ~35% of source tris
    target = max(4, int(round(src_tris * 0.35)))
    dpos, didx, duv, mid_tris = vertex_cluster_decimate(pos, idx, uv, target)
    dnrm = averaged_normals(dpos, didx)
    gltf = GLTF2().load(str(glb))
    tex_png = first_base_texture(gltf, str(glb.parent))
    mid_path = out_dir / f"{stem}_mid.glb"
    build_glb(mid_path, dpos, dnrm, duv, didx, texture_png=tex_png,
              name=f"{stem}_mid")
    # verify: reload and count
    check = model_stats(mid_path)
    assert check["tris"] == mid_tris, (check["tris"], mid_tris)

    # ---- FAR tier: billboard impostor
    tex_img = Image.open(io.BytesIO(tex_png)).convert("RGB") if tex_png else None
    if tex_img is None:
        # flat mid-grey fallback so untextured models still get an impostor
        tex_img = Image.new("RGB", (8, 8), (150, 150, 150))
        uv = np.zeros((len(pos), 2))
    img, foot_w, foot_h = render_billboard(pos, idx, uv, tex_img, size=256)
    far_png = out_dir / f"{stem}_far.png"
    img.save(str(far_png))
    # quad sized to the impostor footprint (metres), facing +Z
    hw, hh = foot_w / 2.0, foot_h / 2.0
    qpos = np.array([[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]],
                    dtype=np.float64)
    qnrm = np.array([[0, 0, 1]] * 4, dtype=np.float64)
    quv = np.array([[0, 1], [1, 1], [1, 0], [0, 0]], dtype=np.float64)
    qidx = np.array([[0, 1, 2], [0, 2, 3]], dtype=np.int64)
    with open(far_png, "rb") as f:
        far_tex = f.read()
    far_glb = out_dir / f"{stem}_far.glb"
    build_glb(far_glb, qpos, qnrm, quv, qidx, texture_png=far_tex,
              name=f"{stem}_far")
    # verify: quad really is 2 tris, png decodes with alpha
    qcheck = model_stats(far_glb)
    assert qcheck["tris"] == 2, qcheck["tris"]
    with Image.open(far_png) as im:
        assert im.size == (256, 256) and im.mode == "RGBA"
        alpha = np.asarray(im)[:, :, 3]
        coverage = float((alpha > 0).mean())
    assert coverage > 0.01, "billboard rendered nothing"
    descriptor = {
        "source": glb.name,
        "tier": "far",
        "texture": far_png.name,
        "size_m": [round(foot_w, 4), round(foot_h, 4)],
        "view_dir": [1.0, 0.55, 1.0],
        "coverage": round(coverage, 4),
    }
    far_json = out_dir / f"{stem}_far.json"
    far_json.write_text(json.dumps(descriptor, indent=2))
    print(f"lod: {glb.name}")
    print(f"  close: {src_tris} tris (source)")
    print(f"  mid:   {mid_tris} tris ({mid_tris/src_tris*100:.1f}% of source, "
          f"target 35%) -> {mid_path.name}")
    print(f"  far:   billboard {foot_w:.2f}x{foot_h:.2f} m, "
          f"coverage {coverage*100:.1f}% -> {far_png.name}, {far_glb.name}")
    return {"mid_tris": mid_tris, "src_tris": src_tris,
            "far_png": far_png, "far_glb": far_glb}


# ---------------------------------------------------------------------------
# --update-manifest: append processed entries (ASSETS.md 2.1 fields)
# ---------------------------------------------------------------------------
def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def update_manifest_cmd(processed_dir, class_name, source_id, repo=None,
                        manifest_path=None):
    repo = Path(repo or REPO)
    manifest_path = Path(manifest_path) if manifest_path else repo / "assets" / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    by_id = {a.get("id"): a for a in manifest.get("assets", [])}
    src = by_id.get(source_id)
    if src is None:
        print(f"ERROR: source id '{source_id}' not in {manifest_path}",
              file=sys.stderr)
        return 1
    processed_dir = Path(processed_dir).resolve()
    files = sorted(p for p in processed_dir.rglob("*")
                   if p.is_file() and p.suffix.lower() in (".glb", ".png"))
    if not files:
        print(f"ERROR: no .glb/.png files in {processed_dir}", file=sys.stderr)
        return 1
    existing = set(by_id)
    added = 0
    today = date.today().isoformat()
    for f in files:
        rel = f.relative_to(repo).as_posix()
        stem = f.stem
        if stem.endswith("_mid"):
            base, tier, tiers = stem[:-4], "mid", "mid"
        elif stem.endswith("_far"):
            base, tier, tiers = stem[:-4], "far", "far"
        else:
            base, tier, tiers = stem, "close", "close,mid,far"
        entry_id = f"{source_id}_{base}_{tier}{f.suffix.lower()}"
        if entry_id in existing:
            print(f"  skip (exists): {entry_id}")
            continue
        mods = [f"processed from {src.get('path', source_id)}"]
        if tier == "close":
            mods.append("scale normalised to 1 unit = 1 m (step 4)")
        elif tier == "mid":
            mods.append("vertex-cluster decimated to ~35% tris (step 5)")
        else:
            mods.append("billboard impostor from software rasterizer (step 5)")
        manifest["assets"].append({
            "id": entry_id,
            "path": rel,
            "source_url": src.get("source_url", ""),
            "source_site": src.get("source_site", ""),
            "author": src.get("author", ""),
            "licence": src.get("licence", ""),
            "licence_copy": src.get("licence_copy", ""),
            "date_retrieved": today,
            "attribution_text": src.get("attribution_text", ""),
            "class": class_name,
            "lod_tiers": tiers,
            "modifications": "; ".join(mods),
            "sha256": sha256_file(f),
        })
        existing.add(entry_id)
        added += 1
        print(f"  added: {entry_id} -> {rel}")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"manifest: {added} entries appended to {manifest_path}")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Asset build pipeline: ASSETS.md steps 4-6.")
    ap.add_argument("--update-manifest", action="store_true",
                    help="append processed-file entries to assets/manifest.json")
    ap.add_argument("--processed-dir",
                    help="directory of processed files (with --update-manifest)")
    ap.add_argument("--source-id",
                    help="manifest id of the source pack (with --update-manifest)")
    ap.add_argument("--manifest",
                    help="manifest file to update (default: assets/manifest.json)")
    ap.add_argument("--class", dest="class_name",
                    choices=sorted(CLASS_SPEC),
                    help="asset class (with --update-manifest)")
    sub = ap.add_subparsers(dest="cmd")
    p = sub.add_parser("audit", help="check budgets for one GLB")
    p.add_argument("glb")
    p.add_argument("--class", dest="class_name", required=True,
                   choices=sorted(CLASS_SPEC))
    p = sub.add_parser("process", help="normalise scale, write processed GLB")
    p.add_argument("glb")
    p.add_argument("--class", dest="class_name", required=True,
                   choices=sorted(CLASS_SPEC))
    p.add_argument("--out", required=True, help="output directory")
    p = sub.add_parser("lod", help="generate MID and FAR tiers")
    p.add_argument("glb")
    p.add_argument("--out", required=True, help="output directory")
    args = ap.parse_args(argv)

    if args.update_manifest:
        if not args.processed_dir or not args.class_name or not args.source_id:
            ap.error("--update-manifest needs --processed-dir, --class and --source-id")
        return update_manifest_cmd(args.processed_dir, args.class_name,
                                   args.source_id,
                                   manifest_path=args.manifest)

    if args.cmd == "audit":
        return audit_cmd(args.glb, args.class_name)
    if args.cmd == "process":
        process_cmd(args.glb, args.class_name, args.out)
        return 0
    if args.cmd == "lod":
        lod_cmd(args.glb, args.out)
        return 0
    ap.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
