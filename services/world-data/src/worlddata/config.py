"""Config loading and validation.

CONSTITUTION.md section 1.2: "Every balance, economy, combat, AI, and
difficulty constant lives in one commented balance config file. No magic
numbers in logic." That file is config/world_data.toml. This module loads it,
validates it, and hands out typed accessors. Nothing else in the pipeline reads
the TOML directly.

Validation is deliberately strict. A typo in a config key should stop the
build at load time with a clear message, not silently produce a wrong number.
"""

from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .errors import ConfigError

# Root of services/world-data/. Derived from this file's location:
#   src/worlddata/config.py -> src/worlddata -> src -> services/world-data
SERVICE_ROOT = Path(__file__).resolve().parents[2]
# Default config path, relative to the service root.
DEFAULT_CONFIG_PATH = SERVICE_ROOT / "config" / "world_data.toml"

# Keys that must be present for the pipeline to run at all. Listed here so a
# missing key is reported once with the full list, not one run at a time.
_REQUIRED_KEYS: tuple[tuple[str, ...], ...] = (
    ("meta", "config_version"),
    ("paths", "raw_dir"),
    ("paths", "cache_dir"),
    ("paths", "export_dir"),
    ("paths", "report_dir"),
    ("census_year",),
    ("estimates_vintage",),
    ("classification", "min_population"),
    ("classification", "class_count"),
    ("classification", "class_names"),
    ("classification", "method"),
    ("seed", "food_person_days_per_day"),
    ("seed", "worker_share_of_population"),
    ("seed", "hectares_per_worker"),
    ("seed", "sanitation_baseline"),
    ("seed", "unrest_initial"),
    ("travel", "kmh_primary_road"),
    ("travel", "kmh_secondary_road"),
    ("travel", "kmh_offroad"),
    ("travel", "kmh_rail"),
    ("verification", "minimum_spot_checks"),
    ("ratings", "max_rating"),
    ("ratings", "state_share_percentiles"),
    ("terrain", "max_void_fraction"),
    ("sections",),
    ("section_targets",),
    ("v1", "region_bbox"),
    ("v1", "slice_states"),
    ("network", "max_attempts"),
    ("network", "timeout_seconds"),
)


@dataclass(frozen=True)
class ClassificationConfig:
    """How settlement size classes are derived from the real distribution."""

    min_population: int
    class_count: int
    class_names: tuple[str, ...]
    method: str
    emit_distribution_report: bool


@dataclass(frozen=True)
class SeedConfig:
    """Per-capita constants that convert real data into simulation seed values."""

    values: dict[str, float]

    def __getitem__(self, key: str) -> float:
        try:
            return self.values[key]
        except KeyError as exc:
            raise ConfigError(f"[seed] is missing required key {key!r}") from exc


@dataclass(frozen=True)
class TravelConfig:
    """Speeds and road-class mapping used to build the route graph."""

    kmh_primary: float
    kmh_secondary: float
    kmh_offroad: float
    kmh_rail: float
    road_class_mtfcc: dict[str, str]
    segment_warning_km: float
    min_segment_gc_fraction: float

    def speed_for_mtfcc(self, mtfcc: str | None) -> float:
        """Speed in km/h for a Census MTFCC road code.

        Unknown or missing codes fall back to the secondary-road speed, which
        is the conservative choice: it is slower than a primary road, so an
        unclassified road never makes a march unrealistically fast.
        """
        if mtfcc is None:
            return self.kmh_secondary
        road_class = self.road_class_mtfcc.get(str(mtfcc).upper())
        if road_class == "primary":
            return self.kmh_primary
        if road_class == "secondary":
            return self.kmh_secondary
        return self.kmh_secondary


@dataclass(frozen=True)
class RatingsConfig:
    """How the 1..5 section ratings are computed. Never forced to a target."""

    max_rating: int
    state_share_percentiles: tuple[float, ...]
    weights: dict[str, dict[str, float]]
    min_state_coverage: float


@dataclass(frozen=True)
class SectionDefinition:
    """One playable side: its states and the design target ratings to check against.

    ``state_names`` are transcribed from FACTIONS.md. ``state_fips`` is filled in
    at run time by matching those names against the Census Bureau's own
    name/FIPS pairs, so no numeric identifier is hand-typed anywhere.
    """

    key: str
    name: str
    state_names: tuple[str, ...]
    target_ratings: dict[str, int]
    state_fips: tuple[str, ...] = ()


@dataclass(frozen=True)
class Config:
    """The validated pipeline configuration."""

    path: Path
    raw: dict[str, Any]
    service_root: Path
    classification: ClassificationConfig
    seed: SeedConfig
    travel: TravelConfig
    ratings: RatingsConfig
    sections: tuple[SectionDefinition, ...]
    census_year: int
    estimates_vintage: int
    region_bbox: tuple[float, float, float, float]
    region_name: str
    slice_state_names: tuple[str, ...]
    slice_name: str
    elevation_tiles: tuple[str, ...]

    def path_for(self, key: str) -> Path:
        """Resolve a [paths] entry to an absolute path inside the service root."""
        try:
            relative = self.raw["paths"][key]
        except KeyError as exc:
            raise ConfigError(f"[paths] is missing required key {key!r}") from exc
        return (self.service_root / relative).resolve()

    def get(self, dotted: str) -> Any:
        """Read a nested config value by dotted path, e.g. ``terrain.max_void_fraction``."""
        node: Any = self.raw
        for part in dotted.split("."):
            if not isinstance(node, dict) or part not in node:
                raise ConfigError(f"config key {dotted!r} not found in {self.path}")
            node = node[part]
        return node


# Human-readable section names, transcribed from FACTIONS.md section 4 headings.
# The membership lists themselves come from the config file so that the config
# is the single source of truth; these names are labels, not data.
_SECTION_NAMES: dict[str, str] = {
    "pacific_compact": "Pacific Compact",
    "mountain_alliance": "Mountain Alliance",
    "great_lakes_union": "Great Lakes Union",
    "southern_compact": "Southern Compact",
    "lone_star_frontier": "Lone Star Frontier",
    "atlantic_corridor": "Atlantic Corridor",
}


def _require_positive(name: str, value: float) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
        raise ConfigError(f"{name} must be a positive number, got {value!r}")
    return float(value)


def _require_fraction(name: str, value: float) -> float:
    number = _require_positive(name, value)
    if number > 1.0:
        raise ConfigError(f"{name} must be a fraction in (0, 1], got {value!r}")
    return number


def _load_sections(raw: dict[str, Any]) -> tuple[SectionDefinition, ...]:
    section_table = raw.get("sections")
    target_table = raw.get("section_targets")
    if not isinstance(section_table, dict) or not section_table:
        raise ConfigError("[sections] must be a non-empty table of section key -> state FIPS list")
    if not isinstance(target_table, dict):
        raise ConfigError("[section_targets] must be a table of section key -> rating table")

    sections: list[SectionDefinition] = []
    for key, states in section_table.items():
        if key not in _SECTION_NAMES:
            raise ConfigError(
                f"[sections] has unknown section {key!r}; known sections are "
                f"{sorted(_SECTION_NAMES)} (FACTIONS.md section 4 defines six sides)"
            )
        if not isinstance(states, list) or not states:
            raise ConfigError(f"[sections].{key} must be a non-empty list of US state names")
        normalised = [str(name).strip() for name in states]
        if len(set(normalised)) != len(normalised):
            raise ConfigError(f"[sections].{key} repeats a state name")
        targets = target_table.get(key)
        if not isinstance(targets, dict) or not targets:
            raise ConfigError(
                f"[section_targets].{key} is missing. FACTIONS.md section 3 gives a target for every side."
            )
        sections.append(
            SectionDefinition(
                key=key,
                name=_SECTION_NAMES[key],
                state_names=tuple(normalised),
                target_ratings={str(k): int(v) for k, v in targets.items()},
            )
        )

    # FACTIONS.md section 1: "Every state belongs to exactly one section at
    # start." Checked on names here, and again on resolved FIPS codes after the
    # Census file is read, because a name could resolve to something unexpected.
    owner: dict[str, str] = {}
    for section in sections:
        for name in section.state_names:
            if name in owner:
                raise ConfigError(
                    f"state {name!r} is claimed by both {owner[name]!r} and {section.key!r}; "
                    "FACTIONS.md section 1 requires exactly one section per state"
                )
            owner[name] = section.key
    return tuple(sections)


def _expected_jurisdiction_names() -> set[str]:
    """The 50 states plus D.C., spelled the way the Census Bureau spells them.

    Written out rather than derived so that a config entry the pipeline cannot
    match against the real Census file is caught at load time with a readable
    message, instead of at join time with a null identifier.
    """
    return {
        "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
        "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
        "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
        "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
        "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
        "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
        "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
        "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
        "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
    }


def _validate_state_coverage(sections: tuple[SectionDefinition, ...]) -> None:
    """Require all 50 states plus D.C. to be covered.

    PHASES.md Phase 0 requires the full country from the start. Catching an
    omission at load time is far better than shipping 49 states.
    """
    expected = _expected_jurisdiction_names()
    covered = {name for section in sections for name in section.state_names}
    missing = sorted(expected - covered)
    if missing:
        raise ConfigError(
            f"[sections] covers {len(covered)} jurisdictions but {len(missing)} are missing: {missing}. "
            "PHASES.md Phase 0 requires all 50 states plus D.C. assigned to a section."
        )
    extra = sorted(covered - expected)
    if extra:
        raise ConfigError(
            f"[sections] contains FIPS codes that are neither a US state nor D.C.: {extra}. "
            "PHASES.md section 4 does not put outlying areas in any side."
        )


def load_config(path: Path | str | None = None) -> Config:
    """Read, validate, and return the pipeline configuration.

    Raises ConfigError with an explicit message for anything wrong. Never
    substitutes a default for a missing required key - a silent default is a
    magic number, which CONSTITUTION.md section 1.2 forbids.
    """
    # Resolve to an absolute path: export.py records config.path relative to the
    # service root, which raises ValueError when the caller passes a relative
    # --config path. Resolving here keeps every downstream use absolute.
    config_path = Path(path).resolve() if path is not None else DEFAULT_CONFIG_PATH
    if not config_path.is_file():
        raise ConfigError(
            f"config file not found at {config_path}. "
            "All pipeline constants live in config/world_data.toml (CONSTITUTION.md section 1.2)."
        )
    try:
        raw = tomllib.loads(config_path.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise ConfigError(f"{config_path} is not valid TOML: {exc}") from exc

    missing = [".".join(keys) for keys in _REQUIRED_KEYS if not _all_present(raw, keys)]
    if missing:
        raise ConfigError(f"{config_path} is missing required keys: {missing}")

    classification_table = raw["classification"]
    class_names = tuple(str(name) for name in classification_table["class_names"])
    class_count = int(classification_table["class_count"])
    if len(class_names) != class_count:
        raise ConfigError(
            f"[classification].class_names has {len(class_names)} entries but class_count is {class_count}"
        )
    method = str(classification_table["method"])
    if method not in {"largest_gap", "jenks_1d", "density_modes"}:
        raise ConfigError(
            f"[classification].method is {method!r}; supported methods are 'largest_gap', 'jenks_1d' "
            "and 'density_modes'"
        )
    for key in ("bin_width_log10", "smoothing_passes", "fallback_percentiles"):
        if key not in classification_table:
            raise ConfigError(
                f"[classification].{key} is required because the method is {method!r}; "
                "see the comments in config/world_data.toml for what it does."
            )
    percentiles_fallback = [float(value) for value in classification_table["fallback_percentiles"]]
    if sorted(percentiles_fallback) != list(percentiles_fallback):
        raise ConfigError("[classification].fallback_percentiles must be in ascending order")
    if any(not 0 < value < 100 for value in percentiles_fallback):
        raise ConfigError("[classification].fallback_percentiles must all lie strictly between 0 and 100")
    classification = ClassificationConfig(
        min_population=int(classification_table["min_population"]),
        class_count=class_count,
        class_names=class_names,
        method=method,
        emit_distribution_report=bool(classification_table.get("emit_distribution_report", True)),
    )

    seed_values = {key: float(value) for key, value in raw["seed"].items()}
    for key in (
        "food_person_days_per_day",
        "hectares_per_worker",
        "crowding_reference_people_per_km2",
    ):
        if key not in seed_values:
            raise ConfigError(f"[seed] is missing required key {key!r}")
        _require_positive(f"[seed].{key}", seed_values[key])
    for key in ("worker_share_of_population", "sanitation_baseline", "unrest_initial"):
        if key not in seed_values:
            raise ConfigError(f"[seed] is missing required key {key!r}")
        _require_fraction(f"[seed].{key}", seed_values[key])
    seed = SeedConfig(values=seed_values)

    travel_table = raw["travel"]
    travel = TravelConfig(
        kmh_primary=_require_positive("[travel].kmh_primary_road", travel_table["kmh_primary_road"]),
        kmh_secondary=_require_positive("[travel].kmh_secondary_road", travel_table["kmh_secondary_road"]),
        kmh_offroad=_require_positive("[travel].kmh_offroad", travel_table["kmh_offroad"]),
        kmh_rail=_require_positive("[travel].kmh_rail", travel_table["kmh_rail"]),
        road_class_mtfcc={str(k).upper(): str(v) for k, v in travel_table["road_class_mtfcc"].items()},
        segment_warning_km=_require_positive("[travel].segment_warning_km", travel_table["segment_warning_km"]),
        min_segment_gc_fraction=_require_fraction(
            "[travel].min_segment_gc_fraction", travel_table["min_segment_gc_fraction"]
        ),
    )

    ratings_table = raw["ratings"]
    weights = {
        dimension: {str(k): float(v) for k, v in sub.items()}
        for dimension, sub in ratings_table["weights"].items()
    }
    if not weights:
        raise ConfigError("[ratings].weights is empty; every rating dimension needs at least one input")
    for dimension, sub in weights.items():
        if not sub:
            raise ConfigError(f"[ratings].weights.{dimension} is empty")
        if any(value < 0 for value in sub.values()):
            raise ConfigError(f"[ratings].weights.{dimension} has a negative weight")
        if sum(sub.values()) <= 0:
            raise ConfigError(f"[ratings].weights.{dimension} weights sum to zero")
    max_rating = int(ratings_table["max_rating"])
    if max_rating < 2:
        raise ConfigError(f"[ratings].max_rating must be at least 2, got {max_rating}")
    percentiles = tuple(float(value) for value in ratings_table["state_share_percentiles"])
    if sorted(percentiles) != list(percentiles):
        raise ConfigError("[ratings].state_share_percentiles must be in ascending order")
    if any(not 0 < value < 100 for value in percentiles):
        raise ConfigError("[ratings].state_share_percentiles must all lie strictly between 0 and 100")
    if len(percentiles) != max_rating - 1:
        raise ConfigError(
            f"[ratings].state_share_percentiles has {len(percentiles)} edges but max_rating is "
            f"{max_rating}, which needs {max_rating - 1} edges to make {max_rating} bands"
        )
    ratings = RatingsConfig(
        max_rating=max_rating,
        state_share_percentiles=percentiles,
        weights=weights,
        min_state_coverage=_require_fraction("[ratings].min_state_coverage", ratings_table["min_state_coverage"]),
    )

    sections = _load_sections(raw)
    _validate_state_coverage(sections)

    bbox_values = raw["v1"]["region_bbox"]
    if len(bbox_values) != 4:
        raise ConfigError("[v1].region_bbox must be [west, south, east, north]")
    west, south, east, north = (float(value) for value in bbox_values)
    if not (-180 <= west < east <= 180):
        raise ConfigError(f"[v1].region_bbox longitudes are out of order or out of range: west={west} east={east}")
    if not (-90 <= south < north <= 90):
        raise ConfigError(f"[v1].region_bbox latitudes are out of order or out of range: south={south} north={north}")

    elevation_tiles = tuple(str(tile).strip().upper() for tile in raw["v1"].get("elevation_tiles", []))

    census_year = int(raw["census_year"])
    if census_year % 10 or not 1940 <= census_year <= 2020:
        raise ConfigError(
            f"census_year is {census_year}; expected a decennial census year between 1940 and 2020 "
            "(ERA.md section 5 requires census data for the chosen start year)"
        )

    return Config(
        path=config_path,
        raw=raw,
        service_root=SERVICE_ROOT,
        classification=classification,
        seed=seed,
        travel=travel,
        ratings=ratings,
        sections=sections,
        census_year=census_year,
        estimates_vintage=int(raw["estimates_vintage"]),
        region_bbox=(west, south, east, north),
        region_name=str(raw["v1"]["region_name"]),
        slice_state_names=tuple(str(state).strip() for state in raw["v1"]["slice_states"]),
        slice_name=str(raw["v1"]["slice_name"]),
        elevation_tiles=elevation_tiles,
    )


def _all_present(node: Any, keys: tuple[str, ...]) -> bool:
    for key in keys:
        if not isinstance(node, dict) or key not in node:
            return False
        node = node[key]
    return True
