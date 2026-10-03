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
import { bandFor, classifySettlement, indexSettlements, loadHeightfield, makeProjection, positionKey } from "./load.js";
import type { Heightfield, RegionFile, WorldSettlement, WorldSettlementFile } from "./types.js";

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

/**
 * The two elevation lists in `region.json`.
 *
 * A region may ship a boot list and a detail list: the boot list is what the client
 * fetches at startup, the detail list is the same coverage at a finer zoom for close
 * zoom and battle maps. Shipping only a boot list is valid. These tests hold the line
 * between "optional" and "unvalidated", because a malformed detail list that nobody
 * checks is a gap discovered later from the wrong side, and a detail list silently
 * treated as the boot list is a 200 MB boot payload nobody asked for.
 */
describe("the elevation tiers in region.json", () => {
  const path = fileURLToPath(new URL("../../public/world/region.json", import.meta.url));
  if (!existsSync(path)) {
    throw new Error("public/world/region.json is missing. Run `npm run fetch:world`.");
  }
  const region = JSON.parse(readFileSync(path, "utf8")) as RegionFile;

  it("has a boot list the client actually reads, at the list's own zoom", () => {
    // The loader's resolution maths and its tile paths both come from this list, so a
    // boot list that disagrees with itself is what the whole heightfield rests on.
    expect(region.elevation.encoding).toBe("terrarium");
    expect(region.elevation.tiles.length).toBeGreaterThan(0);
    expect(region.elevation.zoom).toBeGreaterThanOrEqual(0);
    expect(region.elevation.tileSize).toBeGreaterThan(0);
    for (const tile of region.elevation.tiles) {
      expect(tile.z).toBe(region.elevation.zoom);
      expect(tile.path).toContain(`elevation/${region.elevation.zoom}/${tile.x}/${tile.y}.png`);
    }
  });

  it("ships the tiered region: a small boot list plus the larger detail list", () => {
    // The loader reads `elevation` and leaves `elevationDetail` alone, so the region
    // ships the small zoom-10 boot list (154 tiles) for startup and the zoom-12
    // detail list (2,236 tiles) for future on-demand streaming.
    expect(region.elevation.tiles.length).toBeGreaterThan(0);
    expect(region.elevationDetail).toBeDefined();
    expect(region.elevationDetail!.zoom).toBeGreaterThan(region.elevation.zoom);
    expect(region.elevationDetail!.tiles.length).toBeGreaterThan(region.elevation.tiles.length);
    for (const tile of region.elevationDetail!.tiles) {
      expect(tile.z).toBe(region.elevationDetail!.zoom);
    }
  });

  it("loads a tiered file from the boot list, never from the larger detail list", async () => {
    // The shape written by the tiered export: Ohio split into a zoom-10 boot list and a
    // zoom-12 detail list, 154 tiles against 2,236. The client must read the first and
    // leave the second alone, because fetching the detail list at boot is the ~200 MB
    // payload this split exists to avoid.
    // A 14 x 11 grid, the shape the real Ohio boot list has: the loader derives the
    // heightfield's size from the tile grid's extent, so the tiles have to be laid out as
    // a grid rather than as a list for the field dimensions to mean anything.
    const tiles = (zoom: number, cols: number, rows: number) =>
      Array.from({ length: cols * rows }, (_, i) => {
        const x = 100 + (i % cols);
        const y = 200 + Math.floor(i / cols);
        return { z: zoom, x, y, path: `elevation/${zoom}/${x}/${y}.png` };
      });
    const tiered: RegionFile = {
      name: "tiered",
      bbox: { south: 37.1, west: -85.3, north: 40.6, east: -81.6 },
      elevation: { encoding: "terrarium", formula: "", zoom: 10, tileSize: 256, tiles: tiles(10, 14, 11) },
      elevationDetail: { encoding: "terrarium", formula: "", zoom: 12, tileSize: 256, tiles: tiles(12, 52, 43) },
      retrieved: "2026-10-01",
    };

    const requested: string[] = [];
    const canvasStub = {
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: () => {},
        drawImage: () => {},
        // 0x800000 is terrarium's zero, so every tile decodes to 0 m and the loop moves on.
        getImageData: () => ({ data: new Uint8ClampedArray(256 * 256 * 4).fill(0x80) }),
      }),
    };
    const globals = globalThis as Record<string, unknown>;
    const saved = {
      document: globals["document"],
      fetch: globals["fetch"],
      bitmap: globals["createImageBitmap"],
      // `loadHeightfield` resolves tile paths against `location.href`, which node has no
      // global for. Supplied here rather than in the loader, because in the client this
      // is the browser's own global and the loader is right to use it.
      location: globals["location"],
    };
    globals["document"] = { createElement: () => canvasStub };
    globals["createImageBitmap"] = async () => ({ close: () => {} });
    globals["location"] = { href: "http://localhost/" };
    globals["fetch"] = async (url: string) => {
      requested.push(String(url));
      return { ok: true, blob: async () => new Blob() };
    };

    try {
      const hf = await loadHeightfield(tiered, "http://localhost/world/");
      // 14 x 11 tiles of 256 px is a 3584 x 2816 field, which is what the boot list
      // describes. Had the loader used the detail list this would be 13312 x 11008 and
      // 2,236 fetches would have happened.
      expect(hf.width).toBe(14 * 256);
      expect(hf.height).toBe(11 * 256);
    } finally {
      globals["document"] = saved.document;
      globals["fetch"] = saved.fetch;
      globals["createImageBitmap"] = saved.bitmap;
      globals["location"] = saved.location;
    }

    // Every requested tile is a zoom-10 boot tile. A single zoom-12 request here is the
    // bug this test exists to catch: 2,236 of them is a boot nobody can wait for.
    expect(requested).toHaveLength(tiered.elevation.tiles.length);
    expect(requested.every((url) => url.includes("/elevation/10/"))).toBe(true);
    expect(requested.some((url) => url.includes("/elevation/12/"))).toBe(false);
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
  void base;

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

/**
 * Names shared across states, and what the index does about them.
 *
 * Thirty-six of the 487 names in the V1 export are held by more than one place. The
 * original index put every settlement into one `Map` keyed by name, so the last one in
 * the file won and the rest were unreachable: `resolve("Winchester")` returned whichever
 * state happened to be listed last, with nothing to indicate three places matched. These
 * tests use the real export, because the collision count is a fact about the data rather
 * than about the code.
 */
describe("settlement lookup by position and qualified name", () => {
  const settlementsPath = fileURLToPath(
    new URL("../../public/world/settlements.json", import.meta.url),
  );
  if (!existsSync(settlementsPath)) {
    throw new Error("public/world/settlements.json is missing. Run `npm run fetch:world`.");
  }
  const file = JSON.parse(readFileSync(settlementsPath, "utf8")) as {
    settlements: WorldSettlementFile[];
  };
  const settlements: WorldSettlement[] = file.settlements.map((s) => ({
    id: s.osmId.replace(/^node\//, ""),
    name: s.name,
    place: s.place,
    lat: s.lat,
    lon: s.lon,
    population: s.population,
    populationSource: s.populationSource,
    state: s.state,
    stateCode: s.stateCode,
    osmPopulation: s.osmPopulation,
  }));
  const index = indexSettlements(settlements);

  it("finds every settlement in the export by id, so nothing is unreachable", () => {
    for (const s of settlements) {
      expect(index.resolve(s.id), `${s.name} ${s.id} is not resolvable by id`).toBe(s);
    }
    expect(index.all()).toHaveLength(settlements.length);
    expect(index.byId.size).toBe(settlements.length);
  });

  it("finds every settlement by position, which is unique across the export", () => {
    // The closest pair of places in the region is 858 m apart, which is far more than
    // four decimals of a degree can blur together, so position resolves all of them.
    expect(index.byPosition.size).toBe(settlements.length);
    for (const s of settlements) {
      const key = positionKey(s.lat, s.lon);
      expect(index.resolve(key), `${s.name} did not resolve at ${key}`).toBe(s);
    }
  });

  it("refuses to guess when a bare name is held by more than one state", () => {
    // Winchester is a real case: Kentucky, Indiana and Ohio all have one.
    expect(index.candidatesFor("Winchester").map((s) => s.state)).toEqual([
      "Kentucky",
      "Indiana",
      "Ohio",
    ]);
    expect(index.resolve("Winchester")).toBeUndefined();
    expect(index.resolve("winchester")).toBeUndefined();
    // Absent from the name maps rather than pointing at one of the three.
    expect(index.byName.has("Winchester")).toBe(false);
    expect(index.byNameFolded.has("winchester")).toBe(false);
  });

  it("still resolves an ambiguous name once the state is given", () => {
    for (const s of settlements) {
      const hit = index.resolve(`${s.name}, ${s.state}`);
      expect(hit, `${s.name}, ${s.state} did not resolve`).toBe(s);
      expect(index.resolve(`${s.name} ${s.stateCode}`)).toBe(s);
      // Case and spacing are not a reason for a lookup to fail.
      expect(index.resolve(`${s.name.toUpperCase()},  ${s.state}`)).toBe(s);
    }
  });

  it("resolves every unique bare name, in any case", () => {
    const ambiguous = new Set(index.candidatesFor("Winchester").map((s) => s.name));
    const ambiguousNames = new Set(
      settlements
        .filter((s) => index.candidatesFor(s.name).length > 1)
        .map((s) => s.name),
    );
    expect(ambiguousNames.size).toBe(36);
    expect(ambiguous.has("Winchester")).toBe(true);

    for (const s of settlements) {
      if (ambiguousNames.has(s.name)) continue;
      expect(index.resolve(s.name), `${s.name} should resolve by name alone`).toBe(s);
      expect(index.resolve(s.name.toLowerCase())).toBe(s);
    }
  });

  it("returns nothing rather than a near miss", () => {
    expect(index.resolve("")).toBeUndefined();
    expect(index.resolve("   ")).toBeUndefined();
    expect(index.resolve("Nowheresville")).toBeUndefined();
    expect(index.candidatesFor("Nowheresville")).toEqual([]);
    // An id that does not exist must not fall through to a name lookup and match one.
    expect(index.resolve("0-00000")).toBeUndefined();
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
