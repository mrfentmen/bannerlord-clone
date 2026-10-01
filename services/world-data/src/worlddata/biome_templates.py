"""Tier 2A-44 to 53: Biome templates for battle patches.

Each template generates cover objects and terrain modifiers for its biome.
Cover objects follow the contract in docs/BATTLE_TERRAIN.md:
  {type, x, y, height_m, radius_m, rotation_deg}
"""

from __future__ import annotations

import math
import random


def _rand(rng: random.Random, lo: float, hi: float) -> float:
    return rng.uniform(lo, hi)


def city_template(rng: random.Random, patch_size_m: float = 2000.0) -> list[dict]:
    """Tier 2A-44: Urban — building footprints as cover/obstacles.

    Generates a street grid with buildings. Without NYC building-footprint
    data in the pipeline, uses a procedural grid with realistic densities.
    """
    covers = []
    half = patch_size_m / 2
    # Street grid: blocks of ~120m.
    block = 120.0
    # Buildings per block: 2-4 (keeps byte budget safe).
    x = -half + block / 2
    while x < half:
        y = -half + block / 2
        while y < half:
            n_buildings = rng.randint(2, 4)
            for _ in range(n_buildings):
                bx = x + _rand(rng, -block/3, block/3)
                by = y + _rand(rng, -block/3, block/3)
                # Building size: 15-40m footprint, 8-60m height.
                size = _rand(rng, 15, 40)
                height = _rand(rng, 8, 60)
                covers.append({
                    "type": "building",
                    "x": round(bx, 1),
                    "y": round(by, 1),
                    "height_m": round(height, 1),
                    "radius_m": round(size / 2, 1),
                    "rotation_deg": round(_rand(rng, 0, 90), 1),
                })
            y += block
        x += block
    return covers


def forest_template(rng: random.Random, patch_size_m: float = 2000.0) -> list[dict]:
    """Tier 2A-45: Forest — tree density + canopy height.

    Without NLCD canopy data, uses density proxy: 150-300 trees per patch.
    """
    covers = []
    half = patch_size_m / 2
    n_trees = rng.randint(150, 300)
    for _ in range(n_trees):
        covers.append({
            "type": "tree",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 8, 25), 1),  # canopy height
            "radius_m": round(_rand(rng, 2, 5), 1),   # trunk + canopy
            "rotation_deg": 0.0,
        })
    return covers


def plains_template(rng: random.Random, patch_size_m: float = 2000.0) -> list[dict]:
    """Tier 2A-46: Plains — open terrain, cover density ≈ 0, LOS max.

    Sparse rocks and the occasional lone tree.
    """
    covers = []
    half = patch_size_m / 2
    # 5-15 scattered rocks.
    for _ in range(rng.randint(5, 15)):
        covers.append({
            "type": "rock",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 1, 3), 1),
            "radius_m": round(_rand(rng, 1, 4), 1),
            "rotation_deg": round(_rand(rng, 0, 360), 1),
        })
    return covers


def snow_template(rng: random.Random, patch_size_m: float = 2000.0) -> list[dict]:
    """Tier 2A-47: Snow — movement modifiers + visual flags.

    Returns cover objects (sparse trees/rocks) plus a modifiers dict.
    The modifiers are attached to the patch metadata, not cover objects.
    """
    covers = plains_template(rng, patch_size_m)
    # Add snow-specific: fewer trees, more rocks.
    half = patch_size_m / 2
    for _ in range(rng.randint(10, 30)):
        covers.append({
            "type": "tree",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 5, 15), 1),
            "radius_m": round(_rand(rng, 2, 4), 1),
            "rotation_deg": 0.0,
        })
    return covers


def snow_modifiers() -> dict:
    """Movement modifiers for snow biome."""
    return {
        "movement_multiplier": 0.7,  # 30% slower in snow
        "visual_flags": ["snow_cover", "reduced_visibility"],
    }


def river_template(rng: random.Random, patch_size_m: float = 2000.0) -> list[dict]:
    """Tier 2A-48: River-crossing — bridge/ford records.

    Generates a river running north-south with a bridge and ford.
    The water mask (from the contract) marks the river cells.
    """
    covers = []
    half = patch_size_m / 2
    # River is at x=0, width ~60m. Bridge at y=0, ford at y=400.
    # Bridge: a wall-like structure across the river.
    covers.append({
        "type": "wall",
        "x": 0.0,
        "y": 0.0,
        "height_m": 3.0,
        "radius_m": 35.0,  # bridge length
        "rotation_deg": 90.0,  # east-west
    })
    # Ford: shallow crossing marked by rocks.
    for i in range(5):
        covers.append({
            "type": "rock",
            "x": round(_rand(rng, -20, 20), 1),
            "y": round(400 + _rand(rng, -10, 10), 1),
            "height_m": 0.5,
            "radius_m": 2.0,
            "rotation_deg": 0.0,
        })
    # Sparse trees along banks.
    for _ in range(rng.randint(20, 40)):
        side = rng.choice([-1, 1])
        covers.append({
            "type": "tree",
            "x": round(side * _rand(rng, 50, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 8, 20), 1),
            "radius_m": round(_rand(rng, 2, 4), 1),
            "rotation_deg": 0.0,
        })
    return covers


def desert_template(rng: random.Random, patch_size_m: float = 2000.0) -> list[dict]:
    """Tier 2A-49: Desert — southwestern, sparse vegetation.

    Without NLCD shrubland data, uses sparse rocks and dry bushes (as trees
    with low height).
    """
    covers = []
    half = patch_size_m / 2
    # Scattered rocks.
    for _ in range(rng.randint(30, 60)):
        covers.append({
            "type": "rock",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 0.5, 2.5), 1),
            "radius_m": round(_rand(rng, 1, 3), 1),
            "rotation_deg": round(_rand(rng, 0, 360), 1),
        })
    # Dry shrubs (low trees).
    for _ in range(rng.randint(40, 80)):
        covers.append({
            "type": "tree",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 1, 3), 1),
            "radius_m": round(_rand(rng, 1, 2), 1),
            "rotation_deg": 0.0,
        })
    return covers


def hills_template(rng: random.Random, patch_size_m: float = 2000.0) -> list[dict]:
    """Tier 2A-50: Hills — slope-derived, rocky outcrops.

    More rocks and elevation variance. The heightfield itself carries the
    slope; this adds rocky cover.
    """
    covers = []
    half = patch_size_m / 2
    for _ in range(rng.randint(60, 120)):
        covers.append({
            "type": "rock",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 2, 8), 1),
            "radius_m": round(_rand(rng, 2, 6), 1),
            "rotation_deg": round(_rand(rng, 0, 360), 1),
        })
    # Sparse trees in valleys.
    for _ in range(rng.randint(20, 40)):
        covers.append({
            "type": "tree",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 6, 15), 1),
            "radius_m": round(_rand(rng, 2, 4), 1),
            "rotation_deg": 0.0,
        })
    return covers


def swamp_template(rng: random.Random, patch_size_m: float = 2000.0) -> list[dict]:
    """Tier 2A-51: Swamp — wetlands, water obstacles, dense vegetation.

    Without NLCD wetland data, uses water pools (as obstacles) and dense
    low trees.
    """
    covers = []
    half = patch_size_m / 2
    # Water pools (impassable, marked as rocks for collision).
    for _ in range(rng.randint(8, 15)):
        covers.append({
            "type": "rock",  # water pool proxy
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": 0.2,
            "radius_m": round(_rand(rng, 20, 60), 1),
            "rotation_deg": 0.0,
        })
    # Dense cypress-like trees.
    for _ in range(rng.randint(100, 200)):
        covers.append({
            "type": "tree",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 10, 20), 1),
            "radius_m": round(_rand(rng, 3, 6), 1),
            "rotation_deg": 0.0,
        })
    return covers


def coastal_template(rng: random.Random, patch_size_m: float = 2000.0) -> list[dict]:
    """Tier 2A-52: Coastal — beach/water mask from place boundaries.

    The water mask marks the ocean; this adds beach obstacles and
    coastal vegetation.
    """
    covers = []
    half = patch_size_m / 2
    # Beach is at y < -500 (south edge is water). Dunes as low rocks.
    for _ in range(rng.randint(20, 40)):
        covers.append({
            "type": "rock",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, -300), 1),
            "height_m": round(_rand(rng, 1, 3), 1),
            "radius_m": round(_rand(rng, 3, 8), 1),
            "rotation_deg": 0.0,
        })
    # Palm-like trees inland.
    for _ in range(rng.randint(30, 60)):
        covers.append({
            "type": "tree",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -200, half), 1),
            "height_m": round(_rand(rng, 8, 15), 1),
            "radius_m": round(_rand(rng, 2, 4), 1),
            "rotation_deg": 0.0,
        })
    return covers


def industrial_template(rng: random.Random, patch_size_m: float = 2000.0) -> list[dict]:
    """Tier 2A-53: Industrial — factory/warehouse zones.

    Without land-use data, uses large warehouse buildings and storage
    tanks (as rocks) in a zoned layout.
    """
    covers = []
    half = patch_size_m / 2
    # Warehouse district: large rectangular buildings.
    for _ in range(rng.randint(8, 15)):
        covers.append({
            "type": "building",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 10, 20), 1),
            "radius_m": round(_rand(rng, 30, 60), 1),
            "rotation_deg": round(rng.choice([0, 90]), 1),
        })
    # Storage tanks.
    for _ in range(rng.randint(10, 20)):
        covers.append({
            "type": "rock",  # tank proxy
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": round(_rand(rng, 8, 15), 1),
            "radius_m": round(_rand(rng, 8, 15), 1),
            "rotation_deg": 0.0,
        })
    # Parked vehicles.
    for _ in range(rng.randint(20, 40)):
        covers.append({
            "type": "vehicle",
            "x": round(_rand(rng, -half, half), 1),
            "y": round(_rand(rng, -half, half), 1),
            "height_m": 3.0,
            "radius_m": 6.0,
            "rotation_deg": round(_rand(rng, 0, 360), 1),
        })
    return covers


# Registry: biome name -> template function.
TEMPLATES = {
    "city": city_template,
    "forest": forest_template,
    "plains": plains_template,
    "snow": snow_template,
    "river": river_template,
    "desert": desert_template,
    "hills": hills_template,
    "swamp": swamp_template,
    "coastal": coastal_template,
    "industrial": industrial_template,
}


def generate_cover(biome: str, seed: int) -> list[dict]:
    """Generate cover objects for a biome with a deterministic seed."""
    if biome not in TEMPLATES:
        raise ValueError(f"unknown biome: {biome}")
    rng = random.Random(seed)
    return TEMPLATES[biome](rng)
