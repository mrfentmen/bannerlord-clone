#!/usr/bin/env python3
"""Faction banner / insignia generator (ART_AND_AUDIO.md lines 50, 65).

Procedural, deterministic, license-clean: seed from faction id -> picks from
the canonical palette and charge set below. Renders 512x512 PNG + SVG per
faction. These show on uniforms, vehicles, the map, and the UI.

Usage:
    python3 generate-banners.py                      # all six sections
    python3 generate-banners.py --out DIR            # custom output dir
    python3 generate-banners.py pacific_compact      # one faction
"""
import argparse
import hashlib
import math
import os
import sys

from PIL import Image, ImageDraw

# ---------------------------------------------------------------- palette
# Canonical project palette. Per-faction primary/secondary/accent plus the
# global status colors (ART_AND_AUDIO.md line 25 checklist).
PALETTE = {
    "pacific_compact": {
        "name": "Pacific Compact",
        "primary": "#0E3A5D", "secondary": "#7FB5A6", "accent": "#D9A441",
        "charge": "stripes",
    },
    "mountain_alliance": {
        "name": "Mountain Alliance",
        "primary": "#3A4750", "secondary": "#8A8F98", "accent": "#C9A227",
        "charge": "chevron",
    },
    "great_lakes_union": {
        "name": "Great Lakes Union",
        "primary": "#1E5B3A", "secondary": "#D9B45B", "accent": "#5B6B7A",
        "charge": "circle",
    },
    "southern_compact": {
        "name": "Southern Compact",
        "primary": "#8C1D2F", "secondary": "#E8DCC8", "accent": "#A9713F",
        "charge": "tower",
    },
    "lone_star_frontier": {
        "name": "Lone Star Frontier",
        "primary": "#B45A1B", "secondary": "#D9C49A", "accent": "#4A2F1D",
        "charge": "star",
    },
    "atlantic_corridor": {
        "name": "Atlantic Corridor",
        "primary": "#16294D", "secondary": "#A8B0BC", "accent": "#B0703C",
        "charge": "bolt",
    },
}

STATUS = {
    "good": "#3FA34D",
    "warning": "#E8A33D",
    "critical": "#D64545",
}

SIZE = 512
FIELDS = ("shield", "roundel", "banner")  # chosen by hash of faction id


def _hash_pick(faction_id, n):
    h = hashlib.sha256(faction_id.encode()).digest()
    return h[0] % n


# ---------------------------------------------------------------- geometry
# All shapes are built in a 512x512 space as primitive dicts so the PNG and
# SVG renderers share one description.

def star_poly(cx, cy, r_out, r_in, points=5, rot=-90):
    pts = []
    for i in range(points * 2):
        r = r_out if i % 2 == 0 else r_in
        a = math.radians(rot + i * 180 / points)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def charge_shapes(charge, variant):
    """Return list of ('poly', pts) / ('circle', cx, cy, r) / ('rect', box)."""
    c = SIZE / 2
    s = 1.0 + (variant - 1) * 0.06  # subtle deterministic variation
    if charge == "stripes":
        return [("rect", (64, 176 * s, 448, 240 * s)),
                ("rect", (64, 272 * s, 448, 336 * s))]
    if charge == "chevron":
        return [("poly", [(106, 360), (256, 150 * s), (406, 360),
                          (406, 300), (256, 210 * s), (106, 300)])]
    if charge == "circle":
        return [("circle", c, c, 120 * s),
                ("circle", c, c, 88 * s)]  # ring via two circles
    if charge == "star":
        return [("poly", star_poly(c, c, 150 * s, 62 * s))]
    if charge == "tower":
        w, x0 = 150 * s, c - 75 * s
        shapes = [("rect", (x0, 190, x0 + w, 400))]
        for i in range(4):  # battlements
            bx = x0 + i * (w / 4)
            shapes.append(("rect", (bx, 150, bx + w / 4 - 8, 190)))
        shapes.append(("rect", (c - 14, 250, c + 14, 400)))  # gate
        return shapes
    if charge == "bolt":
        return [("poly", [(300, 90), (180, 290), (250, 290),
                          (210, 430), (340, 230), (265, 230)])]
    raise ValueError(charge)


def field_path(kind):
    c = SIZE / 2
    if kind == "roundel":
        return [("circle", c, c, 236)]
    if kind == "banner":
        return [("poly", [(96, 40), (416, 40), (416, 472), (256, 392), (96, 472)])]
    # shield (heater)
    return [("poly", [(96, 60), (416, 60), (416, 260),
                      (256, 470), (96, 260)])]


# ---------------------------------------------------------------- PNG

def render_png(faction_id, out_path):
    spec = PALETTE[faction_id]
    variant = _hash_pick(faction_id, 3)
    field = FIELDS[_hash_pick(faction_id + ":field", len(FIELDS))]
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for shape in field_path(field):
        _draw_png(d, shape, spec["primary"])
    # thin secondary border inset
    for shape in field_path(field):
        _draw_png_outline(d, shape, spec["secondary"], width=10)
    for shape in charge_shapes(spec["charge"], variant):
        _draw_png(d, shape, spec["accent"])
    img.save(out_path)


def _draw_png(d, shape, color):
    kind = shape[0]
    if kind == "poly":
        d.polygon(shape[1], fill=color)
    elif kind == "circle":
        _, cx, cy, r = shape
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)
    elif kind == "rect":
        d.rectangle(shape[1], fill=color)


def _draw_png_outline(d, shape, color, width=10):
    kind = shape[0]
    if kind == "poly":
        d.line(shape[1] + [shape[1][0]], fill=color, width=width, joint="curve")
    elif kind == "circle":
        _, cx, cy, r = shape
        d.ellipse([cx - r + width / 2, cy - r + width / 2,
                   cx + r - width / 2, cy + r - width / 2],
                  outline=color, width=width)


# ---------------------------------------------------------------- SVG

def _svg_shape(shape, fill, stroke=None, sw=0):
    kind = shape[0]
    if kind == "poly":
        pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in shape[1])
        extra = (f' stroke="{stroke}" stroke-width="{sw}"' if stroke else "")
        return f'<polygon points="{pts}" fill="{fill}"{extra}/>'
    if kind == "circle":
        _, cx, cy, r = shape
        extra = (f' stroke="{stroke}" stroke-width="{sw}"' if stroke else "")
        return (f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" '
                f'fill="{fill}"{extra}/>')
    if kind == "rect":
        _, (x0, y0, x1, y1) = shape
        return (f'<rect x="{x0:.1f}" y="{y0:.1f}" '
                f'width="{x1-x0:.1f}" height="{y1-y0:.1f}" fill="{fill}"/>')


def render_svg(faction_id, out_path):
    spec = PALETTE[faction_id]
    variant = _hash_pick(faction_id, 3)
    field = FIELDS[_hash_pick(faction_id + ":field", len(FIELDS))]
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">']
    for shape in field_path(field):
        parts.append(_svg_shape(shape, spec["primary"], spec["secondary"], 10))
    for shape in charge_shapes(spec["charge"], variant):
        parts.append(_svg_shape(shape, spec["accent"]))
    parts.append("</svg>")
    with open(out_path, "w") as f:
        f.write("\n".join(parts) + "\n")


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("faction", nargs="?", help="faction id (default: all)")
    ap.add_argument("--out", default="banners", help="output directory")
    args = ap.parse_args()
    ids = [args.faction] if args.faction else sorted(PALETTE)
    os.makedirs(args.out, exist_ok=True)
    for fid in ids:
        if fid not in PALETTE:
            sys.exit(f"unknown faction '{fid}'. known: {', '.join(sorted(PALETTE))}")
        png = os.path.join(args.out, f"{fid}.png")
        svg = os.path.join(args.out, f"{fid}.svg")
        render_png(fid, png)
        render_svg(fid, svg)
        print(f"{fid}: {png}, {svg}")


if __name__ == "__main__":
    main()
