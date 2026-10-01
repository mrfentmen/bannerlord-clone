/**
 * Terrain geometry.
 *
 * The one that matters here is `computes normals that point up`. The first winding
 * produced downward normals, so the key light gave a negative N dot L and the entire
 * terrain rendered black. It looked like missing data, not like a winding bug, and the
 * screenshot was the only thing that showed it. This test makes it a build failure
 * instead.
 */

import { describe, expect, it } from "vitest";
import { Scene } from "@babylonjs/core/scene.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { buildTerrain } from "../terrain.js";
import { makeProjection } from "../../world/load.js";
import { terrainBands } from "../../design/tokens.js";
import type { Heightfield, RegionFile } from "../../world/types.js";

const region: RegionFile = {
  name: "test",
  bbox: { south: 39.6, west: -105.6, north: 40.1, east: -104.8 },
  elevation: { encoding: "terrarium", formula: "", zoom: 12, tileSize: 256, tiles: [] },
  retrieved: "2026-09-30",
};

/** A real slice of the V1 region's shape: a valley floor rising to a ridge. */
function heightfield(): Heightfield {
  const width = 64;
  const height = 64;
  const metres = new Float32Array(width * height);
  for (let z = 0; z < height; z += 1) {
    for (let x = 0; x < width; x += 1) {
      metres[z * width + x] = 1500 + (x / width) * 2500 + Math.sin(z / 6) * 120;
    }
  }
  return { width, height, metres, resolutionMetres: 30, bounds: region.bbox };
}

function newScene(): Scene {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    deterministicLockstep: false,
    textureSize: 64,
    lockstepMaxSteps: 4,
  });
  return new Scene(engine);
}

describe("terrain mesh", () => {
  const hf = heightfield();
  const projection = makeProjection(region, hf);

  it("computes normals that point up", () => {
    // NullEngine: a real Scene with no GPU behind it, which is all the geometry
  // builder needs.
  const scene = newScene();
    const { mesh } = buildTerrain({ scene, heightfield: hf, projection, samples: 32 });
    const normals = mesh.getVerticesData("normal")!;
    expect(normals.length).toBeGreaterThan(0);
    let up = 0;
    for (let i = 0; i < normals.length; i += 3) {
      expect(Number.isFinite(normals[i]!)).toBe(true);
      expect(Number.isFinite(normals[i + 1]!)).toBe(true);
      if (normals[i + 1]! > 0) up += 1;
    }
    // Every vertex on a heightfield mesh must face up, or the light is behind it.
    expect(up, `${up} of ${normals.length / 3} normals point up`).toBe(normals.length / 3);
  });

  it("colours every vertex from the locked ramp, with no black or white", () => {
    // NullEngine: a real Scene with no GPU behind it, which is all the geometry
  // builder needs.
  const scene = newScene();
    const { mesh } = buildTerrain({ scene, heightfield: hf, projection, samples: 32 });
    const colors = mesh.getVerticesData("color")!;
    expect(colors.length).toBeGreaterThan(0);
    for (let i = 0; i < colors.length; i += 4) {
      // A zero vertex colour multiplies the lit colour to black, which is exactly the
      // failure this catches.
      expect(colors[i]!).toBeGreaterThan(0.05);
      expect(colors[i + 1]!).toBeGreaterThan(0.05);
      expect(colors[i + 2]!).toBeGreaterThan(0.05);
      expect(colors[i + 3]!).toBe(1);
    }
  });

  it("keeps every vertex colour inside the locked ramp's envelope", () => {
    // NullEngine: a real Scene with no GPU behind it, which is all the geometry
  // builder needs.
    // The ramp plus rock and snow are the only colours a terrain vertex can hold, because
    // the slope mix and the snow mix both lerp between members of that same set. So the
    // per-channel minimum and maximum across the ramp bound every vertex. A white vertex
    // means something reached for a colour outside the locked palette.
    const scene = newScene();
    const { mesh } = buildTerrain({ scene, heightfield: hf, projection, samples: 48 });
    const colors = mesh.getVerticesData("color")!;

    const floor = [1, 1, 1];
    const ceiling = [0, 0, 0];
    for (const band of terrainBands) {
      const hex = band.color;
      for (let c = 0; c < 3; c += 1) {
        const v = parseInt(hex.slice(1 + c * 2, 3 + c * 2), 16) / 255;
        floor[c] = Math.min(floor[c]!, v);
        ceiling[c] = Math.max(ceiling[c]!, v);
      }
    }

    // Snow is the lightest band at 201/255, forest the darkest at 47/255. Neither end of
    // the envelope is black and neither is white, which is the property under test.
    expect(Math.max(...ceiling)).toBeLessThan(0.85);
    expect(Math.min(...floor)).toBeGreaterThan(0.1);

    const slack = 0.02;
    for (let i = 0; i < colors.length; i += 4) {
      for (let c = 0; c < 3; c += 1) {
        const v = colors[i + c]!;
        expect(v, `channel ${c} of vertex ${i / 4} is ${v}, outside the ramp`).toBeGreaterThanOrEqual(
          floor[c]! - slack,
        );
        expect(v, `channel ${c} of vertex ${i / 4} is ${v}, outside the ramp`).toBeLessThanOrEqual(
          ceiling[c]! + slack,
        );
      }
    }
  });

  it("scales height so the region reads as the Front Range, in metres", () => {
    // NullEngine: a real Scene with no GPU behind it, which is all the geometry
  // builder needs.
  const scene = newScene();
    const { mesh } = buildTerrain({ scene, heightfield: hf, projection, samples: 16 });
    const positions = mesh.getVerticesData("position")!;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < positions.length; i += 3) {
      minY = Math.min(minY, positions[i]!);
      maxY = Math.max(maxY, positions[i]!);
    }
    // The fixture ramps 1500 m to 4000 m, at 1.6x exaggeration, measured from the
    // region's lowest point rather than from sea level.
    expect(maxY - minY).toBeGreaterThan(3500);
    expect(minY).toBeLessThanOrEqual(0);
    expect(maxY).toBeGreaterThan(3000);
  });

  it("indexes every cell of the grid exactly once", () => {
    // NullEngine: a real Scene with no GPU behind it, which is all the geometry
  // builder needs.
  const scene = newScene();
    const samples = 24;
    const { mesh } = buildTerrain({ scene, heightfield: hf, projection, samples });
    expect(mesh.getTotalIndices()).toBe((samples - 1) * (samples - 1) * 6);
  });
});
