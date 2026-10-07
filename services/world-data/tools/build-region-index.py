#!/usr/bin/env python3
"""Write the client's region index: public/world/regions.json.

The campaign client loads exactly one region at a time, and until this file existed it
loaded the one in `public/world/region.json` because that was the only place the wire
files could live. A second region does not fit that shape - two regions cannot both be
the root directory - so each region gets its own subdirectory and this index says which
subdirectories exist.

It is generated rather than hand-written, because the one failure that matters here is a
region that is listed but not deployed, or deployed but not listed: either way the client
offers a region whose files 404, or hides a region somebody spent a pipeline run
producing. So the entries are read back out of each region's own `region.json`, and a
region with no `region.json` is reported rather than listed.

The counts are read from the same files rather than recomputed, so an entry cannot claim
a settlement count that `settlements.json` does not have.

Usage:

    python tools/build-region-index.py                       # config -> client index
    python tools/build-region-index.py --wire exports/wire   # where the wire builds are
    python tools/build-region-index.py --check               # report drift, write nothing
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[3]
SERVICE = REPO / "services" / "world-data"
sys.path.insert(0, str(SERVICE / "src"))

from worlddata.client_wire import WIRE_VERSION  # noqa: E402
from worlddata.config import DEFAULT_REGION_ID, load_config  # noqa: E402

WIRE = SERVICE / "exports" / "wire"
CONFIG = SERVICE / "config" / "world_data.toml"
CLIENT_WORLD = REPO / "clients" / "campaign" / "public" / "world"

SOURCE = "services/world-data wire build"


def summarise(region_id: str, wire_dir: Path) -> dict[str, Any] | None:
    """One index entry, read from a region's own wire files. None if it is not built.

    Every number here comes out of the file it describes. `settlements` is the length of
    the array `settlements.json` actually holds rather than a count the pipeline logged
    and then changed, because the client's first failure mode on a bad region is a
    `region.json` that describes more world than the files beside it contain.
    """
    region_path = wire_dir / "region.json"
    if not region_path.is_file():
        return None
    region = json.loads(region_path.read_text(encoding="utf-8"))
    settlements_path = wire_dir / "settlements.json"
    network_path = wire_dir / "network.json"
    settlements = json.loads(settlements_path.read_text(encoding="utf-8"))["settlements"]
    network = json.loads(network_path.read_text(encoding="utf-8"))
    boot = region["elevation"]
    return {
        "id": region_id,
        "name": region["name"],
        # Relative to `public/world/`, with a trailing slash: the default region's files sit
        # at the root of that directory and a named region's in a subdirectory of it. The
        # client resolves this against its world base URL, so the same entry works whichever
        # base URL the deployment used.
        "path": "./" if region_id == DEFAULT_REGION_ID else f"./{region_id}/",
        "bbox": region["bbox"],
        "stateCoverage": region.get("stateCoverage", {}).get("region"),
        "settlements": len(settlements),
        "roads": len(network.get("roads", [])),
        "rail": len(network.get("rail", [])),
        "bootZoom": boot["zoom"],
        "bootTiles": len(boot.get("tiles", [])),
        "retrieved": region.get("retrieved"),
        "wireVersion": region.get("wire_version", WIRE_VERSION),
    }


def build(wire: Path) -> dict[str, Any]:
    """The whole index. The default region first, then named regions in id order.

    Default first because it is what the client loads when it is not told otherwise, and
    sorting named regions by id means adding one does not reorder the others.
    """
    config = load_config(CONFIG)
    entries: list[dict[str, Any]] = []
    missing: list[str] = []

    default = summarise(DEFAULT_REGION_ID, wire)
    if default is None:
        missing.append(f"{DEFAULT_REGION_ID} ({wire / 'region.json'})")
    else:
        entries.append(default)

    for spec in sorted(config.regions, key=lambda item: item.region_id):
        entry = summarise(spec.region_id, wire / spec.region_id)
        if entry is None:
            missing.append(f"{spec.region_id} ({wire / spec.region_id / 'region.json'})")
            continue
        entries.append(entry)

    if missing:
        raise SystemExit(
            "region-index: no wire build for: "
            + ", ".join(missing)
            + ". Build it with `python -m worlddata wire --region <id> --out "
            + str(wire / "<id>")
            + "` before writing an index, so the client is never offered a region that 404s."
        )
    if not entries:
        raise SystemExit(f"region-index: no regions found under {wire}")

    return {
        "source": SOURCE,
        # The id the client falls back to. Named explicitly rather than implied by array
        # order, so a client that reads this cannot pick the wrong region by sorting.
        "default": DEFAULT_REGION_ID,
        "note": (
            "One entry per deployed region, read out of each region's own region.json and "
            "settlements.json/network.json. `path` is relative to this directory and ends in a "
            "slash. A region that is not listed here is not deployed, and asking the client "
            "for one that is listed but absent is the failure this file is built to prevent."
        ),
        "regions": entries,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--wire", type=Path, default=WIRE, help="dir holding the wire builds")
    parser.add_argument(
        "--out", type=Path, default=CLIENT_WORLD / "regions.json", help="index file to write"
    )
    parser.add_argument("--check", action="store_true", help="report drift, write nothing")
    arguments = parser.parse_args()

    payload = build(arguments.wire)
    for entry in payload["regions"]:
        print(
            f"region-index: {entry['id']:12} {entry['settlements']:>5} settlements, "
            f"{entry['roads']:>5} roads, {entry['rail']:>5} rail, "
            f"{entry['bootTiles']:>4} boot tiles at z{entry['bootZoom']} -> {entry['path']}"
        )

    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n"
    target = arguments.out
    if arguments.check:
        current = target.read_text(encoding="utf-8") if target.is_file() else None
        verdict = "unchanged" if current == text else f"{target} would be rewritten"
        print(f"region-index: --check, {verdict}")
        return 0 if current == text else 1

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    print(f"region-index: wrote {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())