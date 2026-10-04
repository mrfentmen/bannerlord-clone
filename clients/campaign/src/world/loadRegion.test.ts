/**
 * The load path, against the real committed world data.
 *
 * Everything else in this directory tests a function on its own. This one runs
 * `loadWorldData` over the actual `public/world/` files the client ships and
 * boots from, with the network and the canvas stubbed. That is the only way to
 * catch the class of failure that has actually happened here: the four files are
 * produced by different tooling, so a mismatch between them is invisible to every
 * unit test and shows up as a map that draws the wrong terrain, or not at all.
 *
 * The stubs are deliberately strict. `fetch` serves only the files that exist and
 * throws on anything else, so a tile list naming a file that is not on disk fails
 * here rather than as a blank map in the browser. The canvas returns a real
 * ImageData-shaped object so the terrarium decode runs for real over real bytes.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SUPPORTED_WIRE_VERSION,
  WorldDataError,
  cacheBust,
  loadWorldData,
  settlementsWithoutBoundaries,
} from "./load.js";
import { BUILD_HASH } from "../buildHash.js";

const WORLD_DIR = fileURLToPath(new URL("../../public/world/", import.meta.url));

/** Read a committed world file, or fail with the command that produces it. */
function readWorld<T>(name: string): T {
  const path = `${WORLD_DIR}${name}`;
  if (!existsSync(path)) {
    throw new Error(`public/world/${name} is missing. Deploy the world data first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** A PNG header plus a body, enough for `createImageBitmap` to be given something. */
function fakeTile(): ArrayBuffer {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]).buffer;
}

let requested: string[] = [];

beforeEach(() => {
  requested = [];
  vi.stubGlobal("location", { href: "http://localhost/" });
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
  // The decode reads pixels back off a 2D context. jsdom has no canvas package, so
  // this returns a flat mid-grey field: enough for the decode to run over every tile
  // and for the heightfield to have real dimensions.
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

describe("loading the committed world data", () => {
  it("loads the Ohio River Valley region end to end", async () => {
    const world = await loadWorldData({ baseUrl: "/world" });

    expect(world.settlements.length).toBe(487);
    expect(world.roads.length).toBe(439);
    expect(world.rail.length).toBe(4_653);
    expect(world.region.name).toContain("Ohio River Valley");
    // One outline per settlement: the boundary file is the only real shape the client has
    // for a town, so a region that loaded with none of them is a region with no footprints
    // at all. `src/world/boundaries.test.ts` checks the geometry in detail.
    expect(world.boundaries.length).toBe(487);
    expect(settlementsWithoutBoundaries(world.settlements, world.boundaries)).toEqual([]);
  });

  it("fetches exactly the five wire files and then the boot tiles", async () => {
    await loadWorldData({ baseUrl: "/world" });

    const region = readWorld<{ elevation: { tiles: { path: string }[] } }>("region.json");
    const expected = [
      "/world/region.json",
      "/world/settlements.json",
      "/world/network.json",
      "/world/boundaries.json",
      "/world/territories.json",
      ...region.elevation.tiles.map((t) => `/world/${t.path}`),
    ];
    // The detail tier is a fetchable artifact, not a boot dependency, so none of its
    // 2,236 tiles may be requested during startup.
    expect(requested.slice().sort()).toEqual(expected.sort());
  });

  it(
    "places every settlement and every road inside the region's own bounds",
    async () => {
      // The failure this catches: `region.json` once described the Colorado Front Range
      // while `settlements.json` and `network.json` described the Ohio River Valley, so
      // the projection was centred on Colorado and every Ohio settlement landed about
      // 28x outside the map, with `heightAt` returning 0 for all of them.
      //
      // Every vertex of 439 roads and 4,653 rail lines is checked, which is ~700k
      // assertions and needs more than the default 5s budget.
      const world = await loadWorldData({ baseUrl: "/world" });
      const { south, west, north, east } = world.region.bbox;

      for (const s of world.settlements) {
        expect(s.lat, `${s.name} is south of the region`).toBeGreaterThanOrEqual(south);
        expect(s.lat, `${s.name} is north of the region`).toBeLessThanOrEqual(north);
        expect(s.lon, `${s.name} is west of the region`).toBeGreaterThanOrEqual(west);
        expect(s.lon, `${s.name} is east of the region`).toBeLessThanOrEqual(east);
      }
      for (const way of [...world.roads, ...world.rail]) {
        for (const [lat, lon] of way.coords) {
          expect(lat, `road ${way.id} is south of the region`).toBeGreaterThanOrEqual(south - 0.5);
          expect(lat, `road ${way.id} is north of the region`).toBeLessThanOrEqual(north + 0.5);
          expect(lon, `road ${way.id} is west of the region`).toBeGreaterThanOrEqual(west - 0.5);
          expect(lon, `road ${way.id} is east of the region`).toBeLessThanOrEqual(east + 0.5);
        }
      }
    },
    120_000,
  );

  it("builds a heightfield that covers the settlements it will be asked about", async () => {
    // `heightAt` returns 0 outside the heightfield's extent, so a heightfield that
    // does not span the settlements is a map with no terrain under any of its towns.
    const world = await loadWorldData({ baseUrl: "/world" });
    expect(world.heightfield.width).toBeGreaterThan(0);
    expect(world.heightfield.height).toBeGreaterThan(0);
    expect(world.heightfield.metres.length).toBe(
      world.heightfield.width * world.heightfield.height,
    );
    expect(world.heightfield.resolutionMetres).toBeGreaterThan(0);
  });

  it("reports progress for the survey and the terrain, and finishes both", async () => {
    const stages = new Map<string, [number, number]>();
    await loadWorldData({
      baseUrl: "/world",
      onStage: (stage, loaded, total) => stages.set(stage, [loaded, total]),
    });
    // Five wire files: region, settlements, network, the town outlines, and the faction
    // territories that `factionRegion.ts` maps a chosen side onto.
    expect(stages.get("survey")).toEqual([0, 5]);
    const terrain = stages.get("terrain");
    expect(terrain).toBeDefined();
    expect(terrain![0]).toBe(terrain![1]);
    expect(terrain![1]).toBeGreaterThan(0);
  });
});

describe("when the world data is not there", () => {
  it("says the data is missing rather than drawing an empty map", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404, statusText: "Not Found" }));
    const error = await loadWorldData({ baseUrl: "/world" }).catch((e) => e);
    expect(error).toBeInstanceOf(WorldDataError);
    expect((error as WorldDataError).kind).toBe("missing");
    // A 404 is retryable: the files are fetched, not committed, so a first run can
    // legitimately hit the server before the world data has been published. What it
    // must never be is a silently empty map.
    expect((error as WorldDataError).retryable).toBe(true);
    expect((error as WorldDataError).playerMessage).toMatch(/missing/i);
  });

  it("names the file that was missing", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const url = new URL(String(input), "http://localhost/");
      if (url.pathname.endsWith("region.json")) {
        return { ok: false, status: 404, statusText: "Not Found" };
      }
      const relative = url.pathname.replace(/^\/world\//, "");
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => JSON.parse(readFileSync(`${WORLD_DIR}${relative}`, "utf8")),
      } as unknown as Response;
    });
    const error = await loadWorldData({ baseUrl: "/world" }).catch((e) => e);
    expect((error as WorldDataError).developerDetail).toContain("region.json");
  });
});

/**
 * The browser cache, not the disk, is where a redeployed world file goes stale.
 *
 * The wire files keep their names across deployments, so a request for
 * `/world/region.json` is byte-identical before and after a deploy that changed every
 * byte of its answer. Left alone the HTTP cache is allowed to answer from the previous
 * deployment, and the result is valid JSON describing the wrong region - which is the
 * same class of bug `loadRegion.test.ts` exists for, arriving through a route nothing
 * on disk can show.
 */
describe("cache invalidation across a redeploy", () => {
  it("asks for every world file with the build hash attached", async () => {
    const urls: string[] = [];
    // `beforeEach` already installed a strict stub that serves the real files and 404s
    // anything else; wrap it rather than replacing it, so this test exercises the same
    // data the rest of the suite does.
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string | URL) => {
      urls.push(String(input));
      return inner(input);
    });

    await loadWorldData({ baseUrl: "/world" });

    // Every request, not just the four wire files: the 154 boot tiles are static PNGs
    // under stable paths and would otherwise be the stale ones.
    expect(urls.length).toBeGreaterThan(4);
    for (const url of urls) {
      expect(url, `${url} was requested without a cache-busting token`).toContain(`b=${BUILD_HASH}`);
    }
  });

  it("keys the token on the build hash rather than the clock", async () => {
    // A clock-based token would refetch 8 MB of terrain on every reload and defeat the
    // caching it exists to preserve. The build hash changes once per deployment, so a
    // reload inside one deployment still hits the cache.
    const a = cacheBust("/world/region.json");
    const b = cacheBust("/world/region.json");
    expect(a).toBe(b);
    expect(a.startsWith("/world/region.json?")).toBe(true);
  });

  it("appends to a URL that already carries a query string", async () => {
    expect(cacheBust("/world/region.json?v=1")).toContain(`?v=1&b=${BUILD_HASH}`);
  });

  it("keeps the file path intact so the request still resolves", async () => {
    // The token is a query parameter precisely because these are files served out of
    // `public/world/`; a path segment would 404 instead of serving the file.
    const busted = cacheBust("/world/settlements.json");
    expect(new URL(busted, "http://localhost/").pathname).toBe("/world/settlements.json");
  });
});

/**
 * `wire_version` is the one field in a wire file that describes the shape of the rest
 * of it, so it is the field that decides whether this client can read the file.
 */
describe("the wire format version", () => {
  /**
   * Serve the real files with one of them rewritten, to prove what the stamp changes.
   *
   * Delegates everything except the rewritten file to the strict stub `beforeEach`
   * installed, so the 154 boot tiles still come back as PNG bytes rather than JSON.
   */
  function stubWithStamp(name: string, stamp: number | "absent"): void {
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string | URL) => {
      const relative = new URL(String(input), "http://localhost/").pathname.replace(
        /^\/world\//,
        "",
      );
      if (relative !== name) return inner(input);
      const payload = JSON.parse(readFileSync(`${WORLD_DIR}${relative}`, "utf8"));
      if (stamp === "absent") delete payload.wire_version;
      else payload.wire_version = stamp;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => payload,
      } as unknown as Response;
    });
  }

  it("loads the shipped files, which carry the version this client reads", async () => {
    // `settlements.json` and `network.json` ship stamped v2, and `region.json` and
    // `boundaries.json` ship unstamped. Both have to load.
    const world = await loadWorldData({ baseUrl: "/world" });
    expect(world.settlements.length).toBe(487);
  });

  it("refuses a file from a newer wire revision instead of half-reading it", async () => {
    stubWithStamp("settlements.json", SUPPORTED_WIRE_VERSION + 1);
    const error = await loadWorldData({ baseUrl: "/world" }).catch((e) => e);
    expect(error).toBeInstanceOf(WorldDataError);
    expect((error as WorldDataError).kind).toBe("decode");
    // Not retryable: reloading fetches the same bytes again. The fix is a deploy or a
    // client update, not another attempt.
    expect((error as WorldDataError).retryable).toBe(false);
    expect((error as WorldDataError).developerDetail).toContain("settlements.json");
    expect((error as WorldDataError).developerDetail).toContain(
      String(SUPPORTED_WIRE_VERSION + 1),
    );
  });

  it("refuses an older revision too, because the deploy carries the stamp forward", async () => {
    // A downgrade that reached the client means a file was replaced by something that
    // bypassed `deploy-wire-to-client.py`, which is the thing that keeps this number
    // from going backwards.
    stubWithStamp("network.json", SUPPORTED_WIRE_VERSION - 1);
    const error = await loadWorldData({ baseUrl: "/world" }).catch((e) => e);
    expect(error).toBeInstanceOf(WorldDataError);
    expect((error as WorldDataError).developerDetail).toContain("network.json");
  });

  it("reads a file with no stamp as unversioned rather than as a failure", async () => {
    // `region.json` genuinely ships unstamped today. An absent stamp is an honest
    // "no claim made", and refusing it would leave the game unable to load its own data.
    stubWithStamp("region.json", "absent");
    const world = await loadWorldData({ baseUrl: "/world" });
    expect(world.region.name).toContain("Ohio River Valley");
  });

  it("names the version before the shape, so the log points at the real problem", async () => {
    // A v3 file may be shaped nothing this client recognises. Reporting "broken
    // elevation format" for a renamed field sends whoever reads the log after the
    // wrong cause entirely.
    stubWithStamp("region.json", SUPPORTED_WIRE_VERSION + 1);
    const error = await loadWorldData({ baseUrl: "/world" }).catch((e) => e);
    expect((error as WorldDataError).developerDetail).toContain("wire_version");
    expect((error as WorldDataError).developerDetail).not.toContain("elevation");
  });

  it("tells the player how to recover", async () => {
    stubWithStamp("settlements.json", SUPPORTED_WIRE_VERSION + 1);
    const error = await loadWorldData({ baseUrl: "/world" }).catch((e) => e);
    // CONSTITUTION.md 1.3: a plain sentence and a way out, no developer-speak.
    expect((error as WorldDataError).playerMessage).toMatch(/update the game|re-fetch/i);
    expect((error as WorldDataError).playerMessage).not.toMatch(/wire_version|SUPPORTED_WIRE/);
  });
});
