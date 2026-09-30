"""Elevation: SRTM DEM tiles for the V1 region, and sampling at settlements.

SPEC.md section 2: "Elevation from a public DEM (SRTM or similar) for terrain
height on the campaign map and battle maps."

Two outputs:

* a coarse elevation mesh per tile, for Agent 3 to stream and render;
* a real elevation value sampled at every settlement inside the region, stored on
  the settlement row, so the simulation and battle code have ground height
  without needing the DEM itself.

Both come from the same bytes. Nothing is interpolated beyond what bilinear
sampling over the real grid requires, and a settlement outside every downloaded
tile is reported rather than given a made-up height.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import Config
from ..errors import DatasetGap, ParseError
from ..geo.srtm import ElevationTile, grid_to_geojson, read_hgt


@dataclass(frozen=True)
class TerrainMesh:
    """A downsampled DEM tile ready to export."""

    tile: str
    features: list[dict]
    sample_step_pixels: int
    elevation_min: int
    elevation_max: int


@dataclass(frozen=True)
class ElevationSampler:
    """Samples elevation at a longitude and latitude across several tiles."""

    tiles: tuple[ElevationTile, ...]

    def elevation_at(self, longitude: float, latitude: float) -> float:
        """Elevation in metres, bilinear within the tile that contains the point."""
        for tile in self.tiles:
            if (
                tile.west_lon <= longitude < tile.west_lon + tile.columns * tile.pixel_degrees
                and tile.south_lat <= latitude < tile.south_lat + tile.rows * tile.pixel_degrees
            ):
                return tile.elevation_at(longitude, latitude)
        raise ParseError(
            f"no downloaded elevation tile covers {longitude:.4f},{latitude:.4f}. "
            "Widen v1.elevation_tiles in the config to cover the point."
        )

    def covers(self, longitude: float, latitude: float) -> bool:
        return any(
            tile.west_lon <= longitude < tile.west_lon + tile.columns * tile.pixel_degrees
            and tile.south_lat <= latitude < tile.south_lat + tile.rows * tile.pixel_degrees
            for tile in self.tiles
        )


def load_elevation_tiles(config: Config) -> tuple[ElevationSampler, list[str]]:
    """Read every configured SRTM tile into one sampler."""
    raw_dir = config.path_for("raw_dir")
    maximum_void = float(config.get("terrain.max_void_fraction"))
    tiles: list[ElevationTile] = []
    notes: list[str] = []
    for name in config.elevation_tiles:
        path = raw_dir / f"{name}.hgt.gz"
        if not path.is_file():
            raise DatasetGap(
                "srtm_elevation",
                f"{path.name} is not in {raw_dir}. Run the fetch stage, or remove the tile from "
                "v1.elevation_tiles in the config if the region changed.",
            )
        tiles.append(read_hgt(path, name, max_void_fraction=maximum_void))

    if not tiles:
        raise DatasetGap(
            "srtm_elevation",
            "v1.elevation_tiles in the config is empty, so the pipeline would produce a campaign map with "
            "no ground height at all.",
        )

    vertical_extent = [float(np.min(tile.elevation_m)) for tile in tiles]
    notes.append(
        f"Read {len(tiles)} SRTM 1 arc-second tiles. Lowest grid value {min(vertical_extent):.0f} m, "
        f"highest {max(float(np.max(tile.elevation_m)) for tile in tiles):.0f} m. "
        "Vertical datum is EGM96 geoid height, as SRTM publishes."
    )
    notes.append(
        "Ties for coverage: the V1 region is bounded by "
        f"{config.region_bbox} and the tiles listed in v1.elevation_tiles. Country-wide SRTM is roughly "
        "1,000 tiles and is not downloaded at Phase 0; adding tiles to the config is the whole cost of "
        "widening the map."
    )
    return ElevationSampler(tiles=tuple(tiles)), notes


def build_meshes(sampler: ElevationSampler, *, sample_step: int) -> list[TerrainMesh]:
    """Downsample each tile into an exportable point mesh."""
    meshes: list[TerrainMesh] = []
    for tile in sampler.tiles:
        collection = grid_to_geojson(tile, sample_step)
        grid = tile.elevation_m
        finite = grid[grid != -32768]
        meshes.append(
            TerrainMesh(
                tile=tile.name,
                features=collection["features"],
                sample_step_pixels=sample_step,
                elevation_min=int(finite.min()) if finite.size else 0,
                elevation_max=int(finite.max()) if finite.size else 0,
            )
        )
    return meshes


def sample_settlements(
    sampler: ElevationSampler,
    points: dict[str, tuple[float, float]],
) -> tuple[dict[str, float], list[str], list[str]]:
    """Sample elevation for each settlement.

    Returns (elevations, uncovered_identifiers, notes). A settlement outside the
    downloaded tiles is named in the second list and gets no elevation, so no
    consumer can mistake an absent value for sea level.
    """
    elevations: dict[str, float] = {}
    uncovered: list[str] = []
    for identifier, (longitude, latitude) in points.items():
        if sampler.covers(longitude, latitude):
            elevations[identifier] = sampler.elevation_at(longitude, latitude)
        else:
            uncovered.append(identifier)
    covered_fraction = len(elevations) / len(points) if points else 0.0
    notes = [
        f"Sampled real SRTM elevation at {len(elevations)} of {len(points)} settlements ({covered_fraction:.2%}). "
        f"{len(uncovered)} fell outside the configured V1 region tiles and are reported without a value."
    ]
    if elevations:
        values = list(elevations.values())
        notes.append(
            f"Sampled elevation across settlements ranged from {min(values):.0f} m to {max(values):.0f} m."
        )
    return elevations, uncovered, notes


def write_tile_geojson(path: Path, meshes: list[TerrainMesh], metadata: dict) -> int:
    """Write the elevation mesh to GeoJSON, returning the feature count."""
    import json

    features: list[dict] = []
    for mesh in meshes:
        features.extend(mesh.features)
    document = {
        "type": "FeatureCollection",
        "metadata": {
            **metadata,
            "tiles": [
                {
                    "tile": mesh.tile,
                    "sample_step_pixels": mesh.sample_step_pixels,
                    "elevation_min_m": mesh.elevation_min,
                    "elevation_max_m": mesh.elevation_max,
                }
                for mesh in meshes
            ],
            "features": len(features),
        },
        "features": features,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, separators=(",", ":")), encoding="utf-8")
    return len(features)
