"""Reading a Parquet file's footer without pyarrow.

`pyarrow` is an optional dependency of this package (`pyproject.toml`, extra
`parquet`) and the pipeline degrades to JSONL when it is absent. That is a fine
arrangement for *writing* the export, where the omission is reported, and a poor
one for *checking* it: the committed bundle publishes every table as both JSONL
and Parquet, and the check that the two agree is the whole reason
`worlddata.verify` exists. If the Parquet half silently drops out of that check
whenever pyarrow is missing, then the machine least able to install pyarrow - a
network-restricted build box - is the one that never looks.

So the footer is read here instead. A Parquet file ends with a Thrift-compact
encoded `FileMetaData`, framed as

    ...row groups... | <4-byte LE length> | FileMetaData | b"PAR1"

and that metadata carries the file's row count, its schema, and per-column
statistics, none of which are compressed. Reading it needs no codec at all, so
it works with nothing but the standard library.

What this module does *not* do is read data pages. Row values live in compressed
Thrift-encoded pages whose codecs (Snappy in particular) are not in the standard
library, so `read_parquet` below answers "how many rows, which columns, what
range does each column span" and stops there. That is exactly the question the
export-sync check asks. Reading `route_segments.parquet`'s geometry back out
still needs pyarrow, and the callers that need real values still say so.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# The magic that opens and closes every Parquet file.
MAGIC = b"PAR1"

# --- Thrift compact protocol type ids -----------------------------------------
T_STOP = 0x00
T_TRUE = 0x01
T_FALSE = 0x02
T_BYTE = 0x03
T_I16 = 0x04
T_I32 = 0x05
T_I64 = 0x06
T_DOUBLE = 0x07
T_BINARY = 0x08
T_LIST = 0x09
T_SET = 0x0A
T_MAP = 0x0B
T_STRUCT = 0x0C


class ParquetMetaError(Exception):
    """The file is not a Parquet file, or its footer is not readable."""


# ---------------------------------------------------------------------------
# Thrift compact protocol.
# ---------------------------------------------------------------------------

def _varint(buf: bytes, pos: int) -> tuple[int, int]:
    """Read an unsigned varint. Returns (value, new position)."""
    result = 0
    shift = 0
    while True:
        if pos >= len(buf):
            raise ParquetMetaError("varint ran off the end of the footer")
        byte = buf[pos]
        pos += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, pos
        shift += 7
        if shift > 70:
            raise ParquetMetaError("varint is longer than 10 bytes; this is not Thrift compact")


def _zigzag(value: int) -> int:
    return (value >> 1) ^ -(value & 1)


def _read_struct(buf: bytes, pos: int) -> tuple[dict[int, Any], int]:
    """Read one struct body as {field_id: value}, up to its STOP marker."""
    fields: dict[int, Any] = {}
    last_id = 0
    while True:
        if pos >= len(buf):
            raise ParquetMetaError("struct ran off the end of the footer")
        header = buf[pos]
        pos += 1
        if header == T_STOP:
            return fields, pos
        field_type = header & 0x0F
        delta = (header & 0xF0) >> 4
        if delta == 0:
            raw, pos = _varint(buf, pos)
            field_id = _zigzag(raw)
        else:
            field_id = last_id + delta
        last_id = field_id
        value, pos = _read_value(buf, pos, field_type)
        fields[field_id] = value


def _read_value(buf: bytes, pos: int, field_type: int) -> tuple[Any, int]:
    if field_type in (T_TRUE, T_FALSE):
        return field_type == T_TRUE, pos
    if field_type == T_BYTE:
        if pos >= len(buf):
            raise ParquetMetaError("byte ran off the end of the footer")
        value = buf[pos] - 256 if buf[pos] > 127 else buf[pos]
        return value, pos + 1
    if field_type in (T_I16, T_I32, T_I64):
        raw, pos = _varint(buf, pos)
        return _zigzag(raw), pos
    if field_type == T_DOUBLE:
        if pos + 8 > len(buf):
            raise ParquetMetaError("double ran off the end of the footer")
        return struct.unpack_from("<d", buf, pos)[0], pos + 8
    if field_type == T_BINARY:
        length, pos = _varint(buf, pos)
        if pos + length > len(buf):
            raise ParquetMetaError("binary field is longer than the footer")
        return buf[pos : pos + length], pos + length
    if field_type in (T_LIST, T_SET):
        if pos >= len(buf):
            raise ParquetMetaError("list header ran off the end of the footer")
        header = buf[pos]
        pos += 1
        element_type = header & 0x0F
        size = (header & 0xF0) >> 4
        if size == 0x0F:
            size, pos = _varint(buf, pos)
        out: list[Any] = []
        for _ in range(size):
            value, pos = _read_value(buf, pos, element_type)
            out.append(value)
        return out, pos
    if field_type == T_MAP:
        size, pos = _varint(buf, pos)
        if size == 0:
            return {}, pos
        if pos >= len(buf):
            raise ParquetMetaError("map header ran off the end of the footer")
        types = buf[pos]
        pos += 1
        key_type = (types & 0xF0) >> 4
        value_type = types & 0x0F
        out_map: dict[Any, Any] = {}
        for _ in range(size):
            key, pos = _read_value(buf, pos, key_type)
            value, pos = _read_value(buf, pos, value_type)
            out_map[key] = value
        return out_map, pos
    if field_type == T_STRUCT:
        return _read_struct(buf, pos)
    raise ParquetMetaError(f"unknown Thrift type id {field_type} in the footer")


# ---------------------------------------------------------------------------
# Parquet structures, by field id.
# ---------------------------------------------------------------------------

@dataclass
class ColumnMeta:
    """One column of one row group, as the footer describes it."""

    name: str
    physical_type: str
    num_values: int
    codec: str
    null_count: int | None = None
    min_value: Any = None
    max_value: Any = None

    @property
    def min(self) -> Any:
        """``min_value`` decoded, or the legacy ``min`` field decoded."""
        return self.min_value

    @property
    def max(self) -> Any:
        return self.max_value


# Parquet `Type` enum. Only the names are kept; nothing here needs the numbers.
PHYSICAL_TYPES = {
    0: "BOOLEAN",
    1: "INT32",
    2: "INT64",
    3: "INT96",
    4: "FLOAT",
    5: "DOUBLE",
    6: "BYTE_ARRAY",
    7: "FIXED_LEN_BYTE_ARRAY",
}

# Parquet `CompressionCodec` enum.
CODECS = {
    0: "UNCOMPRESSED",
    1: "SNAPPY",
    2: "GZIP",
    3: "LZO",
    4: "BROTLI",
    5: "LZ4",
    6: "ZSTD",
    7: "LZ4_RAW",
}

# Parquet physical type -> the struct format its statistics are encoded with.
# Statistics hold the smallest and largest value of a column in the column's own
# physical encoding, so DOUBLE is eight little-endian IEEE-754 bytes and not an
# eight-byte integer. Reading one as the other produces a number that is
# confidently wrong - -1.4e19 instead of -122.3 - which is the failure mode this
# table exists to prevent.
_STAT_FORMATS = {
    "BOOLEAN": None,
    "INT32": "<i",
    "INT64": "<q",
    "FLOAT": "<f",
    "DOUBLE": "<d",
}
_STAT_WIDTHS = {"INT32": 4, "INT64": 8, "FLOAT": 4, "DOUBLE": 8}


def _decode_stat(raw: bytes | None, physical_type: str) -> Any:
    """Decode a Parquet statistics blob into a Python value.

    BYTE_ARRAY statistics are raw UTF-8, which is how the pandas and pyarrow
    writers store string columns. Anything else is left as the raw bytes rather
    than guessed at: a wrong number in a report is worse than an absent one.
    """
    if raw is None:
        return None
    if physical_type == "BYTE_ARRAY":
        return raw.decode("utf-8", errors="replace")
    fmt = _STAT_FORMATS.get(physical_type)
    width = _STAT_WIDTHS.get(physical_type)
    if fmt is not None and width is not None and len(raw) == width:
        return struct.unpack(fmt, raw)[0]
    return raw


def _statistics(meta: dict[int, Any], physical_type: str) -> tuple[Any, Any, int | None]:
    stats = meta.get(12)
    if not isinstance(stats, dict):
        return None, None, None
    null_count = stats.get(3)
    # min_value/max_value (5/6) supersede min/max (1/2) and are what current
    # writers emit; fall back so an older file still reports a range.
    low = stats.get(6, stats.get(1))
    high = stats.get(5, stats.get(2))
    return (
        _decode_stat(low, physical_type),
        _decode_stat(high, physical_type),
        null_count if isinstance(null_count, int) else None,
    )


def read_metadata(path: Path) -> dict[str, Any]:
    """Parse a Parquet file's footer.

    Returns a dict with ``num_rows``, ``columns`` (leaf column names, in schema
    order), ``created_by``, and ``row_groups`` (a list of dicts with
    ``num_rows`` and per-column metadata).
    """
    path = Path(path)
    with path.open("rb") as handle:
        handle.seek(0, 2)
        size = handle.tell()
        if size < 12:
            raise ParquetMetaError(f"{path} is {size} bytes, too small to be a Parquet file")
        handle.seek(0)
        if handle.read(4) != MAGIC:
            raise ParquetMetaError(f"{path} does not start with the Parquet magic {MAGIC!r}")
        handle.seek(-8, 2)
        trailer = handle.read(8)
        if trailer[4:] != MAGIC:
            raise ParquetMetaError(f"{path} does not end with the Parquet magic {MAGIC!r}")
        (footer_length,) = struct.unpack("<I", trailer[:4])
        start = size - 8 - footer_length
        if start < 4:
            raise ParquetMetaError(f"{path} declares a {footer_length}-byte footer, past the start")
        handle.seek(start)
        footer = handle.read(footer_length)

    metadata, _pos = _read_struct(footer, 0)

    schema_elements = metadata.get(2) or []
    num_rows = metadata.get(3)
    if not isinstance(num_rows, int):
        raise ParquetMetaError(f"{path}'s footer has no row count")

    # A leaf SchemaElement is one with no num_children. The root is element 0.
    leaves: list[dict[int, Any]] = [
        element for element in schema_elements if isinstance(element, dict) and not element.get(5)
    ]

    row_groups: list[dict[str, Any]] = []
    for group in metadata.get(4) or []:
        if not isinstance(group, dict):
            continue
        columns: list[ColumnMeta] = []
        for chunk in group.get(1) or []:
            if not isinstance(chunk, dict):
                continue
            meta = chunk.get(3)
            if not isinstance(meta, dict):
                continue
            path_parts = meta.get(3) or []
            physical = PHYSICAL_TYPES.get(meta.get(1), f"UNKNOWN({meta.get(1)})")
            low, high, nulls = _statistics(meta, physical)
            columns.append(
                ColumnMeta(
                    name=".".join(
                        part.decode("utf-8", errors="replace") if isinstance(part, bytes) else str(part)
                        for part in path_parts
                    ),
                    physical_type=physical,
                    num_values=int(meta.get(5) or 0),
                    codec=CODECS.get(meta.get(4), f"UNKNOWN({meta.get(4)})"),
                    null_count=nulls,
                    min_value=low,
                    max_value=high,
                )
            )
        row_groups.append({"num_rows": int(group.get(3) or 0), "columns": columns})

    created_by = metadata.get(6)
    if isinstance(created_by, bytes):
        created_by = created_by.decode("utf-8", errors="replace")

    return {
        "num_rows": num_rows,
        "columns": [
            (element.get(4) or b"").decode("utf-8", errors="replace")
            if isinstance(element.get(4), bytes)
            else str(element.get(4))
            for element in leaves
        ],
        "created_by": created_by,
        "row_groups": row_groups,
        "column_stats": _collapse_stats(row_groups),
    }


def _collapse_stats(row_groups: list[dict[str, Any]]) -> dict[str, ColumnMeta]:
    """Fold per-row-group statistics into one range per column.

    A file written with many row groups has many partial ranges; the bundle's
    tables are written whole, so this normally collapses to a single group. It is
    done anyway because a partial range silently reported as a total range would
    make a data disagreement look like agreement.
    """
    out: dict[str, ColumnMeta] = {}
    for group in row_groups:
        for column in group["columns"]:
            existing = out.get(column.name)
            if existing is None:
                out[column.name] = ColumnMeta(
                    name=column.name,
                    physical_type=column.physical_type,
                    num_values=column.num_values,
                    codec=column.codec,
                    null_count=column.null_count,
                    min_value=column.min_value,
                    max_value=column.max_value,
                )
                continue
            existing.num_values += column.num_values
            if existing.null_count is not None and column.null_count is not None:
                existing.null_count += column.null_count
            for attribute, better in (("min_value", min), ("max_value", max)):
                mine = getattr(existing, attribute)
                theirs = getattr(column, attribute)
                if mine is None:
                    setattr(existing, attribute, theirs)
                elif theirs is not None and isinstance(mine, (int, float)) and isinstance(theirs, (int, float)):
                    setattr(existing, attribute, better(mine, theirs))
    return out


def read_parquet_summary(path: Path) -> dict[str, Any]:
    """``read_metadata`` that reports failure as a string instead of an exception.

    Callers that want to present the result to a person (rather than abort)
    use this; callers that treat a missing file as fatal use `read_metadata`.
    """
    try:
        return read_metadata(Path(path))
    except (ParquetMetaError, OSError, struct.error) as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}
