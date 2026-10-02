#!/usr/bin/env python3
"""Deploy the pipeline's wire files into the campaign client's public/world/.

The client reads exactly three files out of `clients/campaign/public/world/`, and
those files were once fetched by the client's own `tools/fetch-world-data.mjs`
against a different region entirely (the Northern Colorado Front Range). Since
the Ohio River Valley wire build landed, both regions have been in the same
directory at different times and nothing recorded which is current - the symptom
being a `region.json` that names 2,236 zoom-12 elevation tiles of which 668 are
on disk, so the map fails to draw.

This script makes the deployment a step rather than a copy-paste, and it copies
the three files across unchanged. What it will not do is quietly drop the fields
that only the client has:

  * `wire_version`, added by `build-territories.py` alongside `territories.json`;
  * `network.json`'s `travelEdges` and `travelEdgesMeta`, added by
    `build-wire-travel-edges.py`.

Those are carried over from the file being replaced, and reported, so the result
is byte-comparable to `services/world-data/exports/wire/` plus a known set of
known enrichments rather than a fourth variant nobody can account for.

Usage:

    python tools/deploy-wire-to-client.py                 # wire -> client
    python tools/deploy-wire-to-client.py --check         # report drift, write nothing
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SERVICE = REPO / "services" / "world-data"
WIRE = SERVICE / "exports" / "wire"
CLIENT_WORLD = REPO / "clients" / "campaign" / "public" / "world"

FILES = ("region.json", "settlements.json", "network.json")

# Keys the client's copies carry that the wire build does not produce, and where
# they come from. Listed rather than copied wholesale so a key that disappears
# from the client copy is reported instead of being carried forward forever.
CARRIED = {
    "region.json": ("wire_version",),
    "settlements.json": ("wire_version",),
    "network.json": ("wire_version", "travelEdges", "travelEdgesMeta"),
}

# The wire build stamps `retrieved` with today's date, because it does not know
# when a human last deployed. The client's copy keeps the date the deployed data
# was actually put in place, which is the one a player is told.
#
# But only when the client's copy is the *same* region. The date on the file being
# replaced describes when that data was fetched, and the file being replaced is not
# always the same data: `region.json` was once fetched by the client's own script
# for the Northern Colorado Front Range, so carrying its 2026-10-01 date onto the
# Ohio River Valley region would state a retrieval date for data that was not
# retrieved then. So the existing date is kept only when the identity fields match,
# and the wire build's own date is used when they do not.
KEEP_RETRIEVED = True

# Per file, the keys that say *which* data this is. All of them must be equal for the
# existing `retrieved` date to be carried forward.
IDENTITY = {
    "region.json": ("name", "bbox"),
    "settlements.json": ("source",),
    "network.json": ("source",),
}


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def same_data(name: str, fresh: dict, existing: dict | None) -> bool:
    """True when the client's copy describes the same data as the wire build's.

    Compares the identity keys only, not the whole file: the whole file is expected
    to differ, that is the point of deploying.
    """
    if existing is None:
        return False
    return all(existing.get(key) == fresh.get(key) for key in IDENTITY[name])


def merge(name: str, fresh: dict, existing: dict | None, notes: list[str]) -> dict:
    merged = dict(fresh)
    for key in CARRIED[name]:
        if existing is not None and key in existing:
            merged[key] = existing[key]
        else:
            notes.append(f"{name}: no {key} in the client's copy, so the deployed file will not have it")
    if KEEP_RETRIEVED and existing is not None and "retrieved" in existing:
        if same_data(name, fresh, existing):
            merged["retrieved"] = existing["retrieved"]
        else:
            notes.append(
                f"{name}: the client's copy is a different region, so its retrieved date "
                f"({existing['retrieved']}) is not carried over; using the wire build's "
                f"({fresh.get('retrieved')})"
            )
    return merged


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--wire", type=Path, default=WIRE, help="wire build to deploy (default: exports/wire)")
    parser.add_argument("--client", type=Path, default=CLIENT_WORLD, help="client data dir")
    parser.add_argument("--check", action="store_true", help="report what would change and write nothing")
    args = parser.parse_args()

    notes: list[str] = []
    changed: list[str] = []
    payloads: dict[str, dict] = {}

    for name in FILES:
        source = args.wire / name
        if not source.is_file():
            print(f"deploy: {source} does not exist; run `python -m worlddata wire --out {args.wire}` first")
            return 1
        target = args.client / name
        fresh = load(source)
        existing = load(target) if target.is_file() else None
        merged = merge(name, fresh, existing, notes)
        payloads[name] = merged
        if existing != merged:
            changed.append(name)
        print(f"deploy: {name:18} {len(merged.get('elevation', {}).get('tiles', [])) or '':>6} "
              f"{'would change' if name in changed else 'unchanged'}")

    for note in notes:
        print(f"deploy: NOTE: {note}", file=sys.stderr)

    if args.check:
        print("deploy: --check, nothing written")
        return 1 if changed else 0

    for name, payload in payloads.items():
        (args.client / name).write_text(
            json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n", encoding="utf-8"
        )
    print(f"deploy: wrote {len(payloads)} files to {args.client}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
