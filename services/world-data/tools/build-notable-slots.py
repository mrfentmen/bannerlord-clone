#!/usr/bin/env python3
"""Tier 3-75/76: Derive notable slots per settlement from the pipeline's size class.

Reads settlements from dist/settlements.jsonl.gz and computes notable slots per
settlement. How many slots a settlement gets, and of which location types, is a
function of the size class the pipeline already assigned to that settlement and
of nothing else - see `SLOTS_BY_SIZE_CLASS`.

Two things this tool deliberately does not do, both of which it used to do:

* **It does not band populations itself.** The pipeline derives its size classes
  from the population distribution (cuts at 30,217 and 192,508 for the 2023
  vintage) and writes the result into every settlement row as `size_class`. This
  tool used to apply its own hardcoded 2,500 / 50,000 bands, which put 5,536
  villages and 669 towns in a different class from the export it was reading, and
  the POI tags derived from it inherited the disagreement. The class is read; a
  class this tool does not recognise is refused rather than guessed at.

* **It does not use the builtin `hash()`.** `hash()` on a str is salted per
  process by PYTHONHASHSEED, so two runs of this tool in two processes produced
  two different slot distributions and neither matched a third: the tool could
  not regenerate or diff its own output. `stable_unit_interval` is a BLAKE2b
  digest of the settlement id instead, which is the same number in every
  process, on every machine, forever.

Exports notable slots (location type + count) without invented names.
"""

import gzip
import hashlib
import json
import sys
from pathlib import Path

# Slot range and location types per pipeline size class. The keys are the
# `classification.class_names` the pipeline is configured with and writes into
# every settlement row; the values are the slot budget each class gets.
#
# The ranges are a design decision, not a measurement: they say how much civic
# and commercial life a place of that size has room for. What is *not* decided
# here is which class a population belongs to - the pipeline derives that from
# the distribution and this tool reads the answer.
SLOTS_BY_SIZE_CLASS = {
    "village": (1, 2, ("headman", "trader")),
    "town": (3, 8, ("headman", "trader", "blacksmith", "tavern_keeper", "priest")),
    "city": (
        9,
        25,
        (
            "mayor",
            "trader",
            "blacksmith",
            "tavern_keeper",
            "priest",
            "captain",
            "merchant_lord",
            "spymaster",
        ),
    ),
}

# Digest width for `stable_unit_interval`. Eight bytes is 2**64 buckets, which is
# far more resolution than a 25-slot range needs and keeps the mapping stable if
# the range is ever widened.
DIGEST_BYTES = 8


def stable_unit_interval(settlement_id: str) -> float:
    """A reproducible number in [0, 1) derived from a settlement id.

    BLAKE2b rather than `hash()`, because the builtin is salted per process: it is
    the reason this tool could not reproduce its own output, and a derived
    artefact that cannot be reproduced is not an artefact.
    """
    digest = hashlib.blake2b(settlement_id.encode("utf-8"), digest_size=DIGEST_BYTES).digest()
    return int.from_bytes(digest, "big") / float(1 << (DIGEST_BYTES * 8))


def population_band(population, size_class) -> str:
    """The class to band a settlement by, which is the one the pipeline assigned.

    Returns `size_class` unchanged. The population is accepted and not used for
    the banding, and saying so in the signature is the point: two settlements of
    the same class differ in how many slots they get, and the thing that decides
    that is the settlement id, not the population.
    """
    if size_class not in SLOTS_BY_SIZE_CLASS:
        raise ValueError(
            f"a settlement of population {population} carries size_class {size_class!r}, which is not one of "
            f"{sorted(SLOTS_BY_SIZE_CLASS)}. This tool bands by the pipeline's own size_class and will not "
            "invent a band for a class it has not been given."
        )
    return size_class


def notable_slots(population, size_class, settlement_id) -> dict:
    """Compute deterministic notable slots for one settlement.

    A pure function of its arguments: the same settlement gets the same slots in
    every process, which is what makes the output diffable and the POI tags
    derived from it reproducible.
    """
    band = population_band(population, size_class)
    min_slots, max_slots, types = SLOTS_BY_SIZE_CLASS[band]

    # The only per-settlement variation is where in the class's range it falls,
    # and that comes from the id's digest rather than from a process-local hash.
    count = min_slots + int(stable_unit_interval(settlement_id) * (max_slots - min_slots + 1))
    count = min(count, max_slots)

    slots = []
    for i in range(count):
        slots.append(
            {
                "slot_id": f"{settlement_id}-S{i + 1:02d}",
                "location_type": types[i % len(types)],
                "band": band,
            }
        )

    return {
        "settlement_id": settlement_id,
        "population": population,
        # `band` is the name this tool's slots have always carried and
        # `build-poi-tags.py` reads; `size_class` is the pipeline's name for the
        # same value. Both are written so a reader can tell which classification
        # produced a row without having to know the tool's history.
        "band": band,
        "size_class": band,
        "slot_count": count,
        "slots": slots,
    }


def read_settlements(path: Path):
    """Every settlement row the export holds, in file order.

    Raises on a line that is not a JSON object and skips a row that carries no
    settlement identifier. A malformed line is not something to step over: this
    tool bands every settlement the pipeline ships, and quietly leaving one out is
    how a town ends up with no civic life.
    """
    with gzip.open(path, "rt", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            if row.get("_header"):
                continue
            if not (row.get("settlement_id") or row.get("osmId")):
                continue
            yield row


def main() -> int:
    # tools/ -> world-data/ -> services/ -> repo
    repo = Path(__file__).resolve().parent.parent.parent.parent
    settlements_path = repo / "services/world-data/dist/settlements.jsonl.gz"
    out_path = repo / "services/world-data/dist/notable-slots.jsonl.gz"

    if not settlements_path.exists():
        print(f"ERROR: {settlements_path} not found", file=sys.stderr)
        return 1

    results = []
    try:
        for row in read_settlements(settlements_path):
            settlement_id = row.get("settlement_id") or row["osmId"]
            results.append(notable_slots(row.get("population"), row.get("size_class"), settlement_id))
    except (ValueError, KeyError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    with gzip.open(out_path, "wt", encoding="utf-8") as out:
        for result in results:
            out.write(json.dumps(result) + "\n")

    bands: dict[str, int] = {}
    for result in results:
        bands[result["band"]] = bands.get(result["band"], 0) + 1
    total_slots = sum(result["slot_count"] for result in results)

    print(f"Settlements: {len(results)}")
    print(f"Size classes (the pipeline's own): {dict(sorted(bands.items()))}")
    print(f"Total slots: {total_slots}")
    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())