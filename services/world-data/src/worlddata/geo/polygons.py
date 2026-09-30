"""Turning flat shapefile ring lists into real polygons.

The shapefile reader returns a flat list of rings, because that is all the format
stores. It does not say which rings are separate pieces of land and which are
holes in another piece, and reading the real state files shows the order is
meaningless: Ohio's first ring is a Lake Erie island a few square kilometres in
area, not the state's main body.

The distinction is recoverable, because the shapefile format encodes it in ring
winding order, as ESRI's specification requires: exterior rings are clockwise
(negative signed area under the standard x-east y-north convention) and holes
are counter-clockwise. Every ring in the 2023 Census state files is clockwise,
confirming these are multipolygons of disjoint pieces with no holes.

Getting this wrong is not cosmetic. Treating island rings as holes makes
containment tests fail on real coastal states, and it would make exported
GeoJSON describe inland seas where the sea should be.

Design note: :func:`to_multipolygon` is the only function that interprets winding.
Callers classify once and pass the resulting polygons to the other helpers, so
no helper can quietly apply a different threshold than the one configured.
"""

from __future__ import annotations

from ..errors import GeoError
from .wgs84 import Coord, Ring, centroid, point_in_ring, ring_area_km2

# A polygon: the exterior ring first, then any holes inside it.
Polygon = list[Ring]

# Square degrees per square kilometre at the equator, used to describe the hole
# threshold in a unit a reader can sanity-check. 1 deg^2 is about 12,392 km^2.
SQUARE_DEGREES_PER_SQUARE_KM = 1.0 / 12392.0


def signed_area_deg2(ring: Ring) -> float:
    """Signed planar area of a ring in square degrees.

    Negative means clockwise. The magnitude is used for comparing and weighting
    rings; it is never reported as an area.
    """
    if len(ring) < 3:
        raise GeoError(f"a ring needs at least 3 vertices to enclose area, got {len(ring)}")
    total = 0.0
    for index in range(len(ring)):
        x1, y1 = ring[index]
        x2, y2 = ring[(index + 1) % len(ring)]
        total += x1 * y2 - x2 * y1
    return total / 2.0


def to_multipolygon(
    rings: list[Ring],
    *,
    minimum_hole_area_deg2: float = 0.0,
) -> tuple[list[Polygon], int]:
    """Group a flat ring list into polygons using winding order.

    Exterior rings (clockwise) start a polygon. Counter-clockwise rings are holes
    and are attached to the exterior ring that contains them.

    Two real conditions in the source files are handled explicitly rather than
    guessed at:

    * A counter-clockwise ring containing no clockwise ring. In the 2023 Census
      500k place file this happens twice, for Carefree (Arizona) and North Druid
      Hills (Georgia), and in both cases the ring is a few hundred square metres:
      a sliver the 500k generalisation produced, not a hole. A ring below
      ``minimum_hole_area_deg2`` is therefore treated as a degenerate sliver and
      kept as its own polygon, and counted so the caller can report it.
    * A file whose rings are all counter-clockwise, meaning it uses the opposite
      winding convention. All of them are treated as exteriors rather than
      producing no geometry at all.

    Returns (polygons, sliver_count).
    """
    if minimum_hole_area_deg2 < 0:
        raise GeoError(f"minimum_hole_area_deg2 must not be negative, got {minimum_hole_area_deg2}")

    exteriors = [ring for ring in rings if signed_area_deg2(ring) < 0]
    holes = [ring for ring in rings if signed_area_deg2(ring) > 0]
    if not exteriors:
        # Every ring counter-clockwise: this file uses the opposite convention.
        return ([[ring] for ring in holes], 0)

    polygons: list[Polygon] = [[exterior] for exterior in exteriors]
    slivers = 0
    for hole in holes:
        if signed_area_deg2(hole) < minimum_hole_area_deg2:
            # Too small to be a real hole. Kept as geometry rather than deleted,
            # so nothing from the source file silently disappears.
            polygons.append([hole])
            slivers += 1
            continue
        centre = centroid(hole)
        for polygon in polygons:
            if point_in_ring(centre, polygon[0]):
                polygon.append(hole)
                break
        else:
            raise GeoError(
                f"a counter-clockwise ring of {signed_area_deg2(hole):.3e} square degrees is not inside any "
                "clockwise ring and is larger than the configured minimum hole area, so it cannot be a hole. "
                "The source file's ring winding does not follow the shapefile specification."
            )
    return (polygons, slivers)


def largest_polygon(polygons: list[Polygon]) -> Polygon:
    """The polygon with the largest exterior ring: the main body of a place."""
    if not polygons:
        raise GeoError("cannot take the main body of a geometry with no polygons")
    return max(polygons, key=lambda polygon: abs(signed_area_deg2(polygon[0])))


def area_km2(polygons: list[Polygon]) -> float:
    """Total area of every polygon, holes subtracted."""
    return sum(
        ring_area_km2(polygon[0]) - sum(ring_area_km2(hole) for hole in polygon[1:]) for polygon in polygons
    )


def interior_point(polygons: list[Polygon]) -> Coord:
    """A point inside the geometry's main body: that polygon's area centroid.

    Deliberately the main body and not an average over the whole multipolygon,
    because a centroid averaged over far-offshore islands lands in the sea. An
    earlier version of this pipeline reported Alabama's centre as being in
    Mobile Bay for exactly that reason.
    """
    return centroid(largest_polygon(polygons)[0])


def contains(polygons: list[Polygon], point: Coord) -> bool:
    """True when the point is inside any polygon and outside all its holes.

    Convenient for one-off calls. For repeated point-in-many-polygons queries,
    build a :class:`PolygonIndex` once instead - see the note there on why.
    """
    for polygon in polygons:
        if not point_in_ring(point, polygon[0]):
            continue
        if any(point_in_ring(point, hole) for hole in polygon[1:]):
            continue
        return True
    return False


class PolygonIndex:
    """A multipolygon with every ring's bounding box precomputed.

    Point-in-polygon against a real state boundary costs one scan of thousands
    of vertices per candidate. Since a point outside a ring's bounding box
    cannot be inside the ring, caching those boxes turns the common case - the
    answer is no, quickly - into two float comparisons. Building this once per
    state and reusing it across every port cut a country-wide attribution pass
    from over a minute to well under a second, with identical results because
    the bounding-box test never rejects a point that the full scan would accept.
    """

    __slots__ = ("_boxes", "_rings")

    def __init__(self, polygons: list[Polygon]) -> None:
        from .wgs84 import bbox_of

        self._rings: list[tuple[bool, Ring]] = []
        self._boxes: list[tuple[float, float, float, float]] = []
        for polygon in polygons:
            self._rings.append((False, polygon[0]))
            self._boxes.append(bbox_of(polygon[0]))
            for hole in polygon[1:]:
                self._rings.append((True, hole))
                self._boxes.append(bbox_of(hole))

    def contains(self, point: Coord) -> bool:
        lon, lat = point
        inside_any = False
        for (is_hole, ring), (west, south, east, north) in zip(self._rings, self._boxes, strict=True):
            if not (west <= lon <= east and south <= lat <= north):
                continue
            if point_in_ring(point, ring):
                if is_hole:
                    # Inside a hole means outside the land it was cut from.
                    return False
                inside_any = True
        return inside_any


def geojson_geometry(rings: list[Ring], geometry_type: str) -> dict:
    """GeoJSON geometry for a ring list, as MultiPolygon or MultiLineString.

    Grouped correctly so a consumer reading the file gets islands and lakes
    right rather than a polygon with accidental holes.
    """
    polygons, _slivers = to_multipolygon(rings)
    if geometry_type == "MultiLineString":
        return {
            "type": "MultiLineString",
            "coordinates": [[[list(point) for point in ring] for ring in polygon] for polygon in polygons],
        }
    if geometry_type == "MultiPolygon":
        return {
            "type": "MultiPolygon",
            "coordinates": [
                [[[list(point) for point in ring] for ring in polygon] for polygon in polygons]
            ],
        }
    raise GeoError(f"unsupported geometry type {geometry_type!r}")
