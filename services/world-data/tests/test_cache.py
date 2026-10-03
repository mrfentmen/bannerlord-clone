"""Tests for the stage cache and its invalidation rules.

The cache exists so a re-run does not repeat the two expensive stages: the
boundaries stage reads 32,000 real place polygons and the routes stage reads
137,000 real polylines. A cache that cannot be trusted is worse than no cache,
because it is quiet. So these tests check three separate things:

* **Invalidation.** Changing the config, changing a source file's digest, or
  editing a transform module must all produce a different fingerprint. If any of
  them did not, a re-run would serve a stale answer with no warning.
* **Recovery.** A cache file that cannot be read - truncated by a killed
  process, or written by different code - must be recomputed *and replaced*, so
  the next run is fast again. A cache that reports "the cache will be rewritten"
  without rewriting it is a lie in the run diagnostics, and it costs the most
  expensive stages on every subsequent run.
* **Honesty of the note.** The string that goes into the run record says what
  actually happened.
"""

from __future__ import annotations

import pickle
from pathlib import Path

import pytest

from worlddata import cache as stage_cache
from worlddata.errors import WorldDataError


def sources(tmp_path: Path, **overrides) -> dict[str, tuple[str, Path, str]]:
    """A ``retrieved`` map shaped like the one the pipeline's fetch stage builds."""
    a = tmp_path / "a.bin"
    b = tmp_path / "b.bin"
    a.write_bytes(b"alpha")
    b.write_bytes(b"beta")
    base = {
        "census_place_boundaries": ("2026-09-30", a, "a" * 64),
        "census_rails": ("2026-09-30", b, "b" * 64),
    }
    base.update(overrides)
    return base


def transform_module(tmp_path: Path, name: str = "roads.py", body: str = "def load_routes(): ...\n") -> Path:
    """A stand-in for a transform module, so a code hash can be tested for real."""
    module = tmp_path / name
    module.write_text(body)
    return module


# --------------------------------------------------------------------------
# Invalidation
# --------------------------------------------------------------------------

def test_fingerprint_is_stable_for_the_same_inputs(tmp_path):
    config = tmp_path / "world_data.toml"
    config.write_text("census_year = 2020\n")
    first = stage_cache.fingerprint(config, sources(tmp_path), "boundaries")
    second = stage_cache.fingerprint(config, sources(tmp_path), "boundaries")
    assert first == second


def test_editing_the_config_invalidates_the_cache(tmp_path):
    config = tmp_path / "world_data.toml"
    config.write_text("min_population = 500\n")
    before = stage_cache.fingerprint(config, sources(tmp_path), "boundaries")
    config.write_text("min_population = 5000\n")
    after = stage_cache.fingerprint(config, sources(tmp_path), "boundaries")
    assert before != after, "a config edit must miss the cache, or a threshold change is ignored"


def test_replacing_a_source_file_invalidates_the_cache(tmp_path):
    config = tmp_path / "world_data.toml"
    config.write_text("census_year = 2020\n")
    before = stage_cache.fingerprint(config, sources(tmp_path), "boundaries")
    swapped = sources(tmp_path)
    swapped["census_rails"] = ("2026-09-30", swapped["census_rails"][1], "c" * 64)
    after = stage_cache.fingerprint(config, swapped, "boundaries")
    assert before != after, "a changed source digest must miss the cache"


def test_one_stage_name_does_not_collide_with_another(tmp_path):
    config = tmp_path / "world_data.toml"
    config.write_text("census_year = 2020\n")
    found = sources(tmp_path)
    assert stage_cache.fingerprint(config, found, "boundaries") != stage_cache.fingerprint(
        config, found, "routes"
    )


def test_bumping_the_format_version_invalidates_the_cache(tmp_path, monkeypatch):
    """The manual signal still has to work.

    A cached dataclass read by new code can have the wrong shape, and a code hash
    would not notice a field renamed inside an otherwise unchanged module. The
    version is the manual signal for that, so it has to reach the fingerprint.
    """
    config = tmp_path / "world_data.toml"
    config.write_text("census_year = 2020\n")
    before = stage_cache.fingerprint(config, sources(tmp_path), "boundaries")
    monkeypatch.setattr(stage_cache, "CACHE_FORMAT_VERSION", stage_cache.CACHE_FORMAT_VERSION + 1)
    after = stage_cache.fingerprint(config, sources(tmp_path), "boundaries")
    assert before != after, (
        "CACHE_FORMAT_VERSION is not reaching the fingerprint, so bumping it invalidates nothing"
    )


def test_editing_a_transform_module_invalidates_the_cache(tmp_path):
    """The stage's own code is an input to its output.

    `fingerprint` takes the transform modules it depends on and mixes in their
    bytes. Without this, editing `transforms/roads.py` reuses the old routes
    cache - the exact failure that made CACHE_FORMAT_VERSION a thing people had
    to remember to bump.
    """
    config = tmp_path / "world_data.toml"
    config.write_text("census_year = 2020\n")
    roads = transform_module(tmp_path, "roads.py")
    before = stage_cache.fingerprint(config, sources(tmp_path), "routes", code=[roads])
    roads.write_text("def load_routes():\n    return []  # snap radius now per class\n")
    after = stage_cache.fingerprint(config, sources(tmp_path), "routes", code=[roads])
    assert before != after, "a transform edit must miss the cache, or stale routes are silently reused"


def test_two_modules_swapped_do_not_share_a_fingerprint(tmp_path):
    """Order and identity both matter, so a rename or a reorder is a miss."""
    config = tmp_path / "world_data.toml"
    config.write_text("census_year = 2020\n")
    a = transform_module(tmp_path, "a.py", "A\n")
    b = transform_module(tmp_path, "b.py", "B\n")
    first = stage_cache.fingerprint(config, sources(tmp_path), "routes", code=[a, b])
    assert first != stage_cache.fingerprint(config, sources(tmp_path), "routes", code=[b, a])
    assert first != stage_cache.fingerprint(config, sources(tmp_path), "routes", code=[a])


def test_the_shipped_cache_format_version_is_current():
    """A floor, not a ceiling.

    The version history is in `cache.py`: v6 per-road-class snap radii, v7
    `Route.road_class`/`travel_hours`, v8 the code-hash in the fingerprint. The
    cached stages are `boundaries` and `routes` only - see `pipeline.py`, which
    is also the only place allowed to pass `code` - so a table that is not cached
    cannot require a bump. This test exists so that a future reader can see the
    number is deliberate and where it came from, rather than assuming it is
    arbitrary. Raising it is fine and costs one recompute; lowering it is not.
    """
    assert stage_cache.CACHE_FORMAT_VERSION >= 8


def test_every_cached_stage_passes_its_own_code(tmp_path, monkeypatch):
    """The wiring, not just the function.

    `fingerprint` doing the right thing with a `code` argument is worth nothing if
    the pipeline stops passing one, so this checks the two cached stages really do
    hash the modules that produce them - and that a new cached stage cannot be
    added without also saying what code it depends on.
    """
    from worlddata import pipeline

    config = tmp_path / "world_data.toml"
    config.write_text("census_year = 2020\n")
    found = sources(tmp_path)

    for stage, expected in (("boundaries", "boundaries.py"), ("routes", "roads.py")):
        code = pipeline._stage_code(stage)
        names = [p.name for p in code]
        assert expected in names, f"{stage} stage does not hash {expected}; it hashes {names}"
        assert all(p.is_file() for p in code), f"{stage} stage names a file that does not exist: {names}"

    # A cached stage with no declared code would silently reuse across edits.
    with pytest.raises(WorldDataError) as excinfo:
        pipeline._stage_code("settlements")
    assert "cached stages" in str(excinfo.value)

    # And the stamp the pipeline builds must actually move when that code moves.
    before = stage_cache.fingerprint(config, found, "routes", code=pipeline._stage_code("routes"))
    real_stage_code = pipeline._stage_code
    monkeypatch.setattr(
        pipeline,
        "_stage_code",
        lambda stage: (*real_stage_code(stage), transform_module(tmp_path, "extra.py", "V2\n")),
    )
    after = stage_cache.fingerprint(config, found, "routes", code=pipeline._stage_code("routes"))
    assert before != after


# --------------------------------------------------------------------------
# Reuse
# --------------------------------------------------------------------------

def test_cached_result_is_reused_for_the_same_stamp(tmp_path):
    calls = []

    def compute():
        calls.append(1)
        return ["expensive"]

    first, note = stage_cache.cached(tmp_path, "boundaries", "stamp-1", compute, reuse=True)
    second, note = stage_cache.cached(tmp_path, "boundaries", "stamp-1", compute, reuse=True)
    assert first == second == ["expensive"]
    assert len(calls) == 1, "the second run must not recompute"
    assert "reused" in note


def test_a_different_stamp_recomputes_and_replaces(tmp_path):
    calls = []

    def compute(tag):
        return lambda: (calls.append(tag), [tag])[1]

    stage_cache.cached(tmp_path, "boundaries", "stamp-1", compute("old"), reuse=True)
    result, note = stage_cache.cached(tmp_path, "boundaries", "stamp-2", compute("new"), reuse=True)
    assert result == ["new"]
    assert "different inputs" in note
    _, note = stage_cache.cached(tmp_path, "boundaries", "stamp-2", compute("new"), reuse=True)
    assert "reused" in note, "the recomputed result must be cached, not just returned"
    assert calls == ["old", "new"], "the third call must be served from disk, not recomputed again"


def test_reuse_off_still_leaves_a_usable_cache_behind(tmp_path):
    """`--reuse-stages` off means "do not read the cache", not "do not write it".

    Otherwise a full recomputing run would destroy the cache it just built, and
    the next --reuse-stages run would have nothing to reuse.
    """
    calls = []

    def compute():
        calls.append(1)
        return [len(calls)]

    first, note = stage_cache.cached(tmp_path, "routes", "stamp", compute, reuse=False)
    assert first == [1]
    assert "computed and cached" in note
    second, note = stage_cache.cached(tmp_path, "routes", "stamp", compute, reuse=True)
    assert second == [1]
    assert len(calls) == 1
    assert "reused" in note


# --------------------------------------------------------------------------
# Recovery. This is where the real defect was.
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "corrupt",
    [
        pytest.param(b"", id="empty-file"),
        pytest.param(b"not a pickle at all", id="garbage"),
        pytest.param(pickle.dumps({"stamp": "s", "stage": "s", "result": [1]})[:20], id="truncated"),
    ],
)
def test_an_unreadable_cache_is_recomputed_and_replaced(tmp_path, corrupt):
    """A corrupt cache must not stay corrupt.

    The boundaries and routes stages are the two most expensive in the pipeline.
    If a bad cache file is merely worked around and left on disk, every later run
    pays the full cost again, and the run record claims a rewrite that never
    happened.
    """
    cache_dir = tmp_path / "cache"
    path = cache_dir / "stages" / "boundaries.pickle"
    path.parent.mkdir(parents=True)
    path.write_bytes(corrupt)

    calls = []

    def compute():
        calls.append(1)
        return ["recomputed"]

    result, note = stage_cache.cached(cache_dir, "boundaries", "stamp-1", compute, reuse=True)
    assert result == ["recomputed"]
    assert len(calls) == 1
    assert "could not be read" in note

    # The file on disk must now be a valid cache, not the corrupt bytes again.
    assert path.read_bytes() != corrupt
    result, note = stage_cache.cached(cache_dir, "boundaries", "stamp-1", compute, reuse=True)
    assert result == ["recomputed"]
    assert len(calls) == 1, "the recovered cache was not used, so the rewrite did not happen"
    assert "reused" in note


def test_a_cache_naming_an_unknown_pickle_protocol_is_recovered(tmp_path):
    """A cache written by a newer interpreter is not a crash.

    `pickle.load` raises `ValueError: unsupported pickle protocol: N` - not
    `UnpicklingError` - when a file's first two bytes name a protocol the running
    interpreter does not implement. `cached()` used to catch only the UnpicklingError
    family, so that ValueError escaped, and the whole run died on the two most
    expensive stages the cache exists to protect.

    This is not hypothetical: pickle protocol 6 became the default in CPython 3.14, and
    every manifest this pipeline writes records the interpreter that produced the data.
    A machine on 3.14 running with the cache directory on shared storage therefore
    leaves a file a machine on 3.12 cannot read, and the reader must recompute rather
    than stop.

    The two readers in `cache.py` had drifted on this - `_read()` already listed
    ValueError - so the file is also checked for the drift itself rather than only for
    the symptom.
    """
    cache_dir = tmp_path / "cache"
    path = cache_dir / "stages" / "boundaries.pickle"
    path.parent.mkdir(parents=True)
    path.write_bytes(b"\x80\x63" + b"\x00" * 20)  # protocol 99

    calls = []

    def compute():
        calls.append(1)
        return ["recomputed"]

    result, note = stage_cache.cached(cache_dir, "boundaries", "stamp-1", compute, reuse=True)
    assert result == ["recomputed"]
    assert len(calls) == 1
    assert "could not be read" in note
    assert "ValueError" in note, "the note must name why the cache was unusable, not just that it was"

    # The rewrite happened, so the next run is cheap again.
    result, note = stage_cache.cached(cache_dir, "boundaries", "stamp-1", compute, reuse=True)
    assert len(calls) == 1, "the recovered cache was not used, so the rewrite did not happen"
    assert "reused" in note

    # `_read()` and `cached()` must agree on what is unreadable, or the next edit can
    # reopen the gap. Both now share one tuple.
    assert stage_cache._read(path) is not None
    assert ValueError in stage_cache._UNREADABLE


def test_a_cache_holding_something_other_than_a_record_is_replaced(tmp_path):
    """A readable pickle of the wrong shape is still an unusable cache."""
    cache_dir = tmp_path / "cache"
    path = cache_dir / "stages" / "boundaries.pickle"
    path.parent.mkdir(parents=True)
    path.write_bytes(pickle.dumps(["not", "a", "cache", "record"]))

    result, note = stage_cache.cached(cache_dir, "boundaries", "stamp-1", lambda: ["fresh"], reuse=True)
    assert result == ["fresh"]
    assert "not a cache record" in note
    assert stage_cache._read(path)["result"] == ["fresh"]


def test_the_cache_write_is_atomic(tmp_path, monkeypatch):
    """A killed process must not leave a half-written cache behind.

    The export writer already writes to a .part file and renames it into place; the
    cache writer did not, so an interrupted run left a truncated pickle that every
    later run then had to work around. Here the *existing* good cache is what
    matters: a failed write must leave it readable, not replace it with the
    truncated bytes.
    """
    cache_dir = tmp_path / "cache"
    stage_cache.cached(cache_dir, "routes", "stamp", lambda: ["good"], reuse=False)
    path = cache_dir / "stages" / "routes.pickle"

    real_dump = stage_cache.pickle.dump

    def half_writing_dump(obj, handle, protocol=None):
        handle.write(b"\x80\x04 truncated")  # the first bytes of a pickle, then stop
        raise OSError("killed mid-write")

    monkeypatch.setattr(stage_cache.pickle, "dump", half_writing_dump)
    with pytest.raises(WorldDataError):
        stage_cache.cached(cache_dir, "routes", "stamp", lambda: ["new"], reuse=False)
    monkeypatch.setattr(stage_cache.pickle, "dump", real_dump)

    assert stage_cache._read(path)["result"] == ["good"], "a failed write destroyed the good cache"
    assert not list((cache_dir / "stages").glob("*.part")), "a .part file was left behind"


def test_a_result_that_cannot_be_pickled_fails_loudly(tmp_path):
    """An unpicklable result must reach the message that helps, not a raw traceback.

    `pickle.dump` reports a lambda as AttributeError, not PicklingError, so the
    original handler let the bare AttributeError escape from inside the writer.
    The run record is the only place anyone sees this, and it has to say which
    stage and why.
    """

    def compute():
        return {"bad": lambda: None}  # a local function is not picklable

    with pytest.raises(WorldDataError) as excinfo:
        stage_cache.cached(tmp_path / "cache", "boundaries", "stamp", compute, reuse=False)
    assert "boundaries" in str(excinfo.value)
    assert "cannot be cached" in str(excinfo.value)


def test_a_cache_written_by_another_stage_is_not_reused(tmp_path):
    """The stamp carries the stage name, but the payload should be checked too.

    Not a real failure mode today (pipeline.py mixes a distinct stage name into
    every stamp) - it is here so that the check is not quietly removed later.
    """
    cache_dir = tmp_path / "cache"
    path = cache_dir / "stages" / "boundaries.pickle"
    path.parent.mkdir(parents=True)
    path.write_bytes(pickle.dumps({"stamp": "stamp-1", "stage": "routes", "result": ["wrong"]}))
    result, note = stage_cache.cached(cache_dir, "boundaries", "stamp-1", lambda: ["right"], reuse=True)
    assert result == ["right"]
