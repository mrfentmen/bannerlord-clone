/**
 * The real-building renderer.
 *
 * `buildingsGeometry` is pure (no Scene, no engine), so these tests drive it
 * directly: valid footprints extrude to sane prisms, heights come from the
 * levels tag, and degenerate footprints are skipped without poisoning the
 * vertex stream.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEVELS,
  METRES_PER_LEVEL,
  buildingHeight,
  buildingsGeometry,
  type BuildingFootprint,
} from "../buildings.js";
import { makeProjection } from "../../world/load.js";
import type { Heightfield, RegionFile } from "../../world/types.js";

const region: RegionFile = {
  name: "manhattan-test",
  bbox: { south: 40.69, west: -74.03, north: 40.73, east: -73.98 },
  elevation: { encoding: "terrarium", formula: "", zoom: 12, tileSize: 256, tiles: [] },
  retrieved: "2026-09-30",
};

function flatHeightfield(): Heightfield {
  return {
    width: 8,
    height: 8,
    metres: new Float32Array(64),
    resolutionMetres: 30,
    bounds: region.bbox,
  };
}

const projection = makeProjection(region, flatHeightfield());

/** A simple rectangular block, roughly 40 m by 20 m in Manhattan. */
function rectFootprint(id: number, levels?: string): BuildingFootprint {
  const fp: BuildingFootprint = {
    id,
    coords: [
      [-74.0124, 40.7007],
      [-74.0119, 40.7007],
      [-74.0119, 40.7009],
      [-74.0124, 40.7009],
      [-74.0124, 40.7007], // closed ring, as OSM emits them
    ],
    type: "yes",
  };
  if (levels !== undefined) fp.levels = levels;
  return fp;
}

describe("buildingHeight", () => {
  it("is 3 m per level", () => {
    expect(buildingHeight({ id: 1, coords: [], levels: "10" })).toBe(10 * METRES_PER_LEVEL);
  });

  it("defaults to two levels when the tag is missing or garbage", () => {
    expect(buildingHeight({ id: 1, coords: [] })).toBe(DEFAULT_LEVELS * METRES_PER_LEVEL);
    expect(buildingHeight({ id: 1, coords: [], levels: "" })).toBe(
      DEFAULT_LEVELS * METRES_PER_LEVEL,
    );
    expect(buildingHeight({ id: 1, coords: [], levels: "abc" })).toBe(
      DEFAULT_LEVELS * METRES_PER_LEVEL,
    );
    expect(buildingHeight({ id: 1, coords: [], levels: "0" })).toBe(
      DEFAULT_LEVELS * METRES_PER_LEVEL,
    );
  });
});

describe("buildingsGeometry", () => {
  it("extrudes one box per valid footprint with the right heights", () => {
    const geo = buildingsGeometry(
      [rectFootprint(1, "10"), rectFootprint(2), rectFootprint(3, "4")],
      projection,
    );
    expect(geo.buildingCount).toBe(3);
    expect(geo.peakHeight).toBe(30);

    // Rectangle: 4 wall quads (16 verts) + roof fan (1 centroid + 8 verts).
    const vertsPerBuilding = 16 + 9;
    expect(geo.positions.length).toBe(vertsPerBuilding * 3 * 3);
    expect(geo.colors.length).toBe(vertsPerBuilding * 3 * 4);
    // 4 quads * 2 tris * 3 + 4 fan tris * 3 = 36 indices per building.
    expect(geo.indices.length).toBe(36 * 3);

    // Every index points at a real vertex.
    const vertexCount = geo.positions.length / 3;
    for (const idx of geo.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertexCount);
    }
  });

  it("skips degenerate footprints without breaking the stream", () => {
    const degenerate: BuildingFootprint[] = [
      { id: 9, coords: [] },
      {
        id: 10,
        coords: [
          [-74.0124, 40.7007],
          [-74.0119, 40.7007], // only two points: not a polygon
        ],
      },
      {
        id: 11,
        coords: [
          [-74.0124, 40.7007],
          [-74.0124, 40.7007],
          [-74.0124, 40.7007], // zero area
        ],
      },
    ];
    const geo = buildingsGeometry(
      [rectFootprint(1, "5"), ...degenerate, rectFootprint(2, "7")],
      projection,
    );
    expect(geo.buildingCount).toBe(2);
    expect(geo.peakHeight).toBe(21);
    expect(geo.positions.length).toBeGreaterThan(0);
  });

  it("handles clockwise-wound rings and non-rectangular footprints", () => {
    // L-shaped footprint, wound clockwise (negative area).
    const lShape: BuildingFootprint = {
      id: 42,
      coords: [
        [-74.0124, 40.7009],
        [-74.0124, 40.7007],
        [-74.0119, 40.7007],
        [-74.0119, 40.7008],
        [-74.0121, 40.7008],
        [-74.0121, 40.7009],
      ],
      levels: "3",
    };
    const geo = buildingsGeometry([lShape], projection);
    expect(geo.buildingCount).toBe(1);
    expect(geo.peakHeight).toBe(9);
    // 6 edges: 24 wall verts + 13 roof verts = 37 verts; 6*6 + 6*3 = 54 indices.
    expect(geo.positions.length / 3).toBe(37);
    expect(geo.indices.length).toBe(54);
  });

  it("sits buildings on the terrain via the projection height", () => {
    const hilly: Heightfield = {
      ...flatHeightfield(),
      metres: new Float32Array(64).fill(50),
    };
    const hillyProjection = makeProjection(region, hilly);
    const geo = buildingsGeometry([rectFootprint(1, "2")], hillyProjection, 1.6);
    // Ground is 50 m * 1.6 vertical scale; the lowest vertex sits on it.
    let minY = Infinity;
    for (let i = 1; i < geo.positions.length; i += 3) {
      minY = Math.min(minY, geo.positions[i]!);
    }
    expect(minY).toBeCloseTo(80, 5);
    // Roof is 6 m above the base.
    let maxY = -Infinity;
    for (let i = 1; i < geo.positions.length; i += 3) {
      maxY = Math.max(maxY, geo.positions[i]!);
    }
    expect(maxY - minY).toBeCloseTo(6, 5);
  });
});
