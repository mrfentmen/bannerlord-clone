"""Build the campaign client's wire-format files from the pipeline tables.

Rowan's client (``clients/campaign``) defines the exact shapes it reads in
``src/world/types.ts``: ``region.json``, ``settlements.json``, ``network.json``.
The client's own ``public/world/`` data was fetched for the Northern Colorado
Front Range as a stopgap before this pipeline landed; its DATA-MANIFEST.md
section 5 names this module's output the authoritative replacement:

    "The client expects region.json, settlements.json, and network.json at the
    shapes in src/world/types.ts ... Agent 1's export is authoritative and wins
    wherever the two differ."

What is converted, for the V1 region recorded in the ``regions`` table:

  region.json      name, bbox, and the zoom-12 terrarium tile list covering the
                   bbox, from the pipeline's V1 region decision.
  settlements.json every settlement whose coordinates fall inside the V1 bbox,
                   mapped to the client's WorldSettlementFile shape.
  network.json     every road/rail route segment touching the V1 bbox, with its
                   real TIGER/Line geometry reprojected to [lat, lon] pairs.

Reads the pipeline's working tables from ``dist/`` (parquet): settlements,
route_segments (geometry is excluded from the committed portable bundle, so
this step needs the full pipeline output, not just ``exports/``), regions,
state_profiles. Writes the three files to ``dist/wire/``.

Standing rule (boss order 2026-09-30): OSS projects are reference only. This
module contains no code from any OSS project; the tile math is the standard
slippy-map formula, and the wire shapes are the client's own contract.
"""

from __future__ import annotations

import gzip
import json
import math
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterator

# ---------------------------------------------------------------------------
# Constants. Declared, not magic: each has a comment saying where it comes from.
# ---------------------------------------------------------------------------

# Zoom level of the terrarium elevation tiles, matching the client's existing
# region.json (DATA-MANIFEST.md section 2.1: zoom 12, ~30 m per pixel).
ELEVATION_ZOOM = 12
ELEVATION_TILE_SIZE = 256
ELEVATION_ENCODING = "terrarium"
ELEVATION_FORMULA = "elevation_metres = R * 256 + G + B / 256 - 32768"
# Public tile template. The client's fetch tool already pulls from here; the
# region file only lists which tiles, it does not bundle them.
TERRARIUM_URL_TEMPLATE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"

# Census place-name suffixes stripped for the display name. The full Census name
# is kept in populationCensusName. Only these four are stripped: the rarer
# trailing tokens ("government", "County", "corporation", "Bow", ...) are real
# parts of names often enough that stripping them would mangle places.
# Verified against all 13,189 settlement names 2026-09-30: every name ending in
# one of these has a non-empty stem (e.g. "Alexander City city" -> "Alexander City").
NAME_SUFFIXES = ("city", "town", "village", "borough")
_NAME_SUFFIX_RE = re.compile(
    r"\s+(?:" + "|".join(NAME_SUFFIXES) + r")$", re.IGNORECASE
)

# Road classes the pipeline emits (Census TIGER/Line primary/secondary roads).
# Both are members of the client's RoadClass union; anything else passes through
# untouched and is logged, because silently reclassifying real data is worse
# than handing the client a string it does not recognise.
KNOWN_ROAD_CLASSES = ("motorway", "trunk", "primary", "secondary")


# ---------------------------------------------------------------------------
# Small pure helpers (unit-tested).
# ---------------------------------------------------------------------------

def display_name(census_name: str) -> str:
    """Turn a Census place name into a display name.

    "Abbeville city" -> "Abbeville"; "Alexander City city" -> "Alexander City".
    Names with no recognised suffix are returned unchanged.
    """
    stripped = _NAME_SUFFIX_RE.sub("", census_name).strip()
    # Never return an empty name: if the whole name was a suffix (it never is in
    # the data, but be safe), keep the original.
    return stripped or census_name


def slippy_tile(lon: float, lat: float, zoom: int = ELEVATION_ZOOM) -> tuple[int, int]:
    """Standard slippy-map tile (x, y) for a lon/lat at the given zoom."""
    n = 2**zoom
    x = math.floor((lon + 180.0) / 360.0 * n)
    lat_rad = math.radians(lat)
    y = math.floor(
        (1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi)
        / 2.0
        * n
    )
    return x, y


def tiles_for_bbox(
    south: float, west: float, north: float, east: float, zoom: int = ELEVATION_ZOOM
) -> list[dict[str, Any]]:
    """Every zoom-``zoom`` terrarium tile intersecting the bbox, in tile order."""
    x_west, y_north = slippy_tile(west, north, zoom)
    x_east, y_south = slippy_tile(east, south, zoom)
    tiles = []
    for x in range(x_west, x_east + 1):
        for y in range(y_north, y_south + 1):
            tiles.append(
                {
                    "z": zoom,
                    "x": x,
                    "y": y,
                    "path": f"elevation/{zoom}/{x}/{y}.png",
                }
            )
    return tiles


def geometry_to_latlon(geometry: Any) -> list[list[float]] | None:
    """Normalise a segment geometry to [[lat, lon], ...].

    The pipeline stores geometry as a JSON string of [[lon, lat], ...] pairs
    (see exports/schema.json, route_segments.geometry). Returns None when the
    geometry is missing or has no usable vertices.
    """
    if geometry is None:
        return None
    pairs = json.loads(geometry) if isinstance(geometry, str) else geometry
    coords: list[list[float]] = []
    for point in pairs:
        if point is None or len(point) < 2:
            continue
        lon, lat = point[0], point[1]
        if lon is None or lat is None:
            continue
        coords.append([float(lat), float(lon)])
    return coords or None


def touches_bbox(
    coords: list[list[float]], south: float, west: float, north: float, east: float
) -> bool:
    """True when any vertex of the polyline lies inside the bbox."""
    return any(
        south <= lat <= north and west <= lon <= east for lat, lon in coords
    )


# ---------------------------------------------------------------------------
# Table readers. The pipeline writes dist/*.parquet; read those.
# ---------------------------------------------------------------------------

def _read_parquet_rows(path: Path, columns: list[str] | None = None) -> Iterator[dict[str, Any]]:
    """Yield rows from a parquet file as plain dicts. pyarrow is a pipeline dependency."""
    import pyarrow.parquet as pq

    table = pq.read_table(path, columns=columns)
    names = table.column_names
    for batch in table.to_batches():
        for row in zip(*(batch.column(name).to_pylist() for name in names)):
            yield dict(zip(names, row))


def _read_jsonl_gz_rows(path: Path) -> Iterator[dict[str, Any]]:
    """Yield data rows from a pipeline .jsonl.gz file (skips the header record)."""
    with gzip.open(path, "rt") as handle:
        header = json.loads(next(handle))
        if not isinstance(header, dict) or "_header" not in header:
            raise ValueError(f"{path} does not look like a pipeline jsonl.gz export")
        for line in handle:
            line = line.strip()
            if line:
                yield json.loads(line)


def _load_table(dist: Path, exports: Path, name: str) -> list[dict[str, Any]]:
    """Load a pipeline table, preferring dist/*.parquet, falling back to exports/*.jsonl.gz."""
    parquet_path = dist / f"{name}.parquet"
    if parquet_path.is_file():
        return list(_read_parquet_rows(parquet_path))
    jsonl_path = exports / f"{name}.jsonl.gz"
    if jsonl_path.is_file():
        return list(_read_jsonl_gz_rows(jsonl_path))
    raise FileNotFoundError(
        f"table {name!r} not found as {parquet_path} or {jsonl_path}; "
        "run the pipeline first (python -m worlddata run)"
    )


# ---------------------------------------------------------------------------
# Builders.
# ---------------------------------------------------------------------------

@dataclass
class WireBuildResult:
    out_dir: Path
    region_name: str
    settlement_count: int
    road_count: int
    rail_count: int
    tile_count: int
    warnings: list[str] = field(default_factory=list)

    def log_lines(self) -> list[str]:
        return [
            f"wire: region {self.region_name!r}",
            f"wire: {self.settlement_count} settlements, "
            f"{self.road_count} roads, {self.rail_count} rail segments, "
            f"{self.tile_count} elevation tiles",
            *(f"wire: WARNING: {w}" for w in self.warnings),
            f"wire: wrote {self.out_dir}/region.json, settlements.json, network.json",
        ]


def build_wire_files(
    dist_dir: Path,
    out_dir: Path,
    exports_dir: Path | None = None,
    retrieved: str | None = None,
    census_year: int = 2020,
    estimates_vintage: int = 2023,
) -> WireBuildResult:
    """Convert pipeline tables to the client's three wire-format files.

    ``census_year`` / ``estimates_vintage`` default to the values in
    ``config/world_data.toml``; pass the loaded config's values when they differ
    so the populationSource citation stays honest.
    """
    dist = Path(dist_dir)
    exports = Path(exports_dir) if exports_dir else dist / "exports"
    # The committed portable bundle lives at services/world-data/exports/; the
    # pipeline's own dist/exports copy may not exist. Try the repo exports dir too.
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

    state_profiles = _load_table(dist, exports, "state_profiles")
    fips_to_abbr = {str(r["state_fips"]): str(r["abbreviation"]) for r in state_profiles}
    fips_to_name = {str(r["state_fips"]): str(r["name"]) for r in state_profiles}

    # --- region.json ---------------------------------------------------------
    tiles = tiles_for_bbox(south, west, north, east)
    settlements_all = _load_table(dist, exports, "settlements")
    in_region = [
        s
        for s in settlements_all
        if s.get("latitude") is not None
        and s.get("longitude") is not None
        and south <= float(s["latitude"]) <= north
        and west <= float(s["longitude"]) <= east
    ]
    states_hit = sorted({str(s["state_fips"]) for s in in_region})
    region_file = {
        "name": region_name,
        "bbox": {"south": south, "west": west, "north": north, "east": east},
        "elevation": {
            "encoding": ELEVATION_ENCODING,
            "formula": ELEVATION_FORMULA,
            "zoom": ELEVATION_ZOOM,
            "tileSize": ELEVATION_TILE_SIZE,
            "tiles": tiles,
        },
        "retrieved": retrieved,
        "stateCoverage": {
            "region": ", ".join(fips_to_name.get(f, f) for f in states_hit),
            "regionCode": ",".join(fips_to_abbr.get(f, f) for f in states_hit),
            "basis": (
                "states containing settlements inside the V1 bbox, "
                "per Census TIGER/Line place geography"
            ),
            "settlementTagsPresent": len(in_region),
        },
    }

    # --- settlements.json ----------------------------------------------------
    pop_source = (
        "U.S. Census Bureau, "
        f"Vintage {estimates_vintage} sub-county population estimates, "
        f"{census_year} Census count"
    )
    wire_settlements = []
    for s in in_region:
        fips = str(s["state_fips"])
        wire_settlements.append(
            {
                # The client's field is named osmId, but the contract
                # (DATA-MANIFEST.md section 5) says Agent 1's export is
                # authoritative: our stable id is the Census-based
                # settlement_id (state FIPS + place code), which survives
                # re-runs exactly the way an OSM node id would.
                "osmId": str(s["settlement_id"]),
                "name": display_name(str(s["name"])),
                "place": str(s["size_class"]),
                "lat": float(s["latitude"]),
                "lon": float(s["longitude"]),
                "population": int(s["population"]),
                "populationSource": pop_source,
                "populationCensusName": str(s["name"]),
                "state": fips_to_name.get(fips),
                "stateCode": fips_to_abbr.get(fips),
                "osmPopulation": None,
                "osmPopulationDate": None,
                "wikidata": None,
            }
        )
    # Stable order: biggest places first, so a truncated read still shows cities.
    wire_settlements.sort(key=lambda r: (-r["population"], r["name"]))
    settlements_file = {
        "source": "agent-1-export",
        "licence": (
            "U.S. Government work, public domain (Title 17 U.S.C. 105). "
            "Settlement populations: U.S. Census Bureau, Vintage 2023 "
            "sub-county population estimates, 2020 Census counts. "
            "No attribution required."
        ),
        "retrieved": retrieved,
        "settlements": wire_settlements,
    }

    # --- network.json --------------------------------------------------------
    # Route geometry is deliberately excluded from the committed portable
    # bundle (55 MB, regenerable), so unlike the other tables this one MUST
    # come from the pipeline's own dist/ output. Loading the exports copy
    # would silently emit an empty network.
    segments_path = dist / "route_segments.parquet"
    if not segments_path.is_file():
        raise FileNotFoundError(
            f"{segments_path} not found; the wire network needs the full pipeline "
            "output (python -m worlddata run), not just the committed exports/"
        )
    segments = list(_read_parquet_rows(segments_path))
    roads: list[dict[str, Any]] = []
    rail: list[dict[str, Any]] = []
    for seg in segments:
        coords = geometry_to_latlon(seg.get("geometry"))
        if coords is None:
            continue
        if not touches_bbox(coords, south, west, north, east):
            continue
        kind = str(seg.get("kind"))
        entry_id = str(seg.get("segment_id"))
        name = seg.get("name")
        if kind == "rail":
            rail.append({"osmId": entry_id, "name": name, "coords": coords})
        elif kind == "road":
            road_class = seg.get("road_class")
            if road_class not in KNOWN_ROAD_CLASSES:
                warnings.append(
                    f"segment {entry_id} has road_class {road_class!r}, "
                    "outside the client's RoadClass union; passing through unchanged"
                )
            roads.append(
                {
                    "osmId": entry_id,
                    "highway": road_class,
                    "name": name,
                    "ref": None,
                    "surface": None,
                    "lanes": None,
                    "coords": coords,
                }
            )
        else:
            warnings.append(f"segment {entry_id} has unknown kind {kind!r}; skipped")
    network_file = {
        "source": "agent-1-export",
        "licence": (
            "U.S. Government work, public domain (Title 17 U.S.C. 105). "
            "Road geometry: U.S. Census Bureau, TIGER/Line 2023 Primary and "
            "Secondary Roads; rail geometry: TIGER/Line 2023 Rail Lines. "
            "No attribution required."
        ),
        "retrieved": retrieved,
        "roads": roads,
        "rail": rail,
    }

    for filename, payload in (
        ("region.json", region_file),
        ("settlements.json", settlements_file),
        ("network.json", network_file),
    ):
        with open(out / filename, "w") as handle:
            json.dump(payload, handle, separators=(",", ":"))

    return WireBuildResult(
        out_dir=out,
        region_name=region_name,
        settlement_count=len(wire_settlements),
        road_count=len(roads),
        rail_count=len(rail),
        tile_count=len(tiles),
        warnings=warnings,
    )
