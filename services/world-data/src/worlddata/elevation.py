"""Fetch the terrarium elevation tiles a `region.json` names.

The wire build writes *which* tiles cover a region. It does not bundle them: at
zoom 12 the V1 Ohio River Valley bbox is 2,236 tiles and about 250 MB, which is
not a thing to check into a repository. So the tiles are a fetchable artifact with
a generator, the same split the export uses for `route_segments`.

What is different from `fetch.py`, which fetches the pipeline's source datasets:

  * the tile lists are read from the client's own `region.json`, so the tiles on
    disk are by construction the ones the client asks for. There is no second
    place to keep the tile maths, and a region that is re-bounded cannot end up
    with tiles for the old bounding box;
  * there is no upstream digest to check against, so a tile is verified by
    decoding it rather than by comparing bytes: a non-PNG response body (an S3
    error page, a captive portal login screen) is rejected rather than written;
  * tiers are addressed by name. `boot` is what the client fetches before it
    draws; `detail` is the full-resolution list for progressive loading. Fetching
    one does not fetch the other, because that is the whole point of having two.

The boot tier is small enough to commit, and is - see the client's DATA-MANIFEST.
The detail tier is not, and is gitignored.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

from .client_wire import TERRARIUM_URL_TEMPLATE
from .errors import WorldDataError

# The 8-byte signature every PNG starts with. The tile service returns a 200 with
# an XML error body for a missing tile, so "the response was fine" is not evidence
# that the tile is fine.
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

# A tile is 256x256. A byte ceiling catches a server that answers with something
# enormous rather than a tile; sampled terrarium tiles run about 30-115 KB.
TILE_MAX_BYTES = 4 * 1024 * 1024

# The region.json keys that hold tile lists, in the order they are fetched.
TIER_KEYS: tuple[str, ...] = ("elevation", "elevationDetail")

# Tiers are addressed by role rather than by key, because the two names people
# use are the two jobs: `boot` is what the client fetches before it draws, and
# `detail` is the full-resolution list for progressive loading. Letting a caller
# pass a zoom instead would make "fetch zoom 12" a way to spend 250 MB.
TIER_BY_NAME: dict[str, str] = {"boot": "elevation", "detail": "elevationDetail"}

# Bytes per tile, used only to size a tier before fetching it rather than after.
# Measured, not guessed, and kept per zoom because a zoom-10 tile covers four
# zoom-12 tiles at the same 256x256 resolution and so compresses smaller: the
# Ohio boot tier averages 51 KB and the detail tier 114 KB, from the tiles this
# repository has actually pulled from the bucket.
SAMPLED_TILE_BYTES_BY_KEY = {"elevation": 51_494, "elevationDetail": 114_201}


@dataclass
class TierResult:
    """What happened for one tier, so a partial fetch is visible."""

    name: str
    key: str
    zoom: int
    listed: int
    fetched: int = 0
    present: int = 0
    bytes_written: int = 0
    warnings: list[str] = field(default_factory=list)

    def log_lines(self) -> list[str]:
        lines = [
            f"elevation: {self.name} tier ({self.key}) is zoom {self.zoom} with {self.listed} tiles; "
            f"{self.fetched} downloaded, {self.present} already on disk, "
            f"{self.bytes_written:,} B written"
        ]
        if self.key == "elevationDetail":
            estimate = self.listed * SAMPLED_TILE_BYTES_BY_KEY[self.key] // (1 << 20)
            lines.append(
                f"elevation: the detail tier is about {estimate} MiB at the sampled tile size. "
                "It is a fetchable artifact, not a committed one."
            )
        lines.extend(f"elevation: WARNING: {w}" for w in self.warnings)
        return lines


def read_region(region_path: Path) -> dict[str, Any]:
    """Load a `region.json`, failing loudly if it is not one."""
    region_path = Path(region_path)
    if not region_path.is_file():
        raise WorldDataError(
            f"{region_path} does not exist. Build the wire files first: python -m worlddata wire"
        )
    try:
        document = json.loads(region_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise WorldDataError(f"{region_path} is not valid JSON ({exc}); regenerate it") from exc
    if not isinstance(document, dict) or "elevation" not in document:
        raise WorldDataError(f"{region_path} has no 'elevation' key, so it is not a region file")
    return document


def tier_tiles(document: dict[str, Any], key: str) -> tuple[int, list[dict[str, Any]]]:
    """(zoom, tiles) for one tier of a region file, validating the shape."""
    tier = document.get(key)
    if not isinstance(tier, dict):
        return (0, [])
    tiles = tier.get("tiles")
    if not isinstance(tiles, list):
        raise WorldDataError(f"region.json's {key!r} has no 'tiles' list")
    zoom = tier.get("zoom")
    if not isinstance(zoom, int):
        raise WorldDataError(f"region.json's {key!r} has no integer 'zoom'")
    for tile in tiles:
        if not isinstance(tile, dict) or not {"z", "x", "y", "path"} <= set(tile):
            raise WorldDataError(
                f"region.json's {key!r} has a tile without z/x/y/path: {tile!r}. "
                "Regenerate the wire files rather than patching the list by hand."
            )
    return zoom, tiles


def validate_tile(url: str, body: bytes) -> bytes:
    """Return ``body`` if it is a plausible tile, or raise saying why it is not.

    Separate from the HTTP call so the check is testable on its own and so the
    rule lives in one place. The service answers a missing tile with an XML error
    document and a 200 status, so "the request succeeded" says nothing about
    whether the bytes are a tile - and a file that exists but is an error page
    passes every "is the tile on disk" check and fails in the browser.
    """
    if not body.startswith(PNG_SIGNATURE):
        head = body[:80].decode("utf-8", "replace").replace("\n", " ")
        raise WorldDataError(
            f"{url} returned {len(body):,} bytes that are not a PNG (starts {head!r}). "
            "The tile service answers a missing tile with an error page and a 200 status."
        )
    if len(body) > TILE_MAX_BYTES:
        raise WorldDataError(f"{url} returned {len(body):,} bytes, over the {TILE_MAX_BYTES:,} ceiling")
    return body


def _download(url: str, timeout: float) -> bytes:
    """Fetch one tile and refuse anything that is not a small PNG."""
    import requests

    try:
        response = requests.get(url, timeout=timeout)
    except requests.RequestException as exc:
        raise WorldDataError(f"GET {url} failed: {type(exc).__name__}: {exc}") from exc
    if not response.ok:
        raise WorldDataError(f"GET {url} -> HTTP {response.status_code} {response.reason}")
    return validate_tile(url, response.content)


def fetch_tiles(
    region_path: Path,
    out_dir: Path,
    tiers: Iterable[str] = ("boot",),
    *,
    timeout: float = 60.0,
    force: bool = False,
    download: Callable[[str, float], bytes] | None = None,
) -> list[TierResult]:
    """Download the tiles ``region_path`` names for each requested tier.

    ``tiers`` names the tiers, not the zooms: ``"boot"`` is the list the client
    fetches at startup and ``"detail"`` is the full-resolution list. Naming the
    zoom here instead would let a caller silently fetch 2,236 tiles by passing
    ``12`` and wondering where the disk went.

    ``download`` is injectable so the tests exercise the decision logic (which
    tier, which path, skip what is already there) without touching the network.
    """
    document = read_region(region_path)
    out_dir = Path(out_dir)
    get = download or _download
    results: list[TierResult] = []

    for tier in tiers:
        if tier not in TIER_BY_NAME:
            raise WorldDataError(f"unknown tier {tier!r}; tiers are {sorted(TIER_BY_NAME)}")
        key = TIER_BY_NAME[tier]
        zoom, tiles = tier_tiles(document, key)
        if not tiles:
            continue
        result = TierResult(name=tier, key=key, zoom=zoom, listed=len(tiles))
        for tile in tiles:
            target = out_dir / tile["path"]
            if target.is_file() and not force:
                result.present += 1
                continue
            try:
                body = get(TERRARIUM_URL_TEMPLATE.format(z=tile["z"], x=tile["x"], y=tile["y"]), timeout)
            except WorldDataError as exc:
                # One bad tile must not leave a half-populated tier with a success
                # message. Record it and keep going so one broken coordinate does
                # not cost the other 2,235 tiles, then let the caller decide.
                result.warnings.append(f"tile {tile['z']}/{tile['x']}/{tile['y']}: {exc}")
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)
            result.fetched += 1
            result.bytes_written += len(body)
        results.append(result)

    if not results:
        raise WorldDataError(
            f"{region_path} names no tiles for tier(s) {list(tiers)}; regenerate the wire files"
        )
    return results
