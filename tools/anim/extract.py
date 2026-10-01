"""Extract animation clips from source GLBs into shared-skeleton joint space.

A Clip is plain data: per frame, one quaternion per animated shared-skeleton
joint plus a root translation. Everything downstream (bake, manifest) works
from Clips, so extraction is the only stage that ever touches a source file.
"""

import numpy as np

import gltf as gltf_mod
import retarget

FPS = 30


class Clip:
    def __init__(self, name, frames, loop, source, license, root_policy):
        self.name = name
        self.frames = frames        # list of {"rot": {joint: (4,)}, "root": (3,)}
        self.loop = loop
        self.source = source        # "file.glb :: AnimationName"
        self.license = license
        self.root_policy = root_policy  # "in-place" | "as-authored"
        # sample_fn(t) reproduces the frame at an arbitrary time; producers
        # set it so verification can probe the true loop point t=duration.
        self.sample_fn = None
        self.exact_duration = len(frames) / FPS

    @property
    def duration(self):
        return len(self.frames) / FPS

    @property
    def joints(self):
        seen = set()
        for f in self.frames:
            seen.update(f["rot"].keys())
        return sorted(seen)


def _node_world_translation(gltf, node_idx, local):
    """World translation of a node given {node_idx: (T, R, S)} local overrides."""
    chain = []
    i = node_idx
    while i is not None:
        chain.append(i)
        i = gltf.parent.get(i)
    # Full matrix walk, root down. Scale matters: the three.js example
    # models carry a 0.01 scene scale (centimetres to metres); dropping it
    # inflates every root-motion measurement 100x.
    m = np.eye(4)
    for i in reversed(chain):
        t, r, s = local[i]
        m = m @ _tr_matrix(t, r, s)
    return m[:3, 3]


def _tr_matrix(t, q, s=None):
    x, y, z, w = q
    n = x * x + y * y + z * z + w * w
    f = 2.0 / n if n > 1e-12 else 0.0
    r = np.array([
        [1 - f * (y * y + z * z), f * (x * y - z * w), f * (x * z + y * w)],
        [f * (x * y + z * w), 1 - f * (x * x + z * z), f * (y * z - x * w)],
        [f * (x * z - y * w), f * (y * z + x * w), 1 - f * (x * x + y * y)],
    ])
    if s is not None:
        r = r * np.asarray(s, dtype=np.float64)
    m = np.eye(4)
    m[:3, :3] = r
    m[:3, 3] = t
    return m


def _local_all(gltf, pose):
    out = {}
    for n in gltf.nodes:
        e = pose.get(n.index) if pose else None
        out[n.index] = ((e["translation"] if e else n.translation),
                        (e["rotation"] if e else n.rotation),
                        (e["scale"] if e else n.scale))
    return out


def _motion_node(gltf, anim, node_names):
    """Pick the node that actually carries root motion, if any.

    Compares the animated world translation at the clip start vs the clip
    end; the reference is the clip itself, never the rest pose.
    """
    best, best_range = None, 0.0
    pose0 = gltf_mod.sample_animation(gltf, anim, 0.0)
    pose1 = gltf_mod.sample_animation(gltf, anim, anim.duration)
    local0, local1 = _local_all(gltf, pose0), _local_all(gltf, pose1)
    for cname in retarget.ROOT_MOTION_CANDIDATES:
        idx = node_names.get(cname)
        if idx is None:
            continue
        p0 = _node_world_translation(gltf, idx, local0)
        p1 = _node_world_translation(gltf, idx, local1)
        r = float(np.linalg.norm(p1 - p0))
        if r > best_range:
            best, best_range = idx, r
    return best if best_range > 1e-4 else None


def extract_clip(gltf, anim_name, rig, clip_name, loop, license, root_policy):
    """Sample a named animation into a Clip in shared-skeleton joint space."""
    if rig not in retarget.RIG_MAPS:
        raise gltf_mod.GltfError(f"unknown rig {rig!r}")
    amap = retarget.RIG_MAPS[rig]
    anim = gltf.animation_by_name(anim_name)
    node_names = {n.name: n.index for n in gltf.nodes}
    # Reverse map: source node name -> skeleton joint, for animated nodes only.
    anim_nodes = {ch.node for ch in anim.channels}
    transfer = {}
    for idx in anim_nodes:
        sname = gltf.nodes[idx].name
        joint = amap.get(sname)
        if joint is not None:
            transfer[idx] = (joint, gltf.nodes[idx].rotation.copy())

    motion_idx = _motion_node(gltf, anim, node_names)
    # Root-motion reference: the clip's own start pose, so every clip begins
    # at the origin and loop closure measures real motion, not a constant
    # offset between the authored rest pose and the animation.
    w0 = None
    if motion_idx is not None:
        pose0 = gltf_mod.sample_animation(gltf, anim, 0.0)
        w0 = _node_world_translation(gltf, motion_idx, _local_all(gltf, pose0))

    def sample_frame(t):
        pose = gltf_mod.sample_animation(gltf, anim, t)
        rot = {}
        for idx, (joint, rest_q) in transfer.items():
            e = pose.get(idx)
            q = e["rotation"] if e else gltf.nodes[idx].rotation
            rot[joint] = retarget.relative_rotation(rest_q, q)
        root = np.zeros(3)
        if motion_idx is not None:
            w = _node_world_translation(gltf, motion_idx, _local_all(gltf, pose))
            root = w - w0
            if root_policy == "in-place":
                root = np.array([0.0, root[1], 0.0])
        return {"rot": rot, "root": root}

    nframes = max(2, int(round(anim.duration * FPS)))
    frames = []
    for i in range(nframes):
        t = (i / FPS) if not loop else (i / nframes) * anim.duration
        if not loop:
            t = min(t, anim.duration)
        frames.append(sample_frame(t))

    src = f"{gltf_path_name(gltf)} :: {anim_name}"
    clip = Clip(clip_name, frames, loop, src, license, root_policy)
    clip.sample_fn = sample_frame
    clip.exact_duration = anim.duration if loop else len(frames) / FPS
    return clip


def gltf_path_name(gltf):
    return getattr(gltf, "path_name", "source.glb")


def load_source(path):
    g = gltf_mod.load(path)
    g.path_name = path.name if hasattr(path, "name") else str(path)
    return g
