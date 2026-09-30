"""Spot-checking settlements against independently published figures.

PHASES.md Phase 0 exit criteria: "verified against real figures for at least 10
spot-checked places". agents/README.md Contract A: "The spot-check values and
sources get checked in, because an unverified number is a guess."

How a spot check works here, and what it actually proves:

* The pipeline's value comes from the Census Bureau's Vintage sub-county
  estimates file, importing the published estimates base for 1 April 2020.
* The check value is a figure published by a *different* publisher, for the
  *same place*, fetched live at check time from a URL recorded in the file.

Reading the real Census data made one thing certain: the decennial 2020 Census
place count is not available machine-readably at national scale. It exists only
in the fixed-width P.L. 94-171 redistricting files, about 2.6 GB for all 51
jurisdictions. The nearest real published place-level figure that is both
machine-readable and independent of the estimates file is the decennial count as
quoted by a secondary publisher. That is what this module checks against, and it
says so plainly rather than implying the two are the same product.

The tolerance is a declared config constant. The two figures are different
measures - an estimates base derived from the census, against a census count -
so exact equality is not the expected outcome and a tolerance is the correct
test. A settlement outside the tolerance is a **disagreement** and is reported as
one.
"""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import requests

from .config import Config
from .errors import WorldDataError, FetchError
from .seed import SettlementSeed

# The secondary publisher checked against. Chosen because it is fetchable without
# an account and states its own source in the text, and because the figure it
# reports is the decennial census count rather than a later estimate.
CHECK_SOURCE_NAME = "Wikipedia REST summary endpoint"
CHECK_SOURCE_TEMPLATE = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"

# Census years a candidate figure may be qualified with. The decennial series is
# every tenth year; the target year is the newest one, and the older years are
# accepted so a summary that only carries a previous decennial still reads as a
# census count rather than as "not found". Anything else - a 2025 estimate, a
# 2024 revenue figure - is not a census count and is rejected.
_DECENNIAL_YEARS = frozenset(range(1900, 2101, 10))
_TARGET_CENSUS_YEAR = 2020

# Words that name a headcount of people, in the plural forms the summaries use.
# A number is only accepted when the text ties it to one of these, immediately
# before it ("a population of 675,647") or immediately after it ("641,903
# residents").
_HEADCOUNT_TERMS = (
    "population",
    "inhabitants",
    "residents",
    "people",
    "citizens",
    "inhabited",
)

# Headcount word with a short gap of ordinary words between it and the number:
#   "a population of 675,647", "The population of the city was 235,685",
#   "The city's population was 263,886", "The population was 504,258".
# The gap is bounded and may not cross a comma, semicolon, full stop or bracket,
# so an anchor 40 characters away in a different clause cannot lend its word to a
# number that is not a population. That bound is the fix for the bug this module
# used to have: Boston's summary reads "an area of 48.4 square miles (125 km2) and
# a population of 675,647", and a wide "anywhere nearby" window let "125" borrow
# the "population" that followed it. Boston was reported as having a 2020 census
# population of 125, which is 542,793 percent away from the real figure and
# looked entirely plausible.
_HEADCOUNT_BEFORE = re.compile(
    r"(?<![\w])(?:%s)(?![\w])[^,;.()]{0,40}$" % "|".join(_HEADCOUNT_TERMS),
    re.IGNORECASE,
)
# The same idea the other way round: number, optional comma, headcount word.
#   "with 641,903 residents at the 2020 census", "over 1.6 million residents".
# No "^" here: re.match() is called with the end offset of the number, and "^"
# only ever matches at the real start of the string, so anchoring it there would
# have made this pattern unreachable.
_HEADCOUNT_AFTER = re.compile(
    r"[\s,]*(?:%s)(?![\w])" % "|".join(_HEADCOUNT_TERMS),
    re.IGNORECASE,
)

# A plain count, a thousands-separated count, or a decimal figure.
#
# The trailing guard is not a plain "(?!.)": a sentence-ending period after a
# whole number is punctuation, not a decimal point. With a naive guard the regex
# backtracked and matched "641" out of "641,903." - the trailing comma group has
# to end in a digit, and a following period only disqualifies when a digit follows
# it.
_NUMBER = re.compile(r"(?<![\d.])\d+(?:,\d{3})*(?:\.\d+)?(?![\d]|\.\d)")

# Unit tokens that make a number a measurement rather than a headcount. Matched
# as a prefix of the text immediately after the number, which is what rejects
# "125 km2", "48.4 square miles", "517.9 square miles" and "21.1 percent".
# "million", "billion" and "thousand" are deliberately absent: those are read as
# scales before this test runs.
_NON_HEADCOUNT_UNITS = (
    "square",
    "sq",
    "mi",
    "km",
    "m",
    "acre",
    "hectare",
    "foot",
    "feet",
    "ft",
    "in",
    "percent",
    "%",
    "per",
)

# Smallest and largest headcount accepted. The lower bound rejects ordinals, areas
# and stray small numbers. The upper bound is above the largest US city in the
# 2020 census (New York, 8,804,190) with a wide margin, and rejects national and
# world figures, which are never the population of one settlement.
_MIN_HEADCOUNT = 100
_MAX_HEADCOUNT = 25_000_000

# Clause boundaries. A candidate is only read inside one clause, so a clause that
# describes a metropolitan area cannot lend its "census" year to a city figure in
# the previous clause.
#
# Three details, each of which was a bug first:
#
# * A comma only ends a clause when a digit does NOT follow it. Splitting on every
#   comma cut "675,647" in half, and the parser then read 675 and 647 as two
#   separate figures.
# * A full stop only ends a clause when whitespace and a capital letter follow, so
#   "2.74 million" and "U.S. state" survive intact while "...at the 2020 census.
#   The Chicago metropolitan area has..." does split - and it must, because
#   Chicago's own figure and its metro area's figure are qualified by the same
#   "the 2020 census" phrase in adjacent sentences.
# * The contrasting connectives are included because they introduce a second,
#   separate claim in the same sentence.
_CLAUSE_SPLIT = re.compile(
    r",(?!\d)|;|[.!?](?=\s+[\"'(\[]*[A-Z])|\b(?:while|whereas|although|though)\b"
)

# Text that marks a clause as describing an area larger than one settlement.
# "county" is deliberately not here: a consolidated city-county such as
# Louisville or Jacksonville *is* the settlement, and the word appears in clauses
# that carry the city's own census figure.
_AREA_MARKERS = (
    "metro",
    "megalopolis",
    "statistical area",
    "urban area",
    "combined statistical",
    "commuter zone",
)

# Statuses that mean "ask again in a moment" rather than "this is the answer".
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})

# A four-digit year.
_YEAR = re.compile(r"\b(?:1[6-9]\d{2}|20\d{2})\b")
# The word that makes a clause a census statement rather than an estimate.
_CENSUS_WORD = re.compile(r"\bcensus\b", re.IGNORECASE)

# Largest gap, in characters, between a candidate number and the census year and
# the word "census" that qualify it. Every real sentence in the checked set puts
# the qualifier within about 30 characters of the figure; a longer gap means the
# qualifier is qualifying something else in the clause.
_MAX_QUALIFIER_GAP = 70
# Largest gap, in characters, between a headcount word and the number it anchors.
_MAX_ANCHOR_GAP = 40


@dataclass(frozen=True)
class ReferenceReading:
    """One figure read out of the reference source, with its own wording."""

    population: int
    phrase: str
    url: str


@dataclass
class SpotCheck:
    """One settlement, the pipeline's value, and an independently published one."""

    settlement_id: str
    name: str
    state_name: str
    pipeline_population: int
    pipeline_population_2020_base: int
    reference_population: int | None
    reference_phrase: str | None
    reference_url: str | None
    reference_retrieved_at: str | None
    reference_source: str
    relative_difference: float | None
    verdict: str
    note: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "settlement_id": self.settlement_id,
            "name": self.name,
            "state": self.state_name,
            "pipeline_population": self.pipeline_population,
            "pipeline_population_2020_base": self.pipeline_population_2020_base,
            "reference_population": self.reference_population,
            "reference_phrase": self.reference_phrase,
            "reference_source": self.reference_source,
            "reference_url": self.reference_url,
            "reference_retrieved_at": self.reference_retrieved_at,
            "relative_difference": (
                round(self.relative_difference, 6) if self.relative_difference is not None else None
            ),
            "verdict": self.verdict,
            "note": self.note,
        }


def _candidate_title(seed: SettlementSeed) -> str:
    """Wikipedia article title for a settlement, without hand-writing one per city.

    The pattern "Name, State" covers American city and town articles. The Census
    Bureau publishes some places under the geography rather than the city - a
    consolidated city-county is "Louisville/Jefferson County metro government"
    and "Nashville-Davidson metropolitan government" - and no reference source
    documents those names. The county qualifier is stripped so the article about
    the place is the one that gets read; this is a rule about the Census name
    form, not a per-city list. Any settlement whose title still does not resolve
    is reported as unresolved rather than guessed at, so the check never compares
    the wrong place.
    """
    name = seed.name.strip()
    for pattern in (
        re.compile(r"^(?P<place>.+?)/(?P<county>[^/]+?)\s*metro(?:politan)? government$", re.IGNORECASE),
        re.compile(
            r"^(?P<place>.+?)\s*-\s*(?P<county>[^-]+?)\s*metro(?:politan)? government$", re.IGNORECASE
        ),
    ):
        match = pattern.match(name)
        if match:
            name = match.group("place")
            break
    for suffix in (" city", " town", " village", " borough"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return f"{name}, {seed.state_name}".replace(" ", "_")


def _numbers_in(text: str) -> list[tuple[int, int, int]]:
    """(value, start, end) for every number in a span of text.

    Handles the three shapes a published population takes in this source: a plain
    count with separators ("905,748"), a scaled count ("2.74 million", "1.60
    million") and an unscaled count followed by a headcount word ("641,903
    residents"). ``end`` includes any " million" that was folded into the value,
    so the checks that look at the text after the number see what a reader sees.
    """
    results: list[tuple[int, int, int]] = []
    for match in _NUMBER.finditer(text):
        raw = match.group(0).replace(",", "")
        try:
            value = float(raw)
        except ValueError:
            continue
        end = match.end()
        tail = text[end : end + 12].casefold()
        if tail.startswith(" billion"):
            value *= 1_000_000_000
            end += 8
        elif tail.startswith(" million"):
            value *= 1_000_000
            end += 8
        elif tail.startswith(" thousand"):
            value *= 1_000
            end += 9
        results.append((int(round(value)), match.start(), end))
    return results


def _nearest_year(text: str, span: tuple[int, int]) -> int | None:
    """The decennial year closest to ``span``, or None if none is near enough."""
    best: tuple[int, int] | None = None
    for match in _YEAR.finditer(text):
        distance = _gap_between(span, match.span())
        if distance > _MAX_QUALIFIER_GAP:
            continue
        year = int(match.group(0))
        if year not in _DECENNIAL_YEARS:
            continue
        if best is None or distance < best[0]:
            best = (distance, year)
    return best[1] if best is not None else None


def _nearest_census_word(text: str, span: tuple[int, int]) -> tuple[int, int] | None:
    """(distance, match end) of the closest "census" word, if it is near enough."""
    best: tuple[int, int] | None = None
    for match in _CENSUS_WORD.finditer(text):
        distance = _gap_between(span, match.span())
        if distance > _MAX_QUALIFIER_GAP:
            continue
        if best is None or distance < best[0]:
            best = (distance, match.end())
    return best


def _gap_between(first: tuple[int, int], second: tuple[int, int]) -> int:
    """Characters of whitespace or punctuation between two spans; 0 if they touch."""
    if first[1] <= second[0]:
        return second[0] - first[1]
    if second[1] <= first[0]:
        return first[0] - second[1]
    return 0


def _anchor_span(clause: str, start: int, end: int) -> tuple[int, int] | None:
    """Where a headcount word anchors this number, or None if nothing does.

    Two shapes are accepted and nothing else. The headcount word sits before the
    number within a short gap that cannot cross a clause boundary, or it sits
    immediately after the number. Both are what the real summaries use; a loose
    "is there a headcount word anywhere in this sentence" test is what produced
    Boston's 125.
    """
    window_start = max(0, start - _MAX_ANCHOR_GAP)
    before = clause[window_start:start]
    matches = list(_HEADCOUNT_BEFORE.finditer(before))
    if matches:
        found = matches[-1]
        return window_start + found.start(), start
    if _HEADCOUNT_AFTER.match(clause, end):
        return start, end
    return None


def _is_measurement(clause: str, end: int) -> bool:
    """True when the number is followed by a unit, so it is not a headcount.

    The strip covers non-breaking spaces as well as ordinary ones: Wikipedia's
    summary text writes "48.4 square miles (125 km2)" with a non-breaking space,
    and a test that only skipped " " would read that 125 as a figure.
    """
    tail = clause[end : end + 24].lstrip(" \t\r\n  ,;").casefold()
    return any(tail.startswith(unit) for unit in _NON_HEADCOUNT_UNITS)


def _describes_wider_area(scope: str) -> bool:
    """True when the clause is about something larger than one settlement.

    The clause before is searched too, because a clause is usually predicated
    of a noun phrase in the one before it: Baltimore's summary reads "The city is
    also part of the Washington-Baltimore combined statistical area, which had a
    population of 9.97 million in 2020". The clause holding the figure does not
    name the area; the clause before it does, and reading 9.97 million as
    Baltimore's population would be wrong by a factor of twenty.
    """
    lowered = scope.casefold()
    return any(marker in lowered for marker in _AREA_MARKERS)


def _extract_census_population(
    text: str,
    *,
    census_year: int = _TARGET_CENSUS_YEAR,
) -> tuple[int, str] | None:
    """Find a decennial census headcount for the settlement, or return None.

    Every condition below exists because dropping it produced a wrong answer.

    * The figure must be tied to a headcount word *immediately* before it, or
      immediately after it. The wider "a headcount word appears within forty
      characters" test is what read Boston's area in square kilometres (125) as
      its population, because the words "and a population of" follow the area and
      sit inside forty characters.
    * The figure must not be followed by a unit. This is what rejects "125 km2",
      "48.4 square miles" and "21.1 percent" independently of the anchor test.
    * The clause must name a decennial census year and the word "census" within a
      short distance. A later estimate is not a census count; a 2020 estimate is
      not a census count either, and "2020" must never be read as a population of
      2,020.
    * The clause must not be about a metropolitan area. Chicago's summary gives
      its own 2.74 million at the 2020 census and its metro area's 9.62 million
      "according to the 2020 census" in the next sentence; the second is not this
      settlement.
    * When a clause carries more than one qualified figure, the one qualified by
      the target census year wins. Baltimore's summary reads "a population of
      585,708 at the 2020 census and estimated at 569,997 in 2025", and taking
      the first number in the clause would have been luck rather than a rule.

    The clause before is searched with the clause itself, joined by the comma that
    separated them, because a qualifier is routinely written in one clause and
    the figure in the next: "As of the census of 2010, there were 1,200 people."
    Joining with a comma rather than a space keeps the boundary a delimiter, so a
    headcount word still cannot reach across it.

    Returning None means "the reference source does not publish a usable figure
    here". The caller must then say so on the row; it must never fall back to a
    number that merely looked plausible.
    """
    best: tuple[tuple[int, int, int], tuple[int, str]] | None = None
    previous = ""
    for clause in _CLAUSE_SPLIT.split(text):
        stripped = clause.strip()
        if not stripped:
            continue
        scope = f"{previous}, {stripped}" if previous else stripped
        if not _describes_wider_area(scope):
            for value, start, end in _numbers_in(scope):
                if value in _DECENNIAL_YEARS:
                    continue
                if not _MIN_HEADCOUNT <= value <= _MAX_HEADCOUNT:
                    continue
                if _is_measurement(scope, end):
                    continue
                anchor = _anchor_span(scope, start, end)
                if anchor is None:
                    continue
                span = (start, end)
                year = _nearest_year(scope, span)
                if year is None:
                    continue
                census = _nearest_census_word(scope, span)
                if census is None:
                    continue
                rank = (abs(year - census_year), census[0], start)
                phrase = scope[anchor[0] : census[1]].strip(" ,;")
                if best is None or rank < best[0]:
                    best = (rank, (value, phrase))
        previous = stripped
    return best[1] if best is not None else None


def _retry_delay(response: requests.Response | None, attempt: int, base: float, cap: float) -> float:
    """Seconds to wait before the next attempt: exponential, honouring Retry-After."""
    if response is not None:
        header = response.headers.get("Retry-After")
        if header:
            try:
                return max(0.0, min(cap, float(header)))
            except ValueError:
                pass
    return min(cap, base * (2 ** (attempt - 1)))


def fetch_reference_population(config: Config, seed: SettlementSeed) -> ReferenceReading | None:
    """Fetch one settlement's published census population.

    Returns a ReferenceReading, or None when the source is reachable but says
    nothing usable. Raises FetchError when the source could not be read at all,
    carrying the full reason; one unreachable article must not stop the other
    checks, so the caller records the error on the row instead.

    HTTP 429 is retried with exponential backoff. The REST endpoint rate-limits by
    client and the whole spot check is a burst of small requests against one
    host, so a single refusal in a run used to strand a settlement as
    "unverified" for a reason that had nothing to do with the data. 404 is *not*
    retried: it means the title does not resolve, and waiting cannot change that.
    """
    title = _candidate_title(seed)
    url = CHECK_SOURCE_TEMPLATE.format(title=title)
    headers = {
        "User-Agent": str(config.get("network.user_agent")),
        "Accept": "application/json",
    }
    timeout = float(config.get("verification.spot_check_timeout_seconds"))
    max_attempts = int(config.get("verification.spot_check_max_attempts"))
    base_delay = float(config.get("verification.spot_check_retry_backoff_seconds"))
    max_delay = float(config.get("verification.spot_check_retry_backoff_cap_seconds"))

    reason = ""
    for attempt in range(1, max_attempts + 1):
        response: requests.Response | None = None
        try:
            response = requests.get(url, timeout=timeout, headers=headers)
        except requests.RequestException as exc:
            reason = f"{type(exc).__name__}: {exc}"
        else:
            if response.status_code == 200:
                try:
                    document = response.json()
                except ValueError as exc:
                    raise FetchError(url, f"response was not JSON: {exc}", attempts=attempt) from exc
                extract = document.get("extract") or ""
                found = _extract_census_population(
                    extract, census_year=int(config.get("verification.spot_check_census_year"))
                )
                if found is None:
                    return None
                return ReferenceReading(population=found[0], phrase=found[1], url=url)
            reason = f"HTTP {response.status_code} {response.reason}"
            if response.status_code == 404:
                raise FetchError(
                    url,
                    f"HTTP 404 Not Found; the reference source publishes no article at {url}, so this "
                    f"settlement cannot be checked against it. The title derived from the Census name is "
                    f"{title!r}",
                    attempts=attempt,
                )
            if response.status_code not in _RETRYABLE_STATUS:
                raise FetchError(url, reason, attempts=attempt)
            reason = (
                f"{reason}; the endpoint is rate-limiting this client. Retried with exponential backoff, "
                f"attempt {attempt} of {max_attempts}"
            )
        if attempt < max_attempts:
            time.sleep(_retry_delay(response, attempt, base_delay, max_delay))
    raise FetchError(url, f"{reason}; gave up after {max_attempts} attempt(s)", attempts=max_attempts)


def run_spot_checks(
    config: Config,
    settlements: list[SettlementSeed],
    *,
    minimum: int,
) -> tuple[list[SpotCheck], list[str]]:
    """Spot-check the largest settlements in each of the six sides.

    Selecting the largest settlement per section, plus the largest overall, means
    the check covers every side and the places most likely to be wrong, rather
    than whichever names happened to come first in a file.
    """
    tolerance = float(config.get("verification.settlement_population_tolerance"))
    pace = float(config.get("verification.spot_check_min_request_interval_seconds"))
    notes: list[str] = []

    candidates: list[SettlementSeed] = []
    seen: set[str] = set()

    by_section: dict[str, list[SettlementSeed]] = {}
    for seed in settlements:
        if seed.section_key:
            by_section.setdefault(seed.section_key, []).append(seed)

    # Selection is the largest settlements in each side, not a sample across the
    # whole distribution. An earlier version also took each side's median-sized
    # settlement; those are 500-person villages that no reference source
    # documents, so four rows came back unverifiable and the check shrank without
    # saying why. Checking the largest places per side is both verifiable and the
    # place a parsing error would do most damage.
    per_section = int(config.get("verification.spot_checks_per_section"))
    for section_key in sorted(by_section):
        ordered = sorted(by_section[section_key], key=lambda seed: -seed.population)
        for seed in ordered[:per_section]:
            if seed.settlement_id not in seen:
                candidates.append(seed)
                seen.add(seed.settlement_id)

    ordered_all = sorted(settlements, key=lambda seed: -seed.population)
    for seed in ordered_all:
        if len(candidates) >= minimum + 2:
            break
        if seed.settlement_id not in seen:
            candidates.append(seed)
            seen.add(seed.settlement_id)

    if len(candidates) < minimum:
        raise WorldDataError(
            f"only {len(candidates)} settlements are available to spot-check but the exit criterion "
            f"requires {minimum}. Add settlements or lower the minimum."
        )

    notes.append(
        "Selection: the "
        f"{per_section} largest settlements in each of the six sides, so every side is checked and the "
        "places checked are ones an independent publisher documents. Median-sized settlements were tried "
        "and dropped because no reference source covers a 500-person village."
    )
    results: list[SpotCheck] = []
    retrieved_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for index, seed in enumerate(candidates):
        if index:
            time.sleep(pace)
        reading: ReferenceReading | None = None
        note = ""
        try:
            reading = fetch_reference_population(config, seed)
        except FetchError as exc:
            note = f"reference source could not be read: {exc.reason}"
        reference = reading.population if reading is not None else None
        if reading is None and not note:
            note = (
                "no decennial census figure for this settlement in the reference source's summary text "
                f"for {_candidate_title(seed)}; the settlement is reported as unverified rather than "
                "compared against a number that was not read"
            )

        base = seed.population_2020_base
        if reference is None:
            verdict = "unverified"
            difference = None
        else:
            difference = abs(base - reference) / max(1, reference)
            verdict = "agree" if difference <= tolerance else "disagree"
            if verdict == "disagree":
                note = (
                    f"pipeline {base:,} versus published {reference:,}, {difference:.2%} apart, outside the "
                    f"{tolerance:.2%} tolerance. This is a finding to investigate, not something to smooth "
                    "over."
                )

        results.append(
            SpotCheck(
                settlement_id=seed.settlement_id,
                name=seed.name,
                state_name=seed.state_name,
                pipeline_population=seed.population,
                pipeline_population_2020_base=base,
                reference_population=reference,
                reference_phrase=reading.phrase if reading is not None else None,
                reference_url=reading.url if reading is not None else None,
                reference_retrieved_at=retrieved_at if reading is not None else None,
                reference_source=CHECK_SOURCE_NAME,
                relative_difference=difference,
                verdict=verdict,
                note=note,
            )
        )

    verified = sum(1 for item in results if item.verdict in ("agree", "disagree"))
    agreed = sum(1 for item in results if item.verdict == "agree")
    disagreed = sum(1 for item in results if item.verdict == "disagree")
    unverified = sum(1 for item in results if item.verdict == "unverified")
    notes.append(
        f"Spot-check: {len(results)} settlements checked against an independently published decennial "
        f"census figure; {verified} reached a verdict ({agreed} agree within {tolerance:.2%}, "
        f"{disagreed} disagree), {unverified} could not be verified from the reference source."
    )
    if verified < minimum:
        notes.append(
            f"WARNING: only {verified} settlements reached a verdict, below the {minimum} the Phase 0 exit "
            "criterion requires. Every unverified row says why. Raising this number by dropping the "
            "unverifiable rows would make the check look complete without being complete."
        )
    if unverified:
        notes.append(
            f"{unverified} spot-check rows have no reference figure and are marked 'unverified'. They are "
            "reported rather than dropped, because a check that silently shrinks to the rows it could "
            "satisfy is not a check."
        )
    if len(seen) != len(results):
        raise WorldDataError("spot-check produced duplicate settlement rows")
    return results, notes


def write_spot_checks(
    config: Config,
    results: list[SpotCheck],
    notes: list[str],
) -> tuple[str, str]:
    """Write the checked-in spot-check record as JSON and Markdown."""
    export_dir = config.path_for("export_dir")
    report_dir = config.path_for("report_dir")
    export_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    payload = {
        "title": "Settlement spot check",
        "description": (
            "Pipeline settlement populations against independently published decennial census figures, "
            "fetched at the recorded time from the recorded URL. Generated by the run; do not hand-edit."
        ),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "reference_source": CHECK_SOURCE_NAME,
        "reference_url_template": CHECK_SOURCE_TEMPLATE,
        "measure_compared": (
            "The pipeline value is the Census Bureau's published estimates base for 1 April 2020, from the "
            "Vintage sub-county estimates file. The reference value is the decennial 2020 census count as "
            "quoted by an independent publisher. These are two different Census measures, so a small "
            "difference is expected and correct; exact equality is not the test."
        ),
        "tolerance": float(config.get("verification.settlement_population_tolerance")),
        "verdicts": {
            "agree": "Relative difference within the tolerance.",
            "disagree": "Relative difference outside the tolerance. A finding, not a failure to hide.",
            "unverified": (
                "The reference source could not be read for this settlement, or its summary publishes no "
                "decennial census figure for the place. Reported with the reason, never guessed at."
            ),
        },
        "notes": notes,
        "checks": [item.as_dict() for item in results],
    }
    json_path = export_dir / "spot_checks.json"
    json_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Settlement spot check",
        "",
        "PHASES.md Phase 0 exit criteria require at least 10 settlements verified against real published",
        "figures. This is that record. Generated by the run; do not hand-edit.",
        "",
        "## What is being compared, and why the two numbers differ",
        "",
        payload["measure_compared"],
        "",
        f"Tolerance: {payload['tolerance']:.2%}.",
        "",
        f"Reference source: {CHECK_SOURCE_NAME}, `{CHECK_SOURCE_TEMPLATE.format(title='<City>, <State>')}`",
        "",
        "## Results",
        "",
        "| Settlement | State | Pipeline base 2020 | Published census | Difference | Verdict | Source |",
        "|---|---|---|---|---|---|---|",
    ]
    for item in results:
        reference = f"{item.reference_population:,}" if item.reference_population is not None else "not read"
        difference = f"{item.relative_difference:.3%}" if item.relative_difference is not None else "-"
        # The reason a row could not be read is in the Notes section in full. A
        # 60-character slice of it here used to cut sentences mid-word.
        source = item.reference_url or "see Notes"
        lines.append(
            f"| {item.name} | {item.state_name} | {item.pipeline_population_2020_base:,} | {reference} | "
            f"{difference} | **{item.verdict}** | {source} |"
        )
    lines += ["", "## Notes", ""]
    for note in notes:
        lines.append(f"- {note}")
    lines.append("")

    disagreements = [item for item in results if item.verdict == "disagree"]
    if disagreements:
        # The disagreements are the point of the check. They get their own section
        # so that a row the reader has to compare against two other rows is never
        # the row carrying a finding.
        lines += ["## Findings: settlements outside tolerance", ""]
        for item in disagreements:
            lines.append(
                f"- {item.name}, {item.state_name} (pipeline {item.pipeline_population_2020_base:,} "
                f"against published {item.reference_population:,}): {item.note}"
            )
        lines.append("")
        lines.append(
            "A row here is not a failure to be tidied away. Either the pipeline is wrong for this "
            "settlement or the two figures describe different geographies - the Census Bureau and the "
            "reference publisher do not always draw a consolidated city-county the same way. Which of "
            "the two it is has to be established against the source files, not assumed."
        )
        lines.append("")

    lines.append("The published figure for each verified row, quoted as the reference source states it:")
    lines.append("")
    for item in results:
        if item.reference_phrase:
            lines.append(f"- {item.name}, {item.state_name}: \"{item.reference_phrase}\"")
    lines.append("")
    lines.append("Every row that could not be read, with the reason in full:")
    lines.append("")
    for item in results:
        if not item.reference_phrase:
            lines.append(f"- {item.name}, {item.state_name}: {item.note}")
    lines.append("")
    lines.append(
        "An 'unverified' row means the reference source's summary for that place publishes no decennial "
        "census figure. It is not a judgement that the pipeline is wrong, and it is not a row that can be "
        "made to verify by reading a number out of the surrounding prose."
    )
    lines.append("")
    markdown_path = report_dir / "SPOT_CHECK.md"
    markdown_path.write_text("\n".join(lines), encoding="utf-8")
    return (str(json_path), str(markdown_path))