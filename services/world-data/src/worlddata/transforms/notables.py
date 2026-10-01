"""Town and village notables (QUESTS_AND_NOTABLES.md section 2, FEATURES.md V1).

Notables are non-ruler people who hold local power: they give quests,
supply recruits, and shape loyalty, like Bannerlord's notables. This
module generates them deterministically from real settlement data
(population, size class, prosperity, food, unrest, loyalty, health).

Names are fictional by construction (CONSTITUTION.md section 6 requires
fictional people on real geography): they are assembled from syllable
banks and are never sourced from lists of real persons.

Pure function of the settlement seeds: no I/O, no network, no randomness
beyond the hash-seeded PRNG, so output is byte-identical across runs.
"""

from __future__ import annotations

import hashlib
import json
import random
from typing import Any

VERSION = "notables-v1"

# Role, min count, max count per settlement size class.
# From QUESTS_AND_NOTABLES.md section 2's table plus FEATURES.md's list
# (mayors, foremen, shopkeepers, union bosses, gang bosses, farm owners).
ROLES_BY_SIZE: dict[str, list[tuple[str, int, int]]] = {
    "village": [
        ("headman", 1, 1),
        ("farm_owner", 1, 2),
        ("militia_captain", 1, 1),
    ],
    "town": [
        ("mayor", 1, 1),
        ("shopkeeper", 1, 2),
        ("doctor", 1, 1),
        ("foreman", 0, 1),
        ("militia_captain", 1, 1),
    ],
    "city": [
        ("mayor", 1, 1),
        ("merchant", 1, 2),
        ("doctor", 1, 1),
        ("gang_boss", 1, 1),
        ("union_boss", 0, 1),
        ("artisan", 0, 1),
        ("militia_captain", 1, 1),
    ],
}

# How much each role sways its town, before prosperity/population scaling.
ROLE_POWER: dict[str, float] = {
    "mayor": 1.0,
    "gang_boss": 0.8,
    "union_boss": 0.7,
    "headman": 0.6,
    "merchant": 0.6,
    "doctor": 0.5,
    "foreman": 0.5,
    "militia_captain": 0.5,
    "shopkeeper": 0.4,
    "farm_owner": 0.4,
    "artisan": 0.4,
}

# Which of the 10 starter quest types (QUESTS_AND_NOTABLES.md section 4)
# each role can give.
ROLE_QUESTS: dict[str, list[str]] = {
    "headman": ["food_delivery", "protect_harvest", "clear_road"],
    "farm_owner": ["food_delivery", "protect_harvest"],
    "militia_captain": ["clear_road", "bounty", "escort_caravan"],
    "mayor": ["food_delivery", "repair_infrastructure", "rescue_prisoner"],
    "shopkeeper": ["escort_caravan", "recover_stolen_goods"],
    "doctor": ["medicine_run"],
    "foreman": ["repair_infrastructure", "protect_harvest"],
    "merchant": ["escort_caravan", "recover_stolen_goods", "bounty"],
    "gang_boss": ["gang_dispute", "bounty", "recover_stolen_goods"],
    "union_boss": ["repair_infrastructure", "food_delivery"],
    "artisan": ["recover_stolen_goods", "repair_infrastructure"],
}

# Fictional-by-construction name banks. Assembled names read American;
# no entry is a real person's name.
_FIRST_A = ["Mar", "Del", "Kar", "Jen", "Tom", "Ray", "Al", "Bel", "Cor",
            "Dan", "El", "Fran", "Gar", "Har", "Jo", "Ken", "Lar", "Mik",
            "Nan", "Ot", "Pat", "Quin", "Ros", "Sam", "Ter", "Vic", "Wen",
            "Cal", "Dor", "Hal"]
_FIRST_B = ["cus", "ton", "ley", "ra", "na", "ine", "ald", "ene", "ora",
            "ith", "el", "is", "ara", "owen"]
_LAST_A = ["Black", "Stone", "River", "Ash", "Thorn", "Mill", "Brook", "Clay",
           "Hart", "Vale", "Marsh", "Reed", "Wol", "Hawk", "Fox", "Elm",
           "Birch", "Slade", "Grove", "Heath", "Merr", "Nor", "Pen", "Quill",
           "Rook", "Sable", "Tarn", "Vex", "Wren", "Yar"]
_LAST_B = ["wood", "field", "more", "son", "ley", "ford", "well", "ridge",
           "hart", "croft", "holm", "wick", "shaw", "den", "grave", "lock"]


def _get(seed: Any, name: str, default: Any = None) -> Any:
    if isinstance(seed, dict):
        return seed.get(name, default)
    return getattr(seed, name, default)


def _rng_for(*parts: str) -> random.Random:
    h = hashlib.sha256(":".join([VERSION] + list(parts)).encode()).hexdigest()
    return random.Random(int(h[:16], 16))


def fictional_name(rng: random.Random) -> str:
    return (rng.choice(_FIRST_A) + rng.choice(_FIRST_B) + " "
            + rng.choice(_LAST_A) + rng.choice(_LAST_B))


def grievances_for(seed: Any) -> list[str]:
    """Needs and grievances read from the town's state (spec section 2)."""
    out: list[str] = []
    food = _get(seed, "food_stock_person_days", 0) or 0
    demand = _get(seed, "food_demand_person_days", 1) or 1
    if food < demand * 8:
        out.append("food_shortage")
    if (_get(seed, "unrest", 0) or 0) > 0.5:
        out.append("insecurity")
    if (_get(seed, "loyalty", 0.5) or 0.5) < 0.4:
        out.append("misgovernment")
    if (_get(seed, "prosperity", 0.5) or 0.5) < 0.3:
        out.append("poverty")
    if (_get(seed, "infected", 0) or 0) > 0.02:
        out.append("disease")
    return out[:2]


def recruit_pool_for(role: str, population: int) -> dict[str, Any]:
    if role == "militia_captain":
        return {"available": True, "size": max(2, population // 800)}
    if role in ("headman", "farm_owner"):
        return {"available": True, "size": max(1, population // 2000)}
    return {"available": False, "size": 0}


def power_for(role: str, prosperity: float, population: int) -> float:
    base = ROLE_POWER[role]
    pop_factor = 0.7 + 0.3 * min(1.0, population / 50000)
    return round(min(1.0, base * (0.4 + 0.6 * prosperity) * pop_factor), 3)


def generate_notables(seeds: list[Any]) -> list[dict[str, Any]]:
    """Build one notable row per role slot for every settlement seed."""
    rows: list[dict[str, Any]] = []
    for seed in seeds:
        sid = _get(seed, "settlement_id")
        size_class = _get(seed, "size_class", "village")
        population = _get(seed, "population", 0) or 0
        prosperity = _get(seed, "prosperity", 0.5) or 0.5
        grievances = grievances_for(seed)
        n = 0
        for role, lo, hi in ROLES_BY_SIZE.get(size_class, ROLES_BY_SIZE["village"]):
            rng = _rng_for(sid, role)
            count = lo + (rng.randrange(hi - lo + 1) if hi > lo else 0)
            for i in range(count):
                n += 1
                rows.append({
                    "notable_id": f"{sid}-N{n:02d}",
                    "settlement_id": sid,
                    "name": fictional_name(rng),
                    "role": role,
                    "size_class": size_class,
                    "power": power_for(role, prosperity, population),
                    "grievances": json.dumps(grievances),
                    "recruit_pool": json.dumps(recruit_pool_for(role, population)),
                    # JSON strings, not list/dict: the published schema's type
                    # vocabulary is scalars only (see sections.state_fips,
                    # routes.segment_ids for the same convention).
                    "quest_types": json.dumps(ROLE_QUESTS[role]),
                    # JSON string, not a list: the published schema's type
                    # vocabulary is scalars only (see sections.state_fips,
                    # routes.segment_ids for the same convention).
                    "source": ("procedural fictional notables seeded from "
                               "settlement data; names fictional by construction"),
                })
    return rows
