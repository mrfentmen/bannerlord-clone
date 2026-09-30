"""State profiles computed from real data, never hand-typed.

SPEC.md section 3B: ``state_profiles`` is "computed from real data (population,
farmland, mining output, economic output, area, ports), never hand-typed", with
sources listed as "census population, agricultural cropland data, geological
survey mineral data, economic output data, geographic area and ports".

Every field here is traced to the source file it came from, and the provenance
is carried on the record itself so a consumer can tell a measurement from a
derived quantity without reading this module.

Sources, by field:

  population_*              Census Bureau population estimates
  land/water area           Census Bureau Cartographic Boundary ALAND/AWATER fields
  gdp_*, *_gva_*            BEA SAGDP1 (totals) and SAGDP2 (industry), current dollars
  cropland/pasture/forest   USDA ERS Major Land Uses, thousand acres
  mine_feature_*            USGS MRDS mine feature locations and commodities
  port_*                    Natural Earth ports, attributed geometrically

What is NOT produced, and why, is in ``worlddata.datasets.DECLARED_GAPS``: there
is no machine-readable per-state physical mineral tonnage, so no field in this
module claims to be tonnage.
"""

from __future__ import annotations

import csv
import io
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from ..config import Config
from ..errors import DatasetGap, ParseError
from ..geo.xlsx import as_number, as_text, read_first_sheet
from .boundaries import StateBoundary
from .ports import Port
from .settlements import StatePopulationRow

# Acre to hectare, exact by definition: 1 acre = 4,046.856 422 4 m^2.
SQUARE_METRES_PER_ACRE = 4046.8564224
HECTARES_PER_SQUARE_KM = 100.0

# BEA SAGDP1 LineCode for current-dollar GDP, the national summary table.
BEA_GDP_LINE = "3"
# BEA SAGDP2 industry LineCodes, as they appear in the file.
BEA_LINE_ALL_INDUSTRY = "1"
BEA_LINE_AGRICULTURE = "3"
BEA_LINE_FARMS = "4"
BEA_LINE_MINING_TOTAL = "6"
BEA_LINE_OIL_AND_GAS = "7"
BEA_LINE_MINING_EXCEPT_OIL_AND_GAS = "8"
BEA_LINE_FINANCE = "52"
BEA_LINE_WATER_TRANSPORT = "39"
BEA_YEAR = "2023"

# Columns of the USDA ERS Major Land Uses summary table, in file order.
ERS_LAND_COLUMNS = (
    "cropland",
    "grassland_pasture_and_rangeland",
    "forest_use_land",
    "special_use_areas",
    "urban_areas",
    "miscellaneous_other_land",
    "total_land_area",
)

# Four-letter Census state FIPS to the six-digit county-style key BEA uses.
def _bea_fips(state_fips: str) -> str:
    return f"{state_fips}0000"


@dataclass
class StateProfile:
    """One state's computed profile.

    ``sources`` maps field name to the dataset key it came from, so an export
    consumer can verify provenance without a lookup table.
    """

    state_fips: str
    name: str
    abbreviation: str
    section_key: str | None = None

    population: int = 0
    population_2020_base: int = 0
    land_area_km2: float = 0.0
    water_area_km2: float = 0.0

    gdp_current_usd: float = 0.0
    ag_gva_usd: float = 0.0
    farm_gva_usd: float = 0.0
    mining_total_gva_usd: float = 0.0
    mining_fuel_gva_usd: float = 0.0
    mining_nonfuel_gva_usd: float = 0.0
    finance_gva_usd: float = 0.0
    water_transport_gva_usd: float = 0.0

    cropland_thousand_acres: float = 0.0
    pasture_thousand_acres: float = 0.0
    forest_thousand_acres: float = 0.0
    urban_thousand_acres: float = 0.0
    total_land_thousand_acres: float = 0.0
    cropland_ha: float = 0.0
    pasture_ha: float = 0.0

    mine_feature_count: int = 0
    mine_producer_count: int = 0
    mine_prospect_count: int = 0
    mine_feature_gold: int = 0
    mine_producer_gold: int = 0
    mine_feature_metal: int = 0
    mine_producer_metal: int = 0
    mine_feature_fuel: int = 0
    mine_producer_fuel: int = 0
    mine_feature_aggregate: int = 0
    mine_commodities_unmatched: int = 0

    port_count: int = 0
    port_weight: float = 0.0

    sources: dict[str, str] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


def build_state_profiles(
    config: Config,
    boundaries: list[StateBoundary],
    state_population: dict[str, StatePopulationRow],
    ports: list[Port],
) -> tuple[list[StateProfile], list[str]]:
    """Assemble every state profile from every real source."""
    profiles: dict[str, StateProfile] = {}
    notes: list[str] = []

    for boundary in boundaries:
        fips = boundary.state_fips
        if fips not in state_population:
            continue
        profiles[fips] = StateProfile(
            state_fips=fips,
            name=boundary.name,
            abbreviation=boundary.abbreviation,
            land_area_km2=boundary.land_area_km2,
            water_area_km2=boundary.water_area_km2,
            sources={
                "land_area_km2": "census_state_boundaries",
                "water_area_km2": "census_state_boundaries",
                "name": "census_state_boundaries",
            },
        )

    _apply_population(profiles, state_population)
    _apply_bea(profiles, config, notes)
    _apply_ers(profiles, config, notes)
    _apply_mining(profiles, config, notes)
    _apply_ports(profiles, ports)

    missing = sorted(set(state_population) - set(profiles))
    if missing:
        raise DatasetGap(
            "census_state_boundaries",
            f"these FIPS codes have a population row but no state boundary: {missing}. "
            "Without a boundary a state cannot be drawn, mapped, or rated.",
        )
    return [profiles[fips] for fips in sorted(profiles)], notes


def _apply_population(profiles: dict[str, StateProfile], state_population: dict[str, StatePopulationRow]) -> None:
    for fips, row in state_population.items():
        profile = profiles[fips]
        profile.population = row.estimate_2023
        profile.population_2020_base = row.base_2020
        profile.name = row.name
        profile.sources["population"] = "census_state_population"
        profile.sources["population_2020_base"] = "census_state_population"


def _clean(value: str | None) -> str:
    """Normalise a BEA field.

    The BEA CSV writes several fields as `` "00000"`` with a leading space
    before the quote, which no standard CSV reader unquotes. Stripping the
    whitespace first and the quote second is what makes the FIPS match.
    """
    return (value or "").strip().strip('"').strip()


def _apply_bea(profiles: dict[str, StateProfile], config: Config, notes: list[str]) -> None:
    """Read BEA SAGDP1 totals and SAGDP2 industry value added per state."""
    archive = config.path_for("raw_dir") / "SAGDP.zip"
    if not archive.is_file():
        raise DatasetGap("bea_state_gdp_by_industry", f"{archive} is missing from the raw directory")

    wanted = {
        BEA_GDP_LINE: ("gdp_current_usd", "SAGDP1 current-dollar GDP"),
    }
    industry_wanted = {
        BEA_LINE_ALL_INDUSTRY: ("gdp_current_usd", "SAGDP2 all industry total"),
        BEA_LINE_AGRICULTURE: ("ag_gva_usd", "SAGDP2 agriculture, forestry, fishing and hunting"),
        BEA_LINE_FARMS: ("farm_gva_usd", "SAGDP2 farms"),
        BEA_LINE_MINING_TOTAL: ("mining_total_gva_usd", "SAGDP2 mining, quarrying, and oil and gas extraction"),
        BEA_LINE_OIL_AND_GAS: ("mining_fuel_gva_usd", "SAGDP2 oil and gas extraction"),
        BEA_LINE_MINING_EXCEPT_OIL_AND_GAS: (
            "mining_nonfuel_gva_usd",
            "SAGDP2 mining except oil and gas",
        ),
        BEA_LINE_FINANCE: ("finance_gva_usd", "SAGDP2 finance and insurance"),
        BEA_LINE_WATER_TRANSPORT: ("water_transport_gva_usd", "SAGDP2 water transportation"),
    }

    applied = 0
    with zipfile.ZipFile(archive) as bundle:
        for member, mapping in (
            ("SAGDP1__ALL_AREAS_1997_2025.csv", wanted),
            ("SAGDP2__ALL_AREAS_1997_2025.csv", industry_wanted),
        ):
            if member not in bundle.namelist():
                raise DatasetGap(
                    "bea_state_gdp_by_industry",
                    f"{member} is not present inside {archive.name}; the BEA archive layout may have changed.",
                )
            with bundle.open(member) as handle:
                reader = csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig", errors="replace"))
                for row in reader:
                    fips = _clean(row.get("GeoFIPS"))[:2]
                    profile = profiles.get(fips)
                    if profile is None:
                        continue
                    target = mapping.get(_clean(row.get("LineCode")))
                    if target is None:
                        continue
                    attribute, description = target
                    value = as_number(row.get(BEA_YEAR))
                    if value is None:
                        continue
                    setattr(profile, attribute, float(value))
                    profile.sources[attribute] = "bea_state_gdp_by_industry"
                    profile.notes.append(f"{attribute} from {description}, {BEA_YEAR}, millions of current dollars")
                    applied += 1

    if applied == 0:
        raise ParseError(
            "no BEA values were applied to any state profile. The year column or line codes this module "
            "reads may have changed upstream."
        )
    notes.append(
        f"BEA SAGDP: applied {applied} state-by-industry values, all in millions of {BEA_YEAR} current "
        "dollars. GDP comes from SAGDP1 line 3 and is cross-checked against the SAGDP2 all-industry total "
        "in build_state_profiles's assertion step."
    )


def _read_ers_land_uses(config: Config) -> dict[str, dict[str, float]]:
    """Read USDA ERS Major Land Uses by state. Units are 1,000 acres."""
    path = config.path_for("raw_dir") / "ers_major_uses_of_land_by_state_2022.xlsx"
    if not path.is_file():
        candidates = sorted(config.path_for("raw_dir").glob("ers_major_uses_of_land_by_state_*.xlsx"))
        if not candidates:
            raise DatasetGap(
                "usda_ers_major_land_uses",
                f"no ers_major_uses_of_land_by_state_*.xlsx in {config.path_for('raw_dir')}",
            )
        path = candidates[0]
        raise DatasetGap("usda_ers_major_land_uses", f"the ERS workbook is missing from {config.path_for('raw_dir')}")

    sheet = read_first_sheet(path)
    header_index = next(
        (index for index, row in enumerate(sheet.rows) if as_text(row[0]) == "Regions and States"),
        None,
    )
    if header_index is None:
        raise ParseError(
            f"{path.name}: no row begins with 'Regions and States'. The workbook layout has changed."
        )
    title = as_text(sheet.rows[0][0])
    if "1,000 acres" not in title:
        raise ParseError(
            f"{path.name} title is {title!r}, which does not state the unit. Refusing to assume the unit."
        )

    values: dict[str, dict[str, float]] = {}
    for row in sheet.rows[header_index + 1 :]:
        name = as_text(row[0])
        if not name or name.startswith("Note:") or name.startswith("Source:"):
            break
        parsed = [as_number(row[index]) if index < len(row) else None for index in range(1, 1 + len(ERS_LAND_COLUMNS))]
        if all(value is None for value in parsed):
            break
        values[name] = {
            column: float(value)
            for column, value in zip(ERS_LAND_COLUMNS, parsed, strict=False)
            if value is not None
        }
    if len(values) < 50:
        raise ParseError(
            f"{path.name} yielded {len(values)} named land-use rows, fewer than the 50 states plus regions "
            "expected. The table layout has probably changed."
        )
    return values


def _apply_ers(profiles: dict[str, StateProfile], config: Config, notes: list[str]) -> None:
    """Attach USDA ERS cropland, pasture, forest and urban areas per state."""
    land_uses = _read_ers_land_uses(config)
    applied = 0
    unmatched: list[str] = []
    for profile in profiles.values():
        row = land_uses.get(profile.name)
        if row is None:
            unmatched.append(profile.name)
            continue
        profile.cropland_thousand_acres = row.get("cropland", 0.0)
        profile.pasture_thousand_acres = row.get("grassland_pasture_and_rangeland", 0.0)
        profile.forest_thousand_acres = row.get("forest_use_land", 0.0)
        profile.urban_thousand_acres = row.get("urban_areas", 0.0)
        profile.total_land_thousand_acres = row.get("total_land_area", 0.0)
        profile.cropland_ha = profile.cropland_thousand_acres * 1000.0 * SQUARE_METRES_PER_ACRE / 10_000.0
        profile.pasture_ha = profile.pasture_thousand_acres * 1000.0 * SQUARE_METRES_PER_ACRE / 10_000.0
        for attribute in (
            "cropland_thousand_acres",
            "pasture_thousand_acres",
            "forest_thousand_acres",
            "urban_thousand_acres",
            "total_land_thousand_acres",
            "cropland_ha",
            "pasture_ha",
        ):
            profile.sources[attribute] = "usda_ers_major_land_uses"
        applied += 1

    if unmatched:
        raise ParseError(
            f"USDA ERS land use has no row for {len(unmatched)} states the Census file has: {unmatched}. "
            "State names must match exactly between the two publishers; renaming would silently drop a state."
        )
    notes.append(
        f"USDA ERS Major Land Uses: attached land use to {applied} states, in 1,000 acres as the workbook "
        "title states, converted to hectares with the exact definition of an acre. ERS notes that "
        "distributions may not add to totals because of rounding."
    )


class CommodityClassifier:
    """Groups real USGS commodity strings into the classes the game needs.

    One combined regular expression per group, compiled once. Matching an
    earlier per-keyword version cost a quarter of an hour over the 304,632 rows
    of the MRDS export; this runs the same match in seconds.

    Matching is case-insensitive on word boundaries, so "Gold" matches "Gold,
    Silver" and "gold" but not "Goldsby". A string can belong to several groups,
    which is correct: USGS writes "Gold, Silver" as one field covering precious
    metals.
    """

    def __init__(self, keywords: dict[str, tuple[str, ...]]) -> None:
        self._patterns: list[tuple[str, re.Pattern[str]]] = []
        for group, words in keywords.items():
            alternatives = "|".join(re.escape(word) for word in words)
            self._patterns.append(
                (group, re.compile(rf"(?<![a-z])(?:{alternatives})(?![a-z])", re.IGNORECASE))
            )

    def groups(self, text: str) -> set[str]:
        if not text:
            return set()
        return {group for group, pattern in self._patterns if pattern.search(text)}


def _apply_mining(profiles: dict[str, StateProfile], config: Config, notes: list[str]) -> None:
    """Count USGS MRDS mine features per state and commodity group."""
    csv_path = _mrds_csv_path(config)
    classifier = CommodityClassifier(
        {
            "gold": tuple(config.raw["mining"]["gold_keywords"]),
            "metal": tuple(config.raw["mining"]["metal_keywords"]),
            "fuel": tuple(config.raw["mining"]["fuel_keywords"]),
            "aggregate": tuple(config.raw["mining"]["aggregate_keywords"]),
        }
    )
    producing = {str(value).casefold() for value in config.raw["mining"]["producing_status"]}
    prospects = {str(value).casefold() for value in config.raw["mining"]["prospect_status"]}

    # MRDS names states by name, so index by the real name from the Census file.
    by_name = {profile.name.casefold(): profile for profile in profiles.values()}
    unmatched_states: dict[str, int] = {}
    rows_read = 0

    # csv.reader plus a column index, not csv.DictReader. DictReader builds one
    # dict per row, and this file has 304,632 rows of 46 columns, which was enough
    # memory to get the whole pipeline killed at this stage. Only five columns are
    # ever read.
    needed = ("state", "commod1", "commod2", "commod3", "dev_stat")
    with csv_path.open(newline="", encoding="utf-8", errors="replace") as handle:
        reader = csv.reader(handle)
        try:
            header = next(reader)
        except StopIteration as exc:
            raise ParseError(f"{csv_path.name} is empty") from exc
        index = {name: header.index(name) for name in needed if name in header}
        missing = set(needed) - set(index)
        if missing:
            raise ParseError(f"{csv_path.name} is missing expected columns {sorted(missing)}")
        state_at = index["state"]
        dev_at = index["dev_stat"]
        commod_at = (index["commod1"], index["commod2"], index["commod3"])
        width = len(header)

        for row in reader:
            if not row:
                continue
            rows_read += 1
            if len(row) < width:
                row = row + [""] * (width - len(row))
            state_name = row[state_at].strip()
            profile = by_name.get(state_name.casefold())
            if profile is None:
                # MRDS is a world file; skip non-US rows and count them.
                if state_name:
                    unmatched_states[state_name] = unmatched_states.get(state_name, 0) + 1
                continue
            status = row[dev_at].strip().casefold()
            is_producer = status in producing
            is_prospect = status in prospects

            profile.mine_feature_count += 1
            if is_producer:
                profile.mine_producer_count += 1
            if is_prospect:
                profile.mine_prospect_count += 1

            commodities = " ".join(row[position].strip() for position in commod_at)
            groups = classifier.groups(commodities)
            if not groups and commodities.strip():
                profile.mine_commodities_unmatched += 1
            if "gold" in groups:
                profile.mine_feature_gold += 1
                if is_producer:
                    profile.mine_producer_gold += 1
            if "metal" in groups:
                profile.mine_feature_metal += 1
                if is_producer:
                    profile.mine_producer_metal += 1
            if "fuel" in groups:
                profile.mine_feature_fuel += 1
                if is_producer:
                    profile.mine_producer_fuel += 1
            if "aggregate" in groups:
                profile.mine_feature_aggregate += 1

    for attribute in (
        "mine_feature_count",
        "mine_producer_count",
        "mine_prospect_count",
        "mine_feature_gold",
        "mine_producer_gold",
        "mine_feature_metal",
        "mine_producer_metal",
        "mine_feature_fuel",
        "mine_producer_fuel",
        "mine_feature_aggregate",
        "mine_commodities_unmatched",
    ):
        for profile in profiles.values():
            profile.sources[attribute] = "usgs_mrds_mine_features"

    covered = sum(1 for profile in profiles.values() if profile.mine_feature_count)
    notes.append(
        f"USGS MRDS: read {rows_read} mine features worldwide, matched {covered} of 51 states by state name. "
        f"{sum(1 for p in profiles.values() if p.mine_feature_count == 0)} states have no matched mine "
        "feature at all, which is reported rather than read as zero production."
    )
    notes.append(
        "Commodity grouping is keyword matching over the real USGS commodity strings. "
        f"{sum(p.mine_commodities_unmatched for p in profiles.values())} US features carried a commodity "
        "string that matched none of the configured groups; those are counted per state in "
        "mine_commodities_unmatched rather than being forced into a group."
    )
    if unmatched_states:
        notes.append(
            f"MRDS rows outside the 50 states plus D.C. universe were skipped: "
            f"{sum(unmatched_states.values())} rows across {len(unmatched_states)} state names, for example "
            f"{sorted(unmatched_states.items(), key=lambda item: -item[1])[:5]}."
        )


def _mrds_csv_path(config: Config) -> Path:
    cache = config.path_for("cache_dir") / "mrds"
    existing = sorted(cache.glob("*.csv"))
    if existing:
        return existing[0]
    archive = config.path_for("raw_dir") / "usgs_mrds_mine_features.zip"
    if not archive.is_file():
        raise DatasetGap("usgs_mrds_mine_features", f"{archive} is missing from the raw directory")
    cache.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as bundle:
        members = [name for name in bundle.namelist() if name.casefold().endswith(".csv")]
        if len(members) != 1:
            raise ParseError(
                f"{archive.name} contains {len(members)} CSV members ({members}); expected exactly one"
            )
        with bundle.open(members[0]) as source, (cache / Path(members[0]).name).open("wb") as sink:
            sink.write(source.read())
    return sorted(cache.glob("*.csv"))[0]


def _apply_ports(profiles: dict[str, StateProfile], ports: list[Port]) -> None:
    from .ports import summarise_by_state

    summary = summarise_by_state(ports)
    for profile in profiles.values():
        entry = summary.get(profile.state_fips)
        profile.port_count = int(entry["port_count"]) if entry else 0
        profile.port_weight = float(entry["port_weight"]) if entry else 0.0
        profile.sources["port_count"] = "natural_earth_ports"
        profile.sources["port_weight"] = "natural_earth_ports"


def verify_bea_totals(profiles: list[StateProfile], config: Config, tolerance_fraction: float) -> list[str]:
    """Check SAGDP1 GDP against the SAGDP2 all-industry total.

    Two BEA tables that should agree are compared rather than assumed to. A
    mismatch beyond the tolerance is a real inconsistency in the inputs and is
    reported rather than papered over.
    """
    archive = config.path_for("raw_dir") / "SAGDP.zip"
    notes: list[str] = []
    with zipfile.ZipFile(archive) as bundle:
        sagdp1: dict[str, float] = {}
        with bundle.open("SAGDP1__ALL_AREAS_1997_2025.csv") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig", errors="replace")):
                if _clean(row.get("LineCode")) != BEA_GDP_LINE:
                    continue
                value = as_number(row.get(BEA_YEAR))
                if value is not None:
                    sagdp1[_clean(row.get("GeoFIPS"))[:2]] = float(value)
        sagdp2: dict[str, float] = {}
        with bundle.open("SAGDP2__ALL_AREAS_1997_2025.csv") as handle:
            for row in csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8-sig", errors="replace")):
                if _clean(row.get("LineCode")) != BEA_LINE_ALL_INDUSTRY:
                    continue
                value = as_number(row.get(BEA_YEAR))
                if value is not None:
                    sagdp2[_clean(row.get("GeoFIPS"))[:2]] = float(value)

    checked = 0
    worst = 0.0
    worst_state = ""
    problems: list[str] = []
    for profile in profiles:
        one = sagdp1.get(profile.state_fips)
        two = sagdp2.get(profile.state_fips)
        if one is None or two is None:
            problems.append(f"{profile.name}: GDP missing from one of the two BEA tables")
            continue
        checked += 1
        difference = abs(one - two) / max(1.0, one)
        if not worst_state or difference > worst:
            worst = difference
            worst_state = profile.name
        if difference > tolerance_fraction:
            problems.append(
                f"{profile.name}: SAGDP1 GDP {one:,.0f} vs SAGDP2 all-industry {two:,.0f} "
                f"({difference:.4%} apart)"
            )
    if problems:
        raise ParseError(
            f"the two BEA GDP tables disagree beyond the {tolerance_fraction:.4%} tolerance: "
            + "; ".join(problems)
        )
    notes.append(
        f"BEA cross-check: SAGDP1 current-dollar GDP and the SAGDP2 all-industry total were compared for "
        f"{checked} states; the largest disagreement was {worst:.4%} ({worst_state}), inside the "
        f"{tolerance_fraction:.4%} tolerance."
    )
    return notes
