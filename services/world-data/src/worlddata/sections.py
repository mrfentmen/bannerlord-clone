"""Section assignment and the computed 1..5 ratings.

Two separate jobs, and the distinction matters:

1. **Assignment** is design data. FACTIONS.md section 4 lists which states belong
   to each side. The config holds that list as state *names*, resolved against
   the Census Bureau's own name/FIPS table. Nothing here decides membership.

2. **Ratings** must be computed. FACTIONS.md section 3 says so explicitly: the
   ratings are "starting design targets from 1 (weak) to 5 (strong). The real
   game values are computed from real data". PHASES.md Phase 0 requires that the
   computed sides "roughly match FACTIONS.md section 3 (checked, not forced)".

So the design targets are read only to be compared against. If the computed
ratings disagree with the doc, that disagreement is reported with its size and
direction. Nothing in this module writes a computed rating, adjusts a data
mapping to close a gap, or falls back to the target when a dimension is missing.

The band edges are the one real design decision, and it is a data-derived one:
for each dimension the six sections' shares of the national total are compared
against percentiles of the distribution of the 51 individual states' shares of
that same national total. So "a 5" means this section holds more of the nation's
cropland than 80 percent of individual states do. A section can legitimately
score 1 on everything.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from .config import Config, SectionDefinition
from .errors import ConfigError, DatasetGap
from .transforms.state_profiles import StateProfile

# Rating dimensions and the state-profile field each is computed from. The
# weights for combining within a dimension live in [ratings.weights].
DIMENSIONS: tuple[str, ...] = ("money", "gold", "food", "metal", "population")

# Real state-profile field behind each sub-score named in [ratings.weights].
SUB_SCORE_FIELDS: dict[str, str] = {
    "gdp": "gdp_current_usd",
    "ports": "port_weight",
    "precious_gva": "mining_nonfuel_gva_usd",
    "gold_mine_features": "mine_producer_gold",
    "cropland": "cropland_ha",
    "ag_gva": "ag_gva_usd",
    "nonfuel_mining_gva": "mining_nonfuel_gva_usd",
    "metal_mine_features": "mine_producer_metal",
    "population": "population",
}


@dataclass
class SectionTotals:
    """One side's aggregate real data, before any rating is computed."""

    key: str
    name: str
    state_fips: tuple[str, ...]
    states: tuple[str, ...]
    field_totals: dict[str, float]
    coverage: dict[str, float]
    inputs: dict[str, dict[str, float]] = field(default_factory=dict)


@dataclass
class DimensionRating:
    """One dimension's computed result for one section."""

    dimension: str
    section_key: str
    raw_total: float
    national_total: float
    share_of_national: float
    band_edges: tuple[float, ...]
    rating: int
    target: int
    agrees: bool
    coverage: float
    z_score: float
    sub_scores: dict[str, float]


@dataclass
class SectionRatings:
    """All six sections' computed ratings plus the agreement report."""

    ratings: list[DimensionRating]
    band_edges: dict[str, tuple[float, ...]]
    method_description: str

    def by_section(self) -> dict[str, dict[str, DimensionRating]]:
        table: dict[str, dict[str, DimensionRating]] = {}
        for rating in self.ratings:
            table.setdefault(rating.section_key, {})[rating.dimension] = rating
        return table

    def agreement_count(self) -> tuple[int, int]:
        agreed = sum(1 for rating in self.ratings if rating.agrees)
        return (agreed, len(self.ratings))


def assign_sections(
    config: Config,
    profiles: list[StateProfile],
    name_to_fips: dict[str, str],
) -> tuple[dict[str, str], list[str]]:
    """Map each state FIPS to its section key, from FACTIONS.md via config.

    ``name_to_fips`` must come from a downloaded Census file. A config name that
    does not resolve is a hard error: guessing which state was meant is exactly
    how a state ends up on the wrong side.
    """
    assignment: dict[str, str] = {}
    notes: list[str] = []
    for section in config.sections:
        for name in section.state_names:
            fips = name_to_fips.get(name)
            if fips is None:
                raise ConfigError(
                    f"[sections].{section.key} names {name!r}, which does not match any state name in the "
                    f"Census Bureau boundary file. Names available include: {sorted(name_to_fips)[:8]}..."
                )
            if fips in assignment:
                raise ConfigError(
                    f"state {name} ({fips}) is assigned to both {assignment[fips]!r} and {section.key!r}"
                )
            assignment[fips] = section.key

    profile_fips = {profile.state_fips for profile in profiles}
    unassigned = sorted(profile_fips - set(assignment))
    if unassigned:
        raise ConfigError(
            f"{len(unassigned)} states have a profile but no section: {unassigned}. "
            "PHASES.md Phase 0 requires every state to belong to one of the six sides."
        )
    extra = sorted(set(assignment) - profile_fips)
    if extra:
        raise ConfigError(f"{len(extra)} configured states have no profile: {extra}")

    for section in config.sections:
        member_names = [name for name, fips in name_to_fips.items() if assignment.get(fips) == section.key]
        notes.append(f"{section.name}: {len(member_names)} states - {', '.join(sorted(member_names))}")
    notes.append(
        "Section membership is transcribed from FACTIONS.md sections 4.1 to 4.6 and matched to FIPS codes "
        "against the Census Bureau's own state list. No state code was typed by hand, which matters: an "
        "earlier draft of this config used alphabetical positions as if they were FIPS codes and would "
        "have put California in the Mountain Alliance."
    )
    return assignment, notes


def _standardise(values: dict[str, float]) -> dict[str, float]:
    """Z-scores across the six sections. Zero variance yields all zeros."""
    if not values:
        return {}
    mean = sum(values.values()) / len(values)
    variance = sum((value - mean) ** 2 for value in values.values()) / len(values)
    spread = math.sqrt(variance)
    if spread == 0:
        return {key: 0.0 for key in values}
    return {key: (item - mean) / spread for key, item in values.items()}


def compute_section_totals(
    config: Config,
    profiles: list[StateProfile],
    assignment: dict[str, str],
) -> tuple[list[SectionTotals], list[str]]:
    """Aggregate the real state data into one row per side."""
    # The fields a section total needs are the *state profile* fields behind the
    # sub-scores, not the sub-score names themselves.
    required_fields = sorted(
        {SUB_SCORE_FIELDS[name] for sub in config.ratings.weights.values() for name in sub}
    )
    notes: list[str] = []
    rows: list[SectionTotals] = []

    national_totals: dict[str, float] = {}
    for field_name in required_fields:
        national_totals[field_name] = sum(
            float(getattr(profile, field_name)) for profile in profiles
        )

    for section in config.sections:
        members = [profile for profile in profiles if assignment.get(profile.state_fips) == section.key]
        if not members:
            raise DatasetGap(
                "factions_section_membership",
                f"{section.name} has no member states in the profile data, so its ratings would be empty.",
            )
        totals: dict[str, float] = {}
        coverage: dict[str, float] = {}
        for field_name in required_fields:
            present = [profile for profile in members if getattr(profile, field_name) is not None]
            totals[field_name] = sum(float(getattr(profile, field_name)) for profile in present)
            coverage[field_name] = len(present) / len(members)
        rows.append(
            SectionTotals(
                key=section.key,
                name=section.name,
                state_fips=tuple(sorted(profile.state_fips for profile in members)),
                states=tuple(sorted(profile.name for profile in members)),
                field_totals=totals,
                coverage=coverage,
            )
        )

    incomplete = [
        f"{row.name}.{field_name} {row.coverage[field_name]:.0%}"
        for row in rows
        for field_name in required_fields
        if row.coverage[field_name] < config.ratings.min_state_coverage
    ]
    if incomplete:
        raise DatasetGap(
            "state_profile_coverage",
            "these section-field totals are below ratings.min_state_coverage because member states lack "
            "the input: " + ", ".join(incomplete) + ". The ratings would be computed on a partial base, "
            "which is reported rather than scored.",
        )

    # Record the national base on each row so the share calculation is auditable.
    for row in rows:
        row.inputs = {
            name: {
                "section_total": row.field_totals.get(name, 0.0),
                "national_total": national_totals[name],
            }
            for name in required_fields
        }

    notes.append(
        "Section ratings are computed from these real inputs, all of them national totals the pipeline "
        "loaded: " + ", ".join(f"{name} (national {value:,.0f})" for name, value in national_totals.items())
    )
    return rows, notes


def compute_ratings(
    config: Config,
    totals: list[SectionTotals],
    sections: tuple[SectionDefinition, ...],
    state_shares: dict[str, list[float]],
) -> SectionRatings:
    """Compute every side's 1..5 rating for every dimension.

    ``state_shares`` maps each sub-score field to the list of the 51 individual
    states' shares of the national total for that field. The rating band edges
    are percentiles of that list, so the bands describe how a typical *state*
    sits, and a *section* is then rated against it.
    """
    settings = config.ratings
    targets = {section.key: section.target_ratings for section in sections}
    ratings: list[DimensionRating] = []
    band_edges: dict[str, tuple[float, ...]] = {}

    for dimension in DIMENSIONS:
        weights = settings.weights.get(dimension)
        if not weights:
            raise ConfigError(f"[ratings].weights has no entry for the {dimension!r} dimension")

        raw_totals: dict[str, float] = {}
        for row in totals:
            raw_totals[row.key] = sum(
                row.field_totals.get(SUB_SCORE_FIELDS[name], 0.0) * weight for name, weight in weights.items()
            )

        # The national total for a dimension is the sum of the six sections, which
        # is the whole country because the sections partition the 51 jurisdictions.
        national = sum(raw_totals.values())

        shares = {
            key: (value / national if national > 0 else 0.0) for key, value in raw_totals.items()
        }

        edges: tuple[float, ...] = ()
        for name in weights:
            distribution = state_shares.get(SUB_SCORE_FIELDS[name])
            if not distribution:
                raise DatasetGap(
                    "state_profile_coverage",
                    f"the {dimension} dimension needs the per-state share distribution of "
                    f"{SUB_SCORE_FIELDS[name]} to place its rating bands, and it was not provided",
                )
            ordered = sorted(distribution)
            component_edges = tuple(
                _percentile(ordered, percent) for percent in settings.state_share_percentiles
            )
            edges = component_edges if not edges else tuple(
                max(left, right) for left, right in zip(edges, component_edges, strict=True)
            )
        band_edges[dimension] = edges

        z_scores = _standardise(raw_totals)
        for row in totals:
            share = shares[row.key]
            rating = 1
            for index, edge in enumerate(edges):
                if share > edge:
                    rating = index + 2
            sub_scores: dict[str, float] = {}
            for name, weight in weights.items():
                field_values = {
                    other.key: other.field_totals.get(SUB_SCORE_FIELDS[name], 0.0) for other in totals
                }
                sub_scores[name] = _standardise(field_values).get(row.key, 0.0) * weight
            target = int(targets[row.key].get(dimension, 0))
            ratings.append(
                DimensionRating(
                    dimension=dimension,
                    section_key=row.key,
                    raw_total=raw_totals[row.key],
                    national_total=national,
                    share_of_national=share,
                    band_edges=edges,
                    rating=rating,
                    target=target,
                    agrees=rating == target,
                    coverage=min(
                        row.coverage.get(SUB_SCORE_FIELDS[name], 0.0) for name in weights
                    ),
                    z_score=z_scores[row.key],
                    sub_scores=sub_scores,
                )
            )

    return SectionRatings(
        ratings=ratings,
        band_edges=band_edges,
        method_description=(
            "For each dimension, each side's real total is expressed as a share of the national total. "
            "Rating band edges are percentiles of the distribution of the 51 individual states' shares of "
            f"that same national total, at percentiles {list(settings.state_share_percentiles)}. A side "
            "scores 5 when it holds more of the national figure than that percentile of individual states "
            "do. Because the bands come from the real state distribution rather than from FACTIONS.md, a "
            "side can legitimately score 1 on every dimension, and the comparison against the design "
            "targets is a report rather than an input."
        ),
    )


def state_share_distributions(profiles: list[StateProfile]) -> dict[str, list[float]]:
    """Per-state share of the national total, for every field the ratings use.

    This is the distribution the rating bands are cut from. It is the bridge
    between "how big is a state" and "how big is a section": a section is rated
    against where the individual states actually sit.
    """
    distributions: dict[str, list[float]] = {}
    for field_name in sorted(set(SUB_SCORE_FIELDS.values())):
        national = sum(float(getattr(profile, field_name)) for profile in profiles)
        if national <= 0:
            distributions[field_name] = [0.0] * len(profiles)
            continue
        distributions[field_name] = [float(getattr(profile, field_name)) / national for profile in profiles]
    return distributions


def _percentile(ordered: list[float], percent: float) -> float:
    if not ordered:
        raise ConfigError("cannot take a percentile of an empty distribution")
    position = (len(ordered) - 1) * (percent / 100.0)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[int(position)]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight
