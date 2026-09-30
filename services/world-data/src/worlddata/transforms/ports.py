"""Ports, attributed to states by real geometry.

SPEC.md section 3 requires a ``ports`` figure in the state profile, and
FACTIONS.md makes ports central to the Pacific Compact and Atlantic Corridor
story. FACTIONS.md section 5 says the figure comes from geography data.

Reading the real Natural Earth 1:10m ports file showed it carries no country and
no state attribute at all - only a name, a feature class, a scale rank and a URL.
Attributing ports to states therefore has to be done geometrically, which this
module does: a port belongs to the state polygon that contains its point.

Performance note: a naive containment test of 1,081 ports against 51 state
polygons takes minutes, because a single large state has thousands of vertices.
Pre-filtering by bounding box makes it milliseconds and does not change the
answer, because a point outside the bounding box cannot be inside the polygon.

What the figure is and is not: a count of ports large enough to appear on a
1:10m world map, with Natural Earth's scale rank as an importance weight. Small
harbours, river ports and fishing wharves are absent. That gap is recorded in the
data manifest.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from ..config import Config
from ..errors import ParseError
from ..geo.geojson import read_features
from ..geo.polygons import PolygonIndex
from ..geo.wgs84 import Coord, bbox_of, point_in_bbox
from .boundaries import StateBoundary

# Natural Earth scale ranks. Lower rank means more important: 3-4 minor,
# 5-6 intermediate, 7-8 small. Reading the real file showed the ranks it actually
# uses for ports are 3 to 8 - it contains no rank 0-2 feature - so the labels
# here do not claim a "major" category that this dataset cannot produce. A port
# is both counted and weighted, so a coast of ten minor wharves does not outrank
# one important deep-water port the way a raw count would let it.
PORT_SCALE_RANKS = {
    3: "minor",
    4: "minor",
    5: "intermediate",
    6: "intermediate",
    7: "small",
    8: "small",
}
# Ranks the source could carry but does not, kept so an unexpected rank is
# labelled rather than silently bucketed.
PORT_SCALE_RANKS.update({rank: "major" for rank in (0, 1, 2)})


@dataclass(frozen=True)
class Port:
    """One port, with the state it actually falls inside."""

    port_id: str
    name: str
    state_fips: str
    scale_rank: int
    scale_label: str
    longitude: float
    latitude: float


def _longitudes_to_try(longitude: float, bounds: tuple[float, float, float, float]) -> list[float]:
    """Longitudes to test a point at, handling polygons that cross 180 degrees.

    Alaska is the only state where this can arise: its Census boundary ring uses
    positive longitudes for the western Aleutians and negative longitudes for
    the rest, so a port in that far-western group shares no longitude with the
    ring that contains it. When a state's bounding box is wider than 180 degrees
    the point is also tested shifted by a full turn each way.
    """
    if bounds[2] - bounds[0] <= 180.0:
        return [longitude]
    return [longitude, longitude + 360.0, longitude - 360.0]


def load_ports(config: Config, boundaries: list[StateBoundary]) -> tuple[list[Port], list[str]]:
    """Read the Natural Earth ports file and attribute each port to a state."""
    path = config.path_for("raw_dir") / "ne_10m_ports.geojson"
    if not path.is_file():
        raise ParseError(
            f"{path} is missing. Ports feed the money rating dimension, so their absence is reported "
            "rather than scored as zero."
        )

    # Pre-compute each state's bounding box and a ring-level index, so the
    # containment test only runs on states the point could plausibly be inside
    # and only scans rings that could contain it.
    candidates: list[tuple[str, str, PolygonIndex, tuple[float, float, float, float]]] = []
    for boundary in boundaries:
        candidates.append(
            (boundary.state_fips, boundary.name, PolygonIndex(boundary.polygons), bbox_of(boundary.geometry))
        )

    ports: list[Port] = []
    worldwide = 0
    unmatched_us = 0
    for geometry, properties in read_features(path):
        if properties.get("featurecla") != "Port":
            continue
        if geometry.get("type") != "Point":
            raise ParseError(
                f"Natural Earth port {properties.get('name')!r} has geometry type "
                f"{geometry.get('type')!r}; only Point is supported"
            )
        coordinates = geometry["coordinates"]
        point: Coord = (float(coordinates[0]), float(coordinates[1]))
        worldwide += 1

        matched: tuple[str, str] | None = None
        for fips, name, polygons, bounds in candidates:
            if not point_in_bbox(point, bounds):
                continue
            for candidate_longitude in _longitudes_to_try(point[0], bounds):
                if polygons.contains((candidate_longitude, point[1])):
                    matched = (fips, name)
                    break
            if matched is not None:
                break
        if matched is None:
            unmatched_us += 1
            continue

        rank = properties.get("scalerank")
        rank_value = int(rank) if isinstance(rank, (int, float)) or (isinstance(rank, str) and rank.isdigit()) else 8
        ports.append(
            Port(
                port_id=str(properties.get("ne_id") or f"port-{len(ports):05d}"),
                name=str(properties.get("name") or "unnamed port"),
                state_fips=matched[0],
                scale_rank=rank_value,
                scale_label=PORT_SCALE_RANKS.get(rank_value, "small"),
                longitude=point[0],
                latitude=point[1],
            )
        )

    if not ports:
        raise ParseError(
            f"{path.name} produced no ports attributed to a US state. The attribution is geometric, so a "
            "zero result means the state polygons and the port points no longer agree."
        )

    notes = [
        f"{path.name}: {worldwide} ports in the file, {len(ports)} of them attributed to one of the 51 "
        "states by testing each port point against the real state polygons. The remaining ports are "
        "outside US state boundaries in this source.",
        "Port importance uses Natural Earth's own scale rank. The ranks this file actually uses for ports "
        "are 3 to 8 (minor, intermediate, small); it contains no rank 0-2 feature, so no port is labelled "
        "major and none is treated as more important than the source claims. Natural Earth publishes no "
        "throughput figure in this file, so no tonnage is imported and none is assumed.",
        "Antimeridian: Alaska's boundary spans 359 degrees of longitude because the Aleutians cross the "
        "180th meridian, so a port point is also tested shifted by a full turn. As it happens no port in "
        "this file lies west of 170 degrees west, so the shift currently attributes nothing extra. It is "
        "kept because it is correct, not because the data needed it.",
    ]
    return ports, notes


def summarise_by_state(ports: list[Port]) -> dict[str, dict[str, float | int]]:
    """Count and weight ports per state."""
    summary: dict[str, dict[str, float | int]] = {}
    for port in ports:
        entry = summary.setdefault(
            port.state_fips,
            {
                "port_count": 0,
                "port_count_major": 0,
                "port_weight": 0.0,
            },
        )
        entry["port_count"] = int(entry["port_count"]) + 1
        if port.scale_label == "major":
            entry["port_count_major"] = int(entry["port_count_major"]) + 1
        # Weight by Natural Earth scale rank: rank 0 weighs 1.0, each step down
        # weighs one eighth of that, floored so no port is worth nothing.
        entry["port_weight"] = float(entry["port_weight"]) + 1.0 / (1.0 + port.scale_rank / 2.0)
    return summary
