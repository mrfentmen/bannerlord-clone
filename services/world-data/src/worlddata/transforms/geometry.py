"""Shared plumbing for reading the downloaded shapefile archives.

Every geometry source the pipeline uses is a ZIP containing a .shp, a .dbf and a
.prj. Unpacking once into the cache directory keeps re-runs cheap and makes the
projection and encoding of each source inspectable rather than hidden.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from ..errors import DatasetGap, ParseError
from ..geo.shapefile import Shapefile, iter_dbf, iter_shapes, read_shapefile

# Members extracted from a Census shapefile ZIP. The ISO metadata XML files are
# deliberately not extracted: they are documentation, and the .prj/.cpg are the
# machine-readable equivalents.
_MEMBER_SUFFIXES = (".shp", ".dbf", ".prj", ".cpg")


@dataclass(frozen=True)
class ShapefileSource:
    """An unpacked shapefile with its attributes and its real projection text."""

    shapefile: Shapefile
    projection_wkt: str
    encoding: str
    stem: str


def unpack_shapefile_archive(archive_path: Path, cache_dir: Path) -> Path:
    """Public alias for the archive unpacker, used by the streaming readers."""
    return _unpack(archive_path, cache_dir)


def _unpack(archive_path: Path, cache_dir: Path) -> Path:
    """Extract the geometry members of a shapefile ZIP into ``cache_dir``.

    Returns the directory holding them. Refuses a ZIP that does not contain a
    single .shp, rather than writing an empty directory that later reads as a
    valid empty dataset.
    """
    if not archive_path.is_file():
        raise DatasetGap(
            "census_shapefile",
            f"expected {archive_path} in the raw directory. Run the fetch stage first.",
        )
    target = cache_dir / archive_path.stem
    target.mkdir(parents=True, exist_ok=True)

    stems: set[str] = set()
    with zipfile.ZipFile(archive_path) as archive:
        for member in archive.namelist():
            if not member.lower().endswith(_MEMBER_SUFFIXES):
                continue
            stem = Path(member).stem
            destination = target / Path(member).name
            # Rewrite rather than trust the archive, so a re-run always picks up
            # a corrected file instead of a stale extraction.
            with archive.open(member) as source, destination.open("wb") as sink:
                sink.write(source.read())
            if destination.suffix.lower() == ".shp":
                stems.add(stem)

    if len(stems) != 1:
        raise ParseError(
            f"{archive_path.name} contains {len(stems)} .shp members ({sorted(stems)}); expected exactly one. "
            "This dataset is a multi-layer shapefile and the pipeline must not guess which layer to read."
        )
    return target


def iter_shapefile(archive_path: Path, cache_dir: Path) -> Iterator[tuple[object, dict[str, object]]]:
    """Stream (geometry, attributes) row by row from a Census shapefile archive.

    Both the geometry and the attribute row are read one record at a time. The
    national rail layer is 119,857 rows of each, and materialising either one is
    enough to get the process killed during the export.
    """
    directory = _unpack(archive_path, cache_dir)
    stem = next(directory.glob("*.shp")).stem
    shp = directory / f"{stem}.shp"
    dbf = directory / f"{stem}.dbf"
    if not dbf.is_file():
        raise ParseError(f"{archive_path.name} has {shp.name} but no matching .dbf attribute table")

    shapes = (shape for shape, _bbox in iter_shapes(shp))
    rows = iter_dbf(dbf)
    for _fields, record in rows:
        try:
            geometry = next(shapes)
        except StopIteration as exc:
            raise ParseError(
                f"{shp.name} has fewer shapes than {dbf.name} has records; the two must be row-aligned"
            ) from exc
        yield (geometry, record)
    leftover = next(shapes, None)
    if leftover is not None:
        raise ParseError(f"{shp.name} has more shapes than {dbf.name} has records; the two must be row-aligned")


def load_shapefile(archive_path: Path, cache_dir: Path) -> ShapefileSource:
    """Unpack a Census shapefile ZIP and read it into memory."""
    directory = _unpack(archive_path, cache_dir)
    stem = next(directory.glob("*.shp")).stem
    shp = directory / f"{stem}.shp"
    dbf = directory / f"{stem}.dbf"
    if not dbf.is_file():
        raise ParseError(f"{archive_path.name} has {shp.name} but no matching .dbf attribute table")

    projection_file = directory / f"{stem}.prj"
    projection_wkt = projection_file.read_text(encoding="latin-1").strip() if projection_file.is_file() else ""
    encoding_file = directory / f"{stem}.cpg"
    encoding = encoding_file.read_text(encoding="ascii").strip() if encoding_file.is_file() else ""

    return ShapefileSource(
        shapefile=read_shapefile(shp, dbf),
        projection_wkt=projection_wkt,
        encoding=encoding,
        stem=stem,
    )


def resolve_state_fips(
    state_names: list[str] | tuple[str, ...],
    available: dict[str, str],
) -> dict[str, str]:
    """Match configured state names to FIPS codes using a real name/FIPS table.

    ``available`` maps state name to FIPS and must come from a downloaded Census
    file. Raises ConfigError-ish ParseError with the unmatched names listed, so a
    typo in a design-doc transcription cannot silently shift a state between
    sides.
    """
    lookup = {name.casefold(): fips for name, fips in available.items()}
    resolved: dict[str, str] = {}
    unmatched: list[str] = []
    for name in state_names:
        fips = lookup.get(name.casefold())
        if fips is None:
            unmatched.append(name)
        else:
            resolved[name] = fips
    if unmatched:
        raise ParseError(
            f"these state names could not be matched against the Census state list: {unmatched}. "
            "FACTIONS.md section 4 transcribes them; either the transcription or the Census name differs."
        )
    return resolved
