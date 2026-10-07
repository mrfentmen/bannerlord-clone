/**
 * Region selection, and the second region itself, against the real committed files.
 *
 * `loadRegion.test.ts` proves the *default* region loads. This proves the other two things
 * that only became true when a deployment could carry more than one region:
 *
 *   * `?region=<id>` resolves to that region's directory, and an id that is not deployed is
 *     an error rather than a silent fall back to the default. A silent fall back is the one
 *     failure mode here that reaches a player looking at a real map: `?region=nyc-metro`
 *     quietly drawing Ohio would be 154 correct-looking towns in the wrong state.
 *   * The NYC metro region's own files load end to end through `loadWorldData` — its wire
 *     files, its boot tiles, its outlines — rather than being merely present on disk.
 *
 * The fetch stub is strict in the same way as the other one: it serves only files that exist
 * and 404s everything else, so a boot tile list naming a file that is not on disk fails
 * here rather than as a blank map in a browser.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILD_HASH } from "../buildHash.js";
import { WorldDataError, loadWorldData, settlementsWithoutBoundaries } from "./load.js";
import {
  loadRegionIndex,
  requestedRegionId,
  resolveRegionBaseUrl,
  validateRegionIndex,
  type RegionIndex,
} from "./regions.js";

const WORLD_DIR = fileURLToPath(new URL("../../public/world/", import.meta.url));

function readWorld<T>(name: string): T {
  const path = `${WORLD_DIR}${name}`;
  if (!existsSync(path)) {
    throw new Error(`public/world/${name} is missing. Build and deploy the world data first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function fakeTile(): ArrayBuffer {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]).buffer;
}

let requested: string[] = [];

beforeEach(() => {
  requested = [];
  vi.stubGlobal("location", { href: "http://localhost/", search: "" });
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input), "http://localhost/");
    requested.push(url.pathname);
    const relative = url.pathname.replace(/^\/world\//, "");
    const path = `${WORLD_DIR}${relative}`;
    if (!existsSync(path)) {
      return { ok: false, status: 404, statusText: "Not Found" };
    }
    const body = relative.endsWith(".png") ? fakeTile() : readFileSync(path, "utf8");
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => ({ arrayBuffer: async () => body }),
      json: async () => JSON.parse(body as string),
    } as unknown as Response;
  });
  vi.stubGlobal("createImageBitmap", async () => ({ close: () => {} }));
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        clearRect: () => {},
        drawImage: () => {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4).fill(128),
        }),
      }),
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- ?region= parsing --------------------------------------------------------

describe("reading ?region=", () => {
  it("reads the id out of a query string", () => {
    expect(requestedRegionId("?region=nyc-metro")).toBe("nyc-metro");
    expect(requestedRegionId("?city=manhattan-sample&region=nyc-metro")).toBe("nyc-metro");
  });

  it("treats an absent or empty parameter as no request at all", () => {
    // A hand-typed `?region` means "the default one", not "the region named the empty
    // string" — which would be an unknown id and a refused load.
    expect(requestedRegionId("")).toBeNull();
    expect(requestedRegionId("?city=manhattan-sample")).toBeNull();
    expect(requestedRegionId("?region=")).toBeNull();
    expect(requestedRegionId("?region=%20%20")).toBeNull();
  });
});

// --- the index ---------------------------------------------------------------

describe("the committed region index", () => {
  it("lists the default region and the NYC metro region", () => {
    const index = readWorld<RegionIndex>("regions.json");
    const ids = index.regions.map((entry) => entry.id);
    expect(ids).toContain("default");
    expect(ids).toContain("nyc-metro");
    expect(index.default).toBe("default");
  });

  it("validates", () => {
    const index = readWorld<unknown>("regions.json");
    expect(validateRegionIndex(index)).toHaveProperty("index");
  });

  it("refuses an index whose default is not among the regions it lists", () => {
    const index = readWorld<RegionIndex>("regions.json");
    const broken = { ...index, default: "atlantis" };
    const checked = validateRegionIndex(broken);
    expect(checked).toHaveProperty("error");
    expect((checked as { error: string }).error).toContain("atlantis");
  });

  it("refuses a path that does not end in a slash", () => {
    // Without the slash, `/world/nyc-metro` + `region.json` resolves against the last
    // segment as a file and requests `/world/region.json` — the default region's file.
    // That is precisely the mix-up a second region exists to prevent, so it is refused
    // rather than normalised.
    const index = readWorld<RegionIndex>("regions.json");
    const entry = { ...index.regions[0], path: "./nyc-metro" };
    const checked = validateRegionIndex({ ...index, regions: [entry] });
    expect(checked).toHaveProperty("error");
    expect((checked as { error: string }).error).toContain('does not end in "/"');
  });

  it("refuses a duplicated id", () => {
    const index = readWorld<RegionIndex>("regions.json");
    const checked = validateRegionIndex({ ...index, regions: [index.regions[0], index.regions[0]] });
    expect((checked as { error: string }).error).toContain("twice");
  });

  it("fetches and validates the real index", async () => {
    const index = await loadRegionIndex("/world");
    expect(index).not.toBeNull();
    expect(index?.regions.length).toBeGreaterThanOrEqual(2);
  });

  it("cache-busts the index request like every other world file", async () => {
    // `regions.json` is a static file at a stable path, so without the build-hash token a
    // browser can answer a new bundle's request with yesterday's index. That is worse here
    // than for a wire file: a stale index still lists a region whose subdirectory the new
    // deployment deleted, and the failure lands as a 404 at boot with the region looking
    // selectable right up until it is not.
    //
    // The shared stub records pathnames only, so this one records the whole request URL -
    // the token is in the query string, which the pathname does not carry.
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(String(input), "http://localhost/");
      urls.push(url.href);
      const relative = url.pathname.replace(/^\/world\//, "");
      const path = `${WORLD_DIR}${relative}`;
      if (!existsSync(path)) {
        return { ok: false, status: 404, statusText: "Not Found" };
      }
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => JSON.parse(readFileSync(path, "utf8")),
      } as unknown as Response;
    });

    await loadRegionIndex("/world");

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/world/regions.json?");
    expect(urls[0]).toContain(`b=${BUILD_HASH}`);
    // A token in the path would 404 rather than serve the file, which is the whole reason
    // `cacheBust` puts it in the query string.
    expect(new URL(urls[0]!).pathname).toBe("/world/regions.json");
  });

  it("returns null when the index is absent, rather than failing the load", async () => {
    // A deployment predating multi-region has no `regions.json` and must still load its
    // one region — the same reasoning `loadWorldData` uses for an absent `boundaries.json`.
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }));
    expect(await loadRegionIndex("/world")).toBeNull();
  });

  it("throws for an index that is present and unreadable", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }));
    // Quietly loading the default region here would mean the player asked for New York and
    // got Ohio with nothing on screen saying so.
    await expect(loadRegionIndex("/world")).rejects.toThrow(WorldDataError);
  });
});

// --- resolution --------------------------------------------------------------

describe("resolving a region to a base URL", () => {
  const index: RegionIndex = {
    default: "default",
    regions: [
      {
        id: "default",
        name: "Ohio River Valley",
        path: "./",
        bbox: { south: 37.1, west: -85.3, north: 40.6, east: -81.6 },
        settlements: 487,
        roads: 439,
        rail: 4653,
        bootZoom: 10,
        bootTiles: 154,
      },
      {
        id: "nyc-metro",
        name: "New York City Metro",
        path: "./nyc-metro/",
        bbox: { south: 40.45, west: -74.4, north: 40.98, east: -73.55 },
        settlements: 154,
        roads: 661,
        rail: 1137,
        bootZoom: 12,
        bootTiles: 99,
      },
    ],
  };

  it("returns the configured base unchanged when no region is asked for", () => {
    expect(resolveRegionBaseUrl(index, null, "/world")).toBe("http://localhost/world/");
    // No index either — a deployment with one region and no index file.
    expect(resolveRegionBaseUrl(null, null, "/world")).toBe("http://localhost/world/");
    expect(resolveRegionBaseUrl(null, "nyc-metro", "/world")).toBe("http://localhost/world/");
  });

  it("resolves a named region to its own directory", () => {
    expect(resolveRegionBaseUrl(index, "nyc-metro", "/world")).toBe(
      "http://localhost/world/nyc-metro/",
    );
  });

  it("resolves the default region to the same base it always was", () => {
    expect(resolveRegionBaseUrl(index, "default", "/world")).toBe("http://localhost/world/");
  });

  it("respects a configured base that is not the default", () => {
    // `VITE_WORLD_DATA_URL` pointing at a CDN must keep working: the index's paths are
    // relative to whatever base was configured, not to a hardcoded `/world`.
    expect(resolveRegionBaseUrl(index, "nyc-metro", "https://cdn.example/data/world")).toBe(
      "https://cdn.example/data/world/nyc-metro/",
    );
    // And one written without its trailing slash.
    expect(resolveRegionBaseUrl(index, "nyc-metro", "https://cdn.example/w")).toBe(
      "https://cdn.example/w/nyc-metro/",
    );
  });

  it("refuses an unknown region instead of falling back to the default", () => {
    let thrown: unknown;
    try {
      resolveRegionBaseUrl(index, "atlantis", "/world");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(WorldDataError);
    expect((thrown as WorldDataError).playerMessage).toContain("atlantis");
    // The message has to name what does exist, or a player cannot recover from a typo.
    expect((thrown as WorldDataError).developerDetail).toContain("nyc-metro");
  });
});

// --- the NYC metro region, end to end ----------------------------------------

describe("loading the NYC metro region", () => {
  it("loads every wire file and all of its boot tiles", async () => {
    const world = await loadWorldData({ baseUrl: "/world/nyc-metro" });

    expect(world.region.regionId).toBe("nyc-metro");
    expect(world.region.name).toContain("New York City Metro");
    expect(world.settlements.length).toBe(154);
    expect(world.roads.length).toBe(661);
    expect(world.rail.length).toBe(1137);
    // One outline per settlement, as in the default region: a region that loaded with none
    // of them would draw points with no footprints at all.
    expect(world.boundaries.length).toBe(154);
    expect(settlementsWithoutBoundaries(world.settlements, world.boundaries)).toEqual([]);
  });

  it("fetched the metro's own files and none of the default region's", async () => {
    await loadWorldData({ baseUrl: "/world/nyc-metro" });

    // The failure this catches: a region whose files were deployed flat, beside the default
    // region's, so one region's settlements loaded under the other's terrain.
    expect(requested).toContain("/world/nyc-metro/region.json");
    expect(requested).toContain("/world/nyc-metro/settlements.json");
    expect(requested).toContain("/world/nyc-metro/network.json");
    expect(requested).toContain("/world/nyc-metro/boundaries.json");
    expect(requested).not.toContain("/world/region.json");
    expect(requested).not.toContain("/world/settlements.json");
  });

  it("fetches its own boot tiles, at its own zoom", async () => {
    await loadWorldData({ baseUrl: "/world/nyc-metro" });
    const region = readWorld<{ elevation: { zoom: number; tiles: { path: string }[] } }>(
      "nyc-metro/region.json",
    );

    // A metro box is 0.85 degrees wide where Ohio's is 3.7, so the default region's zoom-10
    // boot tier would leave the whole metro on about a dozen pixels of terrain. Its zoom is
    // the region's own decision, read from the file rather than assumed.
    expect(region.elevation.zoom).toBe(12);
    expect(requested.filter((path) => path.endsWith(".png")).length).toBe(
      region.elevation.tiles.length,
    );
    for (const tile of region.elevation.tiles) {
      expect(requested).toContain(`/world/nyc-metro/${tile.path}`);
    }
  });

  it("projects every settlement inside its own bounds", async () => {
    // The projection bug stated for the new region: a settlement outside the bbox lands in
    // the terrain or the sea rather than failing.
    const world = await loadWorldData({ baseUrl: "/world/nyc-metro" });
    const { south, west, north, east } = world.region.bbox;

    for (const s of world.settlements) {
      expect(s.lat, `${s.name} is south of the metro region`).toBeGreaterThanOrEqual(south);
      expect(s.lat, `${s.name} is north of the metro region`).toBeLessThanOrEqual(north);
      expect(s.lon, `${s.name} is west of the metro region`).toBeGreaterThanOrEqual(west);
      expect(s.lon, `${s.name} is east of the metro region`).toBeLessThanOrEqual(east);
    }
  });

  it("carries real Census places with real populations", async () => {
    const world = await loadWorldData({ baseUrl: "/world/nyc-metro" });
    const byName = new Map(world.settlements.map((s) => [s.name, s]));

    // Five well-known places in the box, at the coordinates the Census Bureau publishes for
    // them. The pipeline stores each place's *interior point*, which is inside the
    // municipality rather than at its namesake landmark, so the tolerance is a few
    // hundredths of a degree rather than exact.
    const expected: Array<[string, number, number, number]> = [
      // Newark, NJ — 40.7357 / -74.1724, 2023 estimate 304,960
      ["Newark", 40.7357, -74.1724, 304_960],
      // Jersey City, NJ — 40.7282 / -74.0776
      ["Jersey City", 40.7282, -74.0776, 291_657],
      // Yonkers, NY — 40.9312 / -73.8987
      ["Yonkers", 40.9312, -73.8987, 207_657],
      // New Rochelle, NY — 40.9115 / -73.7824
      ["New Rochelle", 40.9115, -73.7824, 83_742],
      // Hackensack, NJ — 40.8862 / -74.0439
      ["Hackensack", 40.8862, -74.0439, 45_736],
      // Freeport, NY — 40.6587 / -73.5868
      ["Freeport", 40.6587, -73.5868, 43_756],
    ];

    for (const [name, lat, lon, population] of expected) {
      const found = byName.get(name);
      expect(found, `${name} is not in the metro region`).toBeDefined();
      expect(Math.abs(found!.lat - lat), `${name} latitude`).toBeLessThan(0.05);
      expect(Math.abs(found!.lon - lon), `${name} longitude`).toBeLessThan(0.05);
      // Populations are the Vintage 2023 estimates, published to the person, so this is
      // exact rather than approximate.
      expect(found!.population, `${name} population`).toBe(population);
      expect(found!.populationSource).toContain("Census");
    }
  });

  it("loads the default region unchanged after all of this", async () => {
    // The regression guard for the whole exercise: adding a region must not disturb the one
    // the client loaded before, which every existing URL and test depends on.
    const world = await loadWorldData({ baseUrl: "/world" });
    expect(world.region.name).toContain("Ohio River Valley");
    expect(world.settlements.length).toBe(487);
    expect(world.roads.length).toBe(439);
    expect(world.rail.length).toBe(4_653);
    expect(world.boundaries.length).toBe(487);
  });

  it("loads every region the committed index lists", async () => {
    // Parameterised by data rather than by a hardcoded list, so a region deployed later is
    // covered the moment it is listed.
    const index = await loadRegionIndex("/world");
    expect(index).not.toBeNull();

    for (const entry of index!.regions) {
      const baseUrl = resolveRegionBaseUrl(index, entry.id, "/world");
      const world = await loadWorldData({ baseUrl });
      expect(world.settlements.length, `${entry.id} settlements`).toBe(entry.settlements);
      expect(world.roads.length, `${entry.id} roads`).toBe(entry.roads);
      expect(world.rail.length, `${entry.id} rail`).toBe(entry.rail);
    }
  });
});