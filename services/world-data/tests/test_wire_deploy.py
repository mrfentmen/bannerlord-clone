"""The wire-deploy step, checked against the failure it was written for.

`services/world-data/exports/wire/` and `clients/campaign/public/world/` are the same
three files, copied by `tools/deploy-wire-to-client.py`. They drifted once: the client's
copy of `region.json` still described the Northern Colorado Front Range, a region
fetched by the client's own script, while `settlements.json` and `network.json` had
already been replaced with Ohio River Valley data. Both regions had been in the same
directory at different times and nothing recorded which was current.

The symptom was not subtle and it was not caught by any test: `region.json` named 2,236
zoom-12 elevation tiles of which none were on disk, so `loadHeightfield` threw on the
first one and the map never drew. Meanwhile the settlements projected against a
Colorado bbox, roughly 28x outside the map.

So this checks the properties that make that drift visible:

  * the deployed files are the ones `worlddata wire` produces, per table;
  * a `retrieved` date is only carried across a deploy when the client's copy is the
    *same* region, so a fetch date cannot be stamped onto unrelated data;
  * the client-only enrichments (`wire_version`, `travelEdges`) survive a redeploy
    rather than being silently dropped, because they are the client's to add;
  * the boot tier's tile list and the files on disk agree, since a missing boot tile
    stops the map drawing.

No test here needs a network or a real Parquet read.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any

import pytest

SERVICE = Path(__file__).resolve().parents[1]
REPO = SERVICE.parents[1]
WIRE = SERVICE / "exports" / "wire"
CLIENT_WORLD = REPO / "clients" / "campaign" / "public" / "world"
DEPLOY = SERVICE / "tools" / "deploy-wire-to-client.py"


def _load_deploy_module():
    """Import the deploy tool by path. Its name has a hyphen, so it is not importable."""
    spec = importlib.util.spec_from_file_location("deploy_wire_to_client", DEPLOY)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


deploy = _load_deploy_module()


def wire_file(name: str) -> dict[str, Any]:
    return json.loads((WIRE / name).read_text(encoding="utf-8"))


def client_file(name: str) -> dict[str, Any]:
    return json.loads((CLIENT_WORLD / name).read_text(encoding="utf-8"))


requires_client = pytest.mark.skipif(
    not CLIENT_WORLD.is_dir(),
    reason=f"{CLIENT_WORLD} is not present; the service is testable on its own",
)


# ---------------------------------------------------------------------------
# The deployed copy
# ---------------------------------------------------------------------------

@requires_client
@pytest.mark.parametrize("name", ["region.json", "settlements.json", "network.json"])
def test_the_deployed_file_is_the_wire_build(name: str):
    """Deploy, not hand-editing. A field that differs is a bug in the deploy path."""
    deployed = client_file(name)
    built = wire_file(name)
    # `retrieved` is the one field the deploy tool treats specially, and the carried
    # keys are the client's own enrichments. Everything else must be identical.
    for key in set(built) | set(deployed):
        if key in ("retrieved", *deploy.CARRIED[name]):
            continue
        assert deployed.get(key) == built.get(key), (
            f"{name}: the client's {key!r} is not what `worlddata wire` produces. "
            "Re-run `python tools/deploy-wire-to-client.py`."
        )


@requires_client
def test_the_deployed_region_matches_the_settlements_it_ships():
    """The bug this deploy path exists to prevent, stated as an assertion.

    A `region.json` describing a different region than `settlements.json` places every
    settlement outside the projection, and the map draws nothing useful while every
    individual file still looks valid.
    """
    region = client_file("region.json")
    settlements = client_file("settlements.json")["settlements"]
    assert settlements, "the deployed region has no settlements at all"
    bbox = region["bbox"]
    for s in settlements:
        assert bbox["south"] <= s["lat"] <= bbox["north"], f"{s['name']} is outside the region's latitude"
        assert bbox["west"] <= s["lon"] <= bbox["east"], f"{s['name']} is outside the region's longitude"


@requires_client
def test_the_deployed_region_counts_are_the_v1_counts():
    """487 / 439 / 4,653, pinned against the data rather than against a comment."""
    settlements = client_file("settlements.json")["settlements"]
    network = client_file("network.json")
    assert len(settlements) == 487
    assert len(network["roads"]) == 439
    assert len(network["rail"]) == 4_653


# ---------------------------------------------------------------------------
# The deploy tool's own decisions
# ---------------------------------------------------------------------------

def test_a_retrieved_date_is_carried_across_when_the_region_is_the_same():
    fresh = {"name": "Ohio River Valley", "bbox": {"south": 37.1}, "retrieved": "2026-10-02"}
    existing = dict(fresh, retrieved="2026-09-30")
    merged = deploy.merge("region.json", fresh, existing, [])
    assert merged["retrieved"] == "2026-09-30", (
        "redeploying the same region should keep the date it was actually put in place"
    )


def test_a_retrieved_date_is_refused_across_regions():
    """The Colorado date must not be stamped onto Ohio data.

    `region.json` was once fetched by the client's own script for a different region.
    Carrying that file's `retrieved` forward would state a fetch date for data that was
    not fetched then, which is the kind of plausible-but-wrong record the constitution
    forbids. The region changed, so the date has to change with it.
    """
    fresh = {"name": "Ohio River Valley", "bbox": {"south": 37.1}, "retrieved": "2026-10-02"}
    existing = {"name": "Northern Colorado Front Range", "bbox": {"south": 39.6}, "retrieved": "2026-10-01"}
    notes: list[str] = []
    merged = deploy.merge("region.json", fresh, existing, notes)
    assert merged["retrieved"] == "2026-10-02"
    assert any("different region" in note for note in notes), notes


def test_a_differing_bbox_counts_as_a_different_region():
    """The name alone is not identity. Same name, moved bbox, is different data."""
    fresh = {"name": "Ohio River Valley", "bbox": {"south": 37.1, "north": 40.6}, "retrieved": "2026-10-02"}
    existing = {"name": "Ohio River Valley", "bbox": {"south": 36.0, "north": 41.0}, "retrieved": "2026-09-30"}
    merged = deploy.merge("region.json", fresh, existing, [])
    assert merged["retrieved"] == "2026-10-02"


def test_client_only_enrichments_survive_a_redeploy():
    """`wire_version` and the travel edges are the client's to add, and are kept.

    The wire build does not produce them, so a naive copy would delete them on every
    deploy. They are carried over from the file being replaced, and the keys are listed
    rather than copied wholesale so a key that disappears is reported.
    """
    fresh = {"name": "R", "retrieved": "2026-10-02"}
    existing = dict(fresh, wire_version=2, travelEdges=[{"from": "a", "to": "b"}])
    merged = deploy.merge("network.json", fresh, existing, [])
    assert merged["wire_version"] == 2
    assert merged["travelEdges"] == [{"from": "a", "to": "b"}]


def test_a_missing_enrichment_is_reported_rather_than_invented():
    notes: list[str] = []
    merged = deploy.merge("network.json", {"name": "R"}, None, notes)
    assert "travelEdges" not in merged
    assert any("travelEdges" in note for note in notes), notes


# ---------------------------------------------------------------------------
# The boot tier, which is a boot dependency
# ---------------------------------------------------------------------------

@requires_client
def test_every_boot_tile_named_by_the_deployed_region_is_on_disk():
    """A boot list naming an absent file means the map never draws.

    `loadHeightfield` fetches every tile in `elevation` before it draws anything and
    throws a retryable error on the first missing one rather than drawing a hole. This
    is the check that turns "the tile list and the files disagree" into a failing test.
    """
    region = client_file("region.json")
    boot = region["elevation"]
    missing = [t["path"] for t in boot["tiles"] if not (CLIENT_WORLD / t["path"]).is_file()]
    assert not missing, (
        f"region.json's boot list names {len(missing)} tiles that are not on disk, "
        f"starting with {missing[0]}. The client fails to draw the map on a missing tile. "
        "Fetch the boot tier with `worlddata fetch-elevation --tier boot`."
    )


@requires_client
def test_no_orphaned_elevation_tiles_are_left_behind():
    """A tile for a region the client no longer serves is 8 KB of nothing.

    Two regions' tiles coexisted in this directory at one point. Anything on disk that
    no tier names is residue from a region that is no longer deployed, and it is dead
    weight in the repository.
    """
    region = client_file("region.json")
    wanted = {t["path"] for key in ("elevation", "elevationDetail") if key in region for t in region[key]["tiles"]}
    on_disk = {
        str(path.relative_to(CLIENT_WORLD))
        for path in (CLIENT_WORLD / "elevation").rglob("*.png")
    }
    orphans = sorted(on_disk - wanted)
    assert not orphans, (
        f"{len(orphans)} elevation tiles on disk belong to no tier in region.json, "
        f"starting with {orphans[0]}. They are from a region that is no longer deployed."
    )
