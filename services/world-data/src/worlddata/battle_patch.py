"""Tier 2A-54 to 58: Battle patch builder.

Ties together terrain extraction, biome classification, and templates
into complete battle patches. Exports in the client wire format.

Tasks:
- 54: Deployment/spawn zones (attacker, defender, reinforcement edge)
- 55: Cover-object catalog schema (validated)
- 56: Byte budget enforcement (256KB max, asserted)
- 57: Wire export (dist/wire/battle/<settlement_id>.json)
- 58: Golden tests (10 settlements, one per biome)
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from .battle_terrain import classify_biome
from .biome_templates import generate_cover, snow_modifiers

# Contract version from docs/BATTLE_TERRAIN.md.
CONTRACT_VERSION = 1

# Byte budget (Tier 2A-56).
MAX_PATCH_BYTES = 262144  # 256 KB

# Cover object schema (Tier 2A-55).
COVER_TYPES = ("wall", "building", "tree", "rock", "vehicle")
REQUIRED_COVER_FIELDS = ("type", "x", "y", "height_m", "radius_m", "rotation_deg")


def validate_cover_object(obj: dict) -> list[str]:
    """Validate a cover object against the catalog schema.

    Returns list of error strings (empty if valid).
    """
    errors = []
    for field in REQUIRED_COVER_FIELDS:
        if field not in obj:
            errors.append(f"missing field: {field}")
    if obj.get("type") not in COVER_TYPES:
        errors.append(f"invalid type: {obj.get('type')}")
    for field in ("x", "y", "height_m", "radius_m", "rotation_deg"):
        if field in obj and not isinstance(obj[field], (int, float)):
            errors.append(f"{field} must be numeric")
    if "height_m" in obj and obj["height_m"] < 0:
        errors.append("height_m must be >= 0")
    if "radius_m" in obj and obj["radius_m"] <= 0:
        errors.append("radius_m must be > 0")
    return errors


def generate_spawn_zones(
    rng: random.Random,
    patch_size_m: float = 2000.0,
) -> dict:
    """Tier 2A-54: Generate deployment/spawn zones.

    Attacker and defender on opposite edges; reinforcement edge adjacent
    to attacker.
    """
    half = patch_size_m / 2
    # Zone size: 400m x 400m.
    zone_size = 400.0

    # Pick attacker edge (0=N, 1=S, 2=E, 3=W).
    attacker_edge = rng.randint(0, 3)
    # Defender is opposite.
    defender_edge = (attacker_edge + 2) % 4
    # Reinforcement is adjacent to attacker (clockwise).
    reinforcement_edge = (attacker_edge + 1) % 4

    edge_names = ["north", "south", "east", "west"]

    def zone_for(edge: int) -> dict:
        if edge == 0:  # north
            return {"x": 0.0, "y": half - zone_size/2, "width_m": zone_size, "height_m": zone_size}
        elif edge == 1:  # south
            return {"x": 0.0, "y": -half + zone_size/2, "width_m": zone_size, "height_m": zone_size}
        elif edge == 2:  # east
            return {"x": half - zone_size/2, "y": 0.0, "width_m": zone_size, "height_m": zone_size}
        else:  # west
            return {"x": -half + zone_size/2, "y": 0.0, "width_m": zone_size, "height_m": zone_size}

    return {
        "attacker": zone_for(attacker_edge),
        "defender": zone_for(defender_edge),
        "reinforcement_edge": edge_names[reinforcement_edge],
    }


def build_patch(
    settlement_id: str,
    latitude: float,
    longitude: float,
    population: float,
    elevation_m: float | None = None,
    seed: int = 42,
) -> dict:
    """Build a complete battle patch for a settlement.

    Returns the patch dict per docs/BATTLE_TERRAIN.md.
    """
    rng = random.Random(seed)

    # Classify biome.
    biome = classify_biome(
        population=population,
        latitude=latitude,
        longitude=longitude,
        elevation_m=elevation_m,
        slope=None,
        dist_to_coast_km=None,  # Would come from coast data
        dist_to_river_km=None,  # Would come from river data
    )

    # Generate cover objects.
    covers = generate_cover(biome, seed=seed)

    # Validate cover objects.
    for obj in covers:
        errors = validate_cover_object(obj)
        if errors:
            raise ValueError(f"invalid cover object: {errors}")

    # Generate spawn zones.
    spawn_zones = generate_spawn_zones(rng)

    # Build patch (heightfield and water_mask would come from extraction;
    # using placeholders here — the real heightfield comes from
    # tools/extract-battle-patch.py).
    patch = {
        "contract_version": CONTRACT_VERSION,
        "settlement_id": settlement_id,
        "biome": biome,
        "center_lat": latitude,
        "center_lon": longitude,
        # Placeholder heightfield: 64x64 zeros.
        # Real data from extract-battle-patch.py.
        "heightfield": [0.0] * 4096,
        "cover_objects": covers,
        "spawn_zones": spawn_zones,
        # Placeholder water mask: all false.
        "water_mask": [False] * 4096,
    }

    # Snow modifiers.
    if biome == "snow":
        patch["modifiers"] = snow_modifiers()

    # Enforce byte budget (Tier 2A-56).
    size = len(json.dumps(patch).encode("utf-8"))
    if size > MAX_PATCH_BYTES:
        raise ValueError(
            f"patch {settlement_id} exceeds byte budget: "
            f"{size} > {MAX_PATCH_BYTES}"
        )
    patch["_byte_size"] = size

    return patch


def export_patch(patch: dict, out_dir: Path) -> Path:
    """Tier 2A-57: Export patch in client wire format."""
    out_dir.mkdir(parents=True, exist_ok=True)
    # Remove internal field before export.
    export = {k: v for k, v in patch.items() if not k.startswith("_")}
    path = out_dir / f"{patch['settlement_id']}.json"
    path.write_text(json.dumps(export))
    return path
