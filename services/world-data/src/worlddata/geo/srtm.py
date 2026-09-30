"""SRTM elevation (.hgt) reading and sampling.

SPEC.md section 2 requires elevation from a public DEM for campaign terrain and
battle maps. The tiles used here are SRTM 1 arc-second "HGT" files published in
the AWS Open Data "Skadi" bucket, which is a mirror of the USGS SRTM void-filled
distribution. A .hgt file is a headerless grid of big-endian signed 16-bit
integers - exactly two bytes per cell - so numpy reads it directly and no raster
library is needed.

Vertical datum is EGM96 geoid height, which is what SRTM publishes. Horizontal
datum is WGS84, matching every other dataset here.
"""

from __future__ import annotations

import gzip
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..errors import ParseError

# SRTM voids are encoded as this value in every product.
VOID_VALUE = -32768
# Grid side length in pixels mapped to arc-seconds per pixel: SRTM1 is 3601
# pixels at 1 arc-second, SRTM3 is 1201 pixels at 3 arc-seconds.
#
# The grid size is how the file is identified; the arc-seconds are how a pixel is
# sized. Conflating the two made a 1 arc-second tile read as a 1 DEGREE grid, so
# every elevation sample in the pipeline came from one corner of the tile.
_ARCSECOND_TILES = {3601: 1, 1201: 3}
_ARCSECONDS_PER_DEGREE = 3600.0
# A tile name is a latitude band then a longitude band, e.g. N35W123.
_TILE_PATTERN = re.compile(r"^([NS])(\d{2})([EW])(\d{3})$")


@dataclass(frozen=True)
class ElevationTile:
    """One DEM tile, ready to sample.

    ``row 0`` is the northernmost row of the tile, matching the SRTM convention
    and the GeoTIFF north-up convention, so index arithmetic matches every other
    raster consumer.
    """

    name: str
    south_lat: float
    west_lon: float
    pixel_degrees: float
    elevation_m: np.ndarray

    @property
    def rows(self) -> int:
        return int(self.elevation_m.shape[0])

    @property
    def columns(self) -> int:
        return int(self.elevation_m.shape[1])

    def elevation_at(self, lon: float, lat: float) -> float:
        """Bilinear elevation in metres at a lon/lat inside this tile.

        Raises ParseError when the point is outside the tile, so a caller can
        never quietly sample a clamped edge value.
        """
        if not (self.west_lon <= lon <= self.west_lon + self.columns * self.pixel_degrees):
            raise ParseError(f"longitude {lon} is outside tile {self.name} (west edge {self.west_lon})")
        if not (self.south_lat <= lat <= self.south_lat + self.rows * self.pixel_degrees):
            raise ParseError(f"latitude {lat} is outside tile {self.name} (south edge {self.south_lat})")

        # Pixel-centre offset: the centre of cell (0,0) sits half a cell north
        # and east of the tile's south-west corner.
        col = (lon - self.west_lon) / self.pixel_degrees - 0.5
        row = (self.rows - 1) - (lat - self.south_lat) / self.pixel_degrees - 0.5

        col0 = int(np.floor(col))
        row0 = int(np.floor(row))
        col1 = min(self.columns - 1, col0 + 1)
        row1 = min(self.rows - 1, row0 + 1)
        col0 = max(0, col0)
        row0 = max(0, row0)

        frac_col = col - col0
        frac_row = row - row0
        grid = self.elevation_m
        top = grid[row0, col0] * (1 - frac_col) + grid[row0, col1] * frac_col
        bottom = grid[row1, col0] * (1 - frac_col) + grid[row1, col1] * frac_col
        return float(top * (1 - frac_row) + bottom * frac_row)


def parse_tile_name(tile: str) -> tuple[float, float]:
    """Return (south_lat, west_lon) for a tile name such as ``N35W123``."""
    match = _TILE_PATTERN.match(tile.strip().upper())
    if not match:
        raise ParseError(
            f"{tile!r} is not an SRTM tile name; expected a latitude band then a longitude band, "
            "for example N35W123"
        )
    ns, lat_digits, ew, lon_digits = match.groups()
    latitude = int(lat_digits)
    longitude = int(lon_digits)
    if not 1 <= latitude <= 60:
        raise ParseError(f"tile {tile!r} has latitude band {latitude}; SRTM covers 1 to 60 degrees north")
    if not 1 <= longitude <= 180:
        raise ParseError(f"tile {tile!r} has longitude band {longitude}; SRTM covers 1 to 180 degrees")
    south_lat = -latitude if ns == "S" else latitude - 1.0
    west_lon = -longitude if ew == "W" else longitude - 1.0
    return (south_lat, west_lon)


def read_hgt(path: Path, tile: str, *, max_void_fraction: float) -> ElevationTile:
    """Read one .hgt file, or one .hgt.gz, into an ElevationTile.

    ``max_void_fraction`` is the share of cells allowed to be SRTM voids. Above
    it, the tile is rejected rather than sampled, because a mostly-empty tile
    produces meaningless elevation and every downstream battle map would inherit
    that. Reasonable range 0.001..0.05; the value comes from config.
    """
    south_lat, west_lon = parse_tile_name(tile)
    raw: bytes
    if path.suffix == ".gz":
        try:
            with gzip.open(path, "rb") as handle:
                raw = handle.read()
        except OSError as exc:
            raise ParseError(f"could not decompress {path}: {exc}") from exc
    else:
        raw = path.read_bytes()

    byte_count = len(raw)
    side = None
    for candidate, degrees in _ARCSECOND_TILES.items():
        if byte_count == candidate * candidate * 2:
            side = (candidate, degrees)
            break
    if side is None:
        raise ParseError(
            f"{path} is {byte_count} bytes, which matches no known SRTM grid. "
            f"Expected a square grid of big-endian int16 at "
            f"{' or '.join(str(size * size * 2) for size in _ARCSECOND_TILES)} bytes."
        )
    size, degrees = side

    grid = np.frombuffer(raw, dtype=">i2").reshape(size, size)
    void_fraction = float(np.count_nonzero(grid == VOID_VALUE)) / float(size * size)
    if void_fraction > max_void_fraction:
        raise ParseError(
            f"{path} is {void_fraction:.4%} void, above the configured ceiling "
            f"{max_void_fraction:.4%} (terrain.max_void_fraction). Refusing to use a mostly-empty DEM."
        )
    return ElevationTile(
        name=tile.upper(),
        south_lat=south_lat,
        west_lon=west_lon,
        pixel_degrees=degrees / _ARCSECONDS_PER_DEGREE,
        elevation_m=grid,
    )


def grid_to_geojson(tile: ElevationTile, step: int) -> dict[str, object]:
    """Downsample a DEM tile into a GeoJSON GridSquare-ish mesh.

    ``step`` is how many source pixels to skip between sampled corners. The full
    resolution grid stays in the cache; this reduced mesh is what the client can
    actually stream, and its resolution is stated in the exported metadata.
    """
    rows = np.arange(0, tile.rows, step)
    cols = np.arange(0, tile.columns, step)
    # Always include the last row/column so the mesh covers the whole tile.
    if rows[-1] != tile.rows - 1:
        rows = np.append(rows, tile.rows - 1)
    if cols[-1] != tile.columns - 1:
        cols = np.append(cols, tile.columns - 1)

    lats = tile.south_lat + (tile.rows - 1 - rows) * tile.pixel_degrees
    lons = tile.west_lon + cols * tile.pixel_degrees

    features = []
    grid = tile.elevation_m
    for row_index, row in enumerate(rows):
        for col_index, col in enumerate(cols):
            elevation = int(grid[row, col])
            if elevation == VOID_VALUE:
                continue
            lon = float(lons[col_index])
            lat = float(lats[row_index])
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [round(lon, 6), round(lat, 6), float(elevation)],
                    },
                    "properties": {
                        "tile": tile.name,
                        "row": int(row),
                        "col": int(col),
                        "elevation_m": elevation,
                    },
                }
            )
    return {
        "type": "FeatureCollection",
        "metadata": {
            "tile": tile.name,
            "source": "SRTM 1 arc-second void-filled (.hgt), AWS Open Data 'Skadi' mirror of the USGS distribution",
            "vertical_datum": "EGM96 geoid height",
            "horizontal_datum": "WGS84",
            "pixel_degrees": tile.pixel_degrees,
            "sample_step_pixels": step,
            "features": len(features),
        },
        "features": features,
    }
