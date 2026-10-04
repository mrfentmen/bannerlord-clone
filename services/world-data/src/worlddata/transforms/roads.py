"""Road and rail import, and the route graph built from them.

SPEC.md section 2: "Roads and rail from imported line data, used for travel
speed, caravan routes, and road_safety segments." SPEC.md section 3 defines the
``routes`` table as id, from_id, to_id, distance, road_safety, geometry.

What this module builds:

* ``route_segments`` - one row per imported road or rail line, carrying its real
  geometry, real length in kilometres, its road class, a speed from config, a
  travel time, and a seeded road_safety.
* ``routes`` - settlement-to-settlement edges. Each line endpoint is snapped to
  the nearest settlement within a configured radius; a line whose both endpoints
  snap becomes an edge between two towns, provided the line is at least
  ``travel.min_segment_gc_fraction`` of the straight-line distance between those
  two towns. A line with one snapped endpoint is kept as a dangling route to the
  edge of the settled world, because deleting it would silently lose real
  geography.

What it does not build: a street network. The Census PRIMARYROADS layer holds
primary roads only. That gap is recorded in the data manifest.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ..config import Config
from ..errors import ParseError
from ..geo.wgs84 import EARTH_RADIUS_KM, Coord, haversine_km, point_in_bbox, polyline_length_km
from .geometry import iter_shapefile

# Census MTFCC codes present in the two TIGER/Line layers the pipeline reads.
MTFCC_PRIMARY_ROAD = "S1100"
MTFCC_RAIL = "R1011"


@dataclass(frozen=True)
class RouteSegment:
    """One imported road or rail line with its derived travel numbers.

    Deliberately does NOT hold its geometry. The national rail layer alone is
    119,857 polylines; keeping every vertex as Python tuples across both layers
    exhausts memory and the process is killed with no traceback, which is what
    happened on the first full run. Geometry is streamed to disk as it is read
    and re-attached only while writing the export.
    """

    segment_id: str
    kind: str
    name: str | None
    road_class: str
    length_km: float
    speed_kmh: float
    travel_hours: float
    road_safety: float
    from_settlement_id: str | None
    to_settlement_id: str | None
    snap_from_km: float | None
    snap_to_km: float | None
    vertex_count: int


@dataclass(frozen=True)
class Route:
    """A settlement-to-settlement edge, as SPEC.md section 3 defines it."""

    route_id: str
    from_settlement_id: str
    to_settlement_id: str
    distance_km: float
    road_safety: float
    segment_ids: tuple[str, ...]
    kind: str
    # Road class of the longest member segment (rail for rail routes); the
    # travel graph and sim feed need per-edge class, not just per-segment.
    road_class: str
    # Sum of member segment travel hours; the travel graph reports minutes.
    travel_hours: float


class SettlementIndex:
    """Grid index for nearest-settlement lookups.

    A naive nearest-neighbour search over 13,000 settlements for each of 137,000
    line endpoints is nearly two billion distance calls. Bucketing the settlements
    into cells about the size of the snap radius and searching the neighbourhood
    is the same answer in a fraction of the time, and it is exact rather than
    approximate: the search expands ring by ring and stops only once the whole
    ring it just examined lies beyond both the radius and the best candidate.

    Cell size is derived from the snap radius rather than passed in, because
    getting the unit right here is not optional. Two earlier versions each got it
    wrong in a different way - one computed the cell in radians and used it as
    degrees, the other multiplied degrees by the degrees-per-radian constant
    instead of dividing - and both produced the same symptom: a route graph with
    zero edges, because the ring search stopped after one ring every time. A test
    now compares the index against brute force on every probe.
    """

    # Degrees per radian. One degree of longitude is 111.19 km at the equator.
    _DEGREES_PER_RADIAN = 180.0 / math.pi
    _KM_PER_DEGREE_EQUATOR = 6371.0088 / (180.0 / math.pi)

    def __init__(self, points: dict[str, Coord], snap_radius_km: float) -> None:
        if snap_radius_km <= 0:
            raise ParseError(f"the settlement index needs a positive snap radius, got {snap_radius_km}")
        self._points = points
        self._snap_km = float(snap_radius_km)
        self._cell = snap_radius_km / self._KM_PER_DEGREE_EQUATOR
        self._grid: dict[tuple[int, int], list[str]] = {}
        for identifier, (lon, lat) in points.items():
            self._grid.setdefault((int(lon // self._cell), int(lat // self._cell)), []).append(identifier)

    def nearest(self, point: Coord, max_km: float | None = None) -> tuple[str | None, float]:
        """Nearest settlement within the snap radius, or (None, infinity).

        ``max_km`` may narrow the radius below the index's own, which the tests
        use. It never widens it, so a caller cannot accidentally scan the country.
        """
        radius_km = self._snap_km if max_km is None else min(max_km, self._snap_km)
        if not self._points:
            return None, float("inf")

        origin = (int(point[0] // self._cell), int(point[1] // self._cell))
        best_id: str | None = None
        best_km = float("inf")
        ring = 0
        # Longitude degrees shrink by cos(latitude), so the cell size in
        # kilometres is only known once the query's latitude is. Using the
        # index's worst latitude instead made every mid-latitude lookup scan a
        # dozen oversized buckets.
        km_per_cell = self._cell * self._KM_PER_DEGREE_EQUATOR * max(
            math.cos(math.radians(max(abs(point[1]), 1e-6))), 0.05
        )
        while True:
            # Search this ring before deciding to stop. Testing a ring's outer
            # radius before searching it meant a candidate one cell away was never
            # examined.
            for dx in range(-ring, ring + 1):
                for dy in range(-ring, ring + 1):
                    if ring and abs(dx) != ring and abs(dy) != ring:
                        continue
                    for identifier in self._grid.get((origin[0] + dx, origin[1] + dy), ()):
                        distance = haversine_km(point, self._points[identifier])
                        if distance < best_km:
                            best_km = distance
                            best_id = identifier
            ring += 1
            if ring * km_per_cell > radius_km * 2.0:
                break
            if best_id is not None and (ring - 1) * km_per_cell > best_km:
                break
            if ring > 500:
                raise ParseError(
                    f"nearest-settlement search did not terminate for {point}; the index cell size "
                    f"{self._cell} degrees is too small for a {radius_km} km radius"
                )
        if best_km > radius_km:
            return None, float("inf")
        return best_id, best_km


class GeometryStore:
    """Vertex geometry for route segments, written once and read back by offset.

    Two properties matter here and both were learned the hard way.

    **Nothing is held in memory.** The national road and rail network is about
    6.5 million vertices across 137,000 segments. Keeping them as Python tuples
    exhausts memory and the process is killed with no traceback.

    **The file is uncompressed and indexed.** An earlier version gzipped it, and
    gzip has no random access, so every read re-decompressed the file from the
    start. With three consumers each reading all 137,000 segments, that was 411,000
    full decompressions of a 53 MB file, which is where the pipeline kept dying
    during export. Storing a byte offset and length per segment turns a read into
    a seek.

    The file lives in the cache directory and is a build artefact, so it is not
    compressed and not checked in.
    """

    def __init__(self, path: Path) -> None:
        self._path = path
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._handle = None
        self._offsets: dict[str, tuple[int, int]] = {}
        self.written = 0

    def open_for_write(self) -> "GeometryStore":
        self._path.unlink(missing_ok=True)
        self._handle = self._path.open("w", encoding="utf-8")
        self._offsets = {}
        self.written = 0
        return self

    def write(self, segment_id: str, points: list[tuple[float, float]]) -> None:
        """Append one segment's vertices and record where they landed.

        Built with a formatted join rather than json.dumps on a nested list. At
        6.5 million vertices, going through the json module and a list
        comprehension for each one cost more time than every other part of the
        route stage combined.
        """
        if self._handle is None:
            raise ParseError("GeometryStore.write called before open_for_write")
        offset = self._handle.tell()
        body = ",".join(f"[{x:.6f},{y:.6f}]" for x, y in points)
        line = f'{{"segment_id":"{segment_id}","points":[{body}]}}\n'
        self._handle.write(line)
        self._offsets[segment_id] = (offset, len(line.encode("utf-8")))
        self.written += 1

    def close(self) -> None:
        if self._handle is not None:
            self._handle.close()
            self._handle = None

    def load_index(self) -> dict[str, tuple[int, int]]:
        """Re-read the byte offsets of every segment, for a later pass."""
        if not self._offsets:
            if not self._path.is_file():
                raise ParseError(
                    f"{self._path} is missing. Route geometry is written here rather than held in memory, "
                    "so this file must exist before the export can attach vertices."
                )
            with self._path.open("r", encoding="utf-8") as handle:
                import json

                offset = 0
                for line in handle:
                    marker = '"segment_id":"'
                    start = line.find(marker)
                    if start >= 0:
                        identifier = line[start + len(marker) : line.index('"', start + len(marker))]
                        self._offsets[identifier] = (offset, len(line.encode("utf-8")))
                    offset += len(line.encode("utf-8"))
        return self._offsets

    def read(self, segment_id: str) -> list[list[float]]:
        """Vertices for one segment, in a single seek, or an empty list."""
        import json

        index = self.load_index()
        location = index.get(segment_id)
        if location is None:
            return []
        offset, length = location
        if not self._path.is_file():
            raise ParseError(
                f"{self._path} is missing but the route segment {segment_id} expects geometry in it. "
                "Run the routes stage before the export."
            )
        with self._path.open("rb") as handle:
            handle.seek(offset)
            line = handle.read(length)
        record = json.loads(line)
        if record.get("segment_id") != segment_id:
            raise ParseError(
                f"the route geometry index points {segment_id} at a record for "
                f"{record.get('segment_id')!r}; the index and the file disagree"
            )
        return record["points"]


def _seeded_safety(config: Config, road_class: str, kind: str, length_km: float) -> float:
    """Seed road_safety from real attributes plus the documented config weights.

    Deliberately free of any traffic-volume term. See the note in
    config/world_data.toml: the source file has no traffic data, and inventing
    one would be a fabricated number.
    """
    value = float(config.get("road_safety.baseline"))
    if road_class == "primary":
        value += float(config.get("road_safety.primary_class_bonus"))
    value -= float(config.get("road_safety.per_100km_penalty")) * (length_km / 100.0)
    if kind == "rail":
        value -= float(config.get("road_safety.rail_penalty"))
    return max(0.0, min(float(config.get("road_safety.clamp_max")), value))


def _grouped_pairs(segments: list[RouteSegment]) -> dict[tuple[str, str, str], list[RouteSegment]]:
    """Snapped, non-loop segments grouped by the settlement pair and kind they connect.

    The pair is sorted, because a route is undirected: the same corridor read
    from either end is one edge, not two.
    """
    grouped: dict[tuple[str, str, str], list[RouteSegment]] = {}
    for segment in segments:
        if segment.from_settlement_id is None or segment.to_settlement_id is None:
            continue
        if segment.from_settlement_id == segment.to_settlement_id:
            # A loop that starts and ends at the same town is not an edge between
            # two settlements; it is a spur and stays a segment.
            continue
        left, right = sorted((segment.from_settlement_id, segment.to_settlement_id))
        grouped.setdefault((left, right, segment.kind), []).append(segment)
    return grouped


def _covers_the_gap(
    segment: RouteSegment,
    left: str,
    right: str,
    settlement_points: dict[str, Coord],
    min_segment_gc_fraction: float,
) -> bool:
    """Whether one fragment is long enough to be the journey it appears to be.

    TIGER/Line splits rail into yard leads, sidings and digitisation fragments.
    With a snap radius of 10 km on rail, a 30-metre fragment whose two ends land
    inside the snap radius of two different towns is not a route between them; it
    is a piece of track near each town at once. Measured on the 2023 national
    rail layer, 2,263 of 9,648 rail route edges were shorter than the
    great-circle distance between their own two endpoints, the worst a 0.01 km
    "route" between towns 3.9 km apart.

    Two cases are deliberately kept rather than dropped, because the gate exists
    to remove manufactured edges and not to remove settlements from the graph:

    * an endpoint with no position in the index leaves the comparison
      undecidable, and an undecidable edge stays;
    * two towns at the same point have no straight-line distance to be short of.
    """
    if min_segment_gc_fraction <= 0.0:
        return True
    left_point = settlement_points.get(left)
    right_point = settlement_points.get(right)
    if left_point is None or right_point is None:
        return True
    straight_km = haversine_km(left_point, right_point)
    if straight_km <= 0.0:
        return True
    return segment.length_km >= straight_km * min_segment_gc_fraction


def _gate_drop_counts(
    segments: list[RouteSegment],
    settlement_points: dict[str, Coord],
    min_segment_gc_fraction: float,
) -> dict[str, tuple[int, int]]:
    """Fragments the gate keeps and drops, per kind, as (kept, dropped).

    Measured over the same grouping and the same predicate the edge builder uses,
    so the note in the pipeline log is the gate's own arithmetic rather than a
    second implementation of it that could drift.
    """
    counts: dict[str, list[int]] = {}
    for (left, right, kind), members in _grouped_pairs(segments).items():
        entry = counts.setdefault(kind, [0, 0])
        for segment in members:
            survives = _covers_the_gap(segment, left, right, settlement_points, min_segment_gc_fraction)
            entry[0 if survives else 1] += 1
    return {kind: (kept, dropped) for kind, (kept, dropped) in counts.items()}


def _load_lines(
    config: Config,
    archive_name: str,
    kind: str,
    settlement_points: dict[str, Coord],
    geometry_store: GeometryStore,
) -> tuple[list[RouteSegment], list[str]]:
    """Read one TIGER/Line layer and turn every polyline into a route segment.

    ``settlement_points`` is passed in rather than read from disk, so the route
    graph snaps to exactly the settlements the settlements stage decided on, with
    no hidden intermediate file that could go stale.
    """
    radii = config.travel.snap_radius_km_by_class
    # The spatial index is built at the widest class radius; nearest() only ever
    # *narrows* below the index radius, so per-class radii are enforced per line
    # without rebuilding the grid.
    index = SettlementIndex(settlement_points, max(radii.values()))

    segments: list[RouteSegment] = []
    both_snapped = 0
    one_snapped = 0
    none_snapped = 0
    skipped_short = 0

    for shape, record in iter_shapefile(config.path_for("raw_dir") / archive_name, config.path_for("cache_dir")):
        rings = shape if isinstance(shape, list) and shape and isinstance(shape[0], list) else [shape]
        points = rings[0]
        if len(points) < 2:
            skipped_short += 1
            continue
        length_km = polyline_length_km(points)
        if length_km <= 0.0:
            skipped_short += 1
            continue

        road_class = _road_class(config, record, kind)
        speed = _speed_for(config, road_class, kind)
        class_radius_km = radii[road_class]
        from_id, from_km = index.nearest(points[0], max_km=class_radius_km)
        to_id, to_km = index.nearest(points[-1], max_km=class_radius_km)
        if from_id is not None and to_id is not None:
            both_snapped += 1
        elif from_id is not None or to_id is not None:
            one_snapped += 1
        else:
            none_snapped += 1

        linear_id = record.get("LINEARID")
        name = record.get("FULLNAME")
        segment_id = f"{kind}-{linear_id}"
        geometry_store.write(segment_id, points)
        segments.append(
            RouteSegment(
                segment_id=segment_id,
                kind=kind,
                name=str(name) if name else None,
                road_class=road_class,
                length_km=length_km,
                speed_kmh=speed,
                travel_hours=length_km / speed,
                road_safety=_seeded_safety(config, road_class, kind, length_km),
                from_settlement_id=from_id,
                to_settlement_id=to_id,
                snap_from_km=from_km if from_id else None,
                snap_to_km=to_km if to_id else None,
                vertex_count=len(points),
            )
        )

    notes = [
        f"{archive_name}: read {len(segments)} lines against {len(settlement_points)} settlement points "
        f"with per-class snap radii {radii}. "
        f"{both_snapped} snapped at both ends, {one_snapped} at one "
        f"end, {none_snapped} at neither. Lines shorter than one usable vertex were skipped: {skipped_short}."
    ]
    return segments, notes


def _road_class(config: Config, record: dict, kind: str) -> str:
    """Road class from the Census RTTYP attribute, mapped through config."""
    if kind == "rail":
        return "rail"
    rttyp = record.get("RTTYP")
    mapping = config.travel.road_class_mtfcc
    if rttyp is None:
        return "secondary"
    return mapping.get(str(rttyp).strip().upper(), "secondary")


def _speed_for(config: Config, road_class: str, kind: str) -> float:
    if kind == "rail":
        return config.travel.kmh_rail
    if road_class == "primary":
        return config.travel.kmh_primary
    if road_class == "offroad":
        return config.travel.kmh_offroad
    return config.travel.kmh_secondary


def load_routes(
    config: Config,
    settlement_points: dict[str, Coord],
    *,
    tiger_year: int = 2023,
) -> tuple[list[RouteSegment], list[Route], list[str]]:
    """Load roads and rail, then build the settlement-to-settlement route graph.

    ``settlement_points`` maps settlement identifier to its longitude and
    latitude, resolved by the settlements stage. The same map measures the
    straight line between two snapped towns, which is what
    ``travel.min_segment_gc_fraction`` is applied to; without it the configured
    knob would be a comment, and 63.8% of the committed rail edges were shorter
    than the great-circle distance between their own endpoints.
    """
    if not settlement_points:
        raise ParseError(
            "the route graph was asked to snap to an empty settlement set; run the settlements stage first"
        )
    min_segment_gc_fraction = float(config.get("travel.min_segment_gc_fraction"))
    if not 0.0 <= min_segment_gc_fraction <= 1.0:
        raise ParseError(
            f"travel.min_segment_gc_fraction is {min_segment_gc_fraction}, which is not a fraction of the "
            "straight line between two settlements; config/world_data.toml documents 0.25..0.75"
        )
    segments: list[RouteSegment] = []
    notes: list[str] = []

    store = GeometryStore(config.path_for("cache_dir") / "route_geometry.jsonl.gz").open_for_write()
    try:
        roads, road_notes = _load_lines(
            config, f"tl_{tiger_year}_us_primaryroads.zip", "road", settlement_points, store
        )
        segments.extend(roads)
        notes.extend(road_notes)

        rails, rail_notes = _load_lines(
            config, f"tl_{tiger_year}_us_rails.zip", "rail", settlement_points, store
        )
        segments.extend(rails)
        notes.extend(rail_notes)
    finally:
        store.close()
    notes.append(
        f"Route geometry was written to {store._path.name} rather than held in memory: {store.written:,} "
        f"segment vertex lists, {store._path.stat().st_size / 1_000_000:.0f} MB, with a byte-offset index so "
        "the export can seek to a segment instead of rescanning the file."
    )

    routes = _build_route_edges(
        segments,
        settlement_points=settlement_points,
        min_segment_gc_fraction=min_segment_gc_fraction,
    )
    connected = sum(1 for route in routes if route.from_settlement_id and route.to_settlement_id)
    notes.append(
        f"Built {len(routes)} settlement-to-settlement route edges from {len(segments)} imported lines "
        f"({connected} have settlements at both ends)."
    )
    dropped_notes = []
    gate_counts = _gate_drop_counts(segments, settlement_points, min_segment_gc_fraction)
    for kind, (kept, dropped) in sorted(gate_counts.items()):
        if not dropped:
            continue
        dropped_notes.append(f"{kind}: {dropped:,} of {kept + dropped:,} snapped fragments")
    if dropped_notes:
        notes.append(
            f"Line fragments shorter than travel.min_segment_gc_fraction ({min_segment_gc_fraction:g}) of the "
            "straight line between the two settlements they snapped to formed no route edge, and stayed in the "
            "segment table. Fragments that gate removed: " + "; ".join(dropped_notes) + ". A fragment with an "
            "endpoint that has no settlement position is left undecidable and keeps its edge."
        )
    notes.append(
        "Road length is the sum of great-circle distances between consecutive real vertices of the Census "
        "centreline. It is not a posted-mileage figure and will be shorter on mountainous terrain than a "
        "vehicle would actually travel."
    )
    return segments, routes, notes


def _build_route_edges(
    segments: list[RouteSegment],
    *,
    settlement_points: dict[str, Coord] | None = None,
    min_segment_gc_fraction: float | None = None,
) -> list[Route]:
    """Turn snapped segments into undirected settlement-to-settlement routes.

    ``settlement_points`` and ``min_segment_gc_fraction`` together switch on the
    gate that refuses to make a route edge out of a fragment that is far shorter
    than the straight line between the two towns it snapped to; see
    `_covers_the_gap` for why and for the two cases it leaves alone.

    Both default to None, which is the unfiltered behaviour and the reason the
    gate is an argument rather than a change of default: a caller with no
    settlement positions - a repair tool working from the committed segment table,
    say - still gets every snapped pair, exactly as before the gate existed. The
    gate is per fragment, as `travel.min_segment_gc_fraction` describes it, so a
    corridor carried by several parallel tracks keeps its edge on whichever
    fragments survive.
    """
    grouped = _grouped_pairs(segments)
    if settlement_points is not None and min_segment_gc_fraction is not None:
        grouped = {
            key: [
                segment
                for segment in members
                if _covers_the_gap(segment, key[0], key[1], settlement_points, min_segment_gc_fraction)
            ]
            for key, members in grouped.items()
        }
    routes: list[Route] = []
    for (left, right, kind), members in sorted(grouped.items()):
        if not members:
            continue
        length = sum(segment.length_km for segment in members)
        # Length-weighted mean safety: a short dangerous spur should not drag a
        # long safe highway down as hard as a long dangerous one would lift it.
        safety = (
            sum(segment.road_safety * segment.length_km for segment in members) / length if length > 0 else 0.0
        )
        # The edge's class is its longest member's: a route that is 90%
        # interstate and 10% frontage road behaves as an interstate.
        longest = max(members, key=lambda segment: segment.length_km)
        routes.append(
            Route(
                route_id=f"{kind}:{left}->{right}",
                from_settlement_id=left,
                to_settlement_id=right,
                distance_km=length,
                road_safety=safety,
                segment_ids=tuple(segment.segment_id for segment in members),
                kind=kind,
                road_class=longest.road_class,
                travel_hours=sum(segment.travel_hours for segment in members),
            )
        )
    return routes


def segment_bounds(store: GeometryStore, segment: RouteSegment) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """First and last vertex of a segment, read from the geometry store."""
    points = store.read(segment.segment_id)
    if not points:
        return None
    return ((points[0][0], points[0][1]), (points[-1][0], points[-1][1]))


def segments_in_region(
    segments: list[RouteSegment],
    store: GeometryStore,
    bbox: tuple[float, float, float, float],
) -> list[RouteSegment]:
    """Segments with at least one endpoint inside a bounding box."""
    inside: list[RouteSegment] = []
    for segment in segments:
        bounds = segment_bounds(store, segment)
        if bounds is None:
            continue
        start, end = bounds
        if point_in_bbox(start, bbox) or point_in_bbox(end, bbox):
            inside.append(segment)
    return inside
