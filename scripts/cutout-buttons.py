#!/usr/bin/env python3
"""
Button cutout pipeline (del order 2026-10-04).

Cuts individual buttons out of the AI-generated button sheets in
clients/campaign/public/art/ui/buttons-*.webp and saves each as a
single cropped image in public/art/ui/cut/.

Detection: sheets use a dark background; buttons are bright bordered
rects. Threshold -> connected components -> size filter -> reading-order sort.

Usage:
    python3 scripts/cutout-buttons.py [sheet-name ...]   # specific sheets, or all
    python3 scripts/cutout-buttons.py --force            # re-cut everything
    python3 scripts/cutout-buttons.py --list             # show detected counts only
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

REPO = Path("/home/hatch/workspace/bannerlord-clone")
UI_DIR = REPO / "clients/campaign/public/art/ui"
CUT_DIR = UI_DIR / "cut"
MANIFEST = CUT_DIR / "manifest.json"

BG_THRESHOLD = 52         # (unused now; threshold is adaptive, see detect_buttons)
MIN_AREA_FRAC = 0.005    # ignore specks smaller than 0.5% of image area
PAD_FRAC = 0.008         # padding around each button, fraction of image width
CLOSE_SIZE = 25          # morphological closing to merge border+interior+text

# Per-sheet overrides. Sheets with heavy outer glow need an opening pass to
# sever the glow bridges between adjacent buttons before closing.
# Format: sheet-stem -> {"open": kernel_size}
SHEET_OVERRIDES = {
    "buttons-battle-orders": {"open": 21},
    "buttons-party-manage": {"open": 21},
    "buttons-siege": {"open": 21},
    "buttons-trade-barter": {"open": 21},
}


def detect_buttons(sheet: Path):
    img = Image.open(sheet).convert("RGB")
    w, h = img.size
    gray = np.asarray(img.convert("L")).astype(np.int16)
    # Adaptive threshold: sample background from the image border, since
    # sheets vary (dark ~38 on most, light gray ~85 on a few).
    edge = 12
    border = np.concatenate([
        gray[:edge, :].ravel(), gray[-edge:, :].ravel(),
        gray[:, :edge].ravel(), gray[:, -edge:].ravel(),
    ])
    bg = float(np.median(border))
    # Buttons differ from the background in either direction: bright gold
    # borders/text on dark sheets, dark metal interiors on light sheets.
    mask = np.abs(gray - bg) > 22
    # Sheets with heavy outer glow need an opening pass first to sever the
    # glow bridges between adjacent buttons.
    override = SHEET_OVERRIDES.get(sheet.stem, {})
    if override.get("open"):
        mask = ndimage.binary_opening(mask, structure=np.ones((override["open"], override["open"])))
    # Close gaps so each button's border + interior + text merge into one blob.
    mask = ndimage.binary_closing(mask, structure=np.ones((CLOSE_SIZE, CLOSE_SIZE)))
    labeled, n = ndimage.label(mask)
    boxes = []
    min_area = w * h * MIN_AREA_FRAC
    for i in range(1, n + 1):
        ys, xs = np.nonzero(labeled == i)
        if len(xs) == 0:
            continue
        area = len(xs)
        if area < min_area:
            continue
        x0, x1 = xs.min(), xs.max()
        y0, y1 = ys.min(), ys.max()
        bw, bh = x1 - x0, y1 - y0
        # buttons are rects; drop slivers and the whole-image blob
        if bw < w * 0.05 or bh < h * 0.05:
            continue
        if bw > w * 0.95 and bh > h * 0.95:
            continue
        boxes.append((int(x0), int(y0), int(x1), int(y1)))
    # reading order: group into rows by y-center, sort rows top-down, cols left-right
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows = []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        placed = False
        for row in rows:
            rcy = sum((x[1] + x[3]) / 2 for x in row) / len(row)
            rh = sum(x[3] - x[1] for x in row) / len(row)
            if abs(cy - rcy) < rh * 0.6:
                row.append(b)
                placed = True
                break
        if not placed:
            rows.append([b])
    ordered = []
    for row in rows:
        row.sort(key=lambda b: b[0])
        ordered.extend(row)
    return img, ordered


def cut_sheet(sheet: Path, force: bool = False, dry_run: bool = False):
    name = sheet.stem  # e.g. buttons-main-menu
    img, boxes = detect_buttons(sheet)
    w, h = img.size
    pad = int(w * PAD_FRAC)
    out_files = []
    for i, (x0, y0, x1, y1) in enumerate(boxes, 1):
        out = CUT_DIR / f"{name}-{i:02d}.webp"
        out_files.append(out.name)
        if dry_run:
            continue
        if out.exists() and not force:
            continue
        crop = img.crop((
            max(0, x0 - pad), max(0, y0 - pad),
            min(w, x1 + pad), min(h, y1 + pad),
        ))
        crop.save(out, "WEBP", quality=92)
    return out_files, boxes


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    dry_run = "--list" in sys.argv
    if not dry_run:
        CUT_DIR.mkdir(parents=True, exist_ok=True)

    sheets = sorted(UI_DIR.glob("buttons-*.webp"))
    if args:
        wanted = set(args)
        sheets = [s for s in sheets if s.stem in wanted or s.stem.replace("buttons-", "") in wanted]
    if not sheets:
        print("no sheets matched")
        return 1

    manifest = {}
    if MANIFEST.exists() and not dry_run:
        manifest = json.loads(MANIFEST.read_text())

    for sheet in sheets:
        files, boxes = cut_sheet(sheet, force=force, dry_run=dry_run)
        manifest[sheet.stem] = {
            "source": sheet.name,
            "count": len(boxes),
            "boxes": boxes,
            "files": files,
        }
        print(f"{sheet.stem}: {len(boxes)} buttons -> {files[0] if files else 'none'} ...")

    if not dry_run:
        MANIFEST.write_text(json.dumps(manifest, indent=1))
        total = sum(m["count"] for m in manifest.values())
        print(f"manifest: {len(manifest)} sheets, {total} buttons cut -> {CUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
