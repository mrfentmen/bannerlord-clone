"""Stage-level caching, so a re-run does not repeat the expensive stages.

The route stage alone reads 137,000 real polylines and 6.5 million vertices, and
the boundaries stage reads 32,000 place polygons. Together they are most of the
pipeline's runtime and none of it changes between runs unless the downloaded
source files change.

Each expensive stage's result is cached under the cache directory, keyed by a
fingerprint of everything that could change the result: the config file's contents,
the census and vintage settings, and the SHA-256 of every downloaded source. Touch
the config or replace a source file and the fingerprint changes, so the cache is
missed automatically rather than silently serving a stale answer.

The cache lives in data/cache/, which the repository's .gitignore already excludes.
"""

from __future__ import annotations

import hashlib
import pickle
from pathlib import Path
from typing import Any, Callable, TypeVar

from .errors import WorldDataError

T = TypeVar("T")

# Bumped when the cached dataclasses change shape, so an old cache is never read
# into new code. v6: _load_lines snaps per road class (primary/secondary/rail
# radii) instead of one global radius — the fingerprint covers the config but
# not the code, so without the bump a stale all-20km route cache would survive.
# v7: Route gains road_class (longest member segment's) and travel_hours for
# the travel-graph export and sim feed.
CACHE_FORMAT_VERSION = 7


def fingerprint(
    config_file: Path,
    sources: dict[str, tuple[str, Path, str]],
    extra: str = "",
) -> str:
    """A digest of everything that could change a stage's output.

    Includes the config file's bytes, so editing a threshold invalidates the cache
    for the stages that threshold feeds. Includes each source's recorded digest,
    so replacing a download invalidates it too. The cached stage name is mixed in
    by the caller through ``extra``.
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
    return digest.hexdigest()


def cached(
    cache_dir: Path,
    stage: str,
    stamp: str,
    compute: Callable[[], T],
    *,
    reuse: bool,
) -> tuple[T, str]:
    """Return ``compute()``, or a cached result from a previous run.

    Returns (result, note) where the note says whether the stage ran or was
    reused, so the run record is honest about which numbers were freshly
    computed. A cache write that fails is reported, never swallowed.
    """
    target = cache_dir / "stages"
    target.mkdir(parents=True, exist_ok=True)
    path = target / f"{stage}.pickle"

    if reuse and path.is_file():
        try:
            with path.open("rb") as handle:
                payload = pickle.load(handle)
        except (OSError, pickle.UnpicklingError, EOFError, AttributeError) as exc:
            return (
                compute(),
                f"cache for {stage} at {path.name} could not be read ({type(exc).__name__}: {exc}); "
                "recomputed and the cache will be rewritten",
            )
        if isinstance(payload, dict) and payload.get("stamp") == stamp:
            return (payload["result"], f"{stage}: reused cached result from {path.name}")
        return (compute(), f"{stage}: cache was for different inputs, recomputed")

    result = compute()
    try:
        with path.open("wb") as handle:
            pickle.dump({"stamp": stamp, "stage": stage, "result": result}, handle, protocol=pickle.HIGHEST_PROTOCOL)
    except (OSError, pickle.PicklingError) as exc:
        raise WorldDataError(
            f"the {stage} stage computed a result that cannot be cached ({type(exc).__name__}: {exc}). "
            "Run without stage reuse, or remove the field that cannot be pickled."
        ) from exc
    return (result, f"{stage}: computed and cached to {path.name}")
