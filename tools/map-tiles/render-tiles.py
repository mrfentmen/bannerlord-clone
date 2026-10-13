"""Campaign map tile renderer.
Renders slippy-map PNG tiles (z/x/y) of the tactical campaign map from
world-data exports: settlement dots sized by population, road/rail links,
labels for larger towns. Run:
  python3 render-tiles.py --bbox -84.8 38.4 -80.5 41.9 --zooms 6 7 8 \\
      --out tiles --manifest tiles.json
"""
import argparse
import gzip
import json
import math
import os

from PIL import Image, ImageDraw, ImageFont

T = 256
EXPORTS = os.path.expanduser(
    "~/workspace/bannerlord-clone-main/services/world-data/exports")

# tactical-map style (matches era color grade: muted, amber accents)
BG = (24, 29, 34)
GRID = (36, 43, 50)
ROAD = (107, 114, 128)
RAIL = (161, 98, 7)
DOT = (245, 185, 66)
LABEL = (226, 232, 240)


def lonlat_to_px(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n * T
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n * T
    return x, y


def load_settlements(bbox):
    lon0, lat0, lon1, lat1 = bbox
    towns = []
    with gzip.open(f"{EXPORTS}/settlements.jsonl.gz", "rt") as f:
        for line in f:
            r = json.loads(line)
            lo, la = r.get("longitude"), r.get("latitude")
            if ("name" not in r or lo is None or la is None
                    or not (lon0 <= lo <= lon1 and lat0 <= la <= lat1)):
                continue
            towns.append(r)
    return towns


def load_links(bbox):
    """Straight-line road/rail links between in-bbox settlements (v1)."""
    lon0, lat0, lon1, lat1 = bbox
    coords = {}
    with gzip.open(f"{EXPORTS}/settlements.jsonl.gz", "rt") as f:
        for line in f:
            r = json.loads(line)
            lo, la = r.get("longitude"), r.get("latitude")
            if ("settlement_id" in r and lo is not None and la is not None
                    and lon0 <= lo <= lon1 and lat0 <= la <= lat1):
                coords[r["settlement_id"]] = (lo, la)
    links = []
    with gzip.open(f"{EXPORTS}/routes.jsonl.gz", "rt") as f:
        for line in f:
            r = json.loads(line)
            a, b = r.get("from_settlement_id"), r.get("to_settlement_id")
            if a in coords and b in coords:
                links.append((coords[a], coords[b], r.get("kind", "road")))
    return links


def dot_radius(pop):
    if pop >= 100000:
        return 6
    if pop >= 20000:
        return 4.5
    if pop >= 5000:
        return 3
    return 2


def render_tile(z, x, y, towns, links):
    img = Image.new("RGB", (T, T), BG)
    d = ImageDraw.Draw(img)
    # graticule
    for gx in range(0, T, 64):
        d.line([(gx, 0), (gx, T)], fill=GRID)
        d.line([(0, gx), (T, gx)], fill=GRID)
    ox, oy = x * T, y * T

    def proj(lon, lat):
        px, py = lonlat_to_px(lon, lat, z)
        return px - ox, py - oy

    for (lo1, la1), (lo2, la2), kind in links:
        p1, p2 = proj(lo1, la1), proj(lo2, la2)
        if kind == "rail":
            d.line([p1, p2], fill=RAIL, width=2)
        else:
            d.line([p1, p2], fill=ROAD, width=1)
    for t in towns:
        px, py = proj(t["longitude"], t["latitude"])
        if not (-20 <= px <= T + 20 and -20 <= py <= T + 20):
            continue
        r = dot_radius(t.get("population", 0) or 0)
        d.ellipse([px - r, py - r, px + r, py + r], fill=DOT)
        if z >= 7 and (t.get("population", 0) or 0) >= 20000:
            name = t["name"].replace(" city", "")
            d.text((px + r + 3, py - 6), name, fill=LABEL)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", nargs=4, type=float, required=True,
                    metavar=("LON0", "LAT0", "LON1", "LAT1"))
    ap.add_argument("--zooms", nargs="+", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--manifest", default=None)
    a = ap.parse_args()
    towns = load_settlements(a.bbox)
    links = load_links(a.bbox)
    print(f"{len(towns)} settlements, {len(links)} links in bbox")
    count = 0
    for z in a.zooms:
        px0, py1 = lonlat_to_px(a.bbox[0], a.bbox[3], z)  # west, north
        px1, py0 = lonlat_to_px(a.bbox[2], a.bbox[1], z)  # east, south
        x0, x1 = int(px0 // T), int(px1 // T)
        y0, y1 = int(py1 // T), int(py0 // T)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                img = render_tile(z, x, y, towns, links)
                p = os.path.join(a.out, str(z), str(x))
                os.makedirs(p, exist_ok=True)
                img.save(os.path.join(p, f"{y}.png"))
                count += 1
    print(f"{count} tiles -> {a.out}")
    if a.manifest:
        with open(a.manifest, "w") as f:
            json.dump({"bbox": a.bbox, "zooms": a.zooms, "tiles": count,
                       "tile_size": T, "style": "tactical-v1",
                       "sources": ["settlements.jsonl.gz", "routes.jsonl.gz"]},
                      f, indent=2)


if __name__ == "__main__":
    main()
