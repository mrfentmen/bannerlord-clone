#!/usr/bin/env python3
"""finger_curl.py — add natural finger curl to static hand poses in a GLB.

The operator GLBs have finger joints with animation channels, but the relaxed
clips (idle, crouch_idle, ...) carry nearly-straight static finger poses
(~12-15 deg avg). This script scales those rotations outward from identity
(slerp), which preserves each joint's curl axis and only deepens the curl.

Usage:
    finger_curl.py in.glb out.glb --anims idle,crouch_idle --factor 1.6
    finger_curl.py in.glb out.glb --preset relaxed --factor 1.6 --dry-run

Notes:
- Only touches rotation channels of finger joints (index/middle/ring/pinky);
  thumbs are excluded by default (--thumbs to include) since their large
  opposition angles must not be exaggerated.
- BIN bytes are patched in place; JSON chunk is untouched.
"""
import argparse, struct, json, math
import numpy as np

FINGER_KEYS = ("index", "middle", "ring", "pinky")
THUMB_KEYS = ("thumb",)
RELAXED = ["idle", "walk", "run", "sprint", "crouch_idle", "crouch_walk",
           "prone", "downed", "hit", "death", "jump", "slide", "interact", "pickup"]

def load(path):
    with open(path, "rb") as f:
        data = bytearray(f.read())
    assert data[0:4] == b"glTF"
    jlen = struct.unpack("<I", data[12:16])[0]
    js = json.loads(bytes(data[20:20 + jlen]))
    off = 20 + jlen
    assert struct.unpack("<I", data[off:off + 4])[0] == len(data) - off - 8 or True
    blen = struct.unpack("<I", data[off:off + 4])[0]
    binoff = off + 8
    return data, js, binoff

def slerp_scale(q, k):
    # q' = slerp(identity, q, k); axis-preserving curl deepening
    x, y, z, w = (float(v) for v in q)
    n = math.sqrt(x*x + y*y + z*z + w*w) or 1.0
    x, y, z, w = x/n, y/n, z/n, w/n
    ang = 2 * math.acos(min(1.0, abs(w)))
    if ang < 1e-6:
        return (0.0, 0.0, 0.0, 1.0)
    s = math.sin(ang / 2) or 1e-9
    ax, ay, az = x/s, y/s, z/s
    na = ang * k
    hs = math.sin(na / 2)
    return (ax*hs, ay*hs, az*hs, math.cos(na / 2))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--anims", default="", help="comma-separated clip names")
    ap.add_argument("--preset", choices=["relaxed"], default=None)
    ap.add_argument("--factor", type=float, default=1.6)
    ap.add_argument("--thumbs", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    data, js, binoff = load(a.inp)
    nodes, accs, bvs = js["nodes"], js["accessors"], js["bufferViews"]
    keys = FINGER_KEYS + (THUMB_KEYS if a.thumbs else ())
    finger_nodes = {i for i, n in enumerate(nodes)
                    if any(k in (n.get("name") or "").lower() for k in keys)}
    targets = set(a.anims.split(",")) if a.anims else set()
    if a.preset == "relaxed":
        targets |= set(RELAXED)
    anims = {x["name"]: x for x in js.get("animations", [])}
    _lower = {k.lower(): k for k in anims}
    targets = {_lower.get(t.lower(), t) for t in targets}
    missing = [t for t in targets if t not in anims]
    if missing:
        print("clips not in file:", missing)

    patched, before, after = 0, [], []
    for name in targets & set(anims):
        an = anims[name]
        for ch in an["channels"]:
            if ch["target"]["path"] != "rotation":
                continue
            if ch["target"]["node"] not in finger_nodes:
                continue
            s = an["samplers"][ch["sampler"]]
            ac = accs[s["output"]]
            assert ac["componentType"] == 5126 and ac["type"] == "VEC4", "unexpected accessor"
            bv = bvs[ac["bufferView"]]
            start = binoff + bv.get("byteOffset", 0) + ac.get("byteOffset", 0)
            assert bv.get("byteStride", 16) in (0, 16)
            for r in range(ac["count"]):
                o = start + r * 16
                q = struct.unpack("<4f", data[o:o + 16])
                ang0 = 2 * math.degrees(math.acos(min(1.0, abs(q[3]))))
                q2 = slerp_scale(q, a.factor)
                ang1 = 2 * math.degrees(math.acos(min(1.0, abs(q2[3]))))
                before.append(ang0); after.append(ang1)
                if not a.dry_run:
                    data[o:o + 16] = struct.pack("<4f", *q2)
            patched += 1

    if before:
        print(f"clips={sorted(targets & set(anims))} channels={patched} "
              f"avg {sum(before)/len(before):.1f}deg -> {sum(after)/len(after):.1f}deg, "
              f"max {max(before):.1f}deg -> {max(after):.1f}deg")
    else:
        print("nothing patched (no matching finger channels)")
    if not a.dry_run and patched:
        with open(a.out, "wb") as f:
            f.write(data)
        print("wrote", a.out)

if __name__ == "__main__":
    main()
