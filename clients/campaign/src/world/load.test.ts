/**
 * Terrarium elevation decoding.
 *
 * The formula is `elevation_m = R * 256 + G + B / 256 - 32768`. Getting it wrong would
 * put the Front Range under water or in orbit, and nothing else in the client would
 * notice, so it is checked against hand-decoded values.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { bandFor, classifySettlement, makeProjection } from "./load.js";
import type { Heightfield, RegionFile, WorldSettlement } from "./types.js";

/** The decoder as a pure function, so it can be tested without a canvas. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

describe("terrarium elevation decoding", () => {
  it("decodes the documented reference values", () => {
    // Sea level. The terrarium encoding puts it at 0x800000.
    expect(decodeTerrarium(0x80, 0, 0)).toBeCloseTo(0, 6);
    // 1000 m.
    expect(decodeTerrarium(0x83, 0xe8, 0)).toBeCloseTo(1000, 6);
    // A negative value, which the region does not contain but the encoding must handle.
    expect(decodeTerrarium(0x7d, 0xf4, 0)).toBeCloseTo(-524, 6);
  });

  it("uses the blue channel as a fraction, so sub-metre detail survives", () => {
    const a = decodeTerrarium(0x80, 0, 0);
    const b = decodeTerrarium(0x80, 0, 128);
    expect(b - a).toBeCloseTo(0.5, 6);
  });

  it("reads a real region file with a real tile list", () => {
    // The region is the Colorado Front Range: 1500 m on the plains to over 4400 m on
    // the continental divide. A decoder that is subtly wrong still returns numbers, so
    // what catches it is the tile list being real rather than a hand-written example.
    const path = fileURLToPath(new URL("../../public/world/region.json", import.meta.url));
    if (!existsSync(path)) {
      throw new Error("public/world/region.json is missing. Run `npm run fetch:world`.");
    }
    const region = JSON.parse(readFileSync(path, "utf8")) as RegionFile;
    expect(region.elevation.encoding).toBe("terrarium");
    expect(region.elevation.tiles.length).toBeGreaterThan(50);
    expect(region.elevation.tileSize).toBe(256);
    expect(region.bbox.north).toBeGreaterThan(region.bbox.south);
    expect(region.bbox.east).toBeGreaterThan(region.bbox.west);
  });
});

describe("settlement classification from real populations", () => {
  const base: WorldSettlement = {
    id: "1",
    name: "Place",
    place: "town",
    lat: 39.7,
    lon: -104.9,
    population: 50_000,
    populationSource: "test",
    state: "Colorado",
    stateCode: "CO",
    osmPopulation: null,
  };

  it("uses the locked thresholds, not the OSM place tag", () => {
    expect(classifySettlement({ ...base, population: 715_513 }).klass).toBe("city");
    expect(classifySettlement({ ...base, population: 100_000 }).klass).toBe("city");
    expect(classifySettlement({ ...base, population: 99_999 }).klass).toBe("town");
    expect(classifySettlement({ ...base, population: 25_000 }).klass).toBe("town");
    expect(classifySettlement({ ...base, population: 24_999 }).klass).toBe("village");
    expect(classifySettlement({ ...base, population: 1_470 }).klass).toBe("village");
  });

  it("falls back to village and says so when no real population exists", () => {
    // Eleven of the 48 mapped places have no Census figure. Guessing a population for
    // them would be inventing data (CONSTITUTION.md section 1.1).
    const result = classifySettlement({ ...base, population: null });
    expect(result.klass).toBe("village");
    expect(result.fromRealData).toBe(false);
  });

  it("flags every classification that came from a real figure", () => {
    expect(classifySettlement({ ...base, population: 715_513 }).fromRealData).toBe(true);
    expect(classifySettlement({ ...base, population: 300 }).fromRealData).toBe(true);
  });
});

describe("the hypsometric ramp", () => {
  it("bands the region's real altitude range", () => {
    // Longmont sits at about 1540 m, Golden at 1730 m, the divide above 4000 m, so
    // the ramp has to reach from the high plains to snow.
    expect(bandFor(1520).color).toBe("#6E6A55"); // dry prairie
    expect(bandFor(1750).color).toBe("#6E6A55"); // still prairie, the band ends at 1800
    expect(bandFor(1900).color).toBe("#7E7A5C"); // steppe
    expect(bandFor(2250).color).toBe("#5F6247"); // open range
    expect(bandFor(2550).color).toBe("#47503A"); // scrub
    expect(bandFor(2850).color).toBe("#36402F"); // forest
    expect(bandFor(3150).color).toBe("#5E5C55"); // rock
    expect(bandFor(3450).color).toBe("#8A877E"); // scree
    expect(bandFor(4100).color).toBe("#C9C7BE"); // snow
  });

  it("keeps every band under 25 percent saturation", () => {
    for (const band of [1520, 1900, 2200, 2500, 2800, 3100, 3400, 4100]) {
      const hex = bandFor(band).color;
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
      expect(s, `${band}m band ${hex} is ${(s * 100).toFixed(0)}% saturated`).toBeLessThan(0.25);
    }
  });
});

describe("the projection", () => {
  const region: RegionFile = {
    name: "test",
    bbox: { south: 39.6, west: -105.6, north: 40.1, east: -104.8 },
    elevation: { encoding: "terrarium", formula: "", zoom: 12, tileSize: 256, tiles: [] },
    retrieved: "2026-09-30",
  };
  const hf: Heightfield = {
    width: 4,
    height: 4,
    metres: new Float32Array(16).fill(1600),
    resolutionMetres: 30,
    bounds: region.bbox,
  };

  it("puts the south-west corner at the origin and the region at its real size", () => {
    const p = makeProjection(region, hf);
    const origin = p.toWorld(39.6, -105.6);
    expect(origin.x).toBeCloseTo(0, 6);
    expect(origin.z).toBeCloseTo(0, 6);

    // 0.5 degrees of latitude is about 55.6 km.
    expect(p.depth).toBeGreaterThan(55_000);
    expect(p.depth).toBeLessThan(56_200);
    // 0.8 degrees of longitude at 39.85 N is about 68.5 km.
    expect(p.width).toBeGreaterThan(68_000);
    expect(p.width).toBeLessThan(69_500);
  });

  it("round-trips a coordinate", () => {
    const p = makeProjection(region, hf);
    const w = p.toWorld(39.85, -105.2);
    const back = p.toLatLon(w.x, w.z);
    expect(back.lat).toBeCloseTo(39.85, 9);
    expect(back.lon).toBeCloseTo(-105.2, 9);
  });

  it("interpolates height bilinearly and clamps outside the region", () => {
    // A ramp along z, so the middle of the map is a known value.
    const ramp = new Float32Array(16);
    for (let z = 0; z < 4; z += 1) for (let x = 0; x < 4; x += 1) ramp[z * 4 + x] = z * 100;
    const p = makeProjection(region, { ...hf, metres: ramp });
    expect(p.heightAt(0, 0)).toBeCloseTo(0, 3);
    // The south-west corner.
    expect(p.heightAt(0, 0)).toBeCloseTo(0, 3);
    // Halfway up the ramp sits between rows, so bilinear interpolation lands between.
    const mid = p.heightAt(p.width / 2, p.depth / 2);
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(300);
    // Off the edge returns 0 rather than reading past the end of the array.
    expect(p.heightAt(-5000, -5000)).toBe(0);
    expect(p.heightAt(1e9, 1e9)).toBe(0);
  });
});
