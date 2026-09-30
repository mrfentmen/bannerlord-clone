"""WGS84 geodesic helpers.

Every number produced here is computed from the real coordinates that came out
of the source datasets. No projections are involved, so no projection library
is needed and there is nothing to configure.

Distance and area use the sphere of equal radius R (the authalic-ish mean
radius). For campaign-scale travel times and state comparison that is well
inside the precision any downstream consumer needs, and the alternative -
pulling in pyproj for a handful of formulas - would be a new dependency for no
gain. The approximation is stated here rather than hidden.
"""

from __future__ import annotations

import math
from typing import Iterable, Sequence

from ..errors import GeoError

# Mean Earth radius in kilometres (IUGG arithmetic mean radius, 6371.0088 km).
# Reasonable range: 6356..6390. Documented so a reader can see the assumption.
EARTH_RADIUS_KM = 6371.0088

Coord = tuple[float, float]
Ring = Sequence[Coord]


def haversine_km(a: Coord, b: Coord) -> float:
    """Great-circle distance in kilometres between two WGS84 lon/lat points."""
    lon1, lat1 = a
    lon2, lat2 = b
    if not (-180.0 <= lon1 <= 180.0 and -180.0 <= lon2 <= 180.0):
        raise GeoError(f"longitude out of range in haversine_km: {lon1}, {lon2}")
    if not (-90.0 <= lat1 <= 90.0 and -90.0 <= lat2 <= 90.0):
        raise GeoError(f"latitude out of range in haversine_km: {lat1}, {lat2}")
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    inner = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    # Clamp guards against float drift pushing inner just above 1.0.
    inner = min(1.0, max(0.0, inner))
    return 2.0 * EARTH_RADIUS_KM * math.asin(math.sqrt(inner))


def polyline_length_km(points: Ring) -> float:
    """Total great-circle length of a polyline, summing every vertex pair."""
    if len(points) < 2:
        raise GeoError(f"a polyline needs at least 2 vertices to have a length, got {len(points)}")
    return sum(
        haversine_km(points[index], points[index + 1]) for index in range(len(points) - 1)
    )


def ring_area_km2(ring: Ring) -> float:
    """Planar-shoelace area on a locally-flattened ring, in square kilometres.

    The ring is projected with the equirectangular approximation centred on its
    own mean latitude: x = longitude * cos(mean latitude), y = latitude. That is
    accurate to well under a percent for any US state-sized polygon, which is
    the size of thing this pipeline measures, and it avoids needing a full
    geodesic area implementation. Absolute value is taken, so ring winding order
    in the source file does not change the result.
    """
    if len(ring) < 4:
        raise GeoError(f"a closed ring needs at least 4 vertices, got {len(ring)}")
    cos_lat = math.cos(math.radians(mean_latitude(ring)))
    if abs(cos_lat) < 1e-9:
        raise GeoError(f"ring is at a pole (mean latitude {mean_latitude(ring)}), where the projection is degenerate")
    total = 0.0
    for index in range(len(ring)):
        x1 = ring[index][0] * cos_lat
        y1 = ring[index][1]
        x2 = ring[(index + 1) % len(ring)][0] * cos_lat
        y2 = ring[(index + 1) % len(ring)][1]
        total += x1 * y2 - x2 * y1
    return abs(total) * (math.pi / 180.0) ** 2 * EARTH_RADIUS_KM**2 / 2.0


def mean_latitude(ring: Ring) -> float:
    """Mean latitude of a ring, used as the flattening latitude."""
    if not ring:
        raise GeoError("cannot take the mean latitude of an empty ring")
    return sum(point[1] for point in ring) / len(ring)


def polygon_area_km2(rings: Iterable[Ring]) -> float:
    """Area of a polygon with holes: sum of exterior rings minus interior rings.

    Follows shapefile convention where ring order encodes containment - the
    first ring is the exterior and each following ring is a hole inside it.
    """
    rings = list(rings)
    if not rings:
        raise GeoError("polygon has no rings")
    area = ring_area_km2(rings[0])
    for hole in rings[1:]:
        area -= ring_area_km2(hole)
    return max(0.0, area)


def point_in_ring(point: Coord, ring: Ring) -> bool:
    """Ray-casting point-in-polygon test against one ring.

    A point exactly on an edge is unspecified by the algorithm and returns
    False. That is acceptable because the pipeline uses containment to assign
    a coarse region to a point that is already inside the region by bbox.
    """
    x, y = point
    inside = False
    vertex_count = len(ring)
    for index in range(vertex_count):
        x1, y1 = ring[index]
        x2, y2 = ring[(index + 1) % vertex_count]
        if (y1 > y) != (y2 > y):
            crossing_x = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < crossing_x:
                inside = not inside
    return inside


def point_in_polygon(point: Coord, rings: Sequence[Ring]) -> bool:
    """True when the point is inside the exterior ring and outside every hole."""
    if not rings:
        return False
    if not point_in_ring(point, rings[0]):
        return False
    return not any(point_in_ring(point, hole) for hole in rings[1:])


def centroid(ring: Ring) -> Coord:
    """Area-weighted centroid of a ring, falling back to the vertex mean.

    Computed in the same locally-flattened projection as ``ring_area_km2``:
    x = longitude * cos(mean latitude), y = latitude. Both must use the same
    projection or the centroid comes out nonsense, which is why the projection
    lives in one place.
    """
    if len(ring) == 0:
        raise GeoError("cannot take the centroid of an empty ring")
    if len(ring) < 3:
        mean_lon = sum(point[0] for point in ring) / len(ring)
        mean_lat = sum(point[1] for point in ring) / len(ring)
        return (mean_lon, mean_lat)
    cos_lat = math.cos(math.radians(mean_latitude(ring)))
    if abs(cos_lat) < 1e-9:
        raise GeoError(f"ring is at a pole (mean latitude {mean_latitude(ring)})")

    projected = [(point[0] * cos_lat, point[1]) for point in ring]
    twice_area = 0.0
    lon_accumulator = 0.0
    lat_accumulator = 0.0
    for index in range(len(projected)):
        x1, y1 = projected[index]
        x2, y2 = projected[(index + 1) % len(projected)]
        cross = x1 * y2 - x2 * y1
        twice_area += cross
        lon_accumulator += (x1 + x2) * cross
        lat_accumulator += (y1 + y2) * cross

    if abs(twice_area) < 1e-18:
        # A degenerate ring has no area to weight by; the vertex mean is the
        # only defensible answer and it is inside the ring's own hull.
        return (
            sum(point[0] for point in ring) / len(ring),
            sum(point[1] for point in ring) / len(ring),
        )
    lon = lon_accumulator / (3.0 * twice_area) / cos_lat
    lat = lat_accumulator / (3.0 * twice_area)
    return (lon, lat)


def bbox_of(shapes: Iterable[object]) -> tuple[float, float, float, float]:
    """Bounding box over a list of nested coordinate lists."""
    west = south = east = north = None
    for shape in shapes:
        for point in _iter_points(shape):
            lon, lat = point
            west = lon if west is None else min(west, lon)
            east = lon if east is None else max(east, lon)
            south = lat if south is None else min(south, lat)
            north = lat if north is None else max(north, lat)
    if west is None:
        raise GeoError("cannot build a bounding box from zero coordinates")
    return (west, south, east, north)


def _is_coordinate(node: object) -> bool:
    """True for a single (lon, lat) pair, whether it arrived as a tuple from the
    shapefile reader or as a list from GeoJSON."""
    return (
        isinstance(node, (tuple, list))
        and len(node) == 2
        and all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in node)
    )


def _iter_points(shape: object):
    """Yield (lon, lat) pairs from a nested coordinate structure of any depth.

    Accepts the shapefile reader's tuple-of-tuples and GeoJSON's list-of-lists,
    so callers do not have to know which reader produced the geometry.
    """
    if _is_coordinate(shape):
        yield (float(shape[0]), float(shape[1]))
        return
    if not isinstance(shape, (list, tuple)):
        raise GeoError(f"expected nested coordinates, got {type(shape).__name__}")
    for item in shape:
        yield from _iter_points(item)


def point_in_bbox(point: Coord, bbox: tuple[float, float, float, float]) -> bool:
    """True when the point lies inside a [west, south, east, north] box."""
    if not isinstance(point, (tuple, list)) or len(point) != 2:
        raise GeoError(f"point_in_bbox needs a (longitude, latitude) pair, got {point!r}")
    if not isinstance(bbox, (tuple, list)) or len(bbox) != 4:
        raise GeoError(f"point_in_bbox needs a (west, south, east, north) box, got {bbox!r}")
    lon, lat = point
    west, south, east, north = bbox
    if west > east or south > north:
        raise GeoError(f"bounding box {bbox} has its corners inverted")
    return west <= lon <= east and south <= lat <= north
