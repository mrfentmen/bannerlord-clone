/**
 * Battle scene scaffolding: mounts independently, spawns armies fast, and keeps the
 * out-of-bounds countdown honest. Uses NullEngine, so it runs headless in CI.
 */

import { describe, expect, it } from "vitest";
import { Scene } from "@babylonjs/core";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { createBattleScene, extractHeightPatch, type BattleUnit } from "../BattleScene.js";
import { makeProjection } from "../../world/load.js";
import type { Heightfield, RegionFile } from "../../world/types.js";

const region: RegionFile = {
  name: "test",
  bbox: { south: 39.6, west: -105.6, north: 40.1, east: -104.8 },
  elevation: { encoding: "terrarium", formula: "", zoom: 12, tileSize: 256, tiles: [] },
  retrieved: "2026-09-30",
};

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

function testScene(): Scene {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    deterministicLockstep: false,
    textureSize: 64,
    lockstepMaxSteps: 4,
  });
  return new Scene(engine);
}

function makeUnits(n: number): BattleUnit[] {
  const units: BattleUnit[] = [];
  for (let i = 0; i < n; i += 1) {
    units.push({
      id: `u${i}`,
      side: i % 2 === 0 ? "attacker" : "defender",
      x: (i % 50) * 4 - 100,
      z: Math.floor(i / 50) * 4 - 100,
      tier: 1 + (i % 3),
      alive: true,
    });
  }
  return units;
}

describe("extractHeightPatch", () => {
  it("matches the campaign projection within 0.5 m at every sample", () => {
    const projection = makeProjection(region, heightfield());
    const patch = extractHeightPatch(projection, 0, 0, 2000, 16);
    for (let r = 0; r < 16; r += 1) {
      for (let c = 0; c < 16; c += 1) {
        const x = patch.originX + (c / 15) * 2000;
        const z = patch.originZ + (r / 15) * 2000;
        const expected = projection.heightAt(x, z);
        expect(Math.abs(patch.heights[r * 16 + c]! - expected)).toBeLessThan(0.5);
      }
    }
  });
});

describe("battle scene", () => {
  it("mounts and disposes without touching a campaign scene", () => {
    const projection = makeProjection(region, heightfield());
    const scene = testScene();
    const handle = createBattleScene({ scene, projection, centreX: 0, centreZ: 0, size: 2000, seed: 42 });
    expect(handle.biome).toBeDefined();
    expect(handle.scatterCount).toBeGreaterThanOrEqual(50);
    expect(handle.scatterCount).toBeLessThanOrEqual(200);
    handle.dispose();
  });

  it("spawns 1,000 units in under 2 seconds", () => {
    const projection = makeProjection(region, heightfield());
    const scene = testScene();
    const handle = createBattleScene({ scene, projection, centreX: 0, centreZ: 0, size: 2000, seed: 42 });
    const units = makeUnits(1000);
    const start = performance.now();
    handle.spawnArmies(units);
    const elapsed = performance.now() - start;
    expect(handle.unitCount).toBe(1000);
    expect(elapsed).toBeLessThan(2000);
    handle.dispose();
  });

  it("hides dead units on update", () => {
    const projection = makeProjection(region, heightfield());
    const scene = testScene();
    const handle = createBattleScene({ scene, projection, centreX: 0, centreZ: 0, size: 2000, seed: 42 });
    const units = makeUnits(10);
    handle.spawnArmies(units);
    handle.updateUnits(units.map((u, i) => ({ ...u, alive: i !== 3 })));
    const dead = scene.getMeshByName("troop-u3");
    expect(dead?.isVisible).toBe(false);
    handle.dispose();
  });

  it("warns out of bounds with a 5-second countdown", () => {
    const projection = makeProjection(region, heightfield());
    const scene = testScene();
    const handle = createBattleScene({ scene, projection, centreX: 0, centreZ: 0, size: 2000, seed: 42 });
    // Inside the ring: no warning.
    let state = handle.tickBounds(0.016, 0, 0);
    expect(state.outside).toBe(false);
    // Step outside the ring (radius = 1000 - 120 = 880).
    state = handle.tickBounds(0.016, 950, 0);
    expect(state.outside).toBe(true);
    expect(state.countdown).toBeCloseTo(5, 5);
    // One second passes outside.
    state = handle.tickBounds(1, 950, 0);
    expect(state.countdown).toBeCloseTo(4, 5);
    // Returning inside resets.
    state = handle.tickBounds(0.016, 0, 0);
    expect(state.outside).toBe(false);
    expect(state.countdown).toBeCloseTo(5, 5);
    handle.dispose();
  });

  it("renders night lighting dimmer than noon", () => {
    const projection = makeProjection(region, heightfield());
    const mk = (hour: number): number => {
      const scene = testScene();
      const handle = createBattleScene({ scene, projection, centreX: 0, centreZ: 0, size: 2000, seed: 42, timeOfDay: hour });
      const key = scene.getLightByName("battle-key");
      const intensity = (key as unknown as { intensity: number }).intensity;
      handle.dispose();
      return intensity;
    };
    expect(mk(0)).toBeLessThan(mk(12));
  });
});
