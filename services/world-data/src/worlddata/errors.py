"""Typed failures for the world data pipeline.

CONSTITUTION.md section 1.3: "No empty catch blocks. No silent fallbacks."
Every failure mode in this package raises one of these. Nothing in the
pipeline is allowed to catch one of these and continue with a substituted
value - a gap is recorded in the manifest and reported, never invented.
"""

from __future__ import annotations


class WorldDataError(Exception):
    """Base class. Every error this pipeline raises inherits from here."""


class ConfigError(WorldDataError):
    """The config file is missing a key, has a bad type, or contradicts itself."""


class FetchError(WorldDataError):
    """A download failed.

    Carries the URL and the full reason. The pipeline aborts on this rather
    than continuing without the dataset, because a missing dataset that is
    papered over becomes a fabricated number later.
    """

    def __init__(self, url: str, reason: str, attempts: int) -> None:
        super().__init__(f"fetch failed for {url} after {attempts} attempt(s): {reason}")
        self.url = url
        self.reason = reason
        self.attempts = attempts


class ChecksumError(WorldDataError):
    """A downloaded file did not match its expected SHA-256 digest."""


class DatasetGap(WorldDataError):
    """A dataset that the manifest expects could not be produced.

    Raised for a *declared* absence - for example an input series that does
    not cover every state. The pipeline reports the gap instead of filling it.
    """

    def __init__(self, dataset: str, detail: str) -> None:
        super().__init__(f"dataset gap in {dataset}: {detail}")
        self.dataset = dataset
        self.detail = detail


class ParseError(WorldDataError):
    """A source file did not have the structure the parser expected.

    Almost always means the upstream format changed. Loud by design: a silent
    misparse is how a wrong number gets into the game.
    """


class GeoError(WorldDataError):
    """A geometry operation failed on real coordinates."""
