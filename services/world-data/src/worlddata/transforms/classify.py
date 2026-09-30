"""Settlement size classes, with thresholds derived from the real distribution.

PHASES.md Phase 0: "Classify settlements into cities, towns, and villages by
threshold rules applied to real data." The instruction from Agent 1's brief is
sharper still: the cut-offs must come from the distribution, and the reason for
the choice must be recorded.

So nothing here picks round numbers. Two natural-breaks methods are implemented
and the config selects between them:

``largest_gap``
    Sort log10(population) ascending, measure the gap between every pair of
    consecutive values, and cut at the widest gaps until the requested number of
    classes exists. Chosen as the default because it is transparent: the report
    can print the exact gap that was cut and the two real places on either side
    of it, so the choice is arguable rather than mysterious.

``jenks_1d``
    One-dimensional Jenks natural breaks by dynamic programming, which minimises
    within-class variance. The textbook answer, at O(n * k^2) cost.

Both run on log10 population, because settlement populations are roughly
lognormal: linear spacing would put every boundary in the last few percent of
the range and produce one enormous class and two nearly empty ones.

Every output row carries the threshold band it fell in, so the classification
can be audited from the export alone.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from ..config import Config
from ..errors import ConfigError

@dataclass(frozen=True)
class SizeClass:
    """One derived class and the thresholds that produced it."""

    name: str
    population_upper: float | None
    population_lower_inclusive: float
    population_upper_inclusive: float | None
    count: int
    share_of_settlements: float
    share_of_population: float

    def as_dict(self) -> dict[str, object]:
        return {
            "class": self.name,
            "population_lower_inclusive": self.population_lower_inclusive,
            "population_upper_inclusive": self.population_upper_inclusive,
            "count": self.count,
            "share_of_settlements": round(self.share_of_settlements, 6),
            "share_of_population": round(self.share_of_population, 6),
        }


@dataclass(frozen=True)
class Classification:
    """The full classification, including how it was derived."""

    method: str
    minimum_population: int
    cuts_log10: tuple[float, ...]
    classes: tuple[SizeClass, ...]
    population_values: tuple[int, ...]
    largest_gaps: tuple[tuple[float, float, float], ...]
    percentiles: dict[str, float]
    density_diagnostics: tuple[dict[str, object], ...] = ()

    def class_for(self, population: int) -> str:
        """Class name for a population value.

        Uses the same inclusive upper bounds that produced the classes, so a
        lookup can never land on a different boundary than the batch pass did.
        """
        log_value = math.log10(max(population, 1))
        for cut in self.cuts_log10:
            if log_value <= cut:
                return self._name_at(cut)
        return self.classes[-1].name

    def _name_at(self, cut: float) -> str:
        for index, value in enumerate(self.cuts_log10):
            if value == cut:
                return self.classes[index].name
        raise ConfigError(f"classification cut {cut} has no matching class name")

    def as_dict(self) -> dict[str, object]:
        return {
            "method": self.method,
            "input_population_measure": "Census Bureau published place population for the configured vintage",
            "logarithm": "base 10, because settlement populations are roughly lognormal",
            "minimum_population": self.minimum_population,
            "cuts_log10": [round(value, 6) for value in self.cuts_log10],
            "cuts_population": [
                int(round(10**value)) for value in self.cuts_log10
            ],
            "classes": [item.as_dict() for item in self.classes],
            "percentiles": {key: round(value, 2) for key, value in self.percentiles.items()},
            "density_diagnostics": list(self.density_diagnostics),
            "largest_gaps_log10": [
                {
                    "gap": round(gap, 6),
                    "ratio": round(10.0**gap, 3),
                    "below_population": below,
                    "above_population": above,
                }
                for gap, below, above in self.largest_gaps
            ],
        }


def percentile(sorted_values: list[float], percent: float) -> float:
    """Linear-interpolated percentile of an already-sorted list."""
    if not sorted_values:
        raise ConfigError("cannot take a percentile of an empty distribution")
    if not 0 <= percent <= 100:
        raise ConfigError(f"percentile must be between 0 and 100, got {percent}")
    position = (len(sorted_values) - 1) * (percent / 100.0)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[int(position)]
    weight = position - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def _largest_gaps(log_values: list[float]) -> list[tuple[float, float, float]]:
    """Gaps between consecutive sorted log values, widest first."""
    gaps = [
        (log_values[index + 1] - log_values[index], log_values[index], log_values[index + 1])
        for index in range(len(log_values) - 1)
    ]
    gaps.sort(key=lambda item: -item[0])
    return gaps


def _jenks_cuts(sorted_values: list[float], class_count: int) -> list[float]:
    """One-dimensional Jenks natural breaks by dynamic programming.

    Finds the partition that minimises within-class variance, exactly. The
    straightforward implementation is a triple loop, which on the 13,189
    settlements this pipeline imports is roughly 260 million inner iterations and
    does not finish in a usable time. The same recurrence is therefore evaluated
    with numpy over the split index for each end position: the same dynamic
    programme, vectorised, in a few seconds and with no approximation.

    Prefix sums of the values and of their squares give the variance of any
    contiguous slice without recomputing it, so memory stays linear in the
    number of settlements rather than quadratic.

    Returns class_count - 1 upper bounds in increasing order.
    """
    if class_count < 2:
        raise ConfigError(f"natural breaks need at least 2 classes, got {class_count}")
    count = len(sorted_values)
    if class_count > count:
        raise ConfigError(f"cannot split {count} values into {class_count} classes: fewer values than classes")

    values = np.asarray(sorted_values, dtype=np.float64)
    prefix = np.concatenate(([0.0], np.cumsum(values)))
    prefix_sq = np.concatenate(([0.0], np.cumsum(values * values)))

    previous = np.full(count, math.inf)
    previous_choice = np.zeros(count, dtype=np.int64)
    for group in range(1, class_count + 1):
        current = np.full(count, math.inf)
        current_choice = np.zeros(count, dtype=np.int64)
        for stop in range(group - 1, count):
            first_split = group - 1
            splits = np.arange(first_split, stop + 1)
            size = (stop + 1 - splits).astype(np.float64)
            total = prefix[stop + 1] - prefix[splits]
            total_sq = prefix_sq[stop + 1] - prefix_sq[splits]
            mean = total / size
            # Sum of squared deviations, NOT the variance. Minimising variance
            # instead gives every single-element class a cost of zero, so the
            # optimiser fills classes with one settlement each and the cut lands
            # inside a cluster rather than between them.
            squared_deviations = np.maximum(total_sq - total * mean, 0.0)
            if group == 1:
                prior = np.zeros_like(squared_deviations)
            else:
                prior = previous[splits - 1]
            candidate = prior + squared_deviations
            position = int(np.argmin(candidate))
            current[stop] = candidate[position]
            current_choice[stop] = splits[position]
        if current[count - 1] == math.inf:
            raise ConfigError(
                f"Jenks natural breaks found no partition into {group} classes for {count} values; "
                "the distribution has too few distinct values"
            )
        previous = current
        previous_choice = current_choice

    cuts: list[float] = []
    stop = count - 1
    for group in range(class_count, 0, -1):
        split = int(previous_choice[stop])
        if group > 1:
            cuts.append(sorted_values[split])
        stop = split - 1
    cuts.reverse()
    return cuts


def _density_mode_cuts(
    log_values: list[float],
    class_count: int,
    *,
    bin_width: float,
    smoothing_passes: int,
) -> tuple[list[float], list[dict[str, object]]]:
    """Cut at the minima between modes of a smoothed histogram of log population.

    Returns (cuts, diagnostics). Each diagnostic describes one discovered minimum
    so the classification report can show what the density actually looked like,
    rather than only the thresholds that came out of it.
    """
    count = len(log_values)
    lowest = min(log_values)
    highest = max(log_values)
    if highest <= lowest:
        raise ConfigError(
            f"every settlement has the same population ({int(round(10**lowest))}); the distribution has "
            "no shape, so no thresholds can be derived from it"
        )
    bin_count = max(3, int(math.ceil((highest - lowest) / bin_width)) + 1)
    edges = [lowest + index * (highest - lowest) / bin_count for index in range(bin_count + 1)]

    def bin_population(position: int) -> int:
        """Human-readable population at the centre of a bin, for the report."""
        middle = (edges[position] + edges[min(bin_count, position + 1)]) / 2.0
        return int(round(10.0**middle))

    counts = [0] * bin_count
    index = 0
    for value in log_values:
        while index < bin_count - 1 and value >= edges[index + 1]:
            index += 1
        counts[index] += 1

    smoothed = [float(value) for value in counts]
    for _ in range(max(0, smoothing_passes)):
        smoothed = [
            (smoothed[max(0, position - 1)] + smoothed[position] + smoothed[min(bin_count - 1, position + 1)]) / 3.0
            for position in range(bin_count)
        ]

    interior = list(range(1, bin_count - 1))
    minima = [
        position
        for position in interior
        if smoothed[position] <= smoothed[position - 1] and smoothed[position] <= smoothed[position + 1]
    ]
    # Order minima by how deep the valley is, deepest first, and keep only one
    # per neighbourhood so three adjacent flat bins do not become three classes.
    scored = sorted(minima, key=lambda position: smoothed[position])
    chosen: list[int] = []
    for position in scored:
        if all(abs(position - other) > bin_count / (2 * class_count) for other in chosen):
            chosen.append(position)
        if len(chosen) == class_count - 1:
            break
    chosen.sort()

    diagnostics: list[dict[str, object]] = [
        {
            "bin_width_log10": round(bin_width, 4),
            "bins": bin_count,
            "smoothing_passes": smoothing_passes,
            "densest_bin_population": bin_population(max(range(bin_count), key=lambda index: counts[index])),
            "settlements_per_bin_median": int(sorted(counts)[len(counts) // 2]),
            "interior_minima_found": len(minima),
            "interior_minima_populations": [bin_population(position) for position in minima[:12]],
            "minima_usable_for_classes": len(chosen),
        }
    ]
    return [_bin_upper_edge(edges, bin_count, position) for position in chosen], len(minima), diagnostics


def _bin_upper_edge(edges: list[float], bin_count: int, position: int) -> float:
    """Log10 population at the upper edge of a bin."""
    return edges[min(bin_count, position + 1)]


def _fallback_quantile_cuts(values: list[int], percentiles: list[float]) -> list[float]:
    """Log10 cuts at the requested percentiles, used only when the density has no structure."""
    ordered = sorted(values)
    return [math.log10(max(1.0, percentile([float(value) for value in ordered], percent))) for percent in percentiles]


def classify(populations: list[int], config: Config) -> Classification:
    """Derive the size classes and classify every population."""
    settings = config.classification
    values = sorted(population for population in populations if population >= settings.min_population)
    if not values:
        raise ConfigError(
            f"no settlement reaches the configured minimum population of {settings.min_population}; "
            "either the threshold is too high or the population source is empty"
        )
    log_values = sorted(math.log10(value) for value in values)
    gaps = _largest_gaps(log_values)
    diagnostics: list[dict[str, object]] = []

    if settings.method == "largest_gap":
        if len(gaps) < settings.class_count - 1:
            raise ConfigError(
                f"only {len(gaps) + 1} distinct populations are available, which cannot be split into "
                f"{settings.class_count} classes"
            )
        chosen: list[float] = []
        seen: set[float] = set()
        for gap, below, above in gaps:
            if above in seen or below in {value for value in chosen}:
                continue
            chosen.append(above)
            seen.add(above)
            if len(chosen) == settings.class_count - 1:
                break
        if len(chosen) != settings.class_count - 1:
            raise ConfigError(
                f"could not find {settings.class_count - 1} distinct cuts in the population distribution; "
                "there are too few distinct population values"
            )
        cuts = tuple(sorted(chosen))
    elif settings.method == "jenks_1d":
        cuts = tuple(_jenks_cuts(log_values, settings.class_count))
    elif settings.method == "density_modes":
        discovered, minima_found, diagnostics = _density_mode_cuts(
            log_values,
            settings.class_count,
            bin_width=float(config.get("classification.bin_width_log10")),
            smoothing_passes=int(config.get("classification.smoothing_passes")),
        )
        if len(discovered) == settings.class_count - 1:
            cuts = tuple(sorted(discovered))
            diagnostics[0]["cut_source"] = "interior minima of the smoothed log-population density"
        else:
            fallback = [float(value) for value in config.get("classification.fallback_percentiles")]
            if len(fallback) != settings.class_count - 1:
                raise ConfigError(
                    f"[classification].fallback_percentiles has {len(fallback)} entries but class_count is "
                    f"{settings.class_count}, which needs {settings.class_count - 1}"
                )
            cuts = tuple(sorted(_fallback_quantile_cuts(values, fallback)))
            diagnostics[0]["cut_source"] = (
                f"quantile fallback: the smoothed log-population density has {minima_found} interior "
                f"minimum(s) but {settings.class_count} classes need {settings.class_count - 1} interior "
                "boundaries. The distribution is effectively unimodal, so no natural boundary exists to "
                "find. Cuts were placed at the configured percentiles "
                f"{[float(value) for value in config.get('classification.fallback_percentiles')]} instead. "
                "This is reported as a fallback rather than presented as a discovered break."
            )
    else:
        raise ConfigError(f"unsupported classification method {settings.method!r}")

    total_population = sum(values)
    # Bands are built smallest-population first. The configured names are listed
    # coarsest first (city, town, village), so they are reversed here; without
    # this the smallest band would be called "city".
    band_names = list(reversed(settings.class_names))
    classes: list[SizeClass] = []
    lower = settings.min_population
    for index, name in enumerate(band_names):
        upper = int(round(10.0**cuts[index])) if index < len(cuts) else None
        if upper is not None and upper < lower:
            raise ConfigError(
                f"derived cut {index} produced an upper bound of {upper}, which is below the lower bound "
                f"{lower}. The distribution cannot support {settings.class_count} classes."
            )
        members = [value for value in values if value >= lower and (upper is None or value <= upper)]
        if not members:
            raise ConfigError(
                f"derived class {name!r} (population up to {upper}) contains no settlements. "
                "A natural-breaks cut that empties a class is not a usable threshold."
            )
        classes.append(
            SizeClass(
                name=name,
                population_upper=upper,
                population_lower_inclusive=lower,
                population_upper_inclusive=upper,
                count=len(members),
                share_of_settlements=len(members) / len(values),
                share_of_population=sum(members) / total_population,
            )
        )
        lower = (upper or total_population) + 1
        if upper is None:
            break

    percentiles_out = {
        f"p{percent}": percentile([float(value) for value in values], percent)
        for percent in (1, 5, 10, 25, 50, 75, 90, 95, 99, 99.9)
    }

    reported_gaps = []
    for cut in cuts:
        below = max((value for value in log_values if value < cut), default=log_values[0])
        above = min((value for value in log_values if value >= cut), default=log_values[-1])
        reported_gaps.append((above - below, int(round(10.0**below)), int(round(10.0**above))))

    classification = Classification(
        method=settings.method,
        minimum_population=settings.min_population,
        cuts_log10=cuts,
        classes=tuple(classes),
        population_values=tuple(values),
        largest_gaps=tuple(reported_gaps),
        percentiles=percentiles_out,
        density_diagnostics=tuple(diagnostics),
    )
    return classification
