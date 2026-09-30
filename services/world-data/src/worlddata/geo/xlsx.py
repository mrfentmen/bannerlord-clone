"""Minimal XLSX reader built on the stdlib.

Why: several authoritative US federal datasets needed by the state profiles -
USDA ERS major land uses, among them - are published only as .xlsx. An .xlsx
file is a ZIP archive of XML, and Python ships both a ZIP reader and an XML
parser, so reading one is a bounded, well-specified job rather than a reason to
add openpyxl or pandas' Excel engines to the dependency list.

Supported: the first worksheet, shared strings, inline strings, numeric cells,
boolean cells, and the cached formula results. Not supported, and reported as
unsupported rather than guessed at: charts, pivot tables, macros, and files
using the newer rich-value cell types.
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from xml.etree import ElementTree

from ..errors import ParseError

# Office Open XML namespaces. Only the subset this reader touches.
_MAIN_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
# Namespace of the r:id attribute on a <sheet> element in workbook.xml.
_DOCUMENT_REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
# Namespace of <Relationship> elements inside a .rels part.
_PACKAGE_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"

# Cell type codes from the spec that carry a plain value.
_TYPE_NUMBER = "n"
_TYPE_SHARED_STRING = "s"
_TYPE_INLINE_STRING = "inlineStr"
_TYPE_BOOLEAN = "b"
_TYPE_STRING = "str"
_TYPE_ERROR = "e"
# Excel's 1900 date epoch offset in days, for the serials USDA tables sometimes
# contain in a header row. Only used when a caller asks for a date.
_EXCEL_EPOCH_OFFSET_DAYS = 25569  # days between 1900-01-01 and 1970-01-01


@dataclass(frozen=True)
class Sheet:
    """One worksheet as a list of rows of cells. Cells may be None."""

    name: str
    rows: list[list[Any]]


def read_first_sheet(path: Path) -> Sheet:
    """Read the first worksheet of an .xlsx file."""
    with zipfile.ZipFile(path) as archive:
        shared_strings = _read_shared_strings(archive)
        sheet_path = _first_sheet_path(archive)
        rows = _read_sheet(archive, sheet_path, shared_strings)
    return Sheet(name=Path(sheet_path).stem, rows=rows)


def _first_sheet_path(archive: zipfile.ZipFile) -> str:
    try:
        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    except KeyError as exc:
        raise ParseError("xlsx archive has no xl/workbook.xml, so it is not a workbook") from exc
    sheets = workbook.findall(f"{_MAIN_NS}sheets/{_MAIN_NS}sheet")
    if not sheets:
        raise ParseError("xlsx workbook declares no worksheets")
    sheet_id = sheets[0].get(f"{_DOCUMENT_REL_NS}id")
    if not sheet_id:
        raise ParseError("xlsx workbook's first sheet has no relationship id")

    relationships = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    for relationship in relationships.findall(f"{_PACKAGE_REL_NS}Relationship"):
        if relationship.get("Id") == sheet_id:
            target = relationship.get("Target") or ""
            if target.startswith("/"):
                return target.lstrip("/")
            return f"xl/{target}" if not target.startswith("xl/") else target
    raise ParseError(f"xlsx relationship {sheet_id!r} for the first sheet is missing from workbook.xml.rels")


def _read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for item in root.findall(f"{_MAIN_NS}si"):
        strings.append(_si_text(item))
    return strings


def _si_text(node: ElementTree.Element) -> str:
    # A shared string is either one <t> or a run sequence of <r><t>, which is
    # how rich text and multiple-font runs are stored.
    direct = node.find(f"{_MAIN_NS}t")
    if direct is not None and direct.text:
        return direct.text
    pieces: list[str] = []
    for run in node.findall(f"{_MAIN_NS}r"):
        text = run.find(f"{_MAIN_NS}t")
        if text is not None and text.text:
            pieces.append(text.text)
    return "".join(pieces)


def _column_index(reference: str) -> int:
    """'BC12' -> 54, zero-based column index."""
    letters = "".join(character for character in reference if character.isalpha())
    if not letters:
        raise ParseError(f"cell reference {reference!r} has no column letters")
    index = 0
    for character in letters.upper():
        index = index * 26 + (ord(character) - ord("A") + 1)
    return index - 1


def _row_index(reference: str) -> int:
    digits = "".join(character for character in reference if character.isdigit())
    if not digits:
        raise ParseError(f"cell reference {reference!r} has no row number")
    return int(digits) - 1


def _read_sheet(archive: zipfile.ZipFile, sheet_path: str, shared_strings: list[str]) -> list[list[Any]]:
    try:
        root = ElementTree.fromstring(archive.read(sheet_path))
    except KeyError as exc:
        raise ParseError(f"xlsx archive is missing {sheet_path}, referenced by the workbook") from exc

    rows: list[list[Any]] = []
    for row_node in root.iter(f"{_MAIN_NS}row"):
        row_number = _row_index(row_node.get("r") or "1")
        while len(rows) <= row_number:
            rows.append([])
        cells: list[Any] = rows[row_number]
        for cell in row_node.findall(f"{_MAIN_NS}c"):
            reference = cell.get("r") or ""
            column = _column_index(reference) if reference else len(cells)
            while len(cells) <= column:
                cells.append(None)
            cells[column] = _cell_value(cell, shared_strings)
    return rows


def _cell_value(cell: ElementTree.Element, shared_strings: list[str]) -> Any:
    cell_type = cell.get("t")
    if cell_type == _TYPE_INLINE_STRING:
        inline = cell.find(f"{_MAIN_NS}is")
        return _si_text(inline) if inline is not None else None
    value_node = cell.find(f"{_MAIN_NS}v")
    if value_node is None or value_node.text is None:
        # A formula cell with no cached <v> means the file was written by a
        # tool that never calculated it. Returning None would read as "no data",
        # so this is reported.
        if cell.find(f"{_MAIN_NS}f") is not None:
            raise ParseError(
                "xlsx cell has a formula but no cached value, so the workbook was saved without "
                "being calculated. Refusing to treat it as empty."
            )
        return None
    raw = value_node.text
    if cell_type == _TYPE_SHARED_STRING:
        index = int(raw)
        try:
            return shared_strings[index]
        except IndexError as exc:
            raise ParseError(f"xlsx shared string index {index} is out of range ({len(shared_strings)} strings)") from exc
    if cell_type == _TYPE_BOOLEAN:
        return raw.strip() == "1"
    if cell_type in {_TYPE_STRING, _TYPE_ERROR}:
        return raw
    try:
        number = float(raw)
    except ValueError as exc:
        raise ParseError(f"xlsx numeric cell holds {raw!r}, which is not a number") from exc
    return int(number) if number.is_integer() else number


def find_row(rows: list[list[Any]], predicate, description: str) -> int:
    """Index of the first row satisfying ``predicate``, or raise.

    US government workbooks hide their real headers under a title block and
    merged banner rows, so finding the header row by content is the normal
    case rather than a corner case. Failing loudly when the expected table
    cannot be located prevents a silent misalignment of columns.
    """
    for index, row in enumerate(rows):
        if predicate(row):
            return index
    raise ParseError(
        f"could not find {description} in the worksheet. First five rows were: "
        f"{[row[:8] for row in rows[:5]]}"
    )


def cell(row: list[Any], column: int) -> Any:
    """Cell at a zero-based column, or None when the row is short."""
    return row[column] if column < len(row) else None


def as_text(value: Any) -> str:
    """Normalise a worksheet cell to trimmed text, with None for blanks."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def as_number(value: Any) -> float | None:
    """Parse a worksheet cell as a number. Returns None for blanks and for
    the placeholder tokens US statistical workbooks use for suppressed or
    not-applicable cells (``(D)``, ``(NA)``, ``..``, ``-``)."""
    text = as_text(value)
    if not text:
        return None
    stripped = text.strip("()")
    if stripped.upper() in {"NA", "D", "X", ""} or set(stripped) <= {"."} or set(stripped) <= {"-"}:
        return None
    if stripped.endswith("%"):
        body = stripped[:-1].replace(",", "")
        try:
            return float(body)
        except ValueError:
            return None
    cleaned = stripped.replace(",", "").replace("$", "").replace(" ", "")
    try:
        return float(cleaned)
    except ValueError:
        return None
