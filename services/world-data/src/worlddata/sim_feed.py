"""Feed the headless simulation with real settlements (Contract A).

Milo's simulation (``services/simulation``) generates its world in
``internal/worldgen/worldgen.go``. ``Generate`` takes ``[]Settlement``: "When
settlements is non-empty they are used verbatim, which is the path the Phase 0
pipeline takes". Nothing wires real data into that path yet -- this module
produces the file it was designed to consume.

Output: ``dist/sim-feed/settlements.json``, a JSON array whose objects use the
exact Go field names of ``worldgen.Settlement`` (Go's encoding/json matches
keys case-insensitively, so these unmarshal without tags):

    Name, State, SideID, Population, X, Y, IsPort, Terrain, Farmland, IsReal

Field mapping, all from the pipeline's tables (no invented values):

  Name       display name (Census suffix stripped, same as the client wire).
  State      state name.
  SideID     1-6 from the settlement's section_key, in the sim's Sides() order
             (services/simulation/internal/worldgen/worldgen.go): 1 Pacific
             Compact, 2 Mountain Alliance, 3 Great Lakes Union, 4 Southern
             Compact, 5 Lone Star Frontier, 6 Atlantic Corridor. If Milo
             reorders Sides(), this mapping must be updated to match.
  Population real population as a float.
  X, Y       equirectangular projection of lon/lat around the V1 bbox centre,
             in leagues (1 league = 3 statute miles = 4.828032 km).
             x = (lon - clon) * 111.32 * cos(clat) / 4.828032
             y = (clat - lat) * 110.57 / 4.828032
  IsPort     true when the settlement lies within PORT_PROXIMITY_KM of a
             ports-table port (haversine). Ports are point data; proximity is
             the honest mapping.
  Terrain    index into the sim's route_terrain enum (model/entities.go):
             5 Coast when IsPort, 3 Mountain when elevation_m >= 500,
             2 Hills when elevation_m >= 200, else 0 Plain. Forest (1) and
             Swamp (4) cannot be derived from the current tables -- logged as
             a gap per CONSTITUTION.md 1.1, not guessed.
  Farmland   hinterland multiplier from real cropland data: the settlement's
             state cropland share divided by the national mean share, so the
             average state is 1.0 and farm country scores above it.
  IsReal     always true: every row came from the pipeline.

Scope is the V1 bbox, the same slice the client wire format covers.

Standing rule (boss order 2026-09-30): OSS projects are reference only. This
module contains no code from any OSS project.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

from .client_wire import _load_table, display_name

# ---------------------------------------------------------------------------
# Constants. Declared, not magic: each has a comment saying where it comes from.
# ---------------------------------------------------------------------------

# SideID order must match Sides() in
# services/simulation/internal/worldgen/worldgen.go (1-based there).
SECTION_TO_SIDE_ID = {
    "pacific_compact": 1,
    "mountain_alliance": 2,
    "great_lakes_union": 3,
    "southern_compact": 4,
    "lone_star_frontier": 5,
    "atlantic_corridor": 6,
}

# Terrain enum in services/simulation/internal/model/entities.go.
TERRAIN_PLAIN = 0
TERRAIN_HILLS = 2
TERRAIN_MOUNTAIN = 3
TERRAIN_COAST = 5

# Elevation bands for the terrain mapping, in metres. Documented thresholds,
# not tuned: 200 m separates rolling country from hills, 500 m hills from
# mountains in the eastern US context of the V1 region.
HILLS_ELEVATION_M = 200.0
MOUNTAIN_ELEVATION_M = 500.0

# A settlement within this distance of a ports-table port counts as a port
# town for the sim (IsPort enables blockades). Ports are points; 25 km covers
# a port city and its immediate harbor settlements without reaching inland.
PORT_PROXIMITY_KM = 25.0

# 1 league = 3 statute miles, the campaign map's unit in worldgen.Settlement.
KM_PER_LEAGUE = 4.828032


# ---------------------------------------------------------------------------
# Small pure helpers (unit-tested).
# ---------------------------------------------------------------------------

def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in kilometres."""
    r = math.radians
    dlat, dlon = r(lat2 - lat1), r(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def lonlat_to_leagues(
    lon: float, lat: float, clon: float, clat: float
) -> tuple[float, float]:
    """Equirectangular projection around (clon, clat), in leagues."""
    x = (lon - clon) * 111.32 * math.cos(math.radians(clat)) / KM_PER_LEAGUE
    y = (clat - lat) * 110.57 / KM_PER_LEAGUE
    return x, y


def terrain_for(elevation_m: float | None, is_port: bool) -> int:
    """Map elevation to the sim's route_terrain enum.

    Forest (1) and Swamp (4) are not derivable from the pipeline's tables;
    they are never emitted (gap logged by the caller).
    """
    if is_port:
        return TERRAIN_COAST
    elev = float(elevation_m) if elevation_m is not None else 0.0
    if elev >= MOUNTAIN_ELEVATION_M:
        return TERRAIN_MOUNTAIN
    if elev >= HILLS_ELEVATION_M:
        return TERRAIN_HILLS
    return TERRAIN_PLAIN


# ---------------------------------------------------------------------------
# Builder.
# ---------------------------------------------------------------------------

@dataclass
class SimFeedResult:
    out_dir: Path
    region_name: str
    settlement_count: int
    port_count: int
    terrain_counts: dict[int, int]
    warnings: list[str] = field(default_factory=list)

    def log_lines(self) -> list[str]:
        terrain = ", ".join(
            f"{name}={self.terrain_counts.get(code, 0)}"
            for code, name in (
                (TERRAIN_PLAIN, "plain"),
                (TERRAIN_HILLS, "hills"),
                (TERRAIN_MOUNTAIN, "mountain"),
                (TERRAIN_COAST, "coast"),
            )
        )
        return [
            f"sim-feed: region {self.region_name!r}",
            f"sim-feed: {self.settlement_count} settlements, "
            f"{self.port_count} ports, terrain {terrain}",
            *(f"sim-feed: WARNING: {w}" for w in self.warnings),
            f"sim-feed: wrote {self.out_dir}/settlements.json",
        ]


def build_sim_feed(
    dist_dir: Path,
    out_dir: Path,
    exports_dir: Path | None = None,
    retrieved: str | None = None,
) -> SimFeedResult:
    """Write the simulation's settlement feed for the V1 region."""
    dist = Path(dist_dir)
    exports = Path(exports_dir) if exports_dir else dist / "exports"
    if not exports.is_dir():
        candidate = dist.parent / "exports"
        if candidate.is_dir():
            exports = candidate
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    retrieved = retrieved or date.today().isoformat()
    warnings: list[str] = []

    regions = _load_table(dist, exports, "regions")
    if not regions:
        raise ValueError("regions table is empty; the pipeline must record a V1 region")
    region = regions[0]
    south = float(region["bbox_south"])
    west = float(region["bbox_west"])
    north = float(region["bbox_north"])
    east = float(region["bbox_east"])
    region_name = str(region["region_name"])
    clon, clat = (west + east) / 2.0, (south + north) / 2.0

    settlements_all = _load_table(dist, exports, "settlements")
    in_region = [
        s
        for s in settlements_all
        if s.get("latitude") is not None
        and s.get("longitude") is not None
        and south <= float(s["latitude"]) <= north
        and west <= float(s["longitude"]) <= east
    ]
    if not in_region:
        raise ValueError("no settlements inside the V1 bbox")

    # Ports for the IsPort mapping.
    ports = _load_table(dist, exports, "ports")
    port_points = [
        (float(p["longitude"]), float(p["latitude"]))
        for p in ports
        if p.get("longitude") is not None and p.get("latitude") is not None
    ]

    # Farmland multiplier from real cropland data (state_profiles).
    profiles = _load_table(dist, exports, "state_profiles")
    shares: dict[str, float] = {}
    for p in profiles:
        total = float(p.get("total_land_thousand_acres") or 0)
        crop = float(p.get("cropland_thousand_acres") or 0)
        if total > 0:
            shares[str(p["state_fips"])] = crop / total
    national_mean = (
        sum(shares.values()) / len(shares) if shares else 1.0
    )
    if national_mean <= 0:
        warnings.append("no cropland data; farmland multiplier defaults to 1.0")
        national_mean = 1.0

    feed = []
    terrain_counts: dict[int, int] = {}
    port_count = 0
    for s in in_region:
        lon = float(s["longitude"])
        lat = float(s["latitude"])
        section_key = str(s.get("section_key") or "")
        side_id = SECTION_TO_SIDE_ID.get(section_key)
        if side_id is None:
            warnings.append(
                f"settlement {s.get('settlement_id')} has unknown section "
                f"{section_key!r}; SideID set to 0"
            )
            side_id = 0
        is_port = any(
            haversine_km(lon, lat, plon, plat) <= PORT_PROXIMITY_KM
            for plon, plat in port_points
        )
        port_count += 1 if is_port else 0
        terrain = terrain_for(s.get("elevation_m"), is_port)
        terrain_counts[terrain] = terrain_counts.get(terrain, 0) + 1
        x, y = lonlat_to_leagues(lon, lat, clon, clat)
        state_share = shares.get(str(s.get("state_fips")), national_mean)
        feed.append(
            {
                # Exact Go field names of worldgen.Settlement; encoding/json
                # matches keys case-insensitively, so no tags are needed.
                "Name": display_name(str(s["name"])),
                "State": str(s.get("state_name")),
                "SideID": side_id,
                "Population": float(s["population"]),
                "X": x,
                "Y": y,
                "IsPort": is_port,
                "Terrain": terrain,
                "Farmland": state_share / national_mean,
                "IsReal": True,
            }
        )
    # Stable order: biggest places first.
    feed.sort(key=lambda r: (-r["Population"], r["Name"]))

    warnings.append(
        "gap (CONSTITUTION 1.1): Terrain Forest (1) and Swamp (4) are not "
        "derivable from the pipeline's tables and are never emitted; "
        "settlements that should be forest/swamp are mapped to Plain."
    )

    # Contract: settlements.json is a bare JSON array whose objects use the exact
    # Go field names of worldgen.Settlement, so Go can decode it directly with
    # json.Unmarshal(raw, &[]worldgen.Settlement{}). Provenance metadata lives in
    # the sidecar settlements.meta.json, not in the array file.
    meta = {
        "source": "agent-1-export",
        "licence": (
            "U.S. Government work, public domain (Title 17 U.S.C. 105). "
            "Populations: U.S. Census Bureau, Vintage 2023 sub-county "
            "estimates. Ports: Natural Earth 1:10m ports (public domain). "
            "Cropland: USDA Economic Research Service, Major Land Uses, via state "
            "profiles. No attribution required."
        ),
        "retrieved": retrieved,
        "region": region_name,
        "projection": (
            "equirectangular around bbox centre "
            f"({clon:.4f}, {clat:.4f}), 1 league = 3 statute miles"
        ),
        "settlement_count": len(feed),
    }
    (out / "settlements.json").write_text(json.dumps(feed))
    (out / "settlements.meta.json").write_text(json.dumps(meta))
    return SimFeedResult(
        out_dir=out,
        region_name=region_name,
        settlement_count=len(feed),
        port_count=port_count,
        terrain_counts=terrain_counts,
        warnings=warnings,
    )
