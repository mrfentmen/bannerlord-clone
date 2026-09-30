"""Pure-stdlib ESRI Shapefile (.shp) and dBASE (.dbf) reader.

Why this exists rather than a library: the Phase 0 constraint is "no new
dependencies without saying so first". The US government publishes its
authoritative boundary, road and rail data as shapefiles, and the two formats
involved are simple, stable, fully documented binary layouts. Reading them
here keeps the dependency count at zero and keeps every byte of the real data
visible. Agent 1's dependency position is stated in services/world-data/README.md.

Layout implemented (ESRI Shapefile Technical Description, July 1998):

* .shp - 100-byte big-endian header, then variable-length records. Each record
  is an 8-byte record header (record number, content length in 16-bit words)
  followed by the shape content, whose first 4 bytes are the shape type.
* .dbf - dBASE III table. 32-byte header, 32-byte field descriptors, then
  fixed-width records.

Only what the pipeline needs is decoded: geometry as nested coordinate lists,
attributes as a list of dicts. No geometry library, so the output is plain
Python lists and floats that any consumer can read.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Iterator

from ..errors import ParseError

# Shape type codes from the ESRI specification. The Z and M variants share the
# 2D geometry layout and differ only in trailing arrays, which this reader skips
# because the pipeline does not need elevation or measure data from the
# shapefile (real elevation comes from the DEM, transforms/state_profiles.py).
_NULL = 0
_POINT = 1
_POLYLINE = 3
_POLYGON = 5
_MULTIPOINT = 8
_POINT_Z = 11
_POLYLINE_Z = 13
_POLYGON_Z = 15
_MULTIPOINT_Z = 18
_POINT_M = 21
_POLYLINE_M = 23
_POLYGON_M = 25
_MULTIPOINT_M = 28

_MULTIPOINT_TYPES = {_MULTIPOINT, _MULTIPOINT_Z, _MULTIPOINT_M}
_POLYGON_TYPES = {_POLYGON, _POLYGON_Z, _POLYGON_M}
_POLYLINE_TYPES = {_POLYLINE, _POLYLINE_Z, _POLYLINE_M}
_POINT_TYPES = {_POINT, _POINT_Z, _POINT_M}

_HEADER_BYTES = 100
_RECORD_HEADER_BYTES = 8
_DBFILE_HEADER_BYTES = 32
_FIELD_DESCRIPTOR_BYTES = 32
_FIELD_TERMINATOR = 0x0D
# A shapefile header must declare exactly this many 16-bit words of content.
_SHP_FILE_CODE = 9994
_SHAPE_VERSION = 1000


@dataclass(frozen=True)
class Shapefile:
    """A parsed shapefile plus its attribute table."""

    shape_type: int
    bbox: tuple[float, float, float, float]
    shapes: list[object]
    fields: list[str]
    records: list[dict[str, object]]

    def __len__(self) -> int:
        return len(self.records)


def _read_exactly(handle: BinaryIO, count: int, what: str) -> bytes:
    chunk = handle.read(count)
    if len(chunk) != count:
        raise ParseError(
            f"truncated shapefile: wanted {count} bytes for {what} at offset "
            f"{handle.tell() - len(chunk)} but the file ended first"
        )
    return chunk


def _parse_shape_content(shape_type: int, content: bytes) -> object:
    """Decode one shape's content into coordinates.

    Returns a list of (x, y) pairs for point-type shapes, or a list of rings,
    each ring a list of (x, y) pairs, for line and polygon types.
    """
    if len(content) < 4:
        raise ParseError(f"shape record is only {len(content)} bytes, too short to hold a shape type")
    (record_shape_type,) = struct.unpack_from("<i", content, 0)
    if record_shape_type != shape_type:
        raise ParseError(
            f"shape record declares type {record_shape_type} inside a file whose header declares {shape_type}"
        )
    if shape_type == _NULL:
        return None

    if shape_type in _POINT_TYPES:
        if len(content) < 20:
            raise ParseError(f"point shape record is {len(content)} bytes, expected at least 20")
        x, y = struct.unpack_from("<dd", content, 4)
        return [(x, y)]

    if shape_type in _MULTIPOINT_TYPES:
        num_points = struct.unpack_from("<i", content, 36)[0]
        return _read_points(content, 44, num_points)

    if shape_type in _POLYLINE_TYPES or shape_type in _POLYGON_TYPES:
        if len(content) < 44:
            raise ParseError(f"line/polygon shape record is {len(content)} bytes, expected at least 44")
        num_parts, num_points = struct.unpack_from("<ii", content, 36)
        if num_parts < 1 or num_points < 2:
            raise ParseError(
                f"line/polygon shape has numParts={num_parts} numPoints={num_points}, which cannot describe geometry"
            )
        parts_offset = 44
        points_offset = parts_offset + 4 * num_parts
        required = points_offset + 16 * num_points
        if len(content) < required:
            raise ParseError(
                f"line/polygon shape claims {num_parts} parts and {num_points} points "
                f"({required} bytes needed) but the record is only {len(content)} bytes"
            )
        part_starts = list(struct.unpack_from(f"<{num_parts}i", content, parts_offset))
        all_points = _read_points(content, points_offset, num_points)
        rings: list[list[tuple[float, float]]] = []
        for index, start in enumerate(part_starts):
            stop = part_starts[index + 1] if index + 1 < num_parts else num_points
            ring = all_points[start:stop]
            if len(ring) < 2:
                raise ParseError(
                    f"ring {index} of a {num_parts}-part shape has {len(ring)} vertices; a usable "
                    "line or ring needs at least 2"
                )
            rings.append(ring)
        return rings

    raise ParseError(
        f"shape type {shape_type} is not supported by this reader. Supported types are null, point, "
        f"multipoint, polyline and polygon in their 2D, Z and M variants."
    )


def _read_points(content: bytes, offset: int, count: int) -> list[tuple[float, float]]:
    needed = offset + 16 * count
    if needed > len(content):
        raise ParseError(f"shape claims {count} points ({needed} bytes needed) but the record is {len(content)} bytes")
    flat = struct.unpack_from(f"<{2 * count}d", content, offset)
    return [(flat[i * 2], flat[i * 2 + 1]) for i in range(count)]


def read_shp(path: Path) -> tuple[int, tuple[float, float, float, float], list[object]]:
    """Read the geometry of a .shp file.

    Returns (shape_type, bbox, shapes). Shapes are nested coordinate lists as
    described in the module docstring.
    """
    with path.open("rb") as handle:
        header = _read_exactly(handle, _HEADER_BYTES, "the shapefile header")
        (file_code,) = struct.unpack_from(">i", header, 0)
        if file_code != _SHP_FILE_CODE:
            raise ParseError(f"{path} has file code {file_code}, not {_SHP_FILE_CODE}; this is not a .shp file")
        (version,) = struct.unpack_from("<i", header, 28)
        if version != _SHAPE_VERSION:
            raise ParseError(f"{path} declares shape format version {version}, expected {_SHAPE_VERSION}")
        file_length_words = struct.unpack_from(">i", header, 24)[0]
        shape_type = struct.unpack_from("<i", header, 32)[0]
        bbox = struct.unpack_from("<4d", header, 36)
        declared_bytes = file_length_words * 2
        actual_bytes = path.stat().st_size
        if declared_bytes != actual_bytes:
            raise ParseError(
                f"{path} header declares {declared_bytes} bytes but the file is {actual_bytes} bytes; "
                "the download is truncated or the file is corrupt"
            )

        shapes: list[object] = []
        while handle.tell() < actual_bytes:
            record_header = handle.read(_RECORD_HEADER_BYTES)
            if len(record_header) == 0:
                break
            if len(record_header) != _RECORD_HEADER_BYTES:
                raise ParseError(
                    f"{path}: record header at offset {handle.tell() - len(record_header)} is truncated"
                )
            _record_number, content_words = struct.unpack(">ii", record_header)
            content = _read_exactly(handle, content_words * 2, f"record {_record_number} content")
            shapes.append(_parse_shape_content(shape_type, content))

    return shape_type, (bbox[0], bbox[1], bbox[2], bbox[3]), shapes


def read_dbf(path: Path) -> tuple[list[str], list[dict[str, object]]]:
    """Read a dBASE III (.dbf) attribute table.

    Returns (field_names, records). Values are typed by the field descriptor:
    N and F become float, L becomes bool, everything else stays a string with
    trailing whitespace stripped, which is how the source encodes "empty".
    """
    with path.open("rb") as handle:
        header = _read_exactly(handle, _DBFILE_HEADER_BYTES, "the dbf header")
        num_records = struct.unpack_from("<i", header, 4)[0]
        header_length = struct.unpack_from("<h", header, 8)[0]
        record_length = struct.unpack_from("<h", header, 10)[0]
        if header_length < _DBFILE_HEADER_BYTES + _FIELD_DESCRIPTOR_BYTES:
            raise ParseError(f"{path} declares a header length of {header_length} bytes, which is too small")
        if record_length < 1:
            raise ParseError(f"{path} declares a record length of {record_length} bytes, which is invalid")
        if num_records < 0:
            raise ParseError(f"{path} declares {num_records} records, which cannot be right")

        descriptors: list[tuple[str, str, int]] = []
        position = _DBFILE_HEADER_BYTES
        while position + _FIELD_DESCRIPTOR_BYTES <= header_length:
            raw = _read_exactly(handle, _FIELD_DESCRIPTOR_BYTES, f"field descriptor {position}")
            if raw[0] == _FIELD_TERMINATOR:
                break
            name = raw[:11].split(b"\x00")[0].decode("latin-1").strip()
            field_type = raw[11:12].decode("latin-1")
            size = raw[16]
            if size == 0:
                raise ParseError(f"{path} field {name!r} declares a length of 0 bytes")
            descriptors.append((name, field_type, size))
            position += _FIELD_DESCRIPTOR_BYTES
        if not descriptors:
            raise ParseError(f"{path} declares no fields; the attribute table is unusable")

        field_names = [name for name, _, _ in descriptors]
        handle.seek(header_length)

        records: list[dict[str, object]] = []
        for record_index in range(num_records):
            raw = _read_exactly(handle, record_length, f"record {record_index + 1}")
            if raw[0:1] == b"*":
                # dBASE marks a deleted record with '*'. Census files do not use
                # it, but skipping silently would drop rows, so it is reported.
                raise ParseError(
                    f"{path} record {record_index + 1} is flagged deleted. Deleted rows are not "
                    "skipped, because a dropped row becomes a missing settlement."
                )
            record: dict[str, object] = {}
            offset = 1
            for name, field_type, size in descriptors:
                chunk = raw[offset : offset + size]
                offset += size
                record[name] = _decode_field(chunk, field_type)
            records.append(record)

    return field_names, records


def _decode_field(raw: bytes, field_type: str) -> object:
    text = raw.decode("latin-1").strip()
    if not text:
        # An empty cell is missing data, not zero. Callers must handle None.
        return None
    if field_type in {"N", "F"}:
        try:
            number = float(text)
        except ValueError as exc:
            raise ParseError(f"field of type {field_type} contains {text!r}, which is not a number") from exc
        return int(number) if number.is_integer() and "." not in text else number
    if field_type == "L":
        return text.upper() in {"Y", "T"}
    return text


def iter_shapes(path: Path) -> Iterator[tuple[object, tuple[float, float, float, float]]]:
    """Yield each shape's geometry one at a time, with the file's bounding box.

    Streaming is not an optimisation here, it is a requirement. The national TIGER
    rail layer is 119,857 polylines; reading them all into Python tuples at once
    costs hundreds of megabytes and kills the process on a machine with ordinary
    free memory. Callers that only need one pass over a large layer must use this
    rather than ``read_shp``.
    """
    with path.open("rb") as handle:
        header = _read_exactly(handle, _HEADER_BYTES, "the shapefile header")
        (file_code,) = struct.unpack_from(">i", header, 0)
        if file_code != _SHP_FILE_CODE:
            raise ParseError(f"{path} has file code {file_code}, not {_SHP_FILE_CODE}; this is not a .shp file")
        (version,) = struct.unpack_from("<i", header, 28)
        if version != _SHAPE_VERSION:
            raise ParseError(f"{path} declares shape format version {version}, expected {_SHAPE_VERSION}")
        file_length_words = struct.unpack_from(">i", header, 24)[0]
        shape_type = struct.unpack_from("<i", header, 32)[0]
        bbox = struct.unpack_from("<4d", header, 36)
        declared_bytes = file_length_words * 2
        actual_bytes = path.stat().st_size
        if declared_bytes != actual_bytes:
            raise ParseError(
                f"{path} header declares {declared_bytes} bytes but the file is {actual_bytes} bytes; "
                "the download is truncated or the file is corrupt"
            )
        while handle.tell() < actual_bytes:
            record_header = handle.read(_RECORD_HEADER_BYTES)
            if len(record_header) == 0:
                break
            if len(record_header) != _RECORD_HEADER_BYTES:
                raise ParseError(
                    f"{path}: record header at offset {handle.tell() - len(record_header)} is truncated"
                )
            record_number, content_words = struct.unpack(">ii", record_header)
            content = _read_exactly(handle, content_words * 2, f"record {record_number} content")
            yield (_parse_shape_content(shape_type, content), (bbox[0], bbox[1], bbox[2], bbox[3]))


def iter_dbf(path: Path) -> Iterator[tuple[str, dict[str, object]]]:
    """Yield (field-name-tuple, record) one row at a time.

    Streaming matters for the large layers. The national rail attribute table
    has 119,857 rows; holding them all as dicts alongside the route index was the
    largest single allocation in the pipeline and the reason it kept being killed
    at the export stage.
    """
    with path.open("rb") as handle:
        header = _read_exactly(handle, _DBFILE_HEADER_BYTES, "the dbf header")
        num_records = struct.unpack_from("<i", header, 4)[0]
        header_length = struct.unpack_from("<h", header, 8)[0]
        record_length = struct.unpack_from("<h", header, 10)[0]
        if header_length < _DBFILE_HEADER_BYTES + _FIELD_DESCRIPTOR_BYTES:
            raise ParseError(f"{path} declares a header length of {header_length} bytes, which is too small")
        if record_length < 1:
            raise ParseError(f"{path} declares a record length of {record_length} bytes, which is invalid")
        if num_records < 0:
            raise ParseError(f"{path} declares {num_records} records, which cannot be right")

        descriptors: list[tuple[str, str, int]] = []
        position = _DBFILE_HEADER_BYTES
        while position + _FIELD_DESCRIPTOR_BYTES <= header_length:
            raw = _read_exactly(handle, _FIELD_DESCRIPTOR_BYTES, f"field descriptor {position}")
            if raw[0] == _FIELD_TERMINATOR:
                break
            name = raw[:11].split(b"\x00")[0].decode("latin-1").strip()
            field_type = raw[11:12].decode("latin-1")
            size = raw[16]
            if size == 0:
                raise ParseError(f"{path} field {name!r} declares a length of 0 bytes")
            descriptors.append((name, field_type, size))
            position += _FIELD_DESCRIPTOR_BYTES
        if not descriptors:
            raise ParseError(f"{path} declares no fields; the attribute table is unusable")

        field_names = tuple(name for name, _, _ in descriptors)
        handle.seek(header_length)
        for record_index in range(num_records):
            raw = _read_exactly(handle, record_length, f"record {record_index + 1}")
            if raw[0:1] == b"*":
                raise ParseError(
                    f"{path} record {record_index + 1} is flagged deleted. Deleted rows are not "
                    "skipped, because a dropped row becomes a missing settlement."
                )
            record: dict[str, object] = {}
            offset = 1
            for name, field_type, size in descriptors:
                chunk = raw[offset : offset + size]
                offset += size
                record[name] = _decode_field(chunk, field_type)
            yield (field_names, record)


def read_shapefile(shp_path: Path, dbf_path: Path) -> Shapefile:
    """Read a .shp and its matching .dbf into one aligned table."""
    shape_type, bbox, shapes = read_shp(shp_path)
    fields, records = read_dbf(dbf_path)
    if len(shapes) != len(records):
        raise ParseError(
            f"{shp_path.name} has {len(shapes)} shapes but {dbf_path.name} has {len(records)} records; "
            "shapefile geometry and attributes must be row-aligned"
        )
    return Shapefile(shape_type=shape_type, bbox=bbox, shapes=shapes, fields=fields, records=records)
