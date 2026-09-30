"""Seeding a settlement's starting fields from real data plus config constants.

CAUSE_EFFECT.md section 2 lists the per-town fields the simulation reads:
population, workers, food_stock, food_production, food_demand, medicine_stock,
sanitation, infected, crowding, unrest, loyalty, prosperity, tax_rate, garrison,
garrison_conduct, road_safety, treasury.

The Phase 0 brief says to "seed each settlement's starting fields (population,
food production, sanitation baseline) from real data plus documented config
constants" (PHASES.md Phase 0).

What is measured and what is apportioned, stated on every row:

  MEASURED      population, from the Census Bureau place population.
  APPORTIONED   workers, food_demand, food_production. USDA publishes farmland by
                state, never by settlement, so a settlement's share of its state's
                cropland is taken in proportion to its share of that state's
                population. The factor is published on every row so a consumer can
                see exactly how much of it is arithmetic.
  CONSTANT      sanitation, unrest, treasury, and the rest. These come from
                config/world_data.toml with a documented range. They are NOT
                measurements and are not presented as any.

A settlement with no settlement-level measurement available is not given a
fabricated one; see ``source_apportionment`` on every output row.
"""

from __future__ import annotations

from dataclasses import dataclass

from .config import Config
from .errors import ConfigError
from .transforms.settlements import PopulationRow

# Which seed fields are measured, which are apportioned, which are constants.
# Exported in the schema so a consumer never has to guess.
FIELD_PROVENANCE: dict[str, str] = {
    "population": "measured: U.S. Census Bureau published place population",
    "population_2020_base": "measured: U.S. Census Bureau estimates base, April 1 2020",
    "workers": "apportioned: population x config [seed].worker_share_of_population",
    "food_demand": "apportioned: population x config [seed].food_person_days_per_day",
    "food_stock": "constant: population x config [seed].food_stock_person_days_per_person",
    "food_production": "apportioned: state cropland shared by population share, converted at "
    "config [seed].hectares_per_worker",
    "sanitation": "constant: config [seed].sanitation_baseline plus a documented population term",
    "crowding": "apportioned: population over placed land area, against "
    "config [seed].crowding_reference_people_per_km2",
    "unrest": "constant: config [seed].unrest_initial",
    "treasury": "constant: config [seed].treasury_initial",
    "infected": "constant: zero. An outbreak is a simulation event, not a starting condition.",
    "loyalty": "constant: neutral. Loyalty is earned in play.",
    "prosperity": "constant: neutral. Prosperity is earned in play.",
    "tax_rate": "constant: zero. The holder sets tax.",
    "garrison": "constant: zero. Garrisons are raised in play.",
    "garrison_conduct": "constant: not applicable until a garrison exists.",
}


@dataclass(frozen=True)
class SettlementSeed:
    """A settlement's starting state. Every field's provenance is named."""

    settlement_id: str
    name: str
    state_fips: str
    state_name: str
    size_class: str
    population: int
    population_2020_base: int
    workers: int
    food_demand_person_days: float
    food_stock_person_days: float
    food_production_person_days: float
    food_apportionment_factor: float
    sanitation: float
    crowding: float
    unrest: float
    treasury: float
    infected: float
    loyalty: float
    prosperity: float
    tax_rate: float
    garrison: int
    land_area_km2: float
    longitude: float | None
    latitude: float | None
    elevation_m: float | None
    section_key: str | None
    provenance: dict[str, str]


def seed_settlement(
    config: Config,
    row: PopulationRow,
    *,
    size_class: str,
    state_cropland_ha: float,
    state_population: int,
    section_key: str | None,
    land_area_km2: float | None,
    longitude: float | None,
    latitude: float | None,
    elevation_m: float | None,
) -> SettlementSeed:
    """Build one settlement's starting state.

    ``state_cropland_ha`` and ``state_population`` come from the state's real
    profile. Their ratio is the apportionment: this settlement's share of its
    state's farmland.
    """
    seed = config.seed
    population = row.estimate_2023

    if state_population <= 0:
        raise ConfigError(
            f"{row.name} is in state {row.state_fips}, whose population is {state_population}; a settlement "
            "cannot be apportioned a share of a state with no population"
        )
    population_share = population / state_population
    cropland_ha = state_cropland_ha * population_share

    # Farmers per hectare, from the configured hectares-per-worker figure, times
    # the configured worker share, gives the food this settlement's workers can
    # bring in per day expressed in person-days.
    hectares_per_worker = seed["hectares_per_worker"]
    if hectares_per_worker <= 0:
        raise ConfigError("[seed].hectares_per_worker must be positive")
    worker_share = seed["worker_share_of_population"]
    workers = int(round(population * worker_share))
    farm_workers = min(workers, int(cropland_ha / hectares_per_worker))
    food_production = farm_workers * hectares_per_worker * 100.0

    reference_density = seed["crowding_reference_people_per_km2"]
    area = land_area_km2 if land_area_km2 and land_area_km2 > 0 else None
    if area is None:
        # No placed area from the boundary file. Crowding is left at zero rather
        # than guessed from a default area, and the omission is visible because
        # land_area_km2 is null on the row.
        crowding = 0.0
    else:
        density = population / area
        crowding = max(0.0, min(1.0, density / reference_density))

    sanitation = min(
        1.0,
        seed["sanitation_baseline"]
        + seed["sanitation_per_thousand_population"] * (population / 1000.0),
    )

    return SettlementSeed(
        settlement_id=row.settlement_id,
        name=row.name,
        state_fips=row.state_fips,
        state_name=row.state_name,
        size_class=size_class,
        population=population,
        population_2020_base=row.base_2020,
        workers=workers,
        food_demand_person_days=population * seed["food_person_days_per_day"],
        food_stock_person_days=population * seed["food_stock_person_days_per_person"],
        food_production_person_days=food_production,
        food_apportionment_factor=population_share,
        sanitation=sanitation,
        crowding=crowding,
        unrest=seed["unrest_initial"],
        treasury=seed["treasury_initial"],
        infected=0.0,
        loyalty=0.5,
        prosperity=0.5,
        tax_rate=0.0,
        garrison=0,
        land_area_km2=area if area is not None else 0.0,
        longitude=longitude,
        latitude=latitude,
        elevation_m=elevation_m,
        section_key=section_key,
        provenance=FIELD_PROVENANCE,
    )


def summarise_seeds(seeds: list[SettlementSeed]) -> list[str]:
    """Aggregate facts about the seeded set, for the changelog and the report."""
    by_class: dict[str, int] = {}
    population_by_class: dict[str, int] = {}
    without_area = 0
    without_elevation = 0
    for seed in seeds:
        by_class[seed.size_class] = by_class.get(seed.size_class, 0) + 1
        population_by_class[seed.size_class] = population_by_class.get(seed.size_class, 0) + seed.population
        if not seed.land_area_km2:
            without_area += 1
        if seed.elevation_m is None:
            without_elevation += 1

    lines = [
        f"Seeded {len(seeds)} settlements holding {sum(seed.population for seed in seeds):,} people.",
    ]
    for name in sorted(by_class):
        lines.append(
            f"  {name:8} {by_class[name]:>6} settlements, {population_by_class[name]:>12,} people"
        )
    lines.append(
        f"{without_area} settlements have no placed land area from the Census boundary file, so their "
        "crowding value is zero and their land_area_km2 is null rather than assumed."
    )
    lines.append(
        f"{without_elevation} settlements fall outside the downloaded SRTM tiles for the V1 region, so their "
        "elevation_m is null rather than assumed to be sea level."
    )
    return lines
