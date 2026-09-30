"""The pipeline: fetch, transform, verify, classify, seed, export, load.

One entry point that runs every stage in order and returns everything the CLI
reports. Stages are functions of the previous stage's output, never of each
other's internals, so a stage can be run alone for debugging.

Run it with::

    python -m worlddata run

Every stage reports what it did. Nothing is inferred quietly: if a dataset is
missing the run stops with the reason rather than producing a partial world.
"""

from __future__ import annotations

import gc
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from . import datasets as dataset_registry
from . import cache as stage_cache
from . import postgres, schema as schema_module
from .transforms.classify import Classification
from .config import Config, load_config
from .errors import WorldDataError
from .export import write_export
from .manifest import Manifest, build_records, describe_environment, write_manifests
from .seed import SettlementSeed, seed_settlement, summarise_seeds
from .spotcheck import run_spot_checks, write_spot_checks
from .sections import (
    assign_sections,
    compute_ratings,
    compute_section_totals,
    state_share_distributions,
)
from .transforms.boundaries import (
    PlaceBoundary,
    StateBoundary,
    cross_check_against_natural_earth,
    load_place_boundaries,
    load_state_boundaries,
    state_name_to_fips,
)
from .transforms.classify import classify
from .transforms.ports import load_ports
from .transforms.roads import GeometryStore, Route, RouteSegment, load_routes
from .transforms.settlements import (
    PopulationRow,
    filter_settlements,
    load_settlements,
)
from .transforms.state_profiles import StateProfile, build_state_profiles, verify_bea_totals
from .transforms.terrain import load_elevation_tiles, sample_settlements, write_tile_geojson


@dataclass
class PipelineResult:
    """Everything the run produced, for the CLI and the reports."""

    config: Config
    generated_at: str
    progress: bool = True
    diagnostics: list[str] = field(default_factory=list)
    settlements: list[SettlementSeed] = field(default_factory=list)
    profiles: list[StateProfile] = field(default_factory=list)
    classification: Classification | None = None
    ratings: Any = None
    export_summary: dict[str, dict[str, Any]] = field(default_factory=dict)
    postgres_result: postgres.LoadResult | None = None
    timings: dict[str, float] = field(default_factory=dict)
    spot_checks: list = field(default_factory=list)

    def log(self, message: str) -> None:
        self.diagnostics.append(message)
        if self.progress:
            print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {message}", flush=True)

    @staticmethod
    def peak_memory_mb() -> float:
        """Peak resident set size in MB for this process.

        PEAK, not current. macOS exposes no current-RSS counter to an ordinary
        process, and resource.getrusage only ever reports the high-water mark, so
        this number never goes down and must not be read as "memory held right
        now". It is reported because it is the useful figure for "did any stage
        balloon", and because an early draft of this function labelled it
        resident memory and sent the run record chasing a leak that was not one.
        """
        import resource

        # Linux publishes a high-water mark directly and reports ru_maxrss in
        # kilobytes. macOS has no /proc, reports ru_maxrss in bytes, and the
        # threshold below distinguishes the two without guessing.
        try:
            with open("/proc/self/status", encoding="utf-8") as handle:
                for line in handle:
                    if line.startswith("VmHWM:"):
                        return int(line.split()[1]) / 1024.0
        except OSError:
            pass
        # macOS reports bytes, Linux reports kilobytes. A Python process peaking
        # below ten million of anything is not plausible in kilobytes, so that
        # threshold tells the two apart without a platform check.
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return peak / (1024.0 * 1024.0) if peak > 10_000_000 else peak / 1024.0

    def log_stage(self, stage: str) -> None:
        self.log(
            f"{stage}: stage took {self.timings[stage]:.1f}s; process peak memory so far "
            f"{self.peak_memory_mb():.0f} MB"
        )


def _load_routes_for_cache(config: Config, settlement_points):
    """Group the route stage's three return values into the cache's shape."""
    segments, routes, notes = load_routes(config, settlement_points)
    return (segments, routes), list(notes)


def _load_boundaries(config: Config):
    """Read both boundary layers and return them with their notes."""
    state_boundaries, notes = load_state_boundaries(config)
    place_boundaries, place_notes = load_place_boundaries(config)
    return (state_boundaries, place_boundaries), notes + place_notes


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def run(
    config: Config | None = None,
    *,
    skip_fetch: bool = False,
    skip_postgres: bool = False,
    reuse_stages: bool = False,
    progress: bool = True,
) -> PipelineResult:
    """Run the whole Phase 0 pipeline."""
    config = config or load_config()
    result = PipelineResult(config=config, generated_at=_now(), progress=progress)
    generated_at = result.generated_at

    # --- stage 1: fetch ----------------------------------------------------
    stage_start = time.perf_counter()
    retrieved: dict[str, tuple[str, Path, str]] = {}
    row_counts: dict[str, int] = {}
    declared = dataset_registry.all_datasets(
        census_year=config.census_year,
        popest_vintage=config.estimates_vintage,
        elevation_tiles=config.elevation_tiles,
    )
    if skip_fetch:
        from .fetch import read_recorded_digest

        for dataset in declared:
            path = config.path_for("raw_dir") / dataset.filename
            if not path.is_file():
                raise WorldDataError(
                    f"--skip-fetch was passed but {path} is not present. Fetch at least once so the "
                    "pipeline has real data to work on."
                )
            digest = read_recorded_digest(path)
            retrieved[dataset.key] = (
                "recorded by an earlier fetch (reused)",
                path,
                digest or sha256_of(path),
            )
        result.log(f"fetch: reused {len(retrieved)} files already in {config.path_for('raw_dir')}")
    else:
        from .fetch import fetch

        for dataset in declared:
            fetched = fetch(config, dataset.url, dataset.filename, expected_sha256=dataset.expected_sha256)
            retrieved[dataset.key] = (generated_at, fetched.path, fetched.sha256)
            state = "reused" if fetched.from_cache else f"downloaded in {fetched.attempts} attempt(s)"
            result.log(f"fetch: {dataset.filename} ({fetched.bytes_written:,} bytes) {state}")
    result.timings["fetch"] = time.perf_counter() - stage_start
    result.log_stage("fetch")

    # --- stage 2: settlements ---------------------------------------------
    stage_start = time.perf_counter()
    population = load_settlements(config)
    for note in population.diagnostics:
        result.log(f"settlements: {note}")
    kept = filter_settlements(population.places, config.classification.min_population)
    row_counts["census_sub_county_population"] = len(population.places)
    result.log(
        f"settlements: {len(population.places)} places parsed, {len(kept)} at or above the configured "
        f"minimum of {config.classification.min_population:,}, {len(population.states)} states"
    )
    national_total = sum(state.estimate_2023 for state in population.states.values())
    result.log(
        f"settlements: state populations sum to {national_total:,}, which the pipeline compares against "
        "the Census Bureau's own United States row in verify_national_total"
    )
    _verify_national_total(config, population.states, result)
    result.timings["settlements"] = time.perf_counter() - stage_start
    result.log_stage("settlements")

    # --- stage 3: boundaries ----------------------------------------------
    stage_start = time.perf_counter()
    stamp = stage_cache.fingerprint(config.path, retrieved, "boundaries")
    ((state_boundaries, place_boundaries), boundary_notes), cache_note = stage_cache.cached(
        config.path_for("cache_dir"),
        "boundaries",
        stamp,
        lambda: _load_boundaries(config),
        reuse=reuse_stages,
    )
    result.log(cache_note)
    for note in boundary_notes:
        result.log(f"boundaries: {note}")
    name_to_fips = state_name_to_fips(state_boundaries)
    valid_fips = set(population.states)
    state_boundaries = [item for item in state_boundaries if item.state_fips in valid_fips]
    place_boundaries = [item for item in place_boundaries if item.state_fips in valid_fips]
    result.log(
        f"boundaries: {len(state_boundaries)} state polygons and {len(place_boundaries)} place polygons "
        "restricted to the 50-states-plus-D.C. universe"
    )
    for note in cross_check_against_natural_earth(
        state_boundaries,
        config.path_for("raw_dir") / "ne_10m_admin_1_states_provinces.geojson",
        expected_fips=valid_fips,
    ):
        result.log(f"boundaries cross-check: {note}")
    result.timings["boundaries"] = time.perf_counter() - stage_start
    result.log_stage("boundaries")

    # --- stage 4: state profiles ------------------------------------------
    stage_start = time.perf_counter()
    ports, port_notes = load_ports(config, state_boundaries)
    for note in port_notes:
        result.log(f"ports: {note}")
    profiles, profile_notes = build_state_profiles(config, state_boundaries, population.states, ports)
    for note in profile_notes:
        result.log(f"state profiles: {note}")
    for note in verify_bea_totals(profiles, config, config.get("verification.bea_gdp_tolerance")):
        result.log(f"state profiles: {note}")
    result.log(f"state profiles: built {len(profiles)} profiles from real Census, BEA, USDA and USGS data")
    result.profiles = profiles
    result.timings["state_profiles"] = time.perf_counter() - stage_start
    result.log_stage("state_profiles")

    # --- stage 5: sections and ratings -------------------------------------
    stage_start = time.perf_counter()
    assignment, section_notes = assign_sections(config, profiles, name_to_fips)
    for note in section_notes:
        result.log(f"sections: {note}")
    for profile in profiles:
        profile.section_key = assignment[profile.state_fips]
    totals, total_notes = compute_section_totals(config, profiles, assignment)
    for note in total_notes:
        result.log(f"sections: {note}")
    ratings = compute_ratings(
        config, totals, config.sections, state_share_distributions(profiles)
    )
    result.log(f"sections: {ratings.method_description}")
    agreed, considered = ratings.agreement_count()
    result.log(
        f"sections: computed {considered} ratings across 6 sides x 5 dimensions; {agreed} match the "
        f"FACTIONS.md section 3 design target and {considered - agreed} differ. Ratings were not adjusted "
        "to match; see docs/SECTION_RATINGS.md."
    )
    result.ratings = ratings
    result.timings["sections"] = time.perf_counter() - stage_start
    result.log_stage("sections")

    # --- stage 6: classification ------------------------------------------
    stage_start = time.perf_counter()
    classification = classify([row.estimate_2023 for row in kept], config)
    result.classification = classification
    result.log(
        f"classification: method {classification.method}, cuts at "
        f"{[int(round(10 ** cut)) for cut in classification.cuts_log10]}, classes "
        + ", ".join(
            f"{item.name} n={item.count:,}" for item in classification.classes
        )
    )
    result.timings["classification"] = time.perf_counter() - stage_start
    result.log_stage("classification")

    # --- stage 7: geometry for settlements --------------------------------
    stage_start = time.perf_counter()
    place_by_key = {
        f"{boundary.state_fips}-{boundary.place_fips}": boundary for boundary in place_boundaries
    }
    by_name_state = {
        (boundary.state_name if hasattr(boundary, "state_name") else boundary.state_fips, boundary.name): boundary
        for boundary in place_boundaries
    }
    settlement_points: dict[str, tuple[float, float]] = {}
    for row in kept:
        boundary = place_by_key.get(row.settlement_id) or by_name_state.get((row.state_name, row.name))
        if boundary is not None:
            settlement_points[row.settlement_id] = (boundary.longitude, boundary.latitude)
    result.log(
        f"geometry: matched {len(settlement_points)} of {len(kept)} settlements to a Census place polygon "
        "by place FIPS, then by state and name"
    )

    sampler, terrain_notes = load_elevation_tiles(config)
    for note in terrain_notes:
        result.log(f"terrain: {note}")
    elevations, uncovered, elevation_notes = sample_settlements(sampler, settlement_points)
    for note in elevation_notes:
        result.log(f"terrain: {note}")
    if uncovered:
        result.log(
            f"terrain: {len(uncovered)} settlements have no elevation because they fall outside the "
            "configured V1 region; their elevation_m is null in the export"
        )
    result.timings["terrain"] = time.perf_counter() - stage_start
    result.log_stage("terrain")

    # --- stage 9: seed settlements ----------------------------------------
    # Seeding runs before the route stage on purpose. Both need the place
    # boundaries, and the route stage is the memory high point of the pipeline;
    # once the seeds exist the polygons are released so the national road and
    # rail network is not being built alongside 32,000 place geometries.
    stage_start = time.perf_counter()
    profile_by_fips = {profile.state_fips: profile for profile in profiles}
    seeds: list[SettlementSeed] = []
    missing_boundary = 0
    for row in kept:
        boundary = place_by_key.get(row.settlement_id) or by_name_state.get((row.state_name, row.name))
        if boundary is None:
            missing_boundary += 1
        profile = profile_by_fips[row.state_fips]
        seeds.append(
            seed_settlement(
                config,
                row,
                size_class=classification.class_for(row.estimate_2023),
                state_cropland_ha=profile.cropland_ha,
                state_population=profile.population,
                section_key=assignment.get(row.state_fips),
                land_area_km2=boundary.land_area_km2 if boundary is not None else None,
                longitude=boundary.longitude if boundary is not None else None,
                latitude=boundary.latitude if boundary is not None else None,
                elevation_m=elevations.get(row.settlement_id),
            )
        )
    if missing_boundary:
        result.log(
            f"settlements: {missing_boundary} settlements had no Census place polygon, so their "
            "coordinates, land area and crowding are null rather than invented"
        )
    for line in summarise_seeds(seeds):
        result.log(f"seed: {line}")
    result.settlements = seeds
    result.timings["seed"] = time.perf_counter() - stage_start
    result.log_stage("seed")

    # Everything downstream of seeding needs settlement coordinates, which are
    # already copied into settlement_points, and nothing downstream needs the
    # 32,000 place polygons or the raw population rows. Release them here.
    place_by_key = {}
    by_name_state = {}
    place_boundaries = []
    kept = []
    population = None
    gc.collect()
    result.log(
        "seed: released the place polygons and raw population rows before the route stage"
    )

    # --- stage 10: routes --------------------------------------------------
    stage_start = time.perf_counter()
    routes_stamp = stage_cache.fingerprint(
        config.path, retrieved, f"routes:{len(settlement_points)}"
    )
    ((segments, routes), route_notes), cache_note = stage_cache.cached(
        config.path_for("cache_dir"),
        "routes",
        routes_stamp,
        lambda: _load_routes_for_cache(config, settlement_points),
        reuse=reuse_stages,
    )
    result.log(cache_note)
    for note in route_notes:
        result.log(f"routes: {note}")
    row_counts["census_primary_roads"] = sum(1 for item in segments if item.kind == "road")
    row_counts["census_rails"] = sum(1 for item in segments if item.kind == "rail")
    result.log(f"routes: {len(segments)} route segments and {len(routes)} settlement-to-settlement routes")
    result.timings["routes"] = time.perf_counter() - stage_start
    result.log_stage("routes")

    # --- stage 10: spot check ---------------------------------------------
    stage_start = time.perf_counter()
    minimum_checks = int(config.get("verification.minimum_spot_checks"))
    checks, check_notes = run_spot_checks(config, seeds, minimum=minimum_checks)
    for note in check_notes:
        result.log(f"spot check: {note}")
    if len(checks) < minimum_checks:
        raise WorldDataError(
            f"the spot check produced {len(checks)} rows but PHASES.md Phase 0 requires at least "
            f"{minimum_checks}. Add settlements rather than lowering the requirement."
        )
    write_spot_checks(config, checks, check_notes)
    result.spot_checks = checks
    result.timings["spot_check"] = time.perf_counter() - stage_start
    result.log_stage("spot_check")

    # --- stage 11: assemble, publish, load --------------------------------
    stage_start = time.perf_counter()
    tables = _assemble_tables(
        profiles,
        assignment,
        totals,
        ratings,
        seeds,
        routes,
        segments,
        state_boundaries,
        place_boundaries,
        ports,
        classification,
        config,
        GeometryStore(config.path_for("cache_dir") / "route_geometry.jsonl.gz"),
    )
    # The 137,000 route segment objects are compacted into plain tuples inside
    # the table builder and the originals dropped here, so the export's three
    # passes do not run alongside them.
    segments = []
    gc.collect()

    result.export_summary = write_export(
        config,
        tables,
        generated_at=generated_at,
        extra_metadata={
            "schema_file": "schema.json",
            "manifest_file": "MANIFEST.json",
            "classification": classification.as_dict(),
        },
    )
    schema = schema_module.build_schema(
        config,
        tables,
        generated_at=generated_at,
        row_counts={name: summary["rows"] for name, summary in result.export_summary.items()},
        extra={"run_diagnostics_count": len(result.diagnostics)},
    )
    checked_in, shipped = schema_module.write_schema(config, schema)
    result.log(
        f"schema: published {sum(table['row_count'] for table in schema['tables']):,} rows across "
        f"{len(schema['tables'])} tables to {checked_in.relative_to(config.service_root)} and "
        f"{shipped.relative_to(config.service_root)}"
    )

    for name, summary in result.export_summary.items():
        note = (
            f"export: {name} {summary['rows']:,} rows, {summary['jsonl_gz']} "
            f"({summary['jsonl_gz_bytes']:,} B) + {summary['parquet']} "
            f"({summary['parquet_bytes']:,} B)"
        )
        if summary["parquet_error"]:
            note += f" [parquet skipped: {summary['parquet_error']}]"
        result.log(note)

    manifest = Manifest(
        generated_at=generated_at,
        census_year=config.census_year,
        estimates_vintage=config.estimates_vintage,
        datasets=build_records(config, retrieved, row_counts),
        gaps=list(dataset_registry.DECLARED_GAPS),
        diagnostics=list(result.diagnostics),
        environment=describe_environment(),
    )
    paths = write_manifests(config, manifest)
    result.log(
        f"manifest: {len(manifest.datasets)} datasets, {len(manifest.gaps)} declared gaps, written to "
        + ", ".join(str(path.relative_to(config.service_root)) for path in paths.values())
    )

    if skip_postgres:
        result.postgres_result = postgres.LoadResult(False, "skipped by --skip-postgres", False, (), {})
    else:
        result.postgres_result = postgres.load(config, tables, ddl_statements=schema_module.ddl_statements(schema))
    result.log(f"postgres: {result.postgres_result.summary()}")
    result.timings["publish"] = time.perf_counter() - stage_start
    result.log_stage("publish")

    _write_reports(config, result, classification, ratings, schema)
    result.timings["total"] = sum(
        value for key, value in result.timings.items() if key != "total"
    )
    return result


def sha256_of(path) -> str:
    from .fetch import sha256_of_file

    return sha256_of_file(path)


def _verify_national_total(config, states, result: PipelineResult) -> None:
    """Compare the 51 state populations against the Census Bureau's US row.

    The national estimates file contains a United States row as well as 50 state
    rows and D.C. Summing the states must reproduce it. That is a real, published
    figure the pipeline can be held to, and it catches a state being dropped or
    double-counted.
    """
    raw_dir = config.path_for("raw_dir")
    import csv

    national = None
    path = raw_dir / f"NST-EST{config.estimates_vintage}-ALLDATA.csv"
    with path.open(newline="", encoding="latin-1") as handle:
        for row in csv.DictReader(handle):
            # SUMLEV 010 is the United States row; SUMLEV 040 is the states, and
            # the pipeline reads those in settlements.py. Looking for 040 here
            # finds nothing, because no SUMLEV 040 row has STATE 00.
            if row["SUMLEV"].strip() == "010" and row["STATE"].strip() == "00":
                national = int(row[f"POPESTIMATE{config.estimates_vintage}"])
                break
    if national is None:
        result.log(
            "settlements: the national estimates file has no SUMLEV 040 United States row, so the "
            "state-total cross-check was skipped"
        )
        return
    total = sum(state.estimate_2023 for state in states.values())
    difference = total - national
    if difference != 0:
        raise WorldDataError(
            f"the 50 state and D.C. populations sum to {total:,} but the Census Bureau publishes "
            f"{national:,} for the United States. A difference of {difference:,} means a jurisdiction was "
            "dropped or counted twice, and shipping that would put a wrong total in the game."
        )
    result.log(
        f"settlements: cross-check passed - 50 states plus D.C. sum to {total:,}, exactly the Census "
        "Bureau's own published United States figure"
    )


def _assemble_tables(
    profiles: list[StateProfile],
    assignment: dict[str, str],
    totals: Any,
    ratings: Any,
    seeds: list[SettlementSeed],
    routes: list[Route],
    segments: list[RouteSegment],
    state_boundaries: list[StateBoundary],
    place_boundaries: list[PlaceBoundary],
    ports: Any,
    classification: Classification,
    config: Config,
    geometry_store: GeometryStore,
) -> dict[str, Any]:
    """Build the published tables from the transformed data."""
    section_names = {section.key: section.name for section in config.sections}
    size_class_by_id = {seed.settlement_id: seed.size_class for seed in seeds}

    state_profile_rows = []
    for profile in profiles:
        row = {
            "state_fips": profile.state_fips,
            "name": profile.name,
            "abbreviation": profile.abbreviation,
            "section_key": profile.section_key,
            "section_name": section_names.get(profile.section_key or ""),
            "population": profile.population,
            "population_2020_base": profile.population_2020_base,
            "land_area_km2": profile.land_area_km2,
            "water_area_km2": profile.water_area_km2,
            "gdp_current_usd_millions": profile.gdp_current_usd,
            "ag_gva_usd_millions": profile.ag_gva_usd,
            "farm_gva_usd_millions": profile.farm_gva_usd,
            "mining_total_gva_usd_millions": profile.mining_total_gva_usd,
            "mining_fuel_gva_usd_millions": profile.mining_fuel_gva_usd,
            "mining_nonfuel_gva_usd_millions": profile.mining_nonfuel_gva_usd,
            "finance_gva_usd_millions": profile.finance_gva_usd,
            "water_transport_gva_usd_millions": profile.water_transport_gva_usd,
            "cropland_thousand_acres": profile.cropland_thousand_acres,
            "pasture_thousand_acres": profile.pasture_thousand_acres,
            "forest_thousand_acres": profile.forest_thousand_acres,
            "urban_thousand_acres": profile.urban_thousand_acres,
            "total_land_thousand_acres": profile.total_land_thousand_acres,
            "cropland_ha": profile.cropland_ha,
            "pasture_ha": profile.pasture_ha,
            "mine_feature_count": profile.mine_feature_count,
            "mine_producer_count": profile.mine_producer_count,
            "mine_prospect_count": profile.mine_prospect_count,
            "mine_producer_gold": profile.mine_producer_gold,
            "mine_producer_metal": profile.mine_producer_metal,
            "mine_producer_fuel": profile.mine_producer_fuel,
            "mine_feature_gold": profile.mine_feature_gold,
            "mine_feature_metal": profile.mine_feature_metal,
            "mine_feature_fuel": profile.mine_feature_fuel,
            "mine_feature_aggregate": profile.mine_feature_aggregate,
            "mine_commodities_unmatched": profile.mine_commodities_unmatched,
            "port_count": profile.port_count,
            "port_weight": profile.port_weight,
            "data_sources": json.dumps(profile.sources, sort_keys=True),
        }
        state_profile_rows.append(row)

    rating_rows = []
    rating_lookup = ratings.by_section()
    for section in config.sections:
        for dimension, rating in sorted(rating_lookup.get(section.key, {}).items()):
            rating_rows.append(
                {
                    "section_key": section.key,
                    "section_name": section.name,
                    "dimension": dimension,
                    "computed_rating": rating.rating,
                    "design_target_rating": rating.target,
                    "agrees_with_target": rating.agrees,
                    "difference": rating.rating - rating.target,
                    "raw_total": rating.raw_total,
                    "national_total": rating.national_total,
                    "share_of_national": rating.share_of_national,
                    "band_edges_share": json.dumps([round(edge, 8) for edge in rating.band_edges]),
                    "z_score_across_sections": rating.z_score,
                    "sub_scores": json.dumps({key: round(value, 6) for key, value in rating.sub_scores.items()}),
                    "state_coverage": rating.coverage,
                    "note": "Computed from real data. The design target is recorded for comparison only and is never an input.",
                }
            )

    settlement_rows = [
        {
            "settlement_id": seed.settlement_id,
            "name": seed.name,
            "state_fips": seed.state_fips,
            "state_name": seed.state_name,
            "section_key": seed.section_key,
            "size_class": seed.size_class,
            "longitude": seed.longitude,
            "latitude": seed.latitude,
            "elevation_m": seed.elevation_m,
            "land_area_km2": seed.land_area_km2 or None,
            "population": seed.population,
            "population_2020_base": seed.population_2020_base,
            "workers": seed.workers,
            "food_stock_person_days": seed.food_stock_person_days,
            "food_demand_person_days": seed.food_demand_person_days,
            "food_production_person_days": seed.food_production_person_days,
            "food_apportionment_factor": seed.food_apportionment_factor,
            "sanitation": seed.sanitation,
            "crowding": seed.crowding,
            "unrest": seed.unrest,
            "treasury": seed.treasury,
            "infected": seed.infected,
            "loyalty": seed.loyalty,
            "prosperity": seed.prosperity,
            "tax_rate": seed.tax_rate,
            "garrison": seed.garrison,
            "source_apportionment": json.dumps(
                {
                    "population": "measured",
                    "workers": "apportioned",
                    "food_production": "apportioned",
                    "sanitation": "config_constant",
                    "crowding": "apportioned",
                },
                sort_keys=True,
            ),
        }
        for seed in seeds
    ]

    route_rows = [
        {
            "route_id": route.route_id,
            "from_settlement_id": route.from_settlement_id,
            "to_settlement_id": route.to_settlement_id,
            "distance_km": route.distance_km,
            "road_safety": route.road_safety,
            "kind": route.kind,
            "segment_count": len(route.segment_ids),
            "segment_ids": json.dumps(list(route.segment_ids)),
        }
        for route in routes
    ]

    # Compact the 137,000 route segment objects into plain tuples before the
    # export, then drop the objects. The export runs three separate passes over
    # this table (JSON, Parquet, schema sample), and holding 137,000 dataclasses
    # alive across all three was the difference between finishing and being
    # killed. Tuples cost a fraction of the memory and carry the same values.
    compact_segments = [
        (
            segment.segment_id,
            segment.kind,
            segment.road_class,
            segment.name,
            segment.length_km,
            segment.speed_kmh,
            segment.travel_hours,
            segment.road_safety,
            segment.from_settlement_id,
            segment.to_settlement_id,
            segment.snap_from_km,
            segment.snap_to_km,
            segment.vertex_count,
        )
        for segment in segments
    ]
    del segments
    gc.collect()

    # Geometry is re-read from the store one segment at a time, by seek, so the
    # export never holds the national road and rail network in memory.
    def _segment_rows() -> Iterator[dict[str, Any]]:
        """Fresh generator over the route segments, seeking into the store."""
        for row in compact_segments:
            (
                segment_id,
                kind,
                road_class,
                name,
                length_km,
                speed_kmh,
                travel_hours,
                road_safety,
                from_settlement_id,
                to_settlement_id,
                snap_from_km,
                snap_to_km,
                vertex_count,
            ) = row
            points = geometry_store.read(segment_id)
            yield {
                "segment_id": segment_id,
                "kind": kind,
                "road_class": road_class,
                "name": name,
                "length_km": length_km,
                "speed_kmh": speed_kmh,
                "travel_hours": travel_hours,
                "road_safety": road_safety,
                "from_settlement_id": from_settlement_id,
                "to_settlement_id": to_settlement_id,
                "snap_from_km": snap_from_km,
                "snap_to_km": snap_to_km,
                "vertex_count": vertex_count,
                "geometry": json.dumps(points, separators=(",", ":")),
            }
            continue
            yield {
                "segment_id": segment.segment_id,
                "kind": segment.kind,
                "road_class": segment.road_class,
                "name": segment.name,
                "length_km": segment.length_km,
                "speed_kmh": segment.speed_kmh,
                "travel_hours": segment.travel_hours,
                "road_safety": segment.road_safety,
                "from_settlement_id": segment.from_settlement_id,
                "to_settlement_id": segment.to_settlement_id,
                "snap_from_km": segment.snap_from_km,
                "snap_to_km": segment.snap_to_km,
                "vertex_count": segment.vertex_count,
                "geometry": json.dumps(points, separators=(",", ":")),
            }

    segment_rows = _segment_rows()

    state_boundary_rows = [
        {
            "state_fips": boundary.state_fips,
            "abbreviation": boundary.abbreviation,
            "name": boundary.name,
            "land_area_km2": boundary.land_area_km2,
            "water_area_km2": boundary.water_area_km2,
            "ring_count": len(boundary.geometry),
            "vertex_count": sum(len(ring) for ring in boundary.geometry),
        }
        for boundary in state_boundaries
    ]

    place_boundary_rows = [
        {
            "settlement_key": f"{boundary.state_fips}-{boundary.place_fips}",
            "state_fips": boundary.state_fips,
            "place_fips": boundary.place_fips,
            "name": boundary.name,
            "name_with_type": boundary.name_with_type,
            "lsad_code": boundary.lsad_code,
            "size_class": size_class_by_id.get(f"{boundary.state_fips}-{boundary.place_fips}"),
            "longitude": boundary.longitude,
            "latitude": boundary.latitude,
            "land_area_km2": boundary.land_area_km2,
            "vertex_count": boundary.vertex_count,
            "ring_count": boundary.ring_count,
        }
        for boundary in place_boundaries
    ]

    port_rows = [
        {
            "port_id": port.port_id,
            "name": port.name,
            "state_fips": port.state_fips,
            "scale_rank": port.scale_rank,
            "scale_label": port.scale_label,
            "longitude": port.longitude,
            "latitude": port.latitude,
        }
        for port in ports
    ]

    terrain_rows = [
        {
            "settlement_id": seed.settlement_id,
            "longitude": seed.longitude,
            "latitude": seed.latitude,
            "elevation_m": seed.elevation_m,
            "in_v1_region": seed.elevation_m is not None,
        }
        for seed in seeds
        if seed.longitude is not None and seed.latitude is not None
    ]

    return {
        "state_profiles": state_profile_rows,
        "sections": [
            {
                "section_key": section.key,
                "section_name": section.name,
                "state_fips": json.dumps(sorted(assignment_state_fips(section.key, profiles, assignment))),
                "state_count": len(assignment_state_fips(section.key, profiles, assignment)),
                "states": json.dumps(
                    sorted(
                        profile.name
                        for profile in profiles
                        if assignment.get(profile.state_fips) == section.key
                    )
                ),
                "design_target_ratings": json.dumps(section.target_ratings, sort_keys=True),
                "source": "FACTIONS.md sections 4.1-4.6, matched to Census FIPS codes at run time",
            }
            for section in config.sections
        ],
        "section_ratings": rating_rows,
        "settlements": settlement_rows,
        "routes": route_rows,
        # A factory, not a list: the national road and rail network is too large
        # to hold in memory, and three consumers need these rows.
        "route_segments": _segment_rows,
        "state_boundaries": state_boundary_rows,
        "place_boundaries": place_boundary_rows,
        "ports": port_rows,
        "terrain_samples": terrain_rows,
        "regions": [
            {
                "region_name": config.region_name,
                "bbox_west": config.region_bbox[0],
                "bbox_south": config.region_bbox[1],
                "bbox_east": config.region_bbox[2],
                "bbox_north": config.region_bbox[3],
                "elevation_tiles": json.dumps(list(config.elevation_tiles)),
                "vertical_exaggeration": config.get("terrain.vertical_exaggeration"),
                "slice_name": config.slice_name,
                "slice_states": json.dumps(list(config.slice_state_names)),
                "decision_status": (
                    "Chosen in services/world-data/config/world_data.toml because PHASES.md Phase 0 asks "
                    "for a V1 region and a first playable slice and both are still open in CHANGELOG.md. "
                    "Agent 1 cannot edit the design docs; the owner should log this decision there."
                ),
            }
        ],
    }


def assignment_state_fips(section_key: str, profiles: list[StateProfile], assignment: dict[str, str]) -> list[str]:
    return [profile.state_fips for profile in profiles if assignment.get(profile.state_fips) == section_key]


def _write_reports(config: Config, result: PipelineResult, classification: Classification, ratings: Any, schema) -> None:
    from .reports import write_all_reports

    write_all_reports(config, result, classification, ratings, schema)
