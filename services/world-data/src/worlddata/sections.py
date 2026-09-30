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

How a rating is computed, and why it is this and not something else
------------------------------------------------------------------

Three real defects in the previous version of this module made the rating
vacuous, and each one is fixed below. None of the fixes looks at
FACTIONS.md section 3 to choose itself; the agreement counts are reported
afterwards, in docs/SECTION_RATINGS.md, whatever they turn out to be.

**1. The band edges came from the wrong unit.** The old edges were percentiles
of the distribution of the 51 *individual states'* shares of a national total.
A section is an aggregate of 2 to 14 states, so its share of the national total
is structurally several times larger than any single state's share. Measured on
the real data, the highest 80th-percentile state share is 3.30% of national
cropland, while the *weakest* of the six sections holds 3.93% of it. Every
section therefore cleared the top band on every dimension, and all 30 computed
ratings came out as 5. A comparison in which every value is 5 cannot check
anything. The reference class for grading a side has to be sides, not states.

**2. The dimension score added quantities with incompatible units.** The old
score was ``0.70 * gdp_in_millions_of_dollars + 0.30 * port_weight``, which adds
millions of dollars to a unitless count, so the term with the largest magnitude
silently won and the configured weights did nothing. The gold dimension was
worse: ``precious_gva`` and ``nonfuel_mining_gva`` both read the same field,
BEA "mining except oil and gas", so the gold dimension and the metal dimension
were the same number to within the weights. FACTIONS.md section 3 gives the six
sides deliberately different gold and metal profiles; the pipeline could not
tell the two dimensions apart at all. Each sub-score is now the section's
*share of the national total* for that input, so every term is a fraction of the
same country and the configured weights are the emphasis the config says they are.

**3. A sub-score that did not measure its own name.** There is no
precious-metals value-added series for US states in any machine-readable form
(BEA's SAGDP2 breaks mining out only as "oil and gas" versus "everything else",
and "everything else" is mostly coal, stone and sand). What USGS MRDS does
publish per state is the number of mapped gold mine features, and
``worlddata.datasets.DECLARED_GAPS`` already records that the gold dimension
runs on those counts for exactly this reason. ``SUB_SCORE_FIELDS`` now maps the
gold sub-scores onto the two gold-specific MRDS counts, so the gold dimension
measures gold. The config key is still called ``precious_gva``, which is now a
misnomer; see docs/SECTION_RATINGS.md.

**Where the band edges come from now.** Each dimension produces one real number
per side: a weighted blend of that side's shares of the national figure, so it
is a fraction of the country and is directly readable as "this share of the
nation's X". The five bands are then the even fifths of the interval from one
standard deviation below the mean side to one standard deviation above it. That
means 3 is the average side, one rating step is half a standard deviation of the
six sides, and the scale's unit - the standard deviation - is computed from the
real data rather than assumed. Because the edges are derived from the six
observed sides, a side can legitimately score 1 on everything, and 1 is the
floor rather than a penalty.

The one thing here that is a convention rather than a measurement is the width
of a band, set at half a standard deviation. docs/SECTION_RATINGS.md carries the
sensitivity table: the comparison against the design targets barely moves between
a quarter and a full standard deviation, so the finding is not an artefact of it.

``[ratings].state_share_percentiles`` is no longer the source of the band edges,
because the edges are no longer percentiles of anything. It is still read, and
validated: it must be the even division of the 1..``max_rating`` scale, so a
config that asks for something this module cannot honour stops the run instead
of being quietly ignored.
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
#
# Every value here is a measured, published series. Two of them are mine-feature
# COUNTS from the USGS MRDS export rather than economic output, because no
# machine-readable per-state gold or non-fuel metal tonnage exists; see
# DECLARED_GAPS in worlddata.datasets. The counts are mapped to the sub-score
# whose name they actually describe: ``precious_gva`` used to read all non-oil
# and non-gas mining, which made the gold dimension a copy of the metal one.
SUB_SCORE_FIELDS: dict[str, str] = {
    "gdp": "gdp_current_usd",
    "ports": "port_weight",
    # No per-state precious-metals value added exists. BEA line 8 is "mining
    # except oil and gas", which is coal, stone and aggregate, not precious
    # metals, so using it here made gold and metal the same measurement.
    "precious_gva": "mine_producer_gold",
    "gold_mine_features": "mine_feature_gold",
    "cropland": "cropland_ha",
    "ag_gva": "ag_gva_usd",
    "nonfuel_mining_gva": "mining_nonfuel_gva_usd",
    "metal_mine_features": "mine_producer_metal",
    "population": "population",
}

# How many standard deviations of the six sides' dimension score make up the
# full rating range. 1.0 means the bands span mean - 1 sd to mean + 1 sd, so
# band 3 is the average side and one step is half a standard deviation. This is
# the single scale convention in the module; the width is a choice and the
# measured, data-derived part is the unit it is expressed in.
BAND_SPAN_STANDARD_DEVIATIONS = 1.0


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
    """One dimension's computed result for one section.

    ``raw_total`` is the weighted national-share index described in the module
    docstring, and ``national_total`` is therefore 1.0 by construction: the
    index already reads as a fraction of the country. ``band_edges`` are in that
    same fraction, which is why the export column is named ``band_edges_share``.
    ``z_score`` is the index's own standard deviation across the six sides, so
    0 means "the average side" and +1 means "one standard deviation stronger
    than the average side".
    """

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
    index_spread: dict[str, tuple[float, float]] = field(default_factory=dict)
    state_share_reference: dict[str, dict[str, float]] = field(default_factory=dict)

    def by_section(self) -> dict[str, dict[str, DimensionRating]]:
        table: dict[str, dict[str, DimensionRating]] = {}
        for rating in self.ratings:
            table.setdefault(rating.section_key, {})[rating.dimension] = rating
        return table

    def agreement_count(self) -> tuple[int, int]:
        agreed = sum(1 for rating in self.ratings if rating.agrees)
        return (agreed, len(self.ratings))

    def within_one_count(self) -> tuple[int, int]:
        """Ratings within one band of the design target.

        PHASES.md Phase 0 asks for profiles that "roughly match" the design
        table. On a five-band scale, one band is the tolerance that phrase can
        mean, so it is reported next to the exact count.
        """
        close = sum(1 for rating in self.ratings if abs(rating.rating - rating.target) <= 1)
        return (close, len(self.ratings))


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

    fips_to_name = {fips: name for name, fips in name_to_fips.items()}
    for section in config.sections:
        member_names = sorted(
            fips_to_name[fips] for fips, key in assignment.items() if key == section.key
        )
        notes.append(f"{section.name}: {len(member_names)} states - {', '.join(member_names)}")
    notes.append(
        "Section membership is transcribed from FACTIONS.md sections 4.1 to 4.6 and matched to FIPS codes "
        "against the Census Bureau's own state list. No state code was typed by hand, which matters: an "
        "earlier draft of this config used alphabetical positions as if they were FIPS codes and would "
        "have put California in the Mountain Alliance."
    )
    notes.append(
        f"All {len(assignment)} jurisdictions present in the state profiles - the 50 states plus the "
        "District of Columbia - are assigned to exactly one of the six sides, and no side names a state "
        "that has no profile. assign_sections raises rather than reporting a partial map, so reaching "
        "the ratings at all is the proof."
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


def _validate_scale(config: Config) -> int:
    """Check the configured band layout is one this module can honour.

    ``[ratings].state_share_percentiles`` used to place the band edges. It no
    longer does, because the edges are no longer percentiles of the 51 states'
    shares: a side is an aggregate of 2 to 14 states, so grading it against
    single-state percentiles puts every side in the top band on every dimension
    (measured: 30 of 30 ratings came out 5). The key is kept because it still
    declares how the 1..max_rating scale is divided, and a config that divides
    it some other way has to be refused rather than silently reinterpreted.
    """
    top = int(config.get("ratings.max_rating"))
    if top < 2:
        raise ConfigError(f"[ratings].max_rating is {top}; a rating scale needs at least 2 bands")
    percentiles = config.ratings.state_share_percentiles
    if len(percentiles) != top - 1:
        raise ConfigError(
            f"[ratings].state_share_percentiles has {len(percentiles)} entries but max_rating {top} needs "
            f"{top - 1} interior band edges. A five-band scale is divided at "
            f"{[round(100 * index / top, 1) for index in range(1, top)]} percent."
        )
    expected = [100.0 * index / top for index in range(1, top)]
    if any(abs(got - want) > 1e-6 for got, want in zip(percentiles, expected, strict=True)):
        raise ConfigError(
            f"[ratings].state_share_percentiles is {list(percentiles)} but the band edges this module "
            f"places are the even division of the 1..{top} scale, which is {expected}. Change the config "
            "to match, or change BAND_SPAN_STANDARD_DEVIATIONS and the band code with it."
        )
    return top


def compute_ratings(
    config: Config,
    totals: list[SectionTotals],
    sections: tuple[SectionDefinition, ...],
    state_shares: dict[str, list[float]],
) -> SectionRatings:
    """Compute every side's 1..5 rating for every dimension.

    ``state_shares`` maps each sub-score field to the 51 individual states' shares
    of the national total. It is no longer the band reference, for the reason in
    the module docstring, but it is kept and reported: it is the measurement
    that shows why a side's share cannot be graded against a single state's.
    """
    top = _validate_scale(config)
    settings = config.ratings
    targets = {section.key: section.target_ratings for section in sections}
    ratings: list[DimensionRating] = []
    band_edges: dict[str, tuple[float, ...]] = {}
    index_spread: dict[str, tuple[float, float]] = {}
    state_share_reference: dict[str, dict[str, float]] = {}

    for dimension in DIMENSIONS:
        weights = settings.weights.get(dimension)
        if not weights:
            raise ConfigError(f"[ratings].weights has no entry for the {dimension!r} dimension")

        # Each sub-score is the section's SHARE of the national total for that
        # input. That is what makes the terms addable: they are all fractions of
        # the same country, so a weight of 0.70 really does mean 70 percent of
        # the emphasis, whatever units the underlying series is published in.
        weight_total = sum(weights.values())
        shares: dict[str, dict[str, float]] = {}
        for name in weights:
            field_name = SUB_SCORE_FIELDS[name]
            national = next(
                row.inputs.get(field_name, {}).get("national_total", 0.0) for row in totals
            )
            shares[name] = {
                row.key: (row.field_totals.get(field_name, 0.0) / national if national > 0 else 0.0)
                for row in totals
            }

        index: dict[str, float] = {}
        contributions: dict[str, dict[str, float]] = {row.key: {} for row in totals}
        for row in totals:
            contributions[row.key] = {
                name: shares[name][row.key] * weights[name] / weight_total for name in weights
            }
            index[row.key] = sum(contributions[row.key].values())

        mean = sum(index.values()) / len(index)
        spread = math.sqrt(sum((value - mean) ** 2 for value in index.values()) / len(index))

        # The `top` bands are the even division of the interval from
        # mean - span*sd to mean + span*sd. Band k therefore starts at
        # mean - half_width + k * band_width, which is symmetric about the mean
        # and puts band 3 of 5 on the average side.
        half_width = BAND_SPAN_STANDARD_DEVIATIONS * spread
        band_width = 2.0 * half_width / top
        edges = tuple(mean - half_width + band_width * index_ for index_ in range(1, top))
        band_edges[dimension] = edges
        index_spread[dimension] = (mean, spread)
        z_scores = _standardise(index)

        # The single-state reference, reported so the reason the old edges were
        # wrong stays visible instead of being quietly deleted.
        reference: dict[str, float] = {}
        for name in weights:
            distribution = state_shares.get(SUB_SCORE_FIELDS[name])
            if distribution is None:
                raise DatasetGap(
                    "state_profile_coverage",
                    f"the {dimension} dimension needs the per-state share distribution of "
                    f"{SUB_SCORE_FIELDS[name]} to report the state-level reference, and it was not provided",
                )
            reference[name] = max(distribution)
        state_share_reference[dimension] = {
            "largest_single_state_share": max(reference.values()),
            "weakest_section_share": min(index.values()),
        }

        for row in totals:
            value = index[row.key]
            rating = 1
            for position, edge in enumerate(edges):
                if value > edge:
                    rating = position + 2
            target = int(targets[row.key].get(dimension, 0))
            ratings.append(
                DimensionRating(
                    dimension=dimension,
                    section_key=row.key,
                    raw_total=value,
                    national_total=1.0,
                    share_of_national=value,
                    band_edges=edges,
                    rating=rating,
                    target=target,
                    agrees=rating == target,
                    coverage=min(
                        row.coverage.get(SUB_SCORE_FIELDS[name], 0.0) for name in weights
                    ),
                    z_score=z_scores[row.key],
                    sub_scores=contributions[row.key],
                )
            )

    return SectionRatings(
        ratings=ratings,
        band_edges=band_edges,
        index_spread=index_spread,
        state_share_reference=state_share_reference,
        method_description=(
            "Each dimension produces one number per side: a weighted blend of that side's share of the "
            f"national total for each input in [ratings.weights], so it reads directly as a fraction of the "
            f"country. The {top} bands are the even division of the interval from one standard deviation "
            f"below the mean side to one standard deviation above it "
            f"(span {BAND_SPAN_STANDARD_DEVIATIONS} standard deviations), which puts 3 on the average side "
            "and makes one rating step half a standard deviation of the six sides. The mean and the "
            "standard deviation are computed from the real data; the design targets in FACTIONS.md "
            "section 3 are read only to be compared against, never to compute a value. The bands are "
            "deliberately NOT cut at percentiles of the 51 individual states: a side is an aggregate of "
            "2 to 14 states, so its share of the national total is several times a single state's share "
            "and every side lands in the top band on every dimension. That is recorded per dimension in "
            "state_share_reference and explained in docs/SECTION_RATINGS.md."
        ),
    )


def state_share_distributions(profiles: list[StateProfile]) -> dict[str, list[float]]:
    """Per-state share of the national total, for every field the ratings use.

    This is no longer the band reference. It is kept because it is the
    measurement that shows a section's share and a state's share are not the
    same kind of quantity, and because it is a useful audit number on its own:
    it says how the country divides between individual jurisdictions.
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
    """Linear-interpolated percentile of an already-sorted list.

    Retained because the classification and settlement code paths and the tests
    share this helper, and because the state-share audit numbers in
    docs/SECTION_RATINGS.md quote percentiles of the real distributions.
    """
    if not ordered:
        raise ConfigError("cannot take a percentile of an empty distribution")
    position = (len(ordered) - 1) * (percent / 100.0)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[int(position)]
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight
