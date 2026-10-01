#!/usr/bin/env python3
"""Tier 2A-42: Terrain-extraction transform for battle patches.

Extracts a 2km x 2km heightfield patch (64x64 samples at 31.25m) from
terrarium elevation PNG tiles, centered on a settlement.

Terrarium format: elevation_m = R * 256 + G + B / 256 - 32768.
"""

from __future__ import annotations

import io
import math
import sys
from pathlib import Path

try:
    from PIL import Image
    import numpy as np
except ImportError:
    print("PIL and numpy required", file=sys.stderr)
    sys.exit(1)

# Patch spec from docs/BATTLE_TERRAIN.md
PATCH_SIZE_M = 2000.0
GRID_N = 64
SAMPLE_SPACING_M = PATCH_SIZE_M / GRID_N  # 31.25m

# Terrarium tiles are z12 (zoom 12).
TILE_Z = 12


def terrarium_to_elevation(rgb: np.ndarray) -> np.ndarray:
    """Convert terrarium RGB to elevation in metres."""
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    return r * 256.0 + g + b / 256.0 - 32768.0


def latlon_to_tile(lat: float, lon: float, z: int) -> tuple[int, int]:
    """Convert lat/lon to tile x/y at zoom z."""
    n = 2.0 ** z
    x = int((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def tile_to_latlon(x: int, y: int, z: int) -> tuple[float, float]:
    """Convert tile x/y to NW corner lat/lon."""
    n = 2.0 ** z
    lon = x / n * 360.0 - 180.0
    lat_rad = math.atan(math.sinh(math.pi * (1 - 2 * y / n)))
    lat = math.degrees(lat_rad)
    return lat, lon


def extract_patch(
    lat: float,
    lon: float,
    elevation_dir: Path,
) -> np.ndarray:
    """Extract 64x64 heightfield patch centered on lat/lon.

    Returns float32 array of elevations in metres, shape (64, 64),
    row-major north-to-south.
    """
    # Find the tile containing the center.
    cx, cy = latlon_to_tile(lat, lon, TILE_Z)

    # Load the 3x3 tile neighborhood to cover the 2km patch.
    tiles = {}
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            tx, ty = cx + dx, cy + dy
            tile_path = elevation_dir / str(TILE_Z) / str(tx) / f"{ty}.png"
            if tile_path.exists():
                img = Image.open(tile_path).convert("RGB")
                arr = np.array(img)
                tiles[(tx, ty)] = terrarium_to_elevation(arr)
            else:
                # Missing tile: fill with zeros (will be smoothed).
                tiles[(tx, ty)] = np.zeros((256, 256), dtype=np.float32)

    # Stitch into a 768x768 elevation grid.
    stitched = np.zeros((768, 768), dtype=np.float32)
    for (tx, ty), elev in tiles.items():
        ox = (tx - (cx - 1)) * 256
        oy = (ty - (cy - 1)) * 256
        stitched[oy:oy+256, ox:ox+256] = elev

    # Find the center pixel in the stitched grid.
    # Tile NW corner:
    center_lat, center_lon = lat, lon
    # Convert center lat/lon to pixel in the center tile.
    n = 2.0 ** TILE_Z
    # X pixel in center tile:
    x_tile = (center_lon + 180.0) / 360.0 * n - cx
    x_px = int(x_tile * 256)
    # Y pixel:
    lat_rad = math.radians(center_lat)
    y_tile = (1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n - cy
    y_px = int(y_tile * 256)

    # Center in stitched coordinates:
    sx = 256 + x_px
    sy = 256 + y_px

    # 2km patch at z12: each tile is ~ (40075km / 2^12) ≈ 9.78km at equator.
    # At lat ~40°, ~7.5km. 2km ≈ 68 pixels (at 256px per ~7.5km).
    # Calculate metres per pixel at this latitude.
    tile_lat_nw, _ = tile_to_latlon(cx, cy, TILE_Z)
    tile_lat_se, _ = tile_to_latlon(cx, cy + 1, TILE_Z)
    tile_height_m = (tile_lat_nw - tile_lat_se) * 111320.0
    m_per_px = tile_height_m / 256.0
    patch_px = int(PATCH_SIZE_M / m_per_px)

    # Extract square patch.
    half = patch_px // 2
    x0 = max(0, sx - half)
    y0 = max(0, sy - half)
    x1 = min(768, x0 + patch_px)
    y1 = min(768, y0 + patch_px)
    patch = stitched[y0:y1, x0:x1]

    # Resample to 64x64 via PIL.
    patch_img = Image.fromarray(patch)
    patch_64 = patch_img.resize((GRID_N, GRID_N), Image.BILINEAR)
    result = np.array(patch_64, dtype=np.float32)

    return result


def main() -> int:
    # Demo: extract patch for a test coordinate.
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--lat", type=float, required=True)
    p.add_argument("--lon", type=float, required=True)
    p.add_argument("--elevation-dir", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()

    patch = extract_patch(args.lat, args.lon, args.elevation_dir)
    print(f"patch shape: {patch.shape}, range: {patch.min():.1f} to {patch.max():.1f}m")

    # Save as numpy for inspection.
    np.save(args.out, patch)
    print(f"saved to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
