"""Tests for the terrarium tile fetcher (worlddata.elevation).

The client refuses to draw a map with a missing tile - it throws a retryable
`WorldDataError` rather than drawing a hole - so the only acceptable states for a
tier are "all of it on disk" and "none of it, with an error". Anything between is
the failure this module was written to make impossible to miss.

What these check, in the order that matters:

* the tile list comes from the client's own `region.json`, so there is no second
  copy of the tile maths that can disagree with the region the client asks for;
* a tile that is already on disk is not re-downloaded, and `--force` re-downloads
  it anyway;
* a response body that is not a PNG is rejected rather than written, because the
  tile service answers a missing tile with an error page and a 200 status;
* one bad tile is recorded and the rest are still fetched, and the result says so
  instead of exiting clean.

No network access. The downloader is injected, so what is under test is the
decision logic rather than AWS.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from worlddata import elevation
from worlddata.errors import WorldDataError

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200


def region_file(tmp_path: Path, **overrides) -> Path:
    document = {
        "name": "Test Valley",
        "bbox": {"south": 37.0, "west": -86.0, "north": 38.0, "east": -85.0},
        "elevation": {
            "encoding": "terrarium",
            "formula": "elevation_metres = R * 256 + G + B / 256 - 32768",
            "zoom": 10,
            "tileSize": 256,
            "tiles": [
                {"z": 10, "x": 100, "y": 200, "path": "elevation/10/100/200.png"},
                {"z": 10, "x": 101, "y": 200, "path": "elevation/10/101/200.png"},
            ],
        },
        "elevationDetail": {
            "encoding": "terrarium",
            "formula": "elevation_metres = R * 256 + G + B / 256 - 32768",
            "zoom": 12,
            "tileSize": 256,
            "tiles": [
                {"z": 12, "x": 400, "y": 800, "path": "elevation/12/400/800.png"},
            ],
        },
        "retrieved": "2026-09-30",
    }
    document.update(overrides)
    path = tmp_path / "region.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


def recorder(calls: list[str], fail_for: set[str] | None = None):
    """A downloader that records the URLs it was asked for.

    Returns real PNG bytes, because that is the only thing a tile fetch is allowed
    to write. Injecting it keeps the tests off the network while still going
    through `fetch_tiles`' own write, skip and warning paths.
    """

    def download(url: str, timeout: float) -> bytes:
        calls.append(url)
        if fail_for and url in fail_for:
            raise WorldDataError(f"GET {url} -> HTTP 404 Not Found")
        return elevation.validate_tile(url, PNG)

    return download


def test_tiles_land_at_the_path_region_json_names(tmp_path: Path):
    region = region_file(tmp_path)
    calls: list[str] = []
    results = elevation.fetch_tiles(region, tmp_path / "out", ["boot"], download=recorder(calls))

    (result,) = results
    assert result.name == "boot" and result.key == "elevation"
    assert result.listed == 2 and result.fetched == 2 and result.present == 0
    assert (tmp_path / "out" / "elevation/10/100/200.png").read_bytes() == PNG
    assert (tmp_path / "out" / "elevation/10/101/200.png").read_bytes() == PNG
    assert calls == [
        elevation.TERRARIUM_URL_TEMPLATE.format(z=10, x=100, y=200),
        elevation.TERRARIUM_URL_TEMPLATE.format(z=10, x=101, y=200),
    ]


def test_only_the_requested_tier_is_fetched(tmp_path: Path):
    """`boot` must not pull the detail tier, or the whole point is lost.

    The detail tier is 2,236 tiles and about 249 MiB. Fetching it because someone
    asked for the region's terrain would be a slow, silent way to fill a disk.
    """
    region = region_file(tmp_path)
    calls: list[str] = []
    (result,) = elevation.fetch_tiles(region, tmp_path / "out", ["boot"], download=recorder(calls))
    assert result.key == "elevation"
    assert all("/12/" not in url for url in calls)
    assert not (tmp_path / "out" / "elevation/12").exists()

    calls.clear()
    (result,) = elevation.fetch_tiles(region, tmp_path / "out", ["detail"], download=recorder(calls))
    assert result.key == "elevationDetail"
    assert result.zoom == 12
    assert all("/12/" in url for url in calls)
    assert (tmp_path / "out" / "elevation/12/400/800.png").is_file()


def test_both_tiers_can_be_asked_for_at_once(tmp_path: Path):
    region = region_file(tmp_path)
    results = elevation.fetch_tiles(
        region, tmp_path / "out", ["boot", "detail"], download=recorder([])
    )
    assert [(r.name, r.key) for r in results] == [("boot", "elevation"), ("detail", "elevationDetail")]


def test_a_tile_already_on_disk_is_not_re_downloaded(tmp_path: Path):
    region = region_file(tmp_path)
    out = tmp_path / "out"
    (out / "elevation/10/100").mkdir(parents=True)
    (out / "elevation/10/100/200.png").write_bytes(PNG)

    calls: list[str] = []
    (result,) = elevation.fetch_tiles(region, out, ["boot"], download=recorder(calls))
    assert result.present == 1 and result.fetched == 1
    assert len(calls) == 1 and "/101/" in calls[0]

    # A second pass does nothing at all, which is what makes a re-run cheap.
    calls.clear()
    (result,) = elevation.fetch_tiles(region, out, ["boot"], download=recorder(calls))
    assert result.present == 2 and result.fetched == 0
    assert calls == []


def test_force_re_downloads_what_is_there(tmp_path: Path):
    region = region_file(tmp_path)
    out = tmp_path / "out"
    elevation.fetch_tiles(region, out, ["boot"], download=recorder([]))
    calls: list[str] = []
    (result,) = elevation.fetch_tiles(region, out, ["boot"], force=True, download=recorder(calls))
    assert result.fetched == 2 and result.present == 0
    assert len(calls) == 2


def test_a_body_that_is_not_a_png_is_rejected():
    """The tile service returns an error page with a 200 for a missing tile.

    Writing that to disk would produce a file that exists, passes any "is the tile
    there" check, and fails to decode in the browser - the worst possible outcome,
    because the check that should have caught it reports success.
    """
    url = "https://example.invalid/terrarium/10/100/200.png"
    body = b"<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>"
    with pytest.raises(WorldDataError, match="not a PNG") as excinfo:
        elevation.validate_tile(url, body)
    assert "NoSuchKey" in str(excinfo.value), "the error body should be quoted, not just rejected"
    assert elevation.validate_tile(url, PNG) == PNG


def test_a_tile_over_the_size_ceiling_is_rejected():
    """A server answering with something enormous is not a tile either."""
    url = "https://example.invalid/terrarium/10/100/200.png"
    with pytest.raises(WorldDataError, match="ceiling") as excinfo:
        elevation.validate_tile(url, PNG + b"\x00" * (elevation.TILE_MAX_BYTES + 1))
    assert f"{elevation.TILE_MAX_BYTES:,}" in str(excinfo.value)


def test_a_rejected_tile_is_never_written(tmp_path: Path):
    """The check has to happen before the write, not after.

    A file on disk that is not a tile is worse than a missing file: the missing-file
    check can see it and the decode failure happens in the browser.
    """
    region = region_file(tmp_path)
    out = tmp_path / "out"

    def bad_download(url: str, timeout: float) -> bytes:
        return elevation.validate_tile(url, b"<Error>NoSuchKey</Error>")

    # validate_tile raises inside the downloader, which fetch_tiles records as a
    # warning for that tile, so nothing is written for it.
    (result,) = elevation.fetch_tiles(region, out, ["boot"], download=bad_download)
    assert result.fetched == 0
    assert len(result.warnings) == 2
    assert not (out / "elevation/10/100/200.png").exists()
    assert not (out / "elevation/10/101/200.png").exists()


def test_one_bad_tile_is_recorded_and_the_rest_are_still_fetched(tmp_path: Path):
    """One broken coordinate must not cost the other 2,235 tiles.

    The tier is still reported as incomplete - the caller decides, and the CLI
    exits non-zero - but the tiles that could be fetched are on disk rather than
    being lost to a single 404.
    """
    region = region_file(tmp_path)
    bad = elevation.TERRARIUM_URL_TEMPLATE.format(z=10, x=100, y=200)
    (result,) = elevation.fetch_tiles(
        region, tmp_path / "out", ["boot"], download=recorder([], fail_for={bad})
    )
    assert result.fetched == 1 and result.listed == 2
    assert len(result.warnings) == 1
    assert "10/100/200" in result.warnings[0] and "404" in result.warnings[0]
    assert (tmp_path / "out" / "elevation/10/101/200.png").is_file()
    assert not (tmp_path / "out" / "elevation/10/100/200.png").exists()

    # And the note a human reads says which tile, not just that something failed.
    lines = result.log_lines()
    assert any("WARNING" in line and "10/100/200" in line for line in lines)


def test_the_detail_tier_reports_its_size_before_it_is_fetched(tmp_path: Path):
    """2,236 tiles is a decision to make knowingly, not to discover by disk usage."""
    document = json.loads(region_file(tmp_path).read_text())
    document["elevationDetail"]["tiles"] = [
        {"z": 12, "x": 400, "y": 800, "path": f"elevation/12/400/{800 + i}.png"} for i in range(2236)
    ]
    (region_path,) = [tmp_path / "region.json"]
    region_path.write_text(json.dumps(document))

    (result,) = elevation.fetch_tiles(region_path, tmp_path / "out", ["detail"], download=recorder([]))
    text = "\n".join(result.log_lines())
    assert "2236 tiles" in text
    assert "MiB" in text and "fetchable artifact" in text


def test_an_unknown_tier_name_is_refused(tmp_path: Path):
    region = region_file(tmp_path)
    with pytest.raises(WorldDataError, match="unknown tier"):
        elevation.fetch_tiles(region, tmp_path / "out", ["zoom12"], download=recorder([]))


def test_a_region_file_with_no_tiles_for_the_tier_is_an_error(tmp_path: Path):
    """Silently fetching nothing is how a map ends up with no terrain."""
    document = json.loads(region_file(tmp_path).read_text())
    document["elevationDetail"]["tiles"] = []
    (region_path,) = [tmp_path / "region.json"]
    region_path.write_text(json.dumps(document))

    with pytest.raises(WorldDataError, match="names no tiles"):
        elevation.fetch_tiles(region_path, tmp_path / "out", ["detail"], download=recorder([]))


def test_a_missing_or_malformed_region_file_is_refused(tmp_path: Path):
    with pytest.raises(WorldDataError, match="does not exist"):
        elevation.fetch_tiles(tmp_path / "nope.json", tmp_path / "out", ["boot"])

    broken = tmp_path / "broken.json"
    broken.write_text("{not json", encoding="utf-8")
    with pytest.raises(WorldDataError, match="not valid JSON"):
        elevation.fetch_tiles(broken, tmp_path / "out", ["boot"])

    not_a_region = tmp_path / "other.json"
    not_a_region.write_text(json.dumps({"settlements": []}), encoding="utf-8")
    with pytest.raises(WorldDataError, match="not a region file"):
        elevation.fetch_tiles(not_a_region, tmp_path / "out", ["boot"])


def test_a_hand_edited_tile_entry_is_refused(tmp_path: Path):
    """A tile list patched by hand is a tile list nobody can account for."""
    document = json.loads(region_file(tmp_path).read_text())
    document["elevation"]["tiles"].append({"z": 10, "x": 5, "path": "elevation/10/5.png"})
    (region_path,) = [tmp_path / "region.json"]
    region_path.write_text(json.dumps(document))

    with pytest.raises(WorldDataError, match="without z/x/y/path"):
        elevation.fetch_tiles(region_path, tmp_path / "out", ["boot"], download=recorder([]))


def test_tier_tiles_accepts_a_region_with_only_a_boot_tier(tmp_path: Path):
    """`elevationDetail` is optional and the fetcher must not require it."""
    document = json.loads(region_file(tmp_path).read_text())
    del document["elevationDetail"]
    (region_path,) = [tmp_path / "region.json"]
    region_path.write_text(json.dumps(document))

    results = elevation.fetch_tiles(region_path, tmp_path / "out", ["boot", "detail"], download=recorder([]))
    assert [r.name for r in results] == ["boot"]
    with pytest.raises(WorldDataError, match="names no tiles"):
        elevation.fetch_tiles(region_path, tmp_path / "out2", ["detail"], download=recorder([]))
