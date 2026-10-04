#!/usr/bin/env python3
"""Tier 3-88/89: Compute garrison and militia baselines per settlement.

- 88: baseline garrison = population x garrison policy factor
- 89: militia pool = adult-population estimate x mobilization rate

The policy factor is keyed on the `section_key` the pipeline assigns to a
settlement's state, and it is keyed on the *whole* key. The tool used to match
`if prefix in key` against `northeast`, `southeast`, `midwest`, `southwest`,
`west` and `pacific`; the pipeline's section keys are `great_lakes_union`,
`southern_compact`, `atlantic_corridor`, `lone_star_frontier`,
`pacific_compact` and `mountain_alliance`, and only one of them contains any of
those six substrings. So 12,227 of 13,189 settlements fell through to the
default without a word, and a designer's change to a named factor would have
been a change that silently never applied.

So the keys are exact now, `KNOWN_SECTION_KEYS` lists the six the pipeline
assigns, and `faction_factor` refuses a key that is not one of them. A renamed
section stops the tool rather than quietly changing every garrison in the
country.

Usage:

    python tools/build-garrison-baselines.py
"""

import gzip
import json
import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE / "src"))

from worlddata.config import load_config  # noqa: E402

CONFIG = SERVICE / "config" / "world_data.toml"

# The section keys `config/world_data.toml [sections]` assigns, spelled out here
# so this tool holds the list rather than reaching for it at import time - the
# tests and `audit-city-data.py` read the constant, and the run below checks it
# against the config it is about to use.
KNOWN_SECTION_KEYS = (
    "pacific_compact",
    "mountain_alliance",
    "great_lakes_union",
    "southern_compact",
    "lone_star_frontier",
    "atlantic_corridor",
)

# Per-section overrides on the garrison policy factor, keyed on the same exact
# section keys. Empty, because nothing in FACTIONS.md sets a per-side garrison
# rate and inventing six numbers would be exactly the fabrication
# CONSTITUTION.md section 1.1 forbids. The mechanism is here rather than absent
# so that a designer with a real basis for one side having a higher rate edits
# one line instead of rebuilding the table: add `"<section_key>": <factor>` and
# every settlement in that section gets it.
GARRISON_FACTOR_BY_SECTION: dict[str, float] = {}

# One garrison rate for every section. 0.008 of a population is a standing force
# of about eight per thousand, which is roughly the peacetime garrison density
# of a large European state applied uniformly rather than per side.
DEFAULT_GARRISON_FACTOR = 0.008

# Adult population fraction (US ~77% over 18, use 0.75 for militia-eligible)
ADULT_FRACTION = 0.75
# Militia mobilization rate (fraction of adults who'd muster)
MOBILIZATION_RATE = 0.08


def faction_factor(section_key: str) -> float:
    """The garrison policy factor for one section, by its exact key.

    Raises ValueError for a key that is not a section this tool knows. That is
    the whole point of the function: the default is applied to every section on
    purpose, so a key that matches nothing is a config or a pipeline change that
    has not been reflected here, and guessing a garrison rate for a faction
    nobody has described is how 12,227 settlements ended up on a number nobody
    chose.
    """
    if not section_key:
        raise ValueError(
            "a settlement carries no section_key; every settlement in the export is assigned a section, so "
            "this row came from a different build and cannot be banded"
        )
    if section_key in GARRISON_FACTOR_BY_SECTION:
        return GARRISON_FACTOR_BY_SECTION[section_key]
    if section_key not in KNOWN_SECTION_KEYS:
        raise ValueError(
            f"section_key {section_key!r} is not one of {sorted(KNOWN_SECTION_KEYS)}; this tool matches "
            "section keys exactly, so a renamed section has to be renamed here too"
        )
    return DEFAULT_GARRISON_FACTOR


def check_known_section_keys(config_path: Path) -> None:
    """Fail the run if this tool and the pipeline's [sections] table disagree."""
    config_sections = {section.key for section in load_config(config_path).sections}
    unknown = sorted(set(KNOWN_SECTION_KEYS) - config_sections)
    missing = sorted(config_sections - set(KNOWN_SECTION_KEYS))
    if unknown or missing:
        raise ValueError(
            f"{config_path.name} [sections] and this tool disagree. Sections this tool does not know: "
            f"{unknown}. Sections it knows that the config no longer has: {missing}."
        )


def main() -> int:
    repo = Path(__file__).resolve().parent.parent.parent.parent
    settlements_path = repo / "services/world-data/dist/settlements.jsonl.gz"
    out_path = repo / "services/world-data/dist/garrison-baselines.jsonl.gz"

    try:
        check_known_section_keys(CONFIG)
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    results = []
    unbanded: list[str] = []
    with gzip.open(settlements_path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if row.get("_header"):
                continue

            sid = row.get("settlement_id") or row.get("osmId")
            if not sid:
                continue

            pop = row.get("population", 0) or 0
            section_key = row.get("section_key") or ""
            try:
                factor = faction_factor(section_key)
            except ValueError:
                unbanded.append(f"{sid} ({section_key!r})")
                continue

            garrison = int(pop * factor)
            # Minimum garrison of 2 for any populated place
            if pop > 0 and garrison < 2:
                garrison = 2

            adults = int(pop * ADULT_FRACTION)
            militia = int(adults * MOBILIZATION_RATE)

            results.append(
                {
                    "settlement_id": sid,
                    "population": pop,
                    "section_key": section_key,
                    "garrison_baseline": garrison,
                    "garrison_factor": factor,
                    "militia_pool": militia,
                    "adult_population": adults,
                }
            )

    if unbanded:
        # Not a warning to be printed and stepped over: every settlement in the
        # export carries a section, so a row that does not is a build this tool
        # cannot band, and writing the rest of the country without it would ship
        # a garrison table with a hole in it and a zero to say so.
        print(
            f"ERROR: {len(unbanded)} settlement(s) carry no usable section_key and would be left out of "
            f"{out_path.name}: {', '.join(unbanded[:10])}"
            + (f", and {len(unbanded) - 10} more" if len(unbanded) > 10 else ""),
            file=sys.stderr,
        )
        return 1

    with gzip.open(out_path, "wt", encoding="utf-8") as out:
        for r in results:
            out.write(json.dumps(r) + "\n")

    total_garrison = sum(r["garrison_baseline"] for r in results)
    total_militia = sum(r["militia_pool"] for r in results)

    print(f"Settlements: {len(results)}")
    print(f"Garrison factor per section: {DEFAULT_GARRISON_FACTOR} for all {len(KNOWN_SECTION_KEYS)} sections")
    print(f"Total garrison baseline: {total_garrison:,}")
    print(f"Total militia pool: {total_militia:,}")
    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())