"""Tests for stage caching (worlddata.cache) and the place-boundary filter guard.

What these check, and why it matters:

* The fingerprint must change when CACHE_FORMAT_VERSION changes: the digest
  covers config bytes and source digests but not code, so the version is the
  only thing standing between a transform fix and a silently reused stale
  cache. On 2026-09-30 a stale boundaries cache held quote-corrupted FIPS and
  the place_boundaries export shipped empty.
* cached() with reuse=True must recompute when the stamp differs (stale cache)
  and reuse only on an exact stamp match.
* restrict_place_boundaries must fail loudly when the loader produced polygons
  but the FIPS filter drops every one -- that join-key disagreement is always
  a bug, never a valid empty result.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from worlddata import cache
from worlddata.cache import cached, fingerprint
from worlddata.errors import WorldDataError
from worlddata.pipeline import restrict_place_boundaries


@dataclass
class _FakeBoundary:
    state_fips: str
    place_fips: str = "00000"


def _sources(tmp_path):
    src = tmp_path / "src.bin"
    src.write_bytes(b"data")
    return {"src": ("2026-01-01", src, "digest123")}


def test_fingerprint_changes_with_format_version(tmp_path):
    cfg = tmp_path / "config.toml"
    cfg.write_bytes(b"[x]\n")
    before = fingerprint(cfg, _sources(tmp_path), "boundaries")
    old = cache.CACHE_FORMAT_VERSION
    cache.CACHE_FORMAT_VERSION = old + 1
    try:
        after = fingerprint(cfg, _sources(tmp_path), "boundaries")
    finally:
        cache.CACHE_FORMAT_VERSION = old
    assert before != after, "bumping CACHE_FORMAT_VERSION must invalidate the cache"


def test_cached_reuses_on_stamp_match(tmp_path):
    calls = []

    def compute():
        calls.append(1)
        return {"v": 1}

    stamp = "fixed-stamp-for-test"
    first, note1 = cached(tmp_path, "s", stamp, compute, reuse=False)
    second, note2 = cached(tmp_path, "s", stamp, compute, reuse=True)
    assert first == second == {"v": 1}
    assert len(calls) == 1, "matching stamp must reuse, not recompute"
    assert "reused" in note2


def test_cached_recomputes_on_stamp_mismatch(tmp_path):
    def compute():
        return {"v": 2}

    (tmp_path / "c.toml").write_bytes(b"")
    cached(tmp_path, "s", "stamp-one", compute, reuse=False)
    result, note = cached(tmp_path, "s", "stamp-two", compute, reuse=True)
    assert result == {"v": 2}
    assert "different inputs" in note


def test_restrict_place_boundaries_keeps_valid_fips():
    rows = [_FakeBoundary("06"), _FakeBoundary("12"), _FakeBoundary("99")]
    kept = restrict_place_boundaries(rows, {"06", "12"})
    assert [b.state_fips for b in kept] == ["06", "12"]


def test_restrict_place_boundaries_empty_in_is_empty_out():
    assert restrict_place_boundaries([], {"06"}) == []


def test_restrict_place_boundaries_raises_when_filter_drops_everything():
    # The 2026-09-30 incident: quoted FIPS from a stale cache matched nothing.
    rows = [_FakeBoundary("'06'"), _FakeBoundary("'12'")]
    with pytest.raises(WorldDataError, match="none survived.*FIPS filter"):
        restrict_place_boundaries(rows, {"06", "12"})
