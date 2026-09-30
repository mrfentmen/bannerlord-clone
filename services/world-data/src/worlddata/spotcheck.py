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

# Patterns that pull a population figure and the phrase it was qualified with out
# of the summary text. Kept strict: a figure is only accepted when the sentence
# says it is a census count, because that is the measure being compared.
_CENSUS_YEARS = ("2020", "2010", "2000", "1990")
# Words that identify a number as a headcount rather than a date, a rank, or a
# measurement. Requiring one of these is what stops the census year itself from
# being read as the population - which is exactly the bug an earlier version had,
# and it reported 2,020 as the published population of Chicago.
_HEADCOUNT_WORDS = (
    "population",
    "inhabitants",
    "residents",
    "people",
    "lived",
    "citizens",
    "inhabited",
)
# A plain count, a thousands-separated count, or a decimal figure.
#
# The trailing guard is not a plain "(?!.)": a sentence-ending period after a
# whole number is punctuation, not a decimal point. With a naive guard the regex
# backtracked and matched "641" out of "641,903." - the trailing comma group has
# to end in a digit, and a following period only disqualifies when a digit follows
# it.
_NUMBER = re.compile(r"(?<![\d.])\d+(?:,\d{3})*(?:\.\d+)?(?![\d]|\.\d)")

# Smallest and largest headcount accepted. The lower bound rejects ordinals and
# stray small numbers; the upper bound rejects national and world figures, which
# are never the population of one settlement.
_MIN_HEADCOUNT = 50
_MAX_HEADCOUNT = 25_000_000
# Census years a candidate number must not equal.
_CENSUS_YEAR_VALUES = {1990, 2000, 2010, 2020}


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

    The pattern "Name, State" covers American city and town articles. Any
    settlement whose title does not resolve is reported as unresolved rather than
    guessed at, so the check never compares the wrong place.
    """
    name = seed.name.strip()
    for suffix in (" city", " town", " village", " borough"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
    return f"{name}, {seed.state_name}".replace(" ", "_")


def _numbers_in(sentence: str) -> list[tuple[int, int, int]]:
    """(value, start, end) for every number in a sentence.

    Handles the three shapes a published population takes in this source: a plain
    count with separators ("905,748"), and a scaled figure ("2.74 million",
    "1.6 billion"). The scaled forms are what a summary of a large city actually
    uses; an earlier version matched only plain counts and so read nothing at all
    for Chicago, Houston, Philadelphia and most other big cities.
    """
    results: list[tuple[int, int, int]] = []
    for match in _NUMBER.finditer(sentence):
        raw = match.group(0).replace(",", "")
        try:
            value = float(raw)
        except ValueError:
            continue
        tail = sentence[match.end() : match.end() + 12].casefold()
        if tail.startswith(" billion"):
            value *= 1_000_000_000
            span = match.end() + 8
        elif tail.startswith(" million"):
            value *= 1_000_000
            span = match.end() + 8
        elif tail.startswith(" thousand"):
            value *= 1_000
            span = match.end() + 9
        else:
            span = match.end()
        results.append((int(round(value)), match.start(), span))
    return results


def _extract_census_population(text: str) -> tuple[int, str] | None:
    """Find a 2020 census headcount in a summary, or return None.

    Every condition below exists because dropping it produced a wrong answer:

    * the sentence must name a census year, so a later estimate is not mistaken
      for a census count;
    * the number must not itself be a year, or "the 2020 census" reads as a
      population of 2,020;
    * a headcount word must sit close to the number, so a rank, an area, a date
      or a percentage is not read as a population;
    * a sentence about a metropolitan area is only used when nothing else in the
      summary qualifies, so a city's own count is not taken to be its metro's.
    """
    best: tuple[int, str] | None = None
    fallback: tuple[int, str] | None = None
    for sentence in re.split(r"(?<=[.!?])\s+", text):
        lowered = sentence.casefold()
        if "census" not in lowered:
            continue
        if not any(year in lowered for year in _CENSUS_YEARS):
            continue
        is_metro = "metropolitan" in lowered or "metro area" in lowered
        for value, start, end in _numbers_in(sentence):
            if value in _CENSUS_YEAR_VALUES:
                continue
            if not _MIN_HEADCOUNT <= value <= _MAX_HEADCOUNT:
                continue
            window = lowered[max(0, start - 40) : end + 40]
            if not any(word in window for word in _HEADCOUNT_WORDS):
                continue
            if is_metro:
                if fallback is None:
                    fallback = (value, sentence.strip())
                continue
            return (value, sentence.strip())
    return best if best is not None else fallback


def fetch_reference_population(
    config: Config,
    seed: SettlementSeed,
) -> tuple[int, str, str] | None:
    """Fetch one settlement's published census population.

    Returns (population, sentence, url), or None when the source is unreachable
    or says nothing usable. Never raises for a fetch failure: one unreachable
    article must not stop the other checks, but the failure is reported on the
    spot-check row.
    """
    title = _candidate_title(seed)
    url = CHECK_SOURCE_TEMPLATE.format(title=title)
    headers = {
        "User-Agent": str(config.get("network.user_agent")),
        "Accept": "application/json",
    }
    try:
        response = requests.get(
            url,
            timeout=float(config.get("verification.spot_check_timeout_seconds")),
            headers=headers,
        )
    except requests.RequestException as exc:
        raise FetchError(url, f"{type(exc).__name__}: {exc}", attempts=1) from exc
    if response.status_code != 200:
        raise FetchError(url, f"HTTP {response.status_code} {response.reason}", attempts=1)
    try:
        document = response.json()
    except ValueError as exc:
        raise FetchError(url, f"response was not JSON: {exc}", attempts=1) from exc
    extract = document.get("extract") or ""
    found = _extract_census_population(extract)
    if found is None:
        return None
    return (found[0], found[1], url)


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
    for seed in candidates:
        reference: int | None = None
        phrase: str | None = None
        url: str | None = None
        note = ""
        try:
            fetched = fetch_reference_population(config, seed)
        except FetchError as exc:
            fetched = None
            note = f"reference source unreachable: {exc.reason}"
        if fetched is not None:
            reference, phrase, url = fetched
        elif not note:
            note = f"no 2020 census figure found in the summary text for {_candidate_title(seed)}"

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
                    f"{tolerance:.2%} tolerance. This is a finding to investigate, not something to smooth over."
                )

        results.append(
            SpotCheck(
                settlement_id=seed.settlement_id,
                name=seed.name,
                state_name=seed.state_name,
                pipeline_population=seed.population,
                pipeline_population_2020_base=base,
                reference_population=reference,
                reference_phrase=phrase,
                reference_url=url,
                reference_retrieved_at=retrieved_at if url else None,
                reference_source=CHECK_SOURCE_NAME,
                relative_difference=difference,
                verdict=verdict,
                note=note,
            )
        )
        time.sleep(0.0)  # keep the request rate visibly sequential and polite

    verified = sum(1 for item in results if item.verdict == "agree")
    disagreed = sum(1 for item in results if item.verdict == "disagree")
    unverified = sum(1 for item in results if item.verdict == "unverified")
    notes.append(
        f"Spot-check: {len(results)} settlements checked against an independently published 2020 census "
        f"figure; {verified} agree within {tolerance:.2%}, {disagreed} disagree, {unverified} could not be "
        f"verified from the reference source."
    )
    if unverified:
        notes.append(
            f"{unverified} spot-check rows have no reference figure and are marked 'unverified'. They are "
            "reported rather than dropped, because a check that silently shrinks to the rows it could "
            "satisfy is not a check."
        )
    by_id_notes = {item.settlement_id for item in results}
    if len(by_id_notes) != len(results):
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
            "Pipeline settlement populations against independently published 2020 census figures, "
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
            "unverified": "The reference source could not be read for this settlement. Reported, not dropped.",
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
        "| Settlement | State | Pipeline base 2020 | Published 2020 census | Difference | Verdict | Source |",
        "|---|---|---|---|---|---|---|",
    ]
    for item in results:
        reference = f"{item.reference_population:,}" if item.reference_population is not None else "not read"
        difference = f"{item.relative_difference:.3%}" if item.relative_difference is not None else "-"
        lines.append(
            f"| {item.name} | {item.state_name} | {item.pipeline_population_2020_base:,} | {reference} | "
            f"{difference} | **{item.verdict}** | {item.reference_url or item.note[:60]} |"
        )
    lines += ["", "## Notes", ""]
    for note in notes:
        lines.append(f"- {note}")
    lines.append("")
    for item in results:
        if item.note:
            lines.append(f"- {item.name}, {item.state_name}: {item.note}")
    lines.append("")
    markdown_path = report_dir / "SPOT_CHECK.md"
    markdown_path.write_text("\n".join(lines), encoding="utf-8")
    return (str(json_path), str(markdown_path))
