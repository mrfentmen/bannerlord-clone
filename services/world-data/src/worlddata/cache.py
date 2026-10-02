"""Stage-level caching, so a re-run does not repeat the expensive stages.

The route stage alone reads 137,000 real polylines and 6.5 million vertices, and
the boundaries stage reads 32,000 place polygons. Together they are most of the
pipeline's runtime and none of it changes between runs unless the downloaded
source files change.

Each expensive stage's result is cached under the cache directory, keyed by a
fingerprint of everything that could change the result: the config file's contents,
the census and vintage settings, the SHA-256 of every downloaded source, *and the
bytes of the transform modules that produce the result*. Touch the config, replace
a source file, or edit `transforms/roads.py` and the fingerprint changes, so the
cache is missed automatically rather than silently serving a stale answer.

The code hash is the part that matters most. The version constant below is the
manual signal for a change no hash can see - a field renamed inside an otherwise
identical module - and it is exactly the thing people forget to bump, which is why
`pipeline._stage_code` is now the only place allowed to declare what a cached stage
depends on. Adding a cached stage means adding its code there, and the test suite
checks that a stage with no declared code is an error rather than a silent miss.

A cache that cannot be trusted is worse than no cache, because it is quiet. So this
module also:

* writes through a `.part` file and renames it into place, so a killed process
  leaves the previous good cache readable rather than a truncated one;
* replaces a cache file it could not read, instead of working around it and leaving
  the bad bytes in place - otherwise every later run pays the full stage cost again
  while the run record claims a rewrite that never happened;
* checks the stage name in the payload, not just the stamp, so a file written by a
  different stage is not handed back;
* reports what actually happened in the note it returns, because the run record is
  the only place anyone sees it.

The cache lives in data/cache/, which the repository's .gitignore already excludes.
"""

from __future__ import annotations

import hashlib
import os
import pickle
from pathlib import Path
from typing import Any, Callable, Iterable, TypeVar

from .errors import WorldDataError

T = TypeVar("T")

# Bumped when the cached dataclasses change shape, so an old cache is never read
# into new code. v6: _load_lines snaps per road class (primary/secondary/rail
# radii) instead of one global radius — the fingerprint covers the config but
# not the code, so without the bump a stale all-20km route cache would survive.
# v7: Route gains road_class (longest member segment's) and travel_hours for
# the travel-graph export and sim feed.
# v8: fingerprint() takes the stage's own code and mixes in its bytes, so editing
# a transform invalidates that stage's cache instead of relying on someone
# remembering this number. Cached stages are `boundaries` and `routes` only.
CACHE_FORMAT_VERSION = 8

# The pickled-payload key. A cache file is a dict with these keys; anything else
# is a file this module did not write, whatever it happens to unpickle to.
_RECORD_KEYS = ("stamp", "stage", "result")


def fingerprint(
    config_file: Path,
    sources: dict[str, tuple[str, Path, str]],
    extra: str = "",
    *,
    code: Iterable[Path] = (),
) -> str:
    """A digest of everything that could change a stage's output.

    Includes the config file's bytes, so editing a threshold invalidates the cache
    for the stages that threshold feeds. Includes each source's recorded digest,
    so replacing a download invalidates it too. Includes the bytes of every module
    in ``code``, in the order given, so editing a transform - or reordering the
    modules a stage depends on - is a miss. The cached stage name is mixed in by
    the caller through ``extra``.

    A ``code`` path that does not exist is an error rather than a skipped hash. A
    silently-omitted module is a stale cache with no warning, which is the failure
    this whole mechanism exists to prevent.
    """
    digest = hashlib.sha256()
    digest.update(b"worlddata-cache-v")
    digest.update(str(CACHE_FORMAT_VERSION).encode())
    digest.update(config_file.read_bytes())
    digest.update(extra.encode())
    for key in sorted(sources):
        _retrieved_at, path, source_digest = sources[key]
        digest.update(key.encode())
        digest.update(source_digest.encode())
        digest.update(path.name.encode())
    for path in code:
        path = Path(path)
        if not path.is_file():
            raise WorldDataError(
                f"a cached stage declared {path} as code it depends on, but that file does not exist; "
                "the stage's fingerprint cannot be computed, so the cache is not consulted"
            )
        digest.update(path.name.encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _read(path: Path) -> dict[str, Any] | None:
    """The cache record at ``path``, or None when there is not one.

    None covers every way a file can be unusable: absent, unreadable, truncated,
    garbage, or a readable pickle of some other shape. The caller needs to tell
    those apart for the run record, so it re-reads the reason itself; this exists
    so there is exactly one definition of "a cache record".
    """
    try:
        with path.open("rb") as handle:
            payload = pickle.load(handle)
    except (OSError, pickle.UnpicklingError, EOFError, AttributeError, ImportError, IndexError, ValueError):
        return None
    if not isinstance(payload, dict) or any(key not in payload for key in _RECORD_KEYS):
        return None
    return payload


def _write(path: Path, stage: str, stamp: str, result: Any) -> None:
    """Write a cache record through a ``.part`` file, renamed into place.

    The rename is what makes this safe: a reader either sees the whole previous
    cache or the whole new one, never a half-written file. The export writer already
    works this way; the cache writer did not, so an interrupted run left a truncated
    pickle that every later run then had to work around.
    """
    part = path.with_name(path.name + ".part")
    try:
        with part.open("wb") as handle:
            pickle.dump({"stamp": stamp, "stage": stage, "result": result}, handle, protocol=pickle.HIGHEST_PROTOCOL)
            handle.flush()
            os.fsync(handle.fileno())
        part.replace(path)
    except (OSError, pickle.PicklingError, AttributeError, TypeError, ValueError) as exc:
        # A partial file must never be left behind: the next run would treat it as
        # this stage's cache and pay the recovery path for it.
        part.unlink(missing_ok=True)
        raise WorldDataError(
            f"the {stage} stage computed a result that cannot be cached ({type(exc).__name__}: {exc}). "
            "Run without stage reuse, or remove the field that cannot be pickled."
        ) from exc


def cached(
    cache_dir: Path,
    stage: str,
    stamp: str,
    compute: Callable[[], T],
    *,
    reuse: bool,
) -> tuple[T, str]:
    """Return ``compute()``, or a cached result from a previous run.

    Returns (result, note) where the note says whether the stage ran, was reused, or
    was recovered, so the run record is honest about which numbers were freshly
    computed. A cache that cannot be used is always replaced, so the recovery cost is
    paid once rather than on every subsequent run. A cache write that fails is
    reported, never swallowed.
    """
    target = cache_dir / "stages"
    target.mkdir(parents=True, exist_ok=True)
    path = target / f"{stage}.pickle"

    if reuse and path.is_file():
        try:
            with path.open("rb") as handle:
                payload = pickle.load(handle)
        except (OSError, pickle.UnpicklingError, EOFError, AttributeError, ImportError, IndexError) as exc:
            reason = f"could not be read ({type(exc).__name__}: {exc})"
        else:
            if not isinstance(payload, dict) or any(key not in payload for key in _RECORD_KEYS):
                reason = f"held {type(payload).__name__}, not a cache record"
            elif payload["stage"] != stage:
                reason = f"was written by the {payload['stage']} stage, not {stage}"
            elif payload["stamp"] != stamp:
                reason = "was for different inputs"
            else:
                return (payload["result"], f"{stage}: reused cached result from {path.name}")

        result = compute()
        _write(path, stage, stamp, result)
        return (
            result,
            f"{stage}: cache {reason}; recomputed and the cache has been rewritten to {path.name}",
        )

    result = compute()
    _write(path, stage, stamp, result)
    return (result, f"{stage}: computed and cached to {path.name}")
