"""Multi-region deployments: the index, and every region it lists.

`clients/campaign/public/world/` used to hold exactly one region — four wire files and an
elevation tree at the root of the directory — so the client had no way to ask for anything
else and no way to know that anything else existed. A second region changes the layout: each
region gets its own subdirectory, and `regions.json` lists them.

That arrangement has one failure mode worth a test, and it is the one the client cannot
detect on its own. A region listed but not deployed 404s at `loadWorldData`, which *is*
loud. The dangerous direction is a region that is deployed but internally inconsistent —
a `region.json` describing a different box than the settlements beside it, a boot tile list
naming files that are not on disk, a `boundaries.json` covering a different set of places —
because each of those files is individually valid, the map draws, and the result is real
terrain with towns projected onto the wrong coordinates.

So these tests walk the index rather than a hardcoded path. That has a second purpose: it
means a *third* region is covered the moment it is listed, without anyone remembering to
extend a test, and it means the default Ohio region is re-checked by the same assertions
as the new one rather than falling out of coverage the moment a second region exists.

Nothing here needs a network, and nothing needs the 53 MB `dist/` files: it reads what was
deployed.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest

REPO = Path(__file__).resolve().parents[3]
SERVICE = REPO / "services" / "world-data"
CLIENT_WORLD = REPO / "clients" / "campaign" / "public" / "world"
INDEX = CLIENT_WORLD / "regions.json"
CONFIG = SERVICE / "config" / "world_data.toml"

requires_client = pytest.mark.skipif(
    not CLIENT_WORLD.is_dir(),
    reason=f"{CLIENT_WORLD} is not present; the service is testable on its own",
)


def load_index() -> dict[str, Any]:
    return json.loads(INDEX.read_text(encoding="utf-8"))


def region_dir(entry: dict[str, Any]) -> Path:
    """The directory one index entry's files live in.

    Resolved the way the client resolves it: `path` is relative to `public/world/` and ends
    in a slash, so joining it onto the world root must stay inside that root. A `path` that
    escaped it would be an index writing the client out of its own directory, which is why
    the containment assertion below is part of resolving rather than a separate check.
    """
    root = CLIENT_WORLD.resolve()
    resolved = (root / entry["path"]).resolve()
    assert resolved == root or root in resolved.parents, (
        f"region {entry['id']!r} has path {entry['path']!r}, which resolves to {resolved}, "
        f"outside {root}"
    )
    return resolved


def wire(entry: dict[str, Any], name: str) -> dict[str, Any]:
    return json.loads((region_dir(entry) / name).read_text(encoding="utf-8"))


# The index itself. `regions()` below is what the per-region tests are parameterised on, so
# a failure names the region rather than "the second one".
def regions() -> list[dict[str, Any]]:
    return load_index()["regions"]


REGION_IDS = [entry["id"] for entry in load_index()["regions"]] if INDEX.is_file() else []


# ---------------------------------------------------------------------------
# The index
# ---------------------------------------------------------------------------

@requires_client
def test_the_index_names_a_default_it_also_lists():
    """A default that is not in `regions` is a region the client will not find."""
    index = load_index()
    listed = {entry["id"] for entry in index["regions"]}
    assert index["default"] in listed, (
        f"regions.json names {index['default']!r} as the default but lists only {sorted(listed)}. "
        "The client falls back to this id, so it has to be resolvable."
    )


@requires_client
def test_every_index_entry_points_at_a_directory_that_exists():
    """A listed region whose files are absent is a 404 the player meets at boot."""
    for entry in regions():
        directory = region_dir(entry)
        missing = [
            name
            for name in ("region.json", "settlements.json", "network.json")
            if not (directory / name).is_file()
        ]
        assert not missing, (
            f"regions.json lists region {entry['id']!r} but {directory} has no {missing}. "
            "The client would offer a region that cannot load. Build it with "
            "`python -m worlddata wire --region <id>` and deploy it."
        )


@requires_client
def test_the_index_counts_are_the_counts_the_files_hold():
    """The index is generated from the files, so this is the check that it still is.

    A hand-edited count here would put a wrong number in front of a player choosing a
    region, and nothing downstream would notice: `loadWorldData` reads the files, never the
    index.
    """
    for entry in regions():
        settlements = wire(entry, "settlements.json")["settlements"]
        network = wire(entry, "network.json")
        region = wire(entry, "region.json")
        assert entry["settlements"] == len(settlements), (
            f"regions.json says region {entry['id']!r} has {entry['settlements']} settlements; "
            f"settlements.json has {len(settlements)}"
        )
        assert entry["roads"] == len(network["roads"]), (
            f"regions.json says region {entry['id']!r} has {entry['roads']} roads; "
            f"network.json has {len(network['roads'])}"
        )
        assert entry["rail"] == len(network["rail"]), (
            f"regions.json says region {entry['id']!r} has {entry['rail']} rail segments; "
            f"network.json has {len(network['rail'])}"
        )
        assert entry["bootTiles"] == len(region["elevation"]["tiles"]), (
            f"regions.json says region {entry['id']!r} has {entry['bootTiles']} boot tiles; "
            f"region.json lists {len(region['elevation']['tiles'])}"
        )
        assert entry["bootZoom"] == region["elevation"]["zoom"], (
            f"regions.json says region {entry['id']!r} boots at zoom {entry['bootZoom']}; "
            f"region.json says {region['elevation']['zoom']}"
        )


@requires_client
def test_the_default_region_is_the_flat_one_and_named_ones_are_subdirectories():
    """Two regions cannot both be the root of `public/world/`.

    The default's files sit at the root because that is where the client loaded from before
    there was more than one region, and every existing deployment, test and `?city=` demo
    URL points there. A named region gets a subdirectory of its own id.
    """
    index = load_index()
    default = next(e for e in index["regions"] if e["id"] == index["default"])
    assert default["path"] == "./", (
        f"the default region's path is {default['path']!r}; it must be './' so the client's "
        "default base URL is unchanged by any of this"
    )
    for entry in index["regions"]:
        assert entry["path"] == "./" if entry["id"] == index["default"] else f"./{entry['id']}/", (
            f"region {entry['id']!r} has path {entry['path']!r}; a named region must be './<id>/'"
        )


@requires_client
def test_no_region_directory_is_orphaned_from_the_index():
    """A deployed region nobody is told about is data that cannot be selected.

    The reverse of the 404 case, and the one that costs a pipeline run's worth of work
    silently: the region builds, deploys, and the index never mentions it.
    """
    listed = {entry["id"] for entry in regions()}
    # Directories under public/world that hold a region.json. `elevation/` and `tiles/` are
    # the default region's asset trees, not regions, so they are not candidates.
    found = {
        path.name for path in CLIENT_WORLD.iterdir() if path.is_dir() and (path / "region.json").is_file()
    }
    orphans = found - listed
    assert not orphans, (
        f"{sorted(orphans)} {'is' if len(orphans) == 1 else 'are'} deployed under "
        f"{CLIENT_WORLD} but absent from regions.json, so no player can select "
        f"{'it' if len(orphans) == 1 else 'them'}. Re-run tools/build-region-index.py."
    )


# ---------------------------------------------------------------------------
# Per region
# ---------------------------------------------------------------------------

@requires_client
@pytest.mark.parametrize("entry", regions(), ids=REGION_IDS)
def test_the_region_file_names_the_region_the_index_lists(entry: dict[str, Any]):
    """`region.json` says which region it is, and it must be the one the index claims.

    Without this the client would load a directory believing it held one region and get
    another: both sets of files are individually valid, and the failure surfaces as towns
    drawn in the wrong place rather than as an error.

    Identity is checked by `regionId` where the file carries one, and by name plus bbox
    where it does not. That split is not a loophole: `regionId` only exists in files written
    since regions became selectable, and `tools/deploy-wire-to-client.py` treats exactly
    `(name, bbox)` as a region file's identity for the same reason — the two together are
    what "which region is this" means, and requiring the newer field of the older file would
    mean redeploying the default region to test anything about the second one.
    """
    region = wire(entry, "region.json")
    assert region["name"] == entry["name"], (
        f"region.json names {region['name']!r} where regions.json names {entry['name']!r}"
    )
    assert region["bbox"] == entry["bbox"], (
        f"region.json's bbox for {entry['id']!r} does not match the one in regions.json"
    )
    declared = region.get("regionId")
    if declared is not None:
        assert declared == entry["id"], (
            f"region.json in {region_dir(entry)} declares regionId {declared!r} but "
            f"regions.json lists it as {entry['id']!r}. The directory and the index disagree "
            "about which region this is."
        )


@requires_client
@pytest.mark.parametrize("entry", regions(), ids=REGION_IDS)
def test_every_settlement_is_inside_its_own_region(entry: dict[str, Any]):
    """The projection bug, stated once: a settlement outside the bbox is drawn off-map.

    `makeProjection` maps the whole world into the region's box, so a settlement half a
    degree outside lands in the terrain or in the sea rather than failing. This is the check
    that a region change did not leave the other region's settlements behind.
    """
    bbox = wire(entry, "region.json")["bbox"]
    settlements = wire(entry, "settlements.json")["settlements"]
    assert settlements, f"region {entry['id']!r} ships no settlements at all"
    outside = [
        s["name"]
        for s in settlements
        if not (bbox["south"] <= s["lat"] <= bbox["north"] and bbox["west"] <= s["lon"] <= bbox["east"])
    ]
    assert not outside, (
        f"region {entry['id']!r} ships {len(outside)} settlements outside its own bbox, "
        f"starting with {outside[0]}. They would be projected into the wrong part of the map."
    )


@requires_client
@pytest.mark.parametrize("entry", regions(), ids=REGION_IDS)
def test_every_boot_tile_the_region_names_is_on_disk(entry: dict[str, Any]):
    """A boot list naming absent files means the map never draws.

    `loadHeightfield` fetches every boot tile before it draws anything and throws on the
    first one it cannot get, so this is the check that turns "the index and the disk
    disagree" into a failing test rather than a boot-time error.
    """
    directory = region_dir(entry)
    boot = wire(entry, "region.json")["elevation"]
    missing = [t["path"] for t in boot["tiles"] if not (directory / t["path"]).is_file()]
    assert not missing, (
        f"region {entry['id']!r} names {len(missing)} boot tiles that are not on disk under "
        f"{directory}, starting with {missing[0]}. Fetch them with "
        "`worlddata fetch-elevation --region <region.json> --out <dir> --tier boot`."
    )


@requires_client
@pytest.mark.parametrize("entry", regions(), ids=REGION_IDS)
def test_no_orphaned_elevation_tiles_are_left_in_a_region(entry: dict[str, Any]):
    """A tile no tier names is residue from a region that is no longer deployed."""
    directory = region_dir(entry)
    region = wire(entry, "region.json")
    wanted = {
        t["path"] for key in ("elevation", "elevationDetail") if key in region for t in region[key]["tiles"]
    }
    on_disk = {str(path.relative_to(directory)) for path in (directory / "elevation").rglob("*.png")}
    orphans = sorted(on_disk - wanted)
    assert not orphans, (
        f"region {entry['id']!r} has {len(orphans)} elevation tiles on disk that no tier names, "
        f"starting with {orphans[0]}."
    )


@requires_client
@pytest.mark.parametrize("entry", regions(), ids=REGION_IDS)
def test_the_two_elevation_tiers_do_not_collide(entry: dict[str, Any]):
    """The tiers are separate directories by zoom, which is the only thing keeping them apart.

    At the same zoom the detail list and the boot list would name the same paths, so a
    detail fetch would overwrite the boot tier in the browser's cache with a list it cannot
    tell apart.
    """
    region = wire(entry, "region.json")
    boot_zoom = region["elevation"]["zoom"]
    detail = region.get("elevationDetail")
    assert detail is not None, f"region {entry['id']!r} has no detail tier"
    assert detail["zoom"] > boot_zoom, (
        f"region {entry['id']!r} boots at zoom {boot_zoom} and details at {detail['zoom']}; "
        "they must differ or the two tiers share one directory"
    )
    boot_paths = {t["path"] for t in region["elevation"]["tiles"]}
    detail_paths = {t["path"] for t in detail["tiles"]}
    assert not (boot_paths & detail_paths), (
        f"region {entry['id']!r} has {len(boot_paths & detail_paths)} tile paths in both tiers"
    )


@requires_client
@pytest.mark.parametrize("entry", regions(), ids=REGION_IDS)
def test_the_boundaries_file_covers_exactly_this_region_settlements(entry: dict[str, Any]):
    """Outlines and towns must describe the same set of places.

    `loadWorldData` refuses a boundary naming a settlement it does not ship, so this is the
    check that the mismatch never gets that far — and it is the failure a region change
    causes most easily, by rebuilding one of the two files and not the other.
    """
    directory = region_dir(entry)
    if not (directory / "boundaries.json").is_file():
        pytest.skip(f"region {entry['id']!r} has no boundaries.json; a region predating it is legal")
    settlements = {str(s["osmId"]) for s in wire(entry, "settlements.json")["settlements"]}
    boundaries = wire(entry, "boundaries.json")["boundaries"]
    keys = [str(b["placeKey"]) for b in boundaries]
    assert len(keys) == len(set(keys)), f"region {entry['id']!r} has duplicate boundary keys"
    assert set(keys) == settlements, (
        f"region {entry['id']!r} has boundaries for {len(set(keys))} places but ships "
        f"{len(settlements)} settlements; missing {sorted(settlements - set(keys))[:3]}, "
        f"unexpected {sorted(set(keys) - settlements)[:3]}"
    )


@requires_client
@pytest.mark.parametrize("entry", regions(), ids=REGION_IDS)
def test_no_wire_file_carries_a_wire_version_the_client_would_refuse(entry: dict[str, Any]):
    """A stamp, where there is one, must be the revision this pipeline writes.

    `loadWorldData` refuses a `wire_version` it does not recognise and reads an absent one as
    an honest "this file makes no version claim". So the two failures are different, and only
    one of them is a wrong number: a *future* stamp means the client would refuse the file,
    and a *lower* one means the deploy tool's carry-forward was bypassed. Both are checked by
    equality rather than by direction, because a stamp of any other value is equally unreadable
    or equally a bypass.

    A named region is required to be stamped on all four files, since it was written after the
    wire build learned to stamp them. The default region predates that and ships two files
    unstamped — `region.json` and `boundaries.json` — which DATA-MANIFEST.md section 5 records
    as the open item; it is not asserted here, because closing it means redeploying the region
    this task is required to leave alone.
    """
    directory = region_dir(entry)
    sys.path.insert(0, str(SERVICE / "src"))
    from worlddata.client_wire import WIRE_VERSION  # noqa: PLC0415
    from worlddata.config import load_config  # noqa: PLC0415

    is_named = entry["id"] != load_config(CONFIG).region(None).region_id

    for name in ("region.json", "settlements.json", "network.json", "boundaries.json"):
        path = directory / name
        if not path.is_file():
            if is_named:
                pytest.fail(f"region {entry['id']!r} has no {name}")
            pytest.skip(f"region {entry['id']!r} has no {name}")
        stamp = wire(entry, name).get("wire_version")
        assert stamp in (None, WIRE_VERSION), (
            f"region {entry['id']!r}: {name} carries wire_version {stamp!r}, not {WIRE_VERSION}. "
            "The client refuses a stamp it does not recognise, so this file would be unreadable."
        )
        if is_named:
            assert stamp == WIRE_VERSION, (
                f"region {entry['id']!r}: {name} carries no wire_version. It was written after "
                "the wire build learned to stamp all four files, so an unstamped one here is a "
                "regression rather than the default region's pre-existing gap."
            )


@requires_client
@pytest.mark.parametrize("entry", regions(), ids=REGION_IDS)
def test_every_road_and_rail_way_has_usable_geometry(entry: dict[str, Any]):
    """The render geometry, checked for the two ways it can be unusable.

    A way with fewer than two coordinates cannot be drawn, and a road whose class is outside
    the client's `RoadClass` union is dropped by `loadWorldData` — silently, because the
    loader treats the class list as a guard rather than a filter.
    """
    network = wire(entry, "network.json")
    known = {"motorway", "trunk", "primary", "secondary"}
    for kind in ("roads", "rail"):
        ways = network[kind]
        assert ways, f"region {entry['id']!r} has no {kind} at all"
        thin = [w["osmId"] for w in ways if len(w.get("coords") or []) < 2]
        assert not thin, (
            f"region {entry['id']!r} has {len(thin)} {kind} with fewer than two coordinates, "
            f"starting with {thin[0]}"
        )
    unclassified = [w["osmId"] for w in network["roads"] if w.get("highway") not in known]
    assert not unclassified, (
        f"region {entry['id']!r} has {len(unclassified)} roads whose class is outside the "
        f"client's RoadClass union {sorted(known)}, starting with {unclassified[0]}. "
        "`loadWorldData` drops those, so they would be on disk and not on the map."
    )


@requires_client
@pytest.mark.parametrize("entry", regions(), ids=REGION_IDS)
def test_settlement_populations_are_real_census_figures(entry: dict[str, Any]):
    """Every population carries its Census citation and is above the pipeline's minimum.

    The pipeline keeps places at or above `classification.min_population` (500) and cites the
    Vintage 2023 sub-county estimates file. A zero or a missing citation would be a real
    number replaced by nothing, which is what CONSTITUTION.md section 1.1 forbids.
    """
    for settlement in wire(entry, "settlements.json")["settlements"]:
        assert settlement["population"] >= 500, (
            f"region {entry['id']!r} ships {settlement['name']!r} with population "
            f"{settlement['population']}, below the configured 500-person minimum"
        )
        assert "Census" in (settlement.get("populationSource") or ""), (
            f"region {entry['id']!r}: {settlement['name']!r} has no Census population citation"
        )
        assert settlement.get("populationCensusName"), (
            f"region {entry['id']!r}: {settlement['name']!r} lost its Census place name"
        )


# ---------------------------------------------------------------------------
# The config side: a region exists because the config declares it
# ---------------------------------------------------------------------------

def test_every_region_the_index_lists_is_declared_in_the_config():
    """The index is built from the config, so a listed region must be a declared one.

    This is what stops the index and the config drifting: an id in `regions.json` that no
    `[regions.<id>]` table backs would be a region nobody can rebuild.
    """
    sys.path.insert(0, str(SERVICE / "src"))
    from worlddata.config import load_config  # noqa: PLC0415

    config = load_config(CONFIG)
    declared = {spec.region_id for spec in config.regions}
    listed = {entry["id"] for entry in load_index()["regions"]}
    undeclared = listed - declared - {config.region(None).region_id}
    assert not undeclared, (
        f"regions.json lists {sorted(undeclared)} but config/world_data.toml declares no "
        f"[regions.{undeclared and sorted(undeclared)[0]}] table for them"
    )