"""Tests for the notables transform: determinism, schema, role coverage."""

from types import SimpleNamespace
import json

from worlddata.transforms.notables import (ROLES_BY_SIZE, generate_notables,
                                           grievances_for, power_for)


def seed(**kw):
    base = dict(settlement_id="01-00124", size_class="village", population=2377,
                prosperity=0.5, unrest=0.05, loyalty=0.5, infected=0.0,
                food_stock_person_days=71310.0, food_demand_person_days=4754.0)
    base.update(kw)
    return SimpleNamespace(**base)


def test_deterministic():
    seeds = [seed(), seed(settlement_id="02-00001", size_class="city",
                          population=800000, prosperity=0.8)]
    assert generate_notables(seeds) == generate_notables(seeds)


def test_role_coverage_per_size():
    rows = generate_notables([seed(size_class="village"),
                              seed(settlement_id="x", size_class="town"),
                              seed(settlement_id="y", size_class="city")])
    by_size: dict[str, set[str]] = {}
    for r in rows:
        by_size.setdefault(r["size_class"], set()).add(r["role"])
    for size, roles in ROLES_BY_SIZE.items():
        expected = {role for role, lo, _ in roles if lo >= 1}
        assert expected <= by_size[size], (size, expected - by_size[size])


def test_schema_and_ranges():
    rows = generate_notables([seed()])
    ids = set()
    for r in rows:
        assert r["notable_id"] not in ids
        ids.add(r["notable_id"])
        assert r["settlement_id"] == "01-00124"
        assert 0.0 <= r["power"] <= 1.0
        assert isinstance(r["name"], str) and " " in r["name"]
        assert json.loads(r["grievances"]) is not None  # JSON-encoded list
        assert json.loads(r["quest_types"])  # JSON-encoded list of quest type ids
        rp = json.loads(r["recruit_pool"])
        assert isinstance(rp["available"], bool) and rp["size"] >= 0


def test_grievances_from_state():
    hungry = seed(food_stock_person_days=100.0, food_demand_person_days=4754.0)
    assert "food_shortage" in grievances_for(hungry)
    restless = seed(unrest=0.9)
    assert "insecurity" in grievances_for(restless)
    sick = seed(infected=0.1)
    assert "disease" in grievances_for(sick)
    calm = seed()
    assert grievances_for(calm) == []


def test_militia_recruits_scale_with_population():
    small = generate_notables([seed(population=1000)])
    big = generate_notables([seed(settlement_id="z", population=100000)])
    sm = next(r for r in small if r["role"] == "militia_captain")
    bg = next(r for r in big if r["role"] == "militia_captain")
    smp, bgp = json.loads(sm["recruit_pool"]), json.loads(bg["recruit_pool"])
    assert smp["available"] and bgp["available"]
    assert bgp["size"] > smp["size"]


def test_power_monotone_in_prosperity():
    assert power_for("mayor", 0.9, 10000) > power_for("mayor", 0.1, 10000)
