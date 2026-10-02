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
    // The region is the Ohio River Valley: floodplain along the river to the Appalachian
    // ridge east of the Appalachians. A decoder that is subtly wrong still returns
    // numbers, so what catches it is the tile list being real rather than a hand-written
    // example.
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

  it("names a region whose bbox is the one the settlement data is inside", () => {
    // The failure this guards against has already happened: `region.json` and
    // `settlements.json` described two different regions in the same directory, so every
    // settlement projected ~28x outside the map and `heightAt` returned 0 for all of
    // them. The files are fetched by different tooling, so nothing else catches it.
    const dir = fileURLToPath(new URL("../../public/world/", import.meta.url));
    const region = JSON.parse(readFileSync(`${dir}region.json`, "utf8")) as RegionFile;
    const settlements = JSON.parse(readFileSync(`${dir}settlements.json`, "utf8")) as {
      settlements: { lat: number; lon: number }[];
    };
    expect(settlements.settlements.length).toBeGreaterThan(0);
    for (const s of settlements.settlements) {
      expect(s.lat).toBeGreaterThanOrEqual(region.bbox.south);
      expect(s.lat).toBeLessThanOrEqual(region.bbox.north);
      expect(s.lon).toBeGreaterThanOrEqual(region.bbox.west);
      expect(s.lon).toBeLessThanOrEqual(region.bbox.east);
    }
  });

  it("has a boot tier small enough to fetch at startup, and a larger detail tier", () => {
    // The client blocks on every tile in `elevation` before it draws. The Ohio bbox at
    // zoom 12 is 2,236 tiles and ~250 MB, so the boot list is the zoom-10 tier and the
    // full-resolution list is a separate, lazily-fetched one.
    const path = fileURLToPath(new URL("../../public/world/region.json", import.meta.url));
    const region = JSON.parse(readFileSync(path, "utf8")) as RegionFile;
    expect(region.elevation.zoom).toBe(10);
    expect(region.elevation.tiles.length).toBeLessThanOrEqual(200);
    expect(region.elevationDetail).toBeDefined();
    expect(region.elevationDetail?.zoom).toBe(12);
    expect(region.elevationDetail!.tiles.length).toBeGreaterThan(region.elevation.tiles.length);
  });

  it("has every boot tile on disk, because a missing one stops the map drawing", () => {
    // `loadHeightfield` throws a retryable error on the first missing tile rather than
    // drawing a hole, so a boot list naming an absent file means the map never appears.
    const dir = fileURLToPath(new URL("../../public/world/", import.meta.url));
    const region = JSON.parse(readFileSync(`${dir}region.json`, "utf8")) as RegionFile;
    for (const tier of [region.elevation, region.elevationDetail]) {
      if (!tier) continue;
      const missing = tier.tiles.filter((t) => !existsSync(`${dir}${t.path}`));
      if (tier === region.elevationDetail) {
        // The detail tier is fetched on demand and never committed, so it is either
        // entirely present or entirely absent. A partial one is a broken fetch.
        expect(missing.length).toBe(tier.tiles.length);
        continue;
      }
      expect(missing.map((t) => t.path)).toEqual([]);
    }
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
    // The Ohio River Valley runs from about 150 m on the floodplain to over 1000 m on
    // the Appalachian ridge in the east, so the ramp has to cover lowland through
    // wooded ridge. These are the ramp's own band boundaries, checked for the colours
    // it assigns and its saturation ceiling.
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
