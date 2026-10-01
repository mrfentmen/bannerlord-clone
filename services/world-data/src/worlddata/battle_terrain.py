"""Tier 2A-43: Biome classifier.

Assigns each settlement exactly one of the 10 biomes from real data:
city, forest, plains, snow, river, desert, hills, swamp, coastal, industrial.

Uses: population, latitude, elevation, slope, distance-to-coast, and
geographic region as proxies for NLCD land-cover classes (NLCD tiles are
not in the pipeline; the classifier documents each proxy).
"""

from __future__ import annotations

import math

# Biome constants (must match docs/BATTLE_TERRAIN.md).
BIOMES = (
    "city",
    "forest",
    "plains",
    "snow",
    "river",
    "desert",
    "hills",
    "swamp",
    "coastal",
    "industrial",
)

# Classification thresholds (documented proxies).
CITY_POPULATION = 50000  # >= this → city (Census urban area proxy)
INDUSTRIAL_POPULATION = 100000  # large cities get industrial zones
SNOW_LATITUDE = 42.0  # north of this → snow biome (winter)
COASTAL_KM = 5.0  # within 5km of shoreline → coastal
HILLS_SLOPE = 0.08  # mean slope > 8% → hills (from elevation)
DESERT_LON_WEST = -105.0  # west of this + south → desert (SW proxy)
DESERT_LAT_SOUTH = 37.0


def haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in km."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


def classify_biome(
    population: float,
    latitude: float,
    longitude: float,
    elevation_m: float | None,
    slope: float | None,
    dist_to_coast_km: float | None,
    dist_to_river_km: float | None,
) -> str:
    """Assign exactly one biome.

    Priority order (first match wins):
    1. city — population >= 50k (urban area)
    2. coastal — within 5km of shoreline
    3. snow — latitude >= 42°N
    4. desert — southwestern US (lon < -105, lat < 37)
    5. hills — mean slope > 8%
    6. river — within 2km of major river
    7. swamp — low elevation (<10m) + southern coastal plain proxy
    8. forest — northern/eastern, elevation 200-1000m proxy
    9. industrial — population >= 100k (subset of city, but distinct biome)
    10. plains — default

    Note: industrial is checked after city but before plains; a large city
    gets 'city' unless it has industrial characteristics. For now, cities
    >=100k with no other biome get 'industrial' as a proxy for factory zones.
    """
    # 1. City (but check industrial first for large cities).
    if population >= INDUSTRIAL_POPULATION:
        # Large metro: industrial unless coastal/snow override.
        if dist_to_coast_km is not None and dist_to_coast_km <= COASTAL_KM:
            return "coastal"
        if latitude >= SNOW_LATITUDE:
            return "snow"
        return "industrial"
    if population >= CITY_POPULATION:
        return "city"

    # 2. Coastal.
    if dist_to_coast_km is not None and dist_to_coast_km <= COASTAL_KM:
        return "coastal"

    # 3. Snow (northern tier).
    if latitude >= SNOW_LATITUDE:
        return "snow"

    # 4. Desert (southwest).
    if longitude <= DESERT_LON_WEST and latitude <= DESERT_LAT_SOUTH:
        return "desert"

    # 5. Hills (steep terrain).
    if slope is not None and slope > HILLS_SLOPE:
        return "hills"

    # 6. River (near major waterway).
    if dist_to_river_km is not None and dist_to_river_km <= 2.0:
        return "river"

    # 7. Swamp (low-lying southern).
    if (
        elevation_m is not None
        and elevation_m < 10.0
        and latitude < 35.0
        and longitude > -90.0
    ):
        return "swamp"

    # 8. Forest (upland east/north).
    if (
        elevation_m is not None
        and 200.0 <= elevation_m <= 1000.0
        and (latitude >= 38.0 or longitude <= -85.0)
    ):
        return "forest"

    # 10. Plains (default).
    return "plains"


def classify_settlement(
    settlement: dict,
    coast_points: list[tuple[float, float]] | None = None,
    river_points: list[tuple[float, float]] | None = None,
) -> str:
    """Classify a settlement dict from the pipeline.

    Expects: population, latitude, longitude, elevation_m (optional).
    coast_points/river_points: list of (lon, lat) for distance calculation.
    """
    lon = float(settlement["longitude"])
    lat = float(settlement["latitude"])
    pop = float(settlement.get("population") or 0)
    elev = settlement.get("elevation_m")
    elev_f = float(elev) if elev is not None else None

    # Distance to coast (if points provided).
    dist_coast = None
    if coast_points:
        dist_coast = min(
            haversine_km(lon, lat, clon, clat) for clon, clat in coast_points
        )

    # Distance to river (if points provided).
    dist_river = None
    if river_points:
        dist_river = min(
            haversine_km(lon, lat, rlon, rlat) for rlon, rlat in river_points
        )

    # Slope: not available from settlement data alone; None = skip hills check.
    # (Tier 2A-50 computes slope from elevation tiles per-patch.)

    return classify_biome(
        population=pop,
        latitude=lat,
        longitude=lon,
        elevation_m=elev_f,
        slope=None,
        dist_to_coast_km=dist_coast,
        dist_to_river_km=dist_river,
    )
