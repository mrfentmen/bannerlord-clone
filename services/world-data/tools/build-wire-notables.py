"""Build client wire notables for the playable Ohio region.

Reads clients/campaign/public/world/settlements.json (OSM-sourced wire
rows whose osmId doubles as the settlement key), synthesizes seed dicts
from the wire fields, and runs the deterministic notables generator.
Output: clients/campaign/public/world/notables.json
"""

import json
import sys

sys.path.insert(0, "/home/hatch/workspace/staging/notables")
from notables import generate_notables

WIRE = ("/home/hatch/workspace/bannerlord-clone-main"
        "/clients/campaign/public/world/settlements.json")


def size_class_for(population: int) -> str:
    # Mirrors the pipeline classification bounds (village 500-30217,
    # town 30218-192508, city above) from the settlements export header.
    if population >= 192509:
        return "city"
    if population >= 30218:
        return "town"
    return "village"


def main() -> None:
    wire = json.load(open(WIRE))
    seeds = []
    for s in wire["settlements"]:
        pop = s.get("population") or s.get("osmPopulation") or 1000
        seeds.append({
            "settlement_id": s["osmId"],
            "size_class": size_class_for(pop),
            "population": pop,
            "prosperity": 0.5,
            "unrest": 0.05,
            "loyalty": 0.5,
            "infected": 0.0,
            "food_stock_person_days": pop * 30.0,
            "food_demand_person_days": pop * 2.0,
        })
    rows = generate_notables(seeds)
    out = {
        "source": "world-data notables pipeline (worker/hana/notables), "
                  "fictional persons; wire seeds only",
        "licence": "Generated content, no external source; names fictional "
                   "by construction.",
        "retrieved": "2026-10-01",
        "notables": rows,
    }
    path = WIRE.replace("settlements.json", "notables.json")
    json.dump(out, open(path, "w"))
    print(f"{len(rows)} notables for {len(seeds)} wire settlements -> {path}")


if __name__ == "__main__":
    main()
