"""HTTP fetching with loud, retrying failures.

CONSTITUTION.md section 1.3: "Every external call is treated as untrusted.
Every endpoint handles its failure cases, not just the happy path. No empty
catch blocks. No silent fallbacks."

This module is the only place the pipeline touches the network. It provides:

* bounded retries with backoff, so a transient 503 is not a failed dataset;
* a hard failure, logged with the full reason, when the retries run out;
* a streaming download with a byte ceiling, so a wrong URL that returns an
  error page cannot fill the disk;
* SHA-256 recorded for every file so a re-run can prove it used the same bytes;
* a digest cache, so re-runs do not re-download but *do* verify.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from .config import Config
from .errors import ChecksumError, FetchError

# Name of the digest sidecar written next to each downloaded file.
_DIGEST_SUFFIX = ".sha256"
# Bytes per read chunk when streaming to disk.
_CHUNK_BYTES = 1 << 20


@dataclass(frozen=True)
class FetchResult:
    """What actually happened, so the caller never has to guess."""

    url: str
    path: Path
    bytes_written: int
    sha256: str
    from_cache: bool
    attempts: int
    final_url: str
    last_modified: str | None


def _network_settings(config: Config) -> dict[str, Any]:
    return {
        "max_attempts": int(config.get("network.max_attempts")),
        "backoff": float(config.get("network.retry_backoff_seconds")),
        "timeout": float(config.get("network.timeout_seconds")),
        "user_agent": str(config.get("network.user_agent")),
        "max_bytes": int(config.get("network.max_download_bytes")),
        "verify": bool(config.get("network.verify_checksums")),
        "reuse": bool(config.get("network.reuse_downloads")),
    }


def _describe_http_error(response: requests.Response) -> str:
    """Turn an HTTP failure into a message a human can act on.

    The upstream 403/404 body is often the actual explanation ("you must send
    a User-Agent"), so it is included verbatim, truncated to stay readable.
    """
    body = response.text.strip()
    snippet = body[:400].replace("\n", " ") if body else "<empty body>"
    return f"HTTP {response.status_code} {response.reason} from {response.url}; body: {snippet}"


def _digest_path_for(path: Path) -> Path:
    return path.with_suffix(path.suffix + _DIGEST_SUFFIX)


def read_recorded_digest(path: Path) -> str | None:
    """Return the SHA-256 recorded by a previous download, or None.

    The sidecar is written as JSON with the digest, URL, byte count and
    Last-Modified header, because that is what makes a manifest entry useful.
    Reading it back parses the JSON rather than splitting whitespace, because
    splitting returns "{" for a JSON object and silently poisons the comparison.
    """
    digest_path = _digest_path_for(path)
    if not digest_path.is_file():
        return None
    try:
        payload = json.loads(digest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        raise ChecksumError(
            f"{digest_path} exists but could not be read ({type(exc).__name__}: {exc}). It records the "
            "digest of the file next to it, so the pipeline cannot verify the download without it. "
            "Delete it and re-run to re-record."
        ) from exc
    digest = payload.get("sha256") if isinstance(payload, dict) else None
    if not isinstance(digest, str) or len(digest) != 64:
        raise ChecksumError(
            f"{digest_path} does not contain a 64-character SHA-256 digest (found {digest!r}). "
            "Delete it and re-run to re-record."
        )
    return digest


def sha256_of_file(path: Path, chunk_bytes: int = _CHUNK_BYTES) -> str:
    """SHA-256 of a file on disk, streamed so large files do not load at once."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_bytes), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download_once(url: str, destination: Path, settings: dict[str, Any]) -> tuple[int, str, str, str | None]:
    """One attempt. Returns (bytes, sha256, final_url, last_modified).

    Writes to a .part file and renames on success, so an interrupted download
    can never be mistaken for a complete one on the next run.
    """
    partial = destination.with_suffix(destination.suffix + ".part")
    digest = hashlib.sha256()
    written = 0
    headers = {"User-Agent": settings["user_agent"], "Accept-Encoding": "identity"}
    try:
        with requests.get(url, stream=True, timeout=settings["timeout"], headers=headers) as response:
            if response.status_code != 200:
                raise FetchError(url, _describe_http_error(response), attempts=1)
            declared = response.headers.get("Content-Length")
            if declared is not None and int(declared) > settings["max_bytes"]:
                raise FetchError(
                    url,
                    f"declared Content-Length {declared} exceeds the configured ceiling "
                    f"{settings['max_bytes']} bytes (network.max_download_bytes); refusing to download",
                    attempts=1,
                )
            with partial.open("wb") as handle:
                for chunk in response.iter_content(chunk_size=_CHUNK_BYTES):
                    if not chunk:
                        continue
                    written += len(chunk)
                    if written > settings["max_bytes"]:
                        raise FetchError(
                            url,
                            f"download exceeded the configured ceiling of {settings['max_bytes']} bytes "
                            "(network.max_download_bytes) after {written} bytes",
                            attempts=1,
                        )
                    digest.update(chunk)
                    handle.write(chunk)
            final_url = response.url
            last_modified = response.headers.get("Last-Modified")
    except FetchError:
        partial.unlink(missing_ok=True)
        raise
    except requests.RequestException as exc:
        partial.unlink(missing_ok=True)
        raise FetchError(url, f"{type(exc).__name__}: {exc}", attempts=1) from exc
    except OSError as exc:
        partial.unlink(missing_ok=True)
        raise FetchError(url, f"could not write {destination}: {exc}", attempts=1) from exc

    if written == 0:
        partial.unlink(missing_ok=True)
        raise FetchError(url, "server returned 200 with a zero-byte body", attempts=1)

    partial.replace(destination)
    return written, digest.hexdigest(), final_url, last_modified


def fetch(
    config: Config,
    url: str,
    destination_name: str,
    *,
    expected_sha256: str | None = None,
) -> FetchResult:
    """Download ``url`` into ``raw_dir/destination_name``, verifying it.

    Re-running is cheap: if the file exists and its recorded digest still
    matches the file on disk, it is reused. If the file exists but its digest
    has changed, that is a hard error - a corrupted or substituted source is
    exactly the failure mode CONSTITUTION.md section 1.1 is about.

    Every failure raises FetchError or ChecksumError. Nothing returns a
    best-effort result.
    """
    settings = _network_settings(config)
    raw_dir = config.path_for("raw_dir")
    raw_dir.mkdir(parents=True, exist_ok=True)
    destination = raw_dir / destination_name

    if destination.is_file() and settings["reuse"]:
        actual = sha256_of_file(destination)
        recorded = read_recorded_digest(destination)
        if recorded is not None and recorded == actual:
            if expected_sha256 is not None and expected_sha256 != actual:
                raise ChecksumError(
                    f"{destination} was previously downloaded with digest {actual} but the expected "
                    f"digest for {url} is {expected_sha256}. Re-download with network.reuse_downloads=false."
                )
            return FetchResult(
                url=url,
                path=destination,
                bytes_written=destination.stat().st_size,
                sha256=actual,
                from_cache=True,
                attempts=0,
                final_url=url,
                last_modified=None,
            )
        # Either the digest sidecar is gone or it disagrees with the bytes.
        if recorded is not None and recorded != actual:
            raise ChecksumError(
                f"{destination} on disk has digest {actual} but {recorded} was recorded for it. "
                "The local copy was modified or truncated; delete it and re-run."
            )

    if expected_sha256 is None:
        # The upstream digest could not be obtained. Record ours so later runs
        # verify the same bytes. The manifest reports this as a gap; see
        # datasets.py for the per-dataset note.
        pass

    last_error: FetchError | None = None
    for attempt in range(1, settings["max_attempts"] + 1):
        try:
            written, digest, final_url, last_modified = _download_once(url, destination, settings)
        except FetchError as exc:
            last_error = FetchError(url, exc.reason, attempts=attempt)
            if attempt < settings["max_attempts"]:
                time.sleep(settings["backoff"] * attempt)
            continue

        if expected_sha256 is not None and settings["verify"] and digest != expected_sha256:
            destination.unlink(missing_ok=True)
            raise ChecksumError(
                f"{url} downloaded with digest {digest} but {expected_sha256} was expected. "
                "The upstream file changed or the transfer was corrupted."
            )

        _digest_path_for(destination).write_text(
            json.dumps(
                {
                    "url": url,
                    "final_url": final_url,
                    "sha256": digest,
                    "bytes": written,
                    "last_modified": last_modified,
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        return FetchResult(
            url=url,
            path=destination,
            bytes_written=written,
            sha256=digest,
            from_cache=False,
            attempts=attempt,
            final_url=final_url,
            last_modified=last_modified,
        )

    assert last_error is not None  # loop always sets it before exhausting attempts
    raise last_error
