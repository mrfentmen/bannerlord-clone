"""Settlement import from real Census Bureau population data.

Source: the Census Bureau's Vintage sub-county population estimates, one row per
geography. Nothing here invents a place or a population.

The source file needs careful reading, and getting it wrong would silently
produce wrong populations, so the layout was established by inspecting the real
file rather than assumed:

  SUMLEV 040  state                        one row per state and D.C.
  SUMLEV 050  county
  SUMLEV 061  state-place, split by county; PLACE is 00000 for CDPs
  SUMLEV 071  state-place, carrying its county code; PLACE is the place FIPS
  SUMLEV 157  duplicate of the place total, plus "(pt.)" parts and county balances
  SUMLEV 162  state-place TOTAL, COUNTY 000, PLACE is the place FIPS
  SUMLEV 170  consolidated city with no balance, PLACE 00000
  SUMLEV 172  "(balance)" part of a consolidated city

The rule this module applies, and why:

* SUMLEV 162/071 give one canonical total per place FIPS. Take those.
* SUMLEV 061 rows are *county parts* of a place, so they must be SUMMED, not
  read. Chicago appears twice under 061 with 2,664,452 and 0; summing gives the
  same total as its 162 row, which is the cross-check this module asserts.
* SUMLEV 157 is either an exact duplicate of a 162 total or a "(pt.)"/"Balance
  of <county>" fragment. Reading it directly would duplicate settlements, so it
  is excluded and the exclusion is asserted by requiring every retained key to
  be unique.
* CDPs and the eight consolidated cities have PLACE 00000, so they are keyed
  on (state, name) instead.

Which population to import is stated, not implied. The pipeline exports:
  population            - the published July 1 estimate for the vintage
  population_2020_base  - the published April 1, 2020 estimates base, which is
                          the Census-2020-based figure
Neither is the decennial census count itself; see docs/DATA_MANIFEST.md.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from ..config import Config
from ..errors import DatasetGap, ParseError

# SUMLEV values whose rows describe a whole place rather than a fragment.
SUMLEV_PLACE_TOTAL = "162"
SUMLEV_PLACE_TOTAL_BY_COUNTY = "071"
SUMLEV_PLACE_PARTS = "061"
SUMLEV_CONSOLIDATED_CITY = "170"

# Names that mark a fragment rather than a settlement.
_FRAGMENT_PREFIX = "Balance of "
_FRAGMENT_SUFFIX = "(pt.)"
_BALANCE_SUFFIX = "(balance)"

# The Census national estimates file includes Puerto Rico, whose FIPS is 72.
# FACTIONS.md section 4 does not put Puerto Rico in any side, so it is excluded
# and the exclusion is reported rather than dropped silently.
EXCLUDED_STATE_FIPS = {"72": "Puerto Rico"}

# Census functional status codes carried through to the export.
# A = active government function, F = future, I = inactive, S = special,
# N = not a governmentally recognized entity, B = nonfunctioning.
_FUNCSTAT_LABELS = {
    "A": "active",
    "F": "consolidation_proposed",
    "I": "inactive",
    "S": "special",
    "N": "not_recognised",
    "B": "nonfunctioning",
}


@dataclass(frozen=True)
class PopulationRow:
    """One place's real population figures, straight from the Census file."""

    state_fips: str
    state_name: str
    place_fips: str
    name: str
    base_2020: int
    estimate_2020: int
    estimate_2023: int
    funcstat: str
    geography_level: str

    @property
    def settlement_id(self) -> str:
        """Stable identifier: state FIPS plus place FIPS, or the name when the
        Census Bureau assigns no place FIPS (CDPs, consolidated cities)."""
        if self.place_fips and self.place_fips != "00000":
            return f"{self.state_fips}-{self.place_fips}"
        return f"{self.state_fips}-nm-{self.name}"


@dataclass(frozen=True)
class StatePopulationRow:
    """One state's real population figure, straight from the Census file."""

    state_fips: str
    name: str
    base_2020: int
    estimate_2020: int
    estimate_2023: int


def _to_int(text: str, *, field: str, row_number: int) -> int:
    stripped = text.strip()
    if not stripped:
        raise ParseError(f"population field {field!r} is empty at data row {row_number}")
    try:
        return int(stripped)
    except ValueError as exc:
        raise ParseError(
            f"population field {field!r} holds {text!r} at data row {row_number}, which is not an integer"
        ) from exc


def _is_fragment(name: str) -> bool:
    return name.startswith(_FRAGMENT_PREFIX) or name.endswith(_FRAGMENT_SUFFIX) or name.endswith(_BALANCE_SUFFIX)


def _base_name(name: str) -> str:
    """The settlement a fragment row belongs to.

    'West Peoria city (pt.)' belongs to 'West Peoria city'. Used so a place
    whose county fragments are partly filtered is recognised and excluded from
    the fragment cross-check.
    """
    if name.endswith(_FRAGMENT_SUFFIX):
        return name[: -len(_FRAGMENT_SUFFIX)].strip()
    if name.endswith(_BALANCE_SUFFIX):
        return name[: -len(_BALANCE_SUFFIX)].strip()
    return name


@dataclass(frozen=True)
class PopulationLoad:
    """Places, states, and the diagnostics the load produced.

    ``diagnostics`` is part of the result rather than a log line, so a caller
    can never load the places without also carrying the notes that explain what
    the source file did.
    """

    places: list[PopulationRow]
    states: dict[str, StatePopulationRow]
    diagnostics: list[str]


def read_state_population(path: Path) -> tuple[dict[str, StatePopulationRow], list[str]]:
    """State and D.C. populations from the Census national estimates file.

    Keys are 2-digit Census state FIPS. The FIPS is read from the STATE column
    rather than being inferred from the state name, so the pipeline never has to
    guess an identifier.
    """
    rows: dict[str, StatePopulationRow] = {}
    excluded: list[str] = []
    with path.open(newline="", encoding="latin-1") as handle:
        reader = csv.DictReader(handle)
        required = {"SUMLEV", "STATE", "NAME", "ESTIMATESBASE2020", "POPESTIMATE2020", "POPESTIMATE2023"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ParseError(f"{path.name} is missing expected columns {sorted(missing)}")
        for index, row in enumerate(reader, start=2):
            if row["SUMLEV"].strip() != "040":
                continue
            fips = row["STATE"].strip()
            if len(fips) != 2 or not fips.isdigit():
                raise ParseError(
                    f"{path.name} row {index}: SUMLEV 040 row has STATE {fips!r}, which is not a 2-digit state FIPS"
                )
            if fips in EXCLUDED_STATE_FIPS:
                excluded.append(f"{row['NAME'].strip()} (FIPS {fips})")
                continue
            if fips in rows:
                raise ParseError(f"{path.name} has two SUMLEV 040 rows for state FIPS {fips}")
            rows[fips] = StatePopulationRow(
                state_fips=fips,
                name=row["NAME"].strip(),
                base_2020=_to_int(row["ESTIMATESBASE2020"], field="ESTIMATESBASE2020", row_number=index),
                estimate_2020=_to_int(row["POPESTIMATE2020"], field="POPESTIMATE2020", row_number=index),
                estimate_2023=_to_int(row["POPESTIMATE2023"], field="POPESTIMATE2023", row_number=index),
            )
    if not rows:
        raise ParseError(f"{path.name} contained no SUMLEV 040 state rows")
    diagnostics = [f"{path.name}: loaded {len(rows)} states and D.C. from the SUMLEV 040 rows."]
    if excluded:
        diagnostics.append(
            f"{path.name}: excluded {len(excluded)} jurisdiction(s) present in the source file but absent "
            f"from FACTIONS.md section 4: {', '.join(excluded)}."
        )
    return rows, diagnostics


def read_place_population(
    path: Path, *, tolerance_fraction: float
) -> tuple[list[PopulationRow], list[str]]:
    """Every Census place and CDP population in the Vintage estimates file.

    Sums county fragments rather than reading them, excludes the duplicated
    and partial rows, and cross-checks the two construction paths against each
    other wherever a place appears under both.
    """
    # (state_fips, place_fips) -> assembled row, for places with a real FIPS.
    by_place_fips: dict[tuple[str, str], dict[str, object]] = {}
    # (state_fips, name) -> assembled row, for CDPs and consolidated cities.
    by_name: dict[tuple[str, str], dict[str, object]] = {}
    # (state_fips, name) -> county-part population total, used as a cross-check.
    county_parts: dict[tuple[str, str], int] = {}
    # Places whose county fragments were partially filtered out. Their fragment
    # sum is not expected to match the place total, so they are not cross-checked.
    has_filtered_fragment: set[tuple[str, str]] = set()
    diagnostics: list[str] = []

    with path.open(newline="", encoding="latin-1") as handle:
        reader = csv.DictReader(handle)
        required = {
            "SUMLEV", "STATE", "COUNTY", "PLACE", "NAME", "STNAME",
            "ESTIMATESBASE2020", "POPESTIMATE2020", "POPESTIMATE2023",
        }
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ParseError(f"{path.name} is missing expected columns {sorted(missing)}")

        for index, row in enumerate(reader, start=2):
            sumlev = row["SUMLEV"].strip()
            if sumlev not in {
                SUMLEV_PLACE_TOTAL,
                SUMLEV_PLACE_TOTAL_BY_COUNTY,
                SUMLEV_PLACE_PARTS,
                SUMLEV_CONSOLIDATED_CITY,
            }:
                continue
            name = row["NAME"].strip()
            state_fips = row["STATE"].strip()
            if _is_fragment(name):
                has_filtered_fragment.add((state_fips, _base_name(name)))
                continue
            place_fips = row["PLACE"].strip()
            estimate = _to_int(row["POPESTIMATE2023"], field="POPESTIMATE2023", row_number=index)

            if sumlev == SUMLEV_PLACE_PARTS:
                # County fragments. Recorded only so the sum can be cross-checked
                # against the place total row for places that also have one.
                key = (state_fips, name)
                county_parts[key] = county_parts.get(key, 0) + estimate
                continue

            record: dict[str, object] = {
                "state_fips": state_fips,
                "state_name": row["STNAME"].strip(),
                "place_fips": place_fips,
                "name": name,
                "base_2020": _to_int(row["ESTIMATESBASE2020"], field="ESTIMATESBASE2020", row_number=index),
                "estimate_2020": _to_int(row["POPESTIMATE2020"], field="POPESTIMATE2020", row_number=index),
                "estimate_2023": estimate,
                "funcstat": row.get("FUNCSTAT", "").strip(),
                "geography_level": "place",
            }

            if place_fips and place_fips != "00000":
                key = (state_fips, place_fips)
                existing = by_place_fips.get(key)
                if existing is None:
                    by_place_fips[key] = record
                elif int(existing["estimate_2023"]) != estimate:
                    raise ParseError(
                        f"{path.name} row {index}: place FIPS {key} appears under two SUMLEV codes with "
                        f"different populations ({existing['estimate_2023']} and {estimate})"
                    )
            else:
                key = (state_fips, name)
                existing = by_name.get(key)
                if existing is None:
                    by_name[key] = record
                else:
                    total = int(existing["estimate_2023"]) + estimate
                    existing["estimate_2023"] = total
                    existing["base_2020"] = int(existing["base_2020"]) + _to_int(
                        row["ESTIMATESBASE2020"], field="ESTIMATESBASE2020", row_number=index
                    )
                    existing["estimate_2020"] = int(existing["estimate_2020"]) + _to_int(
                        row["POPESTIMATE2020"], field="POPESTIMATE2020", row_number=index
                    )

    # Cross-check the two independent readings of the source file: the
    # SUMLEV 162 place total, and the sum of the SUMLEV 061 county fragments.
    #
    # Two situations make a group uncheckable, and both are reported rather than
    # hidden:
    #   * the source file filtered a "(pt.)" or "(balance)" fragment for the
    #     place, so the fragment sum is legitimately lower than the total;
    #   * a state contains more than one distinct place with the same name, so
    #     the name-keyed fragment group is ambiguous. Pennsylvania has two
    #     "Liberty borough" places; summing their fragments together and
    #     comparing against one of them would be a bug, not a finding.
    place_names: dict[tuple[str, str], int] = {}
    for (state_fips, _), record in by_place_fips.items():
        key = (state_fips, str(record["name"]))
        place_names[key] = place_names.get(key, 0) + 1

    checked = 0
    skipped_filtered = 0
    skipped_ambiguous = 0
    mismatches: list[str] = []
    for (state_fips, name), fragment_total in sorted(county_parts.items()):
        if (state_fips, name) in has_filtered_fragment:
            skipped_filtered += 1
            continue
        if place_names.get((state_fips, name), 0) != 1:
            skipped_ambiguous += 1
            continue
        match = next(
            record
            for (fips, _), record in by_place_fips.items()
            if fips == state_fips and record["name"] == name
        )
        checked += 1
        declared = int(match["estimate_2023"])
        if declared == fragment_total:
            continue
        difference = abs(declared - fragment_total)
        relative = difference / max(1, declared)
        if relative > tolerance_fraction:
            raise ParseError(
                f"place {name} ({state_fips}) has a place total of {declared} but its county fragments sum "
                f"to {fragment_total}, a {relative:.4%} difference, above the configured tolerance of "
                f"{tolerance_fraction:.4%}. One of the two readings of the source file is wrong."
            )
        mismatches.append(f"{name} ({state_fips}): total {declared} vs fragments {fragment_total}")

    diagnostics.append(
        f"County-fragment cross-check: {checked} places had their SUMLEV 061 county fragments summed "
        "and compared against their SUMLEV 162 place total. "
        f"{checked - len(mismatches)} agreed exactly; {len(mismatches)} differed within tolerance."
    )
    diagnostics.append(
        f"Cross-check skipped for {skipped_filtered} place(s) whose fragments the source file marks as "
        f"'(pt.)' or '(balance)', and for {skipped_ambiguous} place-name group(s) that are ambiguous "
        "because the state contains more than one distinct place with that name."
    )
    for line in mismatches:
        diagnostics.append(f"  within-tolerance fragment difference: {line}")

    assembled = [
        PopulationRow(
            state_fips=str(record["state_fips"]),
            state_name=str(record["state_name"]),
            place_fips=str(record["place_fips"]),
            name=str(record["name"]),
            base_2020=int(record["base_2020"]),
            estimate_2020=int(record["estimate_2020"]),
            estimate_2023=int(record["estimate_2023"]),
            funcstat=str(record["funcstat"]),
            geography_level=str(record["geography_level"]),
        )
        for record in list(by_place_fips.values()) + list(by_name.values())
    ]

    if not assembled:
        raise ParseError(f"{path.name} yielded no places; the SUMLEV filter cannot be right")

    seen: set[str] = set()
    duplicates: set[str] = set()
    for row in assembled:
        if row.settlement_id in seen:
            duplicates.add(row.settlement_id)
        seen.add(row.settlement_id)
    if duplicates:
        raise ParseError(
            f"{path.name} produced {len(duplicates)} duplicate settlement identifiers, "
            f"for example {sorted(duplicates)[:5]}. Places would be double counted."
        )
    return assembled, diagnostics


def filter_settlements(rows: list[PopulationRow], minimum_population: int) -> list[PopulationRow]:
    """Keep places at or above the configured population floor.

    The floor is a config constant with a documented range, not a number found
    in the logic. Places below it are not deleted from the world: they are
    countryside, and the pipeline records how many were filtered so the count
    can be reported.
    """
    return [row for row in rows if row.estimate_2023 >= minimum_population]


def describe_funcstat(code: str) -> str:
    """Readable label for a Census functional status code."""
    return _FUNCSTAT_LABELS.get(code.strip(), "unknown")


def load_settlements(config: Config) -> PopulationLoad:
    """Load every place and state population the pipeline needs.

    Returns a PopulationLoad. Both populations come from the Census Bureau
    files named in datasets.py, downloaded into the configured raw directory.
    """
    raw_dir = config.path_for("raw_dir")
    places_path = raw_dir / f"sub-est{config.estimates_vintage}.csv"
    states_path = raw_dir / f"NST-EST{config.estimates_vintage}-ALLDATA.csv"
    for path in (places_path, states_path):
        if not path.is_file():
            raise DatasetGap(
                "census_population",
                f"expected {path.name} in {raw_dir}. Run the fetch stage before the transform stage.",
            )
    states, state_diagnostics = read_state_population(states_path)
    places, diagnostics = read_place_population(
        places_path,
        tolerance_fraction=float(config.get("classification.fragment_mismatch_tolerance")),
    )
    return PopulationLoad(places=places, states=states, diagnostics=state_diagnostics + diagnostics)
