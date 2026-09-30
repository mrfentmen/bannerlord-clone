"""GeoJSON reading and writing, per RFC 7946.

Written rather than imported so the pipeline keeps zero third-party geometry
dependencies. Only what is needed: a streaming writer for the published
exports, and a reader good enough to ingest the Natural Earth cross-check
files, which are plain FeatureCollections with no exotic geometry.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Iterator

from ..errors import ParseError

# Decimal places kept in exported coordinates. 7 places is about 1 cm, which is
# finer than any DEM cell the pipeline samples and keeps files much smaller than
# the source shapefiles.
COORDINATE_PRECISION = 7


def round_coordinate(value: float) -> float:
    """Round one coordinate to COORDINATE_PRECISION, normalising -0.0 to 0.0."""
    rounded = round(float(value), COORDINATE_PRECISION)
    return 0.0 if rounded == 0 else rounded


def round_geometry(geometry: Any) -> Any:
    """Recursively round every coordinate in a GeoJSON geometry object."""
    if not isinstance(geometry, dict):
        raise ParseError(f"geometry must be a JSON object, got {type(geometry).__name__}")
    geometry_type = geometry.get("type")
    if geometry_type == "GeometryCollection":
        return {
            "type": geometry_type,
            "geometries": [round_geometry(part) for part in geometry.get("geometries", [])],
        }
    coordinates = geometry.get("coordinates")
    if coordinates is None:
        raise ParseError(f"geometry of type {geometry_type!r} has no coordinates")
    return {"type": geometry_type, "coordinates": _round_nested(coordinates)}


def _round_nested(node: Any) -> Any:
    if isinstance(node, list):
        if node and isinstance(node[0], (int, float)):
            return [round_coordinate(value) for value in node]
        return [_round_nested(item) for item in node]
    if isinstance(node, (int, float)):
        return round_coordinate(node)
    raise ParseError(f"unexpected coordinate leaf {node!r} of type {type(node).__name__}")


def feature(
    geometry: Any,
    properties: dict[str, Any],
    *,
    simplify_tolerance_deg: float | None = None,
    round_coordinates: bool = True,
) -> dict[str, Any]:
    """Build one GeoJSON Feature, optionally simplifying then rounding it."""
    prepared = geometry
    if simplify_tolerance_deg is not None and simplify_tolerance_deg > 0:
        prepared = simplify_geometry(geometry, simplify_tolerance_deg)
    if round_coordinates:
        prepared = round_geometry(prepared)
    return {"type": "Feature", "geometry": prepared, "properties": properties}


def write_feature_collection(
    path: Path,
    features: Iterator[dict[str, Any]],
    *,
    header_properties: dict[str, Any] | None = None,
) -> int:
    """Stream a FeatureCollection to ``path`` without building it in memory.

    Country-wide road and rail geometry runs to hundreds of megabytes if held
    as Python objects, so features are written one at a time. Returns the count
    written. Writes to a .part file and renames, so a crash never leaves a
    truncated file that a later run would treat as complete.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".part")
    count = 0
    with partial.open("w", encoding="utf-8") as handle:
        handle.write('{\n  "type": "FeatureCollection",\n')
        if header_properties:
            handle.write('  "metadata": ')
            handle.write(json.dumps(header_properties, sort_keys=True))
            handle.write(",\n")
        handle.write('  "features": [\n')
        for item in features:
            if count:
                handle.write(",\n")
            handle.write("    ")
            handle.write(json.dumps(item, separators=(",", ":"), sort_keys=True))
            count += 1
        handle.write("\n  ]\n}\n")
    partial.replace(path)
    return count


def read_features(path: Path) -> Iterator[tuple[dict[str, Any], dict[str, Any]]]:
    """Yield (geometry, properties) from a GeoJSON FeatureCollection.

    The whole file is parsed with the stdlib JSON reader. That is fine for the
    Natural Earth cross-check files used here, which are a few megabytes.
    """
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ParseError(f"{path} is not valid JSON: {exc}") from exc
    if not isinstance(document, dict) or document.get("type") != "FeatureCollection":
        raise ParseError(f"{path} is not a GeoJSON FeatureCollection")
    features = document.get("features")
    if not isinstance(features, list):
        raise ParseError(f"{path} has no 'features' array")
    for index, item in enumerate(features):
        if not isinstance(item, dict) or item.get("type") != "Feature":
            raise ParseError(f"{path} feature {index} is not a GeoJSON Feature")
        geometry = item.get("geometry")
        if geometry is None:
            continue
        properties = item.get("properties") or {}
        if not isinstance(properties, dict):
            raise ParseError(f"{path} feature {index} has non-object properties")
        yield geometry, properties


def simplify_geometry(geometry: dict[str, Any], tolerance_deg: float) -> dict[str, Any]:
    """Douglas-Peucker simplification of every ring or line in a geometry.

    Used only for the published exports that Agent 3 renders. The full-precision
    geometry stays in the raw cache, so no precision is lost anywhere it
    matters. Douglas-Peucker is used because it keeps the shape of a coastline
    far better than decimation for the same vertex count.
    """
    if geometry.get("type") == "GeometryCollection":
        return {
            "type": "GeometryCollection",
            "geometries": [simplify_geometry(part, tolerance_deg) for part in geometry.get("geometries", [])],
        }
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type in {"Point", "MultiPoint"}:
        return {"type": geometry_type, "coordinates": coordinates}
    if geometry_type in {"LineString", "MultiPoint"}:
        return {"type": geometry_type, "coordinates": _simplify_ring(coordinates, tolerance_deg)}
    if geometry_type in {"MultiLineString", "Polygon"}:
        return {"type": geometry_type, "coordinates": [_simplify_ring(ring, tolerance_deg) for ring in coordinates]}
    if geometry_type == "MultiPolygon":
        return {
            "type": geometry_type,
            "coordinates": [
                [_simplify_ring(ring, tolerance_deg) for ring in polygon] for polygon in coordinates
            ],
        }
    raise ParseError(f"cannot simplify geometry of unsupported type {geometry_type!r}")


def _simplify_ring(points: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(points) < 3:
        return points
    simplified = _douglas_peucker(points, tolerance)
    if len(simplified) < 2:
        return points
    return simplified


def _douglas_peucker(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Iterative Douglas-Peucker. Iterative because source rings get deep."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = True
    keep[-1] = True
    stack: list[tuple[int, int]] = [(0, len(points) - 1)]
    while stack:
        start, end = stack.pop()
        if end <= start + 1:
            continue
        worst_index = -1
        worst_distance = 0.0
        for index in range(start + 1, end):
            distance = _perpendicular_distance(points[index], points[start], points[end])
            if distance > worst_distance:
                worst_distance = distance
                worst_index = index
        if worst_index >= 0 and worst_distance > tolerance:
            keep[worst_index] = True
            stack.append((start, worst_index))
            stack.append((worst_index, end))
    return [point for point, wanted in zip(points, keep) if wanted]


def _perpendicular_distance(point: list[float], start: list[float], end: list[float]) -> float:
    """Distance from point to the start-end segment, in degrees.

    Longitude is scaled by cos(mean latitude) so the tolerance means roughly the
    same distance north-south as east-west. Working in degrees is acceptable
    because the tolerance is a fraction of a degree.
    """
    mean_lat = math.radians((start[1] + end[1]) / 2.0)
    cos_lat = max(1e-9, math.cos(mean_lat))
    px, py = point[0] * cos_lat, point[1]
    ax, ay = start[0] * cos_lat, start[1]
    bx, by = end[0] * cos_lat, end[1]
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))
