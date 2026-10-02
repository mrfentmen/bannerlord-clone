#!/usr/bin/env python3
"""validate.py - input validation for the 3D asset intake pipeline.

Pure functions, no network, no side effects. Everything here is unit
tested in tests/test_asset_pipeline.py.

Budgets are deliberately conservative for a browser game that must run
on phones: a single hero asset that blows the triangle budget will tank
the frame rate for everyone. The pipeline rejects over-budget models
rather than silently shipping them.
"""

import os
import struct

# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------

#: Hard cap on the GLB file itself. Anything bigger is almost certainly a
#: mistake (uncompressed scan, wrong export) and risks OOM in analysis.
MAX_FILE_BYTES = 50 * 1024 * 1024  # 50 MB

#: Minimum plausible GLB: 12-byte header + 8-byte JSON chunk header.
MIN_FILE_BYTES = 20

#: Per-asset geometry budgets. Models over budget are rejected at intake;
#: the artist needs to decimate before the model can ship.
BUDGETS = {
    "vertices": 100_000,
    "triangles": 200_000,
    "meshes": 64,
    "textures": 16,
}

#: Licences the pipeline accepts explicitly. Anything else must go
#: through UNRESOLVED until a human clears it.
KNOWN_LICENCES = frozenset({
    "UNRESOLVED",
    "UNKNOWN",
    "CC0-1.0",
    "CC-BY-4.0",
    "CC-BY-SA-4.0",
    "MIT",
    "Apache-2.0",
    "MPL-2.0",
    "GPL-3.0-only",
    "GPL-3.0-or-later",
})


class ValidationError(ValueError):
    """Raised when an input fails validation. Message is human-readable."""


# ---------------------------------------------------------------------------
# GLB file validation
# ---------------------------------------------------------------------------

def validate_glb(path):
    """Validate that path is a plausible GLB file.

    Checks, in order: exists, is a file, has a .glb extension, is within
    the size limits, starts with the glTF magic, and has a sane header
    (version 2, declared length matching the file size).

    Returns the file size in bytes on success. Raises ValidationError
    with a plain-English reason on failure.
    """
    if not os.path.exists(path):
        raise ValidationError(f"file not found: {path}")
    if not os.path.isfile(path):
        raise ValidationError(f"not a regular file: {path}")
    if not path.lower().endswith(".glb"):
        raise ValidationError(
            f"expected a .glb file, got: {os.path.basename(path)}")
    size = os.path.getsize(path)
    if size < MIN_FILE_BYTES:
        raise ValidationError(
            f"file too small to be a GLB ({size} bytes): {path}")
    if size > MAX_FILE_BYTES:
        raise ValidationError(
            f"file too large ({size / 1024 / 1024:.1f} MB > "
            f"{MAX_FILE_BYTES / 1024 / 1024:.0f} MB limit): {path}")
    with open(path, "rb") as fh:
        header = fh.read(12)
    if len(header) < 12:
        raise ValidationError(f"could not read GLB header: {path}")
    magic, version, length = struct.unpack("<4sII", header)
    if magic != b"glTF":
        raise ValidationError(
            f"bad GLB magic {magic!r} (expected b'glTF'): {path}")
    if version != 2:
        raise ValidationError(
            f"unsupported glTF version {version} (pipeline expects 2): {path}")
    if length != size:
        raise ValidationError(
            f"GLB header length {length} != actual file size {size}: {path}")
    return size


# ---------------------------------------------------------------------------
# Asset budgets
# ---------------------------------------------------------------------------

def check_budgets(stats):
    """Check analyzed geometry stats against BUDGETS.

    stats is the flat dict recorded in the manifest:
    {"vertices": int|None, "triangles": int|None, "meshes": int|None,
     "textures": int|None}.

    Returns a list of human-readable violation strings (empty = within
    budget). Unknown (None) stats are skipped, not failed - the analyzer
    may not report every field for every model.
    """
    violations = []
    for key, limit in BUDGETS.items():
        value = stats.get(key)
        if value is None:
            continue
        if not isinstance(value, (int, float)) or value < 0:
            violations.append(f"{key}: invalid stat value {value!r}")
        elif value > limit:
            violations.append(
                f"{key}: {value:,} exceeds budget of {limit:,}")
    return violations


# ---------------------------------------------------------------------------
# Licence validation
# ---------------------------------------------------------------------------

def validate_licence(licence):
    """Validate a licence string.

    Returns the normalized licence on success. Raises ValidationError for
    empty strings or strings with suspicious characters. Unknown but
    well-formed identifiers are accepted with a warning flag - the
    caller decides whether to treat them as cleared.
    """
    if not licence or not licence.strip():
        raise ValidationError("licence must not be empty")
    licence = licence.strip()
    if any(c in licence for c in " \t\n\r/\\"):
        raise ValidationError(
            f"licence contains invalid characters: {licence!r}")
    return licence


def is_commercially_cleared(licence):
    """True only for licences that are explicitly cleared for commercial
    use. UNRESOLVED and UNKNOWN are never cleared, and neither is
    anything not on the known list - when in doubt the model stays out
    of public builds."""
    return licence in KNOWN_LICENCES and licence not in ("UNRESOLVED",
                                                        "UNKNOWN")
