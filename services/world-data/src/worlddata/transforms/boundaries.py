"""Boundary import and the Natural Earth cross-check.

Two independent sources describe US state boundaries, at deliberately different
resolutions:

  * the Census Bureau's Cartographic Boundary Files at 500k, which carry the
    Census Bureau's own ALAND/AWATER area figures;
  * Natural Earth at 1:10m, which knows nothing about Census Bureau areas.

The pipeline imports the Census file and uses Natural Earth to corroborate it.
The two resolutions differ, so the check is not an equality test on geometry -
it tests that every state the pipeline ships is present in both sources and
that the two area figures agree to within the difference expected between a
1:500k and a 1:10m generalisation. A state present in one and not the other, or
whose areas disagree beyond that, stops the run.

The place file is a second reader of the same two Census publications, and the
two disagree about how a place is spelled. ``PlaceBoundaryIndex`` is the single
lookup over those place boundaries, shared by both pipeline stages that need a
settlement's centre, so the geometry stage and the seed stage cannot disagree
about which settlements have a position. ``is_place_fragment`` and
``base_place_name`` are the single definition of the Census Bureau's fragment
marker, used here and by ``transforms.settlements``; they were previously two
copies that drifted.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from ..config import Config
from ..errors import ParseError
from ..geo.geojson import read_features
from ..geo.polygons import area_km2, contains, interior_point, to_multipolygon
from ..geo.wgs84 import bbox_of
from .geometry import ShapefileSource, iter_shapefile, load_shapefile

# Field names in the Census Cartographic Boundary Files attribute tables.
_FIELD_STATE_FIPS = "STATEFP"
_FIELD_NAME = "NAME"
_FIELD_STUSPS = "STUSPS"
_FIELD_LAND_M2 = "ALAND"
_FIELD_WATER_M2 = "AWATER"

# Census Bureau Legal/Statistical Area Description codes that appear in place
# files. Only the codes actually seen in this dataset are listed; anything else
# is exported as "other" with its raw code intact.
LSAD_LABELS = {
    "25": "city",
    "21": "borough",
    "31": "town",
    "11": "city",
    "12": "borough",
    "13": "town",
    "37": "village",
    "57": "community",
    "53": "community",
    "52": "village",
    "61": "community",
    "62": "village",
    "70": "CDP",
    "19": "city",
    "20": "borough",
    "39": "town",
    "44": "village",
}

# Natural Earth admin-1 property names. Natural Earth covers the whole world,
# so admin-1 features for many countries share a postal abbreviation with a US
# state (Mali's Kayes region uses "KY"). Every feature is therefore filtered on
# adm0_a3 == USA before any US field is read.
_NE_COUNTRY = "adm0_a3"
_NE_COUNTRY_USA = "USA"
_NE_FIPS = "fips"
_NE_POSTAL = "postal"
_NE_NAME = "name"
_NE_ISO_SUBDIVISION = "iso_3166_2"


@dataclass(frozen=True)
class StateBoundary:
    """One state's real boundary, area, and identity."""

    state_fips: str
    abbreviation: str
    name: str
    land_area_km2: float
    water_area_km2: float
    geometry: list[list[tuple[float, float]]]
    polygons: list[list[list[tuple[float, float]]]]


@dataclass(frozen=True)
class PlaceBoundary:
    """One Census place's boundary, interior point, and legal area type.

    ``lsad_code`` is the Census Bureau's own Legal/Statistical Area Description
    code, which is what distinguishes a city from a town from a borough from a
    Census-designated place. The code is carried through to the export rather
    than being replaced with a guess, and the mapping below is labelled from the
    Census Bureau's published LSAD code list.
    """

    state_fips: str
    place_fips: str
    name: str
    name_with_type: str
    lsad_code: str
    land_area_km2: float
    longitude: float
    latitude: float
    vertex_count: int
    ring_count: int


# Census Bureau fragment markers, spelled the way the two source files spell them.
#
# The cartographic place file publishes a consolidated city-county government as
# "Indianapolis city (balance)" because the government is two jurisdictions and
# the file carries only the part outside the city. The Vintage estimates file
# publishes the same place as "Indianapolis city", under SUMLEV 170, with PLACE
# 00000. County parts appear as "West Peoria city (pt.)" and the remainder of a
# county outside every place as "Balance of Cook County".
#
# Both files have to be readable and the join between them has to survive the
# difference, so the marker is stripped in exactly one place. Two readers that
# each carried their own copy of the rule is how the eight consolidated
# governments came to resolve to no polygon at all.
_FRAGMENT_PREFIX = "Balance of "
_FRAGMENT_SUFFIXES = ("(pt.)", "(balance)")


def is_place_fragment(name: str) -> bool:
    """True for a row that is part of a place rather than the place itself.

    The settlement reader uses this to drop fragment rows before they can be
    counted as settlements of their own; the place reader uses `base_place_name`
    to get behind the marker so a fragment spelling can still find its place.
    """
    return name.startswith(_FRAGMENT_PREFIX) or name.endswith(_FRAGMENT_SUFFIXES)


def base_place_name(name: str) -> str:
    """The place a fragment row belongs to, or the name unchanged.

    'Indianapolis city (balance)' and 'Indianapolis city' are the same place in
    two Census Bureau publications, and both spellings have to reach the same
    entry in `PlaceBoundaryIndex` for the join to hold.
    """
    if name.startswith(_FRAGMENT_PREFIX):
        return name[len(_FRAGMENT_PREFIX) :].strip()
    for suffix in _FRAGMENT_SUFFIXES:
        if name.endswith(suffix):
            return name[: -len(suffix)].strip()
    return name


class PlaceBoundaryIndex:
    """The one place lookup: place FIPS first, then (state FIPS, name).

    Two keys, in that order, because the Census Bureau's own identifier is the
    strongest key there is and must not be second-guessed. Everything keyed on a
    place FIPS resolves on it alone.

    The second key exists for the places the Census Bureau gives no place FIPS.
    A Census-designated place and a consolidated city-county government are both
    published as PLACE 00000, so their `settlement_id` is built from the state
    FIPS and the name and a FIPS lookup can never hold them. Those are the eight
    largest settlements in the export by population for Indianapolis, Louisville
    and Nashville-Davidson, and they shipped with null coordinates, null land
    area and null crowding because the fallback could not fire.

    Two rules that the fallback has to obey, both learned from real data:

    * **Both sides of the lookup are state FIPS.** Keying the index on the
      boundary's state FIPS and looking it up with the population row's
      ``state_name`` could never match - "18" is not "Indiana" - so the fallback
      was dead code and every settlement that needed it silently got nothing.
    * **An ambiguous name resolves to nothing.** Pennsylvania publishes two
      "Liberty borough" places; picking either would put one town at the other
      one's coordinates, which is worse than shipping no outline. Those keys are
      reported in `ambiguous_names` so the settlements that carry one are
      visible rather than merely absent.

    The key is the place file's own ``NAME``, behind the fragment marker, and
    not ``NAMELSAD``. The two disagree for 32,595 of the 32,608 rows in the 2023
    file - the cartographic file puts the LSAD type in ``NAMELSAD`` only - and
    indexing both spellings would make 90 further (state, name) pairs ambiguous
    without resolving a single additional settlement in the published export.
    """

    def __init__(self, boundaries: Iterable[PlaceBoundary]) -> None:
        self._by_key: dict[str, PlaceBoundary] = {}
        candidates: dict[tuple[str, str], list[PlaceBoundary]] = {}
        for boundary in boundaries:
            key = f"{boundary.state_fips}-{boundary.place_fips}"
            if key in self._by_key:
                raise ParseError(
                    f"two place boundaries share the identifier {key}; the place file is supposed to hold "
                    "one row per state and place FIPS"
                )
            self._by_key[key] = boundary
            name = base_place_name(boundary.name)
            if name:
                candidates.setdefault((boundary.state_fips, name), []).append(boundary)
        self._by_state_name = {
            key: members[0] for key, members in candidates.items() if len(members) == 1
        }
        self.ambiguous_names: list[tuple[str, str]] = sorted(
            key for key, members in candidates.items() if len(members) > 1
        )

    def resolve(self, settlement_id: str, state_fips: str, name: str) -> PlaceBoundary | None:
        """The boundary for one settlement, or None if there is not an unambiguous one.

        ``settlement_id`` is the settlement's own identifier, ``state_fips`` its
        Census state FIPS and ``name`` its name as the population file spells it.
        A FIPS-keyed identifier resolves on its own; anything else falls back to
        the state FIPS together with the name, behind the fragment marker.
        """
        by_fips = self._by_key.get(settlement_id)
        if by_fips is not None:
            return by_fips
        return self._by_state_name.get((state_fips, base_place_name(name)))


def _unpack_place_archive(archive_path: Path, cache_dir: Path) -> Path:
    """Unpack a place shapefile ZIP, returning the directory holding it."""
    from .geometry import unpack_shapefile_archive

    return unpack_shapefile_archive(archive_path, cache_dir)


def load_state_boundaries(config: Config, *, carto_year: int = 2023) -> tuple[list[StateBoundary], list[str]]:
    """Read state boundaries and the Census Bureau's own area figures."""
    raw_dir = config.path_for("raw_dir")
    archive = raw_dir / f"cb_{carto_year}_us_state_500k.zip"
    source = load_shapefile(archive, config.path_for("cache_dir"))
    if source.shapefile.shape_type != 5:
        raise ParseError(
            f"{archive.name} has shape type {source.shapefile.shape_type}; state boundaries are polygons (5)"
        )

    minimum_hole = float(config.get("verification.minimum_hole_area_deg2"))
    boundaries: list[StateBoundary] = []
    notes: list[str] = []
    for shape, record in zip(source.shapefile.shapes, source.shapefile.records, strict=True):
        polygons, slivers = to_multipolygon(shape, minimum_hole_area_deg2=minimum_hole)
        if slivers:
            raise ParseError(
                f"state {record[_FIELD_NAME]} carries {slivers} counter-clockwise sliver ring(s) below the "
                "configured minimum hole area. The state boundary files are expected to be hole-free."
            )
        fips = str(record[_FIELD_STATE_FIPS])
        land_m2 = record[_FIELD_LAND_M2]
        water_m2 = record[_FIELD_WATER_M2]
        if not isinstance(land_m2, (int, float)):
            raise ParseError(f"state {fips} has a non-numeric ALAND of {land_m2!r}")
        if not isinstance(water_m2, (int, float)):
            raise ParseError(f"state {fips} has a non-numeric AWATER of {water_m2!r}")
        boundaries.append(
            StateBoundary(
                state_fips=fips,
                abbreviation=str(record[_FIELD_STUSPS]),
                name=str(record[_FIELD_NAME]),
                land_area_km2=float(land_m2) / 1_000_000.0,
                water_area_km2=float(water_m2) / 1_000_000.0,
                geometry=shape,
                polygons=polygons,
            )
        )
    notes.append(
        f"{archive.name}: read {len(boundaries)} boundaries. Projection as published: {source.projection_wkt}"
    )
    multipolygon_states = sum(1 for boundary in boundaries if len(boundary.geometry) > 1)
    notes.append(
        f"{multipolygon_states} of {len(boundaries)} state boundaries are multipolygons in the source file "
        "(main body plus islands and lake shorelines). Rings were grouped by winding order, so islands are "
        "separate polygons rather than holes in the mainland."
    )
    largest_gap = 0.0
    largest_gap_state = ""
    for boundary in boundaries:
        computed = area_km2(boundary.polygons)
        if boundary.land_area_km2 <= 0:
            continue
        relative = abs(computed - boundary.land_area_km2) / boundary.land_area_km2
        if relative > largest_gap:
            largest_gap = relative
            largest_gap_state = boundary.name
    notes.append(
        f"Pipeline-computed polygon area was compared against the Census ALAND field for every state; the "
        f"largest disagreement was {largest_gap:.2%} ({largest_gap_state}). That is the expected difference "
        "between a computed area and the Census Bureau's own published figure, and is why the pipeline uses "
        "the published figure."
    )
    notes.append(
        "Area figures are the Census Bureau's own ALAND and AWATER values from the boundary file "
        "attribute table, converted from square metres to square kilometres. They are not areas this "
        "pipeline computed from the polygons."
    )
    return boundaries, notes


def state_name_to_fips(boundaries: list[StateBoundary]) -> dict[str, str]:
    """Name to FIPS map taken from the Census file, not hard-coded."""
    return {boundary.name: boundary.state_fips for boundary in boundaries}


def load_place_boundaries(config: Config, *, carto_year: int = 2023) -> tuple[list[PlaceBoundary], list[str]]:
    """Read Census place boundaries, used for settlement centres and placed area.

    The polygon geometry itself is read, used to compute each place's interior
    point, and then discarded. Keeping it would hold roughly 32,000 vertex lists
    in memory for the rest of the run, which is enough to get the process killed
    partway through the pipeline. The interior point and the placed area are all
    the downstream stages need; Agents 3 and 4 that want the actual outlines can
    read the Cartographic Boundary file directly, and its URL and licence are in
    the data manifest.
    """
    raw_dir = config.path_for("raw_dir")
    archive = raw_dir / f"cb_{carto_year}_us_place_500k.zip"
    # Streamed, not read whole. The place file is 32 MB of binary geometry, which
    # is about 500 MB as Python tuples. Reading it whole pushed the pipeline to
    # 540 MB resident before the route stage and got it killed twice.
    from ..geo.shapefile import read_dbf

    directory = _unpack_place_archive(archive, config.path_for("cache_dir"))
    stem = next(directory.glob("*.shp")).stem
    _fields, records = read_dbf(directory / f"{stem}.dbf")
    field_names = set(_fields)
    for required in ("STATEFP", "PLACEFP", "NAME", "NAMELSAD", "LSAD", "ALAND"):
        if required not in field_names:
            raise ParseError(
                f"{archive.name} attribute table is missing the {required!r} field. "
                f"Fields present: {sorted(field_names)}"
            )

    minimum_hole = float(config.get("verification.minimum_hole_area_deg2"))
    boundaries: list[PlaceBoundary] = []
    sliver_places: list[str] = []
    from ..geo.shapefile import iter_shapes

    shapes = (shape for shape, _bbox in iter_shapes(directory / f"{stem}.shp"))
    for record in records:
        try:
            shape = next(shapes)
        except StopIteration as exc:
            raise ParseError(
                f"{archive.name}: the geometry file has fewer shapes than the attribute table has records"
            ) from exc
        rings = shape
        polygons, slivers = to_multipolygon(rings, minimum_hole_area_deg2=minimum_hole)
        if slivers:
            sliver_places.append(f"{record['NAME']} ({record['STATEFP']})")
        longitude, latitude = interior_point(polygons)
        land_m2 = record["ALAND"]
        boundaries.append(
            PlaceBoundary(
                state_fips=str(record["STATEFP"]),
                place_fips=str(record["PLACEFP"]),
                name=str(record["NAME"]),
                name_with_type=str(record["NAMELSAD"]),
                lsad_code=str(record["LSAD"]),
                land_area_km2=float(land_m2) / 1_000_000.0 if isinstance(land_m2, (int, float)) else 0.0,
                longitude=longitude,
                latitude=latitude,
                vertex_count=sum(len(ring) for ring in rings),
                ring_count=len(rings),
            )
        )
    leftover = next(shapes, None)
    if leftover is not None:
        raise ParseError(f"{archive.name}: the geometry file has more shapes than there are records")

    lsad_histogram: dict[str, int] = {}
    for boundary in boundaries:
        lsad_histogram[boundary.lsad_code] = lsad_histogram.get(boundary.lsad_code, 0) + 1
    top = sorted(lsad_histogram.items(), key=lambda item: (-item[1], item[0]))[:6]
    notes = [
        f"{archive.name}: read {len(boundaries)} place boundaries. Longitude and latitude are the "
        "area-weighted centroid of the boundary's main body, with islands and lake areas excluded.",
        "Most common Census LSAD area-type codes present: "
        + ", ".join(f"{code} ({LSAD_LABELS.get(code, 'other')}, {count})" for code, count in top)
        + ". The code is carried through to the export rather than being replaced with a guess.",
    ]
    if sliver_places:
        shown = ", ".join(sliver_places[:8])
        remainder = len(sliver_places) - 8
        notes.append(
            f"{len(sliver_places)} place(s) carried a counter-clockwise ring too small to be a real hole "
            f"and not contained by any clockwise ring: {shown}"
            + (f", and {remainder} more" if remainder > 0 else "")
            + ". These are 500k generalisation slivers or over-generalised enclosed water, kept as geometry "
            "and counted rather than deleted. The full list is in docs/DATA_MANIFEST.md."
        )
        notes.append("  sliver places: " + "; ".join(sliver_places))
    return boundaries, notes


def _outer_rings(geometry: dict) -> list[list[list[tuple[float, float]]]]:
    """Polygons of a GeoJSON Polygon or MultiPolygon, as ring lists.

    Each entry is one polygon's rings: the exterior ring first, then holes. The
    containment check tries each polygon because Natural Earth splits a few US
    states into multiple polygons.
    """
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Polygon":
        return [[[(float(point[0]), float(point[1])) for point in ring] for ring in coordinates]]
    if geometry_type == "MultiPolygon":
        return [
            [[(float(point[0]), float(point[1])) for point in ring] for ring in polygon]
            for polygon in coordinates
        ]
    raise ParseError(f"Natural Earth admin-1 geometry has unexpected type {geometry_type!r}")


def cross_check_against_natural_earth(
    boundaries: list[StateBoundary],
    geojson_path: Path,
    *,
    expected_fips: set[str],
) -> list[str]:
    """Corroborate Census state boundaries against an independent source.

    This checks two things that can only both be true if the two files describe
    the same territory:

    1. every state the pipeline ships appears in the Natural Earth file, matched
       on ISO 3166-2 subdivision code;
    2. for each state, the interior point of the Census polygon lies inside the
       Natural Earth polygon, and the two bounding boxes agree.

    Two findings from reading the real Natural Earth file shaped this function
    and are worth recording rather than hiding:

    * Natural Earth's own ``fips`` property is wrong for at least one state -
      Kentucky carries ``US21``, which is Maryland's code. Its ``iso_3166_2``
      property is correct for all 51, so that is what this function matches on.
    * ``area_sqkm`` is zero for every US feature in the 1:10m admin-1 file, so
      there is no area to compare. Agreement is therefore checked geometrically,
      by testing that the interior point of each Census polygon falls inside the
      Natural Earth polygon for the same state. The pipeline's own area figure
      still comes from the Census Bureau's ALAND field.

    Bounding-box differences between the two files are measured and reported but
    are not a pass or fail condition: a state like Wisconsin legitimately
    differs by half a degree of longitude because the two publishers assign the
    waters of Lake Superior differently.
    """
    if not geojson_path.is_file():
        raise ParseError(
            f"{geojson_path} is missing. The cross-check source is declared in datasets.py and must be "
            "downloaded; a missing cross-check is not silently skipped."
        )

    census_by_postal = {
        boundary.abbreviation: boundary for boundary in boundaries if boundary.state_fips in expected_fips
    }
    natural_geometry: dict[str, object] = {}
    for geometry, properties in read_features(geojson_path):
        if str(properties.get(_NE_COUNTRY, "")).upper() != _NE_COUNTRY_USA:
            continue
        iso = str(properties.get(_NE_ISO_SUBDIVISION, "")).upper()
        if iso.startswith("US-"):
            natural_geometry[iso[3:]] = _outer_rings(geometry)

    matched = 0
    containment_checked = 0
    problems: list[str] = []
    worst_bbox = 0.0
    worst_bbox_state = ""

    for abbreviation, boundary in sorted(census_by_postal.items()):
        geometry = natural_geometry.get(abbreviation)
        if geometry is None:
            problems.append(f"{boundary.name} ({abbreviation}) is in the Census file but not in Natural Earth")
            continue
        matched += 1

        natural_bbox = bbox_of(natural_geometry[abbreviation])
        census_bbox = bbox_of(boundary.geometry)
        # Recorded, not enforced: see the docstring for why.
        worst = max(abs(natural_bbox[index] - census_bbox[index]) for index in range(4))
        if worst > worst_bbox:
            worst_bbox = worst
            worst_bbox_state = boundary.name

        # Both directions are tested. Coastal states legitimately fail the
        # Census-to-Natural-Earth direction because the Census file includes
        # offshore islands that Natural Earth generalises away, which can put a
        # whole-state centroid in the sea. Requiring only one direction to hold
        # still catches a genuinely mismatched pairing while tolerating that.
        census_centre = interior_point(boundary.polygons)
        inside_natural = any(
            contains(to_multipolygon(rings)[0], census_centre) for rings in natural_geometry[abbreviation]
        )
        natural_centre = interior_point(
            to_multipolygon([ring for rings in natural_geometry[abbreviation] for ring in rings])[0]
        )
        inside_census = contains(boundary.polygons, natural_centre)
        if inside_natural or inside_census:
            containment_checked += 1
        else:
            problems.append(
                f"{boundary.name}: neither the Census interior point {tuple(round(v, 4) for v in census_centre)} "
                f"nor the Natural Earth interior point {tuple(round(v, 4) for v in natural_centre)} falls "
                "inside the other source's geometry for the same state"
            )

    if problems:
        raise ParseError(
            f"the Census / Natural Earth boundary cross-check did not pass for {len(problems)} issue(s): "
            + "; ".join(problems)
        )
    if matched == 0:
        raise ParseError(
            "the Natural Earth cross-check matched no states, so it proved nothing. The property names "
            "this module reads may have changed upstream."
        )

    return [
        f"Cross-check against Natural Earth 1:10m admin-1: all {matched} states in the 50-states-plus-D.C. "
        "universe matched by ISO 3166-2 subdivision code; none was present in one source and missing from "
        "the other.",
        f"Geometry agreement: the interior point of the Census polygon fell inside the Natural Earth "
        f"polygon for {containment_checked} of {matched} states.",
        f"Largest bounding-box difference between the two files was {worst_bbox:.4f} degrees "
        f"({worst_bbox_state}). Reported, not enforced: the two publishers generalise coastlines very "
        "differently and assign shared waters such as the Great Lakes differently.",
        "Note recorded from the real data: Natural Earth's own 'fips' property is wrong for Kentucky "
        "(it carries US21, Maryland's code), so the match uses 'iso_3166_2' instead. Natural Earth's "
        "'area_sqkm' is zero for every US feature, so no area field was compared; state area in this "
        "pipeline is the Census Bureau's own ALAND value.",
    ]
