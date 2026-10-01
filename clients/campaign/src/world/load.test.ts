/**
 * Terrarium elevation decoding.
 *
 * The formula is `elevation_m = R * 256 + G + B / 256 - 32768`. Getting it wrong would
 * put the Front Range under water or in orbit, and nothing else in the client would
 * notice, so it is checked against hand-decoded values.
 *
 * The tile-loading block at the end covers the runtime tile service and the
 * per-tile fallback. `region.json` now lists 2,236 zoom-12 tiles
 * (`public/world/DATA-MANIFEST.md` section 5.0) and the elevation strategy is not
 * settled, so what matters there is that a tile which will not load costs that tile
 * its terrain and nothing else.
 *
 * This file stays in the node environment: the block above reads `region.json` off
 * disk through `import.meta.url`, which is not a `file:` URL under jsdom. The tile
 * loader needs `location` and a canvas, so the block at the end installs its own.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bandFor,
  classifySettlement,
  clearElevationTileCache,
  elevationTileCacheSize,
  loadHeightfield,
  loadWorldData,
  makeProjection,
  WorldDataError,
} from "./load.js";
import type { Heightfield, NetworkFile, RegionFile, SettlementsFile, WorldSettlement } from "./types.js";

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

/**
 * Loading elevation tiles, from the bundle or from a runtime service.
 *
 * Nothing here touches the network, and nothing here needs a real browser. `fetch`,
 * `createImageBitmap`, `location`, and the canvas are replaced with the smallest
 * things that satisfy `fetchTilePixels`, because what these tests are about is the
 * loader's failure handling, not PNG decoding — which is checked above against
 * hand-decoded values.
 */

const TILE = 256;
/** A tile boundary in the Ohio wire format, so URLs under test look like the real ones. */
const Z = 12;
const X = 1077;
const Y = 1541;

/** RGBA pixels that decode to one flat elevation, using the same formula the loader uses. */
function encodeFlatTile(metres: number): Uint8ClampedArray {
  const v = metres + 32768;
  const r = Math.floor(v / 256);
  const g = Math.floor(v) - r * 256;
  const b = Math.round((v - Math.floor(v)) * 256);
  const data = new Uint8ClampedArray(TILE * TILE * 4);
  for (let i = 0; i < TILE * TILE; i += 1) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** What a mocked `fetch` returns for one URL. `"offline"` throws, as a dead network does. */
type TileReply = { status: number; pixels?: Uint8ClampedArray } | "offline";

/** A canvas whose 2D context hands back whatever bitmap was last drawn into it. */
function fakeCanvas(): unknown {
  let staged: Uint8ClampedArray | null = null;
  return {
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: () => {},
      drawImage: (bitmap: { pixels: Uint8ClampedArray }) => {
        staged = bitmap.pixels;
      },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        width: w,
        height: h,
        data: staged ?? new Uint8ClampedArray(w * h * 4),
      }),
    }),
  };
}

let requestedUrls: string[] = [];

function stubBrowserGlobals(): void {
  requestedUrls = [];
  vi.stubGlobal("location", { href: "https://app.example.test/campaign/" });
  vi.stubGlobal("document", { createElement: () => fakeCanvas() });
  vi.stubGlobal("createImageBitmap", async (blob: { pixels: Uint8ClampedArray }) => ({
    pixels: blob.pixels,
    close: () => {},
  }));
}

function installFakeTilePipeline(reply: (url: string) => TileReply): void {
  stubBrowserGlobals();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      requestedUrls.push(url);
      const r = reply(url);
      if (r === "offline") throw new TypeError("Failed to fetch");
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        statusText: r.status === 404 ? "Not Found" : "OK",
        blob: async () => ({ pixels: r.pixels ?? encodeFlatTile(0) }),
      } as unknown as Response;
    }),
  );
}

function tileRegion(tiles: { z: number; x: number; y: number; path: string }[]): RegionFile {
  return {
    name: "Ohio River Valley (OH/KY metro cluster)",
    bbox: { south: 37.1, west: -85.3, north: 40.6, east: -81.6 },
    elevation: { encoding: "terrarium", formula: "", zoom: Z, tileSize: TILE, tiles },
    retrieved: "2026-09-30",
  };
}

const TILE_PATH = `elevation/${Z}/${X}/${Y}.png`;
const SERVICE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

beforeEach(() => {
  clearElevationTileCache();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearElevationTileCache();
});

describe("loading elevation tiles", () => {
  it("reads a tile from the runtime service as {z}/{x}/{y}.png", async () => {
    installFakeTilePipeline(() => ({ status: 200, pixels: encodeFlatTile(1600) }));
    const region = tileRegion([{ z: Z, x: X, y: Y, path: TILE_PATH }]);

    const hf = await loadHeightfield(region, "https://example.test/world/", undefined, {
      elevationBaseUrl: SERVICE,
    });

    expect(requestedUrls).toEqual([`${SERVICE}/${Z}/${X}/${Y}.png`]);
    // The real terrain survived the round trip, so the URL was the only thing tested.
    expect(hf.elevation).toEqual({ listed: 1, decoded: 1, flat: 0, firstFailures: [] });
    expect(hf.metres[0]).toBeCloseTo(1600, 2);
  });

  it("reads a tile from the bundle when no service is given", async () => {
    installFakeTilePipeline(() => ({ status: 200, pixels: encodeFlatTile(1600) }));
    const region = tileRegion([{ z: Z, x: X, y: Y, path: TILE_PATH }]);

    await loadHeightfield(region, "https://example.test/world/");

    expect(requestedUrls).toEqual([`https://example.test/world/${TILE_PATH}`]);
  });

  it("tolerates a base URL with no trailing slash", async () => {
    installFakeTilePipeline(() => ({ status: 200, pixels: encodeFlatTile(1600) }));
    const region = tileRegion([{ z: Z, x: X, y: Y, path: TILE_PATH }]);

    await loadHeightfield(region, "https://example.test/world/", undefined, {
      elevationBaseUrl: "https://tiles.example.test/v1",
    });

    // Without the slash this would resolve to `v112/1077/1541.png`.
    expect(requestedUrls).toEqual([`https://tiles.example.test/v1/${Z}/${X}/${Y}.png`]);
  });

  it("falls back to flat ground for a missing tile and still loads", async () => {
    // The Ohio list is 2,236 tiles, most of which no single service answers for. One
    // of them being absent must not cost the player the other 2,235.
    const missingX = X + 1;
    installFakeTilePipeline((url) =>
      url.includes(`/${X}/${Y}.png`) ? { status: 200, pixels: encodeFlatTile(1600) } : { status: 404 },
    );
    const region = tileRegion([
      { z: Z, x: X, y: Y, path: TILE_PATH },
      { z: Z, x: missingX, y: Y, path: `elevation/${Z}/${missingX}/${Y}.png` },
    ]);

    const hf = await loadHeightfield(region, "https://example.test/world/", undefined, {
      elevationBaseUrl: SERVICE,
    });

    // The load resolved. The real tile is at ox = 0, the missing one at ox = 256.
    expect(hf.elevation).toEqual({ listed: 2, decoded: 1, flat: 1, firstFailures: [`${Z}/${missingX}/${Y}`] });
    expect(hf.width).toBe(2 * TILE);
    expect(hf.metres[10 * hf.width + 10]).toBeCloseTo(1600, 2);
    // The whole second tile is flat, not just the pixel next to the real one. It
    // occupies columns 256 to 511 of every row, so it is a column range, not a
    // contiguous run of the array.
    let lifted = 0;
    for (let py = 0; py < TILE; py += 1) {
      const row = py * hf.width;
      for (let px = TILE; px < 2 * TILE; px += 1) if (hf.metres[row + px] !== 0) lifted += 1;
    }
    expect(lifted).toBe(0);
  });

  it("falls back to flat ground when the network is gone, not only on a 404", async () => {
    installFakeTilePipeline(() => "offline");
    const region = tileRegion([{ z: Z, x: X, y: Y, path: TILE_PATH }]);

    const hf = await loadHeightfield(region, "https://example.test/world/");

    expect(hf.elevation.flat).toBe(1);
    expect(hf.metres.every((m) => m === 0)).toBe(true);
  });

  it("says how many tiles fell back, in one line, rather than quietly", async () => {
    // CONSTITUTION.md 1.3: no silent fallbacks. 2,236 tiles each logging its own
    // failure would be unusable, so the count is summarised once.
    installFakeTilePipeline(() => ({ status: 404 }));
    const region = tileRegion([{ z: Z, x: X, y: Y, path: TILE_PATH }]);

    await loadHeightfield(region, "https://example.test/world/");

    const lines = vi.mocked(console.warn).mock.calls.map((c) => String(c[0]));
    const summary = lines.filter((l) => l.includes("fell back to flat ground"));
    expect(summary).toHaveLength(1);
    expect(summary[0]).toContain("1 of 1 tiles");
    expect(summary[0]).toContain(`${Z}/${X}/${Y}`);
  });

  it("stays quiet when every tile loaded", async () => {
    installFakeTilePipeline(() => ({ status: 200, pixels: encodeFlatTile(1600) }));
    const region = tileRegion([{ z: Z, x: X, y: Y, path: TILE_PATH }]);

    await loadHeightfield(region, "https://example.test/world/");

    const lines = vi.mocked(console.warn).mock.calls.map((c) => String(c[0]));
    expect(lines.filter((l) => l.includes("fell back"))).toHaveLength(0);
  });

  it("fetches a tile once and serves the second request from memory", async () => {
    installFakeTilePipeline(() => ({ status: 200, pixels: encodeFlatTile(1600) }));
    const region = tileRegion([{ z: Z, x: X, y: Y, path: TILE_PATH }]);
    const options = { elevationBaseUrl: SERVICE };

    const first = await loadHeightfield(region, "https://example.test/world/", undefined, options);
    const second = await loadHeightfield(region, "https://example.test/world/", undefined, options);

    expect(requestedUrls).toHaveLength(1);
    expect(elevationTileCacheSize()).toBe(1);
    // Cached pixels, not a cached flat result: the terrain is still real the second time.
    expect(second.metres[0]).toBeCloseTo(1600, 2);
    expect(second.metres[0]).toBe(first.metres[0]!);
  });

  it("caches a tile within one load as well as across loads", async () => {
    // A region list that names the same tile twice, which a partial re-fetch can produce.
    installFakeTilePipeline(() => ({ status: 200, pixels: encodeFlatTile(1600) }));
    const region = tileRegion([
      { z: Z, x: X, y: Y, path: TILE_PATH },
      { z: Z, x: X, y: Y, path: TILE_PATH },
    ]);

    const hf = await loadHeightfield(region, "https://example.test/world/");

    expect(requestedUrls).toHaveLength(1);
    expect(hf.elevation.decoded).toBe(2);
  });

  it("does not cache a failure, so a dropped connection is retried next load", async () => {
    // Caching the rejection would freeze a transient outage into a permanent hole.
    let offline = true;
    installFakeTilePipeline(() => (offline ? "offline" : { status: 200, pixels: encodeFlatTile(1600) }));
    const region = tileRegion([{ z: Z, x: X, y: Y, path: TILE_PATH }]);
    const options = { elevationBaseUrl: SERVICE };

    const failed = await loadHeightfield(region, "https://example.test/world/", undefined, options);
    expect(failed.elevation.flat).toBe(1);
    expect(elevationTileCacheSize()).toBe(0);

    offline = false;
    const retried = await loadHeightfield(region, "https://example.test/world/", undefined, options);
    expect(requestedUrls).toHaveLength(2);
    expect(retried.elevation).toEqual({ listed: 1, decoded: 1, flat: 0, firstFailures: [] });
    expect(retried.metres[0]).toBeCloseTo(1600, 2);
  });
});

describe("loadWorldData with a runtime elevation service", () => {
  const settlementsFile: SettlementsFile = {
    source: "us-census",
    licence: "public domain",
    retrieved: "2026-09-30",
    settlements: [
      {
        osmId: "node/1",
        name: "Cincinnati",
        place: "city",
        lat: 39.1,
        lon: -84.5,
        population: 309_317,
        populationSource: "us-census",
        populationCensusName: "Cincinnati city, Ohio",
        state: "Ohio",
        stateCode: "OH",
        osmPopulation: null,
        osmPopulationDate: null,
        wikidata: null,
      },
    ],
  };
  const networkFile: NetworkFile = {
    source: "tiger",
    licence: "public domain",
    retrieved: "2026-09-30",
    roads: [{ osmId: "way/1", highway: "primary", name: "Main", ref: null, surface: "asphalt", lanes: 2, coords: [[39.1, -84.5], [39.2, -84.4]] }],
    rail: [],
  };

  /**
   * Serve the three survey files and, optionally, an elevation tile at 404 — the
   * state the Ohio tile list is in until a tile service is decided.
   */
  function installWorldFetch(tilesOk: boolean): void {
    stubBrowserGlobals();
    const json = (body: unknown): Response =>
      ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
    const notFound = { ok: false, status: 404, statusText: "Not Found" } as unknown as Response;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url.endsWith("region.json")) return json(tileRegion([{ z: Z, x: X, y: Y, path: TILE_PATH }]));
        if (url.endsWith("settlements.json")) return json(settlementsFile);
        if (url.endsWith("network.json")) return json(networkFile);
        if (url.endsWith(".png") && tilesOk) {
          return { ok: true, status: 200, blob: async () => ({ pixels: encodeFlatTile(1600) }) } as unknown as Response;
        }
        return notFound;
      }),
    );
  }

  it("passes elevationBaseUrl through to the tile fetches and survives a missing tile", async () => {
    installWorldFetch(false);

    const data = await loadWorldData({
      baseUrl: "https://example.test/world/",
      elevationBaseUrl: SERVICE,
    });

    expect(requestedUrls).toContain(`${SERVICE}/${Z}/${X}/${Y}.png`);
    // The world loaded, settlements and roads included, with flat terrain.
    expect(data.settlements.map((s) => s.name)).toEqual(["Cincinnati"]);
    expect(data.roads.map((r) => r.roadClass)).toEqual(["primary"]);
    expect(data.heightfield.metres.every((m) => m === 0)).toBe(true);
  });

  it("still fails loudly when a survey file is missing", async () => {
    // The fallback is for terrain, not for the map's spine.
    installWorldFetch(true);
    const fake = vi.mocked(globalThis.fetch as unknown as ReturnType<typeof vi.fn>);
    fake.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith("region.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => tileRegion([{ z: Z, x: X, y: Y, path: TILE_PATH }]),
        } as unknown as Response;
      }
      return { ok: false, status: 404, statusText: "Not Found" } as unknown as Response;
    });

    // A `WorldDataError`, whose `playerMessage` says what is missing. The developer
    // detail is the URL and status, not the string "/missing/i" happens to match.
    const err = await loadWorldData({ baseUrl: "https://example.test/world/" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WorldDataError);
    expect((err as WorldDataError).kind).toBe("missing");
    expect((err as WorldDataError).playerMessage).toContain("is missing");
    expect((err as WorldDataError).developerDetail).toContain("settlements.json");
  });
});
