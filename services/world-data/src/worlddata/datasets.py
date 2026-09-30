"""Registry of every external dataset the pipeline consumes.

This module is the single place a URL lives. CONSTITUTION.md section 1.1
requires that gaps and substitutions be logged; `services/world-data/docs/DATA_MANIFEST.md`
is generated from exactly these records, so a dataset cannot be used without
declaring its source, its vintage, and what is missing from it.

Each record states:
  * url           - exactly where the bytes come from
  * filename      - name under data/raw/
  * source        - the publishing body and dataset name, for the manifest
  * version       - the vintage string, taken from the upstream directory name
  * licence       - the public-use terms that let us redistribute derived values
  * used_for      - which profile or geometry field depends on it
  * expected_sha256 - None where upstream publishes no digest. See fetch.py: the
    pipeline records the digest it computed and the manifest reports the gap.
  * gap_note      - filled in from what actually happened during the run
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Census TIGER/Line and Cartographic Boundary vintage. Pinned so a re-run months
# from now downloads the same edition unless this is deliberately bumped.
TIGER_YEAR = 2023
CARTOCURRENT_YEAR = 2023

# Census population-estimates vintage (a post-census vintage that publishes the
# decennial count for every place).
POPEST_VINTAGE = 2023

# The decennial census whose counts are imported. Matches config census_year.
CENSUS_YEAR = 2020

# USDA Economic Research Service "Major Land Uses" edition.
ERS_LAND_YEAR = 2022

# Bureau of Economic Analysis regional (state) GDP edition.
BEA_VINTAGE = 2023

# Elevation mirror. The AWS Open Data "Skadi" bucket is a mirror of the USGS
# SRTM void-filled distribution and needs no credentials, which is what makes
# the pipeline re-runnable by another agent without an account.
SRTM_BASE = "https://elevation-tiles-prod.s3.amazonaws.com/skadi"


@dataclass(frozen=True)
class Dataset:
    """One external input file and everything we know about it."""

    key: str
    url: str
    filename: str
    source: str
    version: str
    licence: str
    used_for: str
    expected_sha256: str | None = None
    upstream_digest_available: bool = False
    notes: str = ""
    gap_note: str = ""

    @property
    def publisher(self) -> str:
        return self.source


def census_places(vintage: int = POPEST_VINTAGE) -> Dataset:
    """Sub-county population estimates, all places in one CSV."""
    return Dataset(
        key="census_sub_county_population",
        url=(
            "https://www2.census.gov/programs-surveys/popest/datasets/"
            f"2020-{vintage}/cities/totals/sub-est{vintage}.csv"
        ),
        filename=f"sub-est{vintage}.csv",
        source=(
            "U.S. Census Bureau, Population Estimates Program, Vintage "
            f"{vintage} Sub-County Population Estimates (SUB-EST{vintage})"
        ),
        version=f"vintage {vintage}, carrying Census {CENSUS_YEAR} base counts",
        licence="U.S. Government work, public domain (Title 17 U.S.C. 105). No permission needed to redistribute.",
        used_for="Settlement population. Imports the CENSUS2020POP column, the published decennial count.",
        notes=(
            "One row per incorporated place and Census-designated place. Contains both the "
            "2020 Census count and the later estimate; the pipeline imports the census column only, "
            "so every settlement population is a published decennial figure."
        ),
    )


def census_states(vintage: int = POPEST_VINTAGE) -> Dataset:
    """State population estimates, all states and D.C. in one CSV."""
    return Dataset(
        key="census_state_population",
        url=(
            "https://www2.census.gov/programs-surveys/popest/datasets/"
            f"2020-{vintage}/state/totals/NST-EST{vintage}-ALLDATA.csv"
        ),
        filename=f"NST-EST{vintage}-ALLDATA.csv",
        source=(
            "U.S. Census Bureau, Population Estimates Program, Vintage "
            f"{vintage} Annual Estimates of the Resident Population by State"
        ),
        version=f"vintage {vintage}, carrying Census {CENSUS_YEAR} base counts",
        licence="U.S. Government work, public domain (Title 17 U.S.C. 105). No permission needed to redistribute.",
        used_for="State profile resident population, and the population rating dimension.",
        notes="Imports the CENSUS2020POP column, the published decennial state count.",
    )


def census_state_boundaries(year: int = CARTOCURRENT_YEAR) -> Dataset:
    """State and equivalent boundaries, with authoritative land and water area."""
    return Dataset(
        key="census_state_boundaries",
        url=f"https://www2.census.gov/geo/tiger/GENZ{year}/shp/cb_{year}_us_state_500k.zip",
        filename=f"cb_{year}_us_state_500k.zip",
        source=f"U.S. Census Bureau, Cartographic Boundary Files, {year}, 500k state",
        version=str(year),
        licence="U.S. Government work, public domain (Title 17 U.S.C. 105). No permission needed to redistribute.",
        used_for="State boundaries for the map, and state land/water area via the ALAND and AWATER fields.",
        notes=(
            "The .dbf carries ALAND and AWATER in square metres as published by the Census Bureau, so "
            "area is the Census Bureau's own figure rather than one this pipeline computed."
        ),
    )


def census_place_boundaries(year: int = CARTOCURRENT_YEAR) -> Dataset:
    """Place boundaries, used for settlement footprints and interior points."""
    return Dataset(
        key="census_place_boundaries",
        url=f"https://www2.census.gov/geo/tiger/GENZ{year}/shp/cb_{year}_us_place_500k.zip",
        filename=f"cb_{year}_us_place_500k.zip",
        source=f"U.S. Census Bureau, Cartographic Boundary Files, {year}, 500k place",
        version=str(year),
        licence="U.S. Government work, public domain (Title 17 U.S.C. 105). No permission needed to redistribute.",
        used_for="Settlement boundary polygons, longitude and latitude of the interior point, and placed area.",
        notes=(
            "The cartographic files generalise shorelines, so the polygons are for display and area "
            "comparison, not for legal boundary work. Census publishes a more precise generalisation "
            "level; 500k was chosen to keep the country-wide file a manageable size."
        ),
    )


def census_primary_roads(year: int = TIGER_YEAR) -> Dataset:
    """Primary and secondary road centrelines for the whole country."""
    return Dataset(
        key="census_primary_roads",
        url=f"https://www2.census.gov/geo/tiger/TIGER{year}/PRIMARYROADS/tl_{year}_us_primaryroads.zip",
        filename=f"tl_{year}_us_primaryroads.zip",
        source=f"U.S. Census Bureau, TIGER/Line {year}, Primary and Secondary Roads (national file)",
        version=str(year),
        licence="U.S. Government work, public domain (Title 17 U.S.C. 105). No permission needed to redistribute.",
        used_for="The road route graph: travel time, caravan routing, and road safety segments.",
        notes=(
            "Census MTFCC classes distinguish primary (S1100), secondary (S1200) and other (S1300) roads. "
            "The FULL roads layer (every local street and residential road) is far larger and is not "
            "downloaded; see gap_note for the consequence."
        ),
    )


def census_rails(year: int = TIGER_YEAR) -> Dataset:
    """Rail line centrelines for the whole country."""
    return Dataset(
        key="census_rails",
        url=f"https://www2.census.gov/geo/tiger/TIGER{year}/RAILS/tl_{year}_us_rails.zip",
        filename=f"tl_{year}_us_rails.zip",
        source=f"U.S. Census Bureau, TIGER/Line {year}, Rail Lines (national file)",
        version=str(year),
        licence="U.S. Government work, public domain (Title 17 U.S.C. 105). No permission needed to redistribute.",
        used_for="The rail portion of the route graph.",
        notes=(
            "TIGER/Line rails carry no year opened and no operating status, so the pipeline cannot tell "
            "an active main line from an abandoned one. See gap_note."
        ),
    )


def natural_earth_admin1() -> Dataset:
    """Independent admin-1 boundary cross-check for the state polygons."""
    return Dataset(
        key="natural_earth_admin1",
        url=(
            "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
            f"{NE_VERSION}/geojson/ne_10m_admin_1_states_provinces.geojson"
        ),
        filename="ne_10m_admin_1_states_provinces.geojson",
        source="Natural Earth, 1:10m Admin 1 States, Provinces (public domain vector tiles)",
        version=NE_VERSION,
        licence="Natural Earth terms of use: free to use in any manner, including commercially. No permission needed.",
        used_for=(
            "Cross-check only. Used to verify that every Census state boundary in the export is "
            "corroborated by an independent source at a different scale."
        ),
        notes="Deliberately a different scale (1:10m) from the Census 500k files, so agreement is evidence.",
    )


def natural_earth_ports() -> Dataset:
    """Ports, with throughput where the source records it."""
    return Dataset(
        key="natural_earth_ports",
        url=(
            "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
            f"{NE_VERSION}/geojson/ne_10m_ports.geojson"
        ),
        filename="ne_10m_ports.geojson",
        source="Natural Earth, 1:10m Ports (public domain vector tiles)",
        version=NE_VERSION,
        licence="Natural Earth terms of use: free to use in any manner, including commercially. No permission needed.",
        used_for="Port inventory and throughput, which feeds the money rating dimension.",
        notes=(
            "Natural Earth records only ports significant enough to appear on a world map at 1:10m. "
            "Small harbours, river ports and fishing wharves are absent. See gap_note."
        ),
    )


NE_VERSION = "master"


def usda_ers_major_land_uses(year: int = ERS_LAND_YEAR) -> Dataset:
    """USDA land use by state, including cropland, pasture and rangeland."""
    return Dataset(
        key="usda_ers_major_land_uses",
        url=(
            "https://www.ers.usda.gov/media/29418/summary-table-1-major-uses-of-land-by-region-"
            f"and-state-united-states-{year}.xlsx"
        ),
        filename=f"ers_major_uses_of_land_by_state_{year}.xlsx",
        source=(
            "U.S. Department of Agriculture, Economic Research Service, "
            f"Major Land Uses of the United States, {year}, Summary Table 1"
        ),
        version=str(year),
        licence="U.S. Government work, public domain (Title 17 U.S.C. 105). No permission needed to redistribute.",
        used_for="Farmland and food dimension: cropland, pastureland, rangeland and woodland per state.",
        notes=(
            "ERS reconciles the Census Bureau, BLM, Forest Service and NASS into one land use picture. "
            "It is a land accounting, not a harvest forecast."
        ),
    )


def bea_state_gdp(vintage: int = BEA_VINTAGE) -> Dataset:
    """State gross domestic product, including value added by mining industry."""
    return Dataset(
        key="bea_state_gdp_by_industry",
        url="https://apps.bea.gov/regional/zip/SAGDP.zip",
        filename="SAGDP.zip",
        source=(
            "U.S. Bureau of Economic Analysis, Regional Economic Accounts, GDP and Personal Income by "
            f"State, SAGDP1 and SAGDP2 ({vintage} release)"
        ),
        version=f"{vintage} release",
        licence="U.S. Government work, public domain (Title 17 U.S.C. 105). No permission needed to redistribute.",
        used_for="Economic output, plus the mining and agriculture value-added series for the metal, gold and food dimensions.",
        notes=(
            "The archive holds SAGDP1 (the summary table: GDP, compensation, gross operating surplus) and "
            "SAGDP2 (GDP by industry for every BEA line). SAGDP2 is what separates oil and gas extraction "
            "from mining except oil and gas, and it separates agriculture from forestry and fishing. The "
            "URL is SAGDP.zip rather than SAGDP1.zip: the single-table file 404s, and only the combined "
            "archive is published at that path."
        ),
    )


def usgs_mrds_mines() -> Dataset:
    """USGS mine feature locations and commodities."""
    return Dataset(
        key="usgs_mrds_mine_features",
        url="https://mrdata.usgs.gov/mrds/mrds-csv.zip",
        filename="usgs_mrds_mine_features.zip",
        source="U.S. Geological Survey, Mineral Resources Data System (MRDS), mine feature export as CSV",
        version="rolling export, retrieved at run time",
        licence=(
            "U.S. Government work. MRDS data is in the public domain and neither USGS nor the U.S. "
            "Government endorses any derived product."
        ),
        used_for="Gold and metal dimensions: count and commodity mix of mine features per state.",
        notes=(
            "A mine FEATURE is a mapped location with a commodity, not an annual production volume. It is "
            "used as an independent second signal alongside BEA value added, never as a substitute for it."
        ),
    )


def srtm_tile(tile: str) -> Dataset:
    """One SRTM elevation tile, from the AWS Open Data Skadi mirror.

    The Skadi bucket lays tiles out under their latitude band, so the key is
    ``skadi/N37/N37W085.hgt.gz`` rather than ``skadi/N37W085.hgt.gz``.
    """
    normalised = tile.strip().upper()
    band = f"{normalised[0]}{normalised[1:3]}"
    return Dataset(
        key=f"srtm_tile_{normalised.lower()}",
        url=f"{SRTM_BASE}/{band}/{normalised}.hgt.gz",
        filename=f"{normalised}.hgt.gz",
        source=(
            "SRTM 1 arc-second void-filled digital elevation model, USGS distribution, "
            f"tile {normalised}, via the AWS Open Data 'Skadi' mirror"
        ),
        version="SRTM 1 arc-second (C-band void filled)",
        licence=(
            "NASA SRTM data is in the public domain. USGS publishes the void-filled product; the AWS "
            "Open Data mirror is a redistribution of it."
        ),
        used_for="Campaign terrain height and battle-map ground elevation inside the V1 region.",
        notes=(
            "Only the tiles covering the configured V1 region are downloaded. Country-wide SRTM is "
            "roughly 1,000 tiles, which is a data-management cost, not a correctness one."
        ),
    )


# Every dataset the pipeline needs, resolved for the configured vintages.
def all_datasets(
    *,
    census_year: int = CENSUS_YEAR,
    popest_vintage: int = POPEST_VINTAGE,
    tiger_year: int = TIGER_YEAR,
    carto_year: int = CARTOCURRENT_YEAR,
    ers_year: int = ERS_LAND_YEAR,
    bea_vintage: int = BEA_VINTAGE,
    elevation_tiles: tuple[str, ...] = (),
) -> list[Dataset]:
    """The full ordered dataset list for a run."""
    datasets = [
        census_places(popest_vintage),
        census_states(popest_vintage),
        census_state_boundaries(carto_year),
        census_place_boundaries(carto_year),
        census_primary_roads(tiger_year),
        census_rails(tiger_year),
        natural_earth_admin1(),
        natural_earth_ports(),
        usda_ers_major_land_uses(ers_year),
        bea_state_gdp(bea_vintage),
        usgs_mrds_mines(),
    ]
    datasets.extend(srtm_tile(tile) for tile in elevation_tiles)
    return datasets


# Datasets the pipeline declares it would like but cannot obtain in a
# machine-readable form. Reported in the manifest under "gaps" so nobody
# discovers the absence by reading the output and wondering.
DECLARED_GAPS: list[dict[str, str]] = [
    {
        "gap": "Per-state physical mineral production tonnage by commodity",
        "wanted_for": "mining output dimension, state_profiles.mining_*",
        "why_missing": (
            "The authoritative source is the USGS Minerals Yearbook Area Reports, published as PDF "
            "tables. www.usgs.gov refused automated requests from this network, and the Mineral "
            "Commodity Summaries data releases on USGS ScienceBase carry national and world tables "
            "rather than state breakdowns. There is no machine-readable state-by-commodity series."
        ),
        "substitution": (
            "Bureau of Economic Analysis mining-sector value added (SAGDP1), split into fuel and "
            "non-fuel lines, combined with USGS MRDS mine-feature counts and commodity mix. Both are "
            "real published series covering all 51 jurisdictions. Neither is a tonnage."
        ),
        "honesty": (
            "mining_tonnes is NOT produced. The export carries mining_gva_fuel, mining_gva_nonfuel, "
            "mine_feature_count and the commodity mix, and each is labelled with what it actually is."
        ),
    },
    {
        "gap": "Full street-level road network",
        "wanted_for": "route graph detail",
        "why_missing": (
            "The Census TIGER/Line ROADS layer for the whole country is a multi-gigabyte download and "
            "is not a Phase 0 cost. Primary and secondary roads are downloaded instead."
        ),
        "substitution": (
            "Primary, secondary and other roads from the TIGER/Line PRIMARYROADS layer. Travel time "
            "uses the MTFCC road class for speed, so an unclassified local street is treated as a "
            "secondary road rather than as fast as a highway."
        ),
        "honesty": (
            "The route graph is a highway-and-secondary network, not a street network. A march that "
            "should have used a residential street will not find one."
        ),
    },
    {
        "gap": "Rail line operating status and year opened",
        "wanted_for": "route graph, historical road gating (ERA.md section 5)",
        "why_missing": "TIGER/Line rails carry neither attribute.",
        "substitution": (
            "All rail lines are imported. Rail is not used for travel-time gating because the era "
            "decision is still open in CHANGELOG.md."
        ),
        "honesty": (
            "An abandoned rail line routes the same as an active one. This matters only if the era "
            "decision selects historical road gating."
        ),
    },
    {
        "gap": "Settlement-level farmland, food production, and sanitation",
        "wanted_for": "settlement seed fields from CAUSE_EFFECT.md section 2",
        "why_missing": (
            "USDA publishes farmland by state, not by place. No federal series gives cropland, food "
            "output, or sewerage coverage per settlement."
        ),
        "substitution": (
            "Settlement food production is apportioned from its own state's USDA ERS cropland in "
            "proportion to settlement population, which is stated on every output row. Sanitation "
            "starts from a documented config constant, not from a measurement."
        ),
        "honesty": (
            "settlement food_production is an apportionment, not a measurement. settlement sanitation "
            "is a constant plus a population term, not a measurement. Both carry a source_apportionment "
            "flag so no consumer mistakes them for observed data."
        ),
    },
    {
        "gap": "Historical population for an earlier start year",
        "wanted_for": "ERA.md section 5, per-year state profile recomputation",
        "why_missing": (
            "The era decision is still open in CHANGELOG.md, so no start year has been chosen. The "
            "pipeline is parameterised on census_year and currently uses "
            f"{CENSUS_YEAR}."
        ),
        "substitution": (
            "Census {year} decennial counts, which is the nearest real published decade to the late "
            "era band. Changing config census_year plus adding the matching Census file is the whole "
            "cost of moving to another decade."
        )
        ,
        "honesty": (
            "Ratings are for the 2020 census vintage. They are not valid for a 1950 start year until "
            "the pipeline is re-run against that decade's Census files."
        ),
    },
]
