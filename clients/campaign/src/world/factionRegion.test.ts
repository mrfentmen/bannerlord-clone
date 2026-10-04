/**
 * Selecting a faction has to load that faction's region.
 *
 * Every input here is a committed file under `public/world/`. Nothing in this file is
 * invented: the hulls come from `territories.json`, the towns from `settlements.json`,
 * and the side ids from the same `PLAYABLE_SIDE_IDS` the start screen offers. A test
 * that built its own polygons would pass whether or not the loader worked, which is the
 * one thing worth ruling out.
 *
 * The world is loaded once through the real `loadWorldData` path rather than assembled
 * from the JSON, so `world.territories` is what the client actually gets at boot. If the
 * loader stopped reading `territories.json`, every assertion here fails.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { loadWorldData, makeProjection } from "./load.js";
import {
  campaignOpening,
  factionFocusRadius,
  factionRegionFor,
  indexTerritories,
  normalizeFactionKey,
  pointInTerritory,
  type FactionRegion,
} from "./factionRegion.js";
import type { FactionTerritoriesFile, WorldData } from "./types.js";
import { PLAYABLE_SIDE_IDS } from "../design/factions.js";
import { SIDE_DEFINITIONS } from "../data/sides.js";

const WORLD_DIR = fileURLToPath(new URL("../../public/world/", import.meta.url));

/** A PNG header plus a body, enough for `createImageBitmap` to be given something. */
function fakeTile(): ArrayBuffer {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(64).fill(0)]).buffer;
}

/** Serve the committed files, and 404 anything that is not committed. */
function stubWorldFiles(): void {
  vi.stubGlobal("location", { href: "http://localhost/" });
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input), "http://localhost/");
    const relative = url.pathname.replace(/^\/world\//, "");
    const path = `${WORLD_DIR}${relative}`;
    if (!existsSync(path)) return { ok: false, status: 404, statusText: "Not Found" };
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
  // The decode reads pixels back off a 2D context. jsdom has no canvas package, so this
  // returns a flat mid-grey field: enough for the heightfield to have real dimensions,
  // which is all the projection needs.
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
}

let world: WorldData;

beforeAll(async () => {
  stubWorldFiles();
  world = await loadWorldData({ baseUrl: "/world" });
  vi.unstubAllGlobals();
}, 120_000);

/** The shipped file, read straight off disk, for cross-checking the loaded copy. */
function shippedTerritories(): FactionTerritoriesFile {
  const path = `${WORLD_DIR}territories.json`;
  if (!existsSync(path)) {
    throw new Error("public/world/territories.json is missing. Build it with build-territories.py.");
  }
  return JSON.parse(readFileSync(path, "utf8")) as FactionTerritoriesFile;
}

describe("the faction territory file reaching the client", () => {
  it("is read at boot, not inferred", () => {
    const shipped = shippedTerritories();
    expect(world.territories.length).toBe(shipped.territories.length);
    expect(world.territories.length).toBe(6);
    expect(world.territories.map((t) => t.label).sort()).toEqual(
      shipped.territories.map((t) => t.label).sort(),
    );
    // Six hulls with real geometry, not six empty records.
    for (const t of world.territories) {
      expect(t.polygon.length).toBeGreaterThanOrEqual(3);
      expect(t.capital.name).not.toBe("");
      expect(Number.isFinite(t.capital.lat)).toBe(true);
    }
  });

  it("joins the pipeline's spelling of a faction id to the client's", () => {
    // `build-territories.py` buckets on a snake_case `section_key`; `PLAYABLE_SIDE_IDS`
    // is hyphenated. A lookup on the raw string finds nothing for every side.
    const shipped = shippedTerritories();
    expect(shipped.territories.map((t) => t.faction)).toContain("great_lakes_union");
    expect(PLAYABLE_SIDE_IDS).toContain("great-lakes-union");

    const byKey = indexTerritories(world.territories);
    for (const sideId of PLAYABLE_SIDE_IDS) {
      expect(byKey.has(normalizeFactionKey(sideId)), `${sideId} has no shipped territory`).toBe(true);
      // The raw shipped spelling is what a lookup without normalization would miss.
      expect(byKey.has(sideId.replace(/-/g, "_")), sideId).toBe(false);
      expect(byKey.has(sideId), sideId).toBe(true);
    }
  });

  it("resolves every playable side, and only playable sides, to a territory", () => {
    for (const sideId of PLAYABLE_SIDE_IDS) {
      expect(factionRegionFor(sideId, world), sideId).not.toBeNull();
    }
    // The Wanderer holds no section, so it holds no territory. `null` says "no shipped
    // territory to intersect with", which is a different fact from "holds nothing here".
    expect(factionRegionFor("wanderer", world)).toBeNull();
  });
});

/**
 * The state most of a faction's settlements inside this region are in.
 *
 * Real FIPS codes off the loaded settlements, so this is a statement about the shipped
 * polygons rather than about the test.
 */
function dominantState(region: FactionRegion): string | null {
  const counts = new Map<string, number>();
  for (const s of region.settlements) {
    if (s.stateCode === null) continue;
    counts.set(s.stateCode, (counts.get(s.stateCode) ?? 0) + 1);
  }
  let top: string | null = null;
  let topCount = 0;
  for (const [code, count] of counts) {
    if (count > topCount) {
      top = code;
      topCount = count;
    }
  }
  return top;
}

/**
 * State name to FIPS code, from the settlements themselves.
 *
 * `settlements.json` carries both on every row, so this join needs no table of its own
 * and cannot disagree with the data it is joined against.
 */
function stateNameByCode(): Map<string, string> {
  const byCode = new Map<string, string>();
  for (const s of world.settlements) {
    if (s.state === null || s.stateCode === null) continue;
    byCode.set(s.stateCode, s.state);
  }
  return byCode;
}

describe("choosing a faction loads that faction's own ground", () => {
  it("gives each side a different set of settlements, cut from the shipped hull", () => {
    const held = new Map<string, FactionRegion>(
      PLAYABLE_SIDE_IDS.map((sideId) => [sideId, factionRegionFor(sideId, world)!]),
    );

    // The headline claim: this is a mapping, not a constant. Two sides that hold
    // different ground must produce different regions.
    const southern = held.get("southern-compact")!;
    const lakes = held.get("great-lakes-union")!;
    const corridor = held.get("atlantic-corridor")!;
    expect(southern.settlements.length).toBeGreaterThan(0);
    expect(lakes.settlements.length).toBeGreaterThan(0);
    expect(corridor.settlements.length).toBeGreaterThan(0);
    expect(lakes.settlements.length).not.toBe(southern.settlements.length);

    const southernIds = new Set(southern.settlements.map((s) => s.id));
    // Every held settlement is a real one the region loaded, and the three factions that
    // reach this region are dominated by three different states: Kentucky for the
    // Southern Compact, West Virginia for the Atlantic Corridor, Ohio for the Great
    // Lakes Union. A hull read with its coordinates transposed, or joined on the wrong
    // id, does not produce that.
    expect(southern.settlements.every((s) => southernIds.has(s.id))).toBe(true);
    expect(dominantState(southern)).toBe("KY");
    expect(dominantState(corridor)).toBe("WV");
    expect(dominantState(lakes)).toBe("OH");
  });

  it("only counts settlements that are inside the hull and inside the loaded region", () => {
    const { south, west, north, east } = world.region.bbox;
    for (const sideId of PLAYABLE_SIDE_IDS) {
      const region = factionRegionFor(sideId, world)!;
      for (const s of region.settlements) {
        expect(pointInTerritory(s.lon, s.lat, region.territory), `${sideId}: ${s.name}`).toBe(true);
        expect(s.lat, `${sideId}: ${s.name} north of region`).toBeLessThanOrEqual(north);
        expect(s.lat, `${sideId}: ${s.name} south of region`).toBeGreaterThanOrEqual(south);
        expect(s.lon, `${sideId}: ${s.name} east of region`).toBeLessThanOrEqual(east);
        expect(s.lon, `${sideId}: ${s.name} west of region`).toBeGreaterThanOrEqual(west);
      }
    }
  });

  it("reads the hull in the order the build script wrote it, lon then lat", () => {
    // A transposed pair is the silent failure: the Pacific Compact's hull would land in
    // the Gulf of Mexico and the client would report, confidently, that the faction
    // holds nothing anywhere. Assert against the shipped geometry, both orders.
    const shipped = shippedTerritories();
    for (const t of world.territories) {
      const onDisk = shipped.territories.find((o) => o.faction === t.faction)!;
      expect(t.polygon).toEqual(onDisk.polygon);
      // Convex hulls only span real degrees. A swap would put the country in the sea.
      const lons = t.polygon.map((p) => p[0]);
      const lats = t.polygon.map((p) => p[1]);
      expect(Math.max(...lons)).toBeLessThan(0);
      expect(Math.max(...lats)).toBeLessThan(72);
      expect(Math.min(...lats)).toBeGreaterThan(17);
    }
  });

  it("hands each faction the states FACTIONS.md says it holds", () => {
    // The one assertion here that is not expressed in the same lat/lon frame as the
    // implementation, which is what makes it able to catch a hull read transposed: the
    // polygon says where, and `SIDE_DEFINITIONS.memberStates` says which states the
    // design says that is. Read with the coordinate pair swapped, the Great Lakes Union
    // stops holding Ohio and starts holding somewhere in the Gulf, and this fails.
    const names = stateNameByCode();
    let checked = 0;
    for (const sideId of PLAYABLE_SIDE_IDS) {
      const region = factionRegionFor(sideId, world)!;
      const code = dominantState(region);
      if (code === null) continue;
      const def = SIDE_DEFINITIONS.find((d) => d.id === sideId);
      expect(def, `${sideId} has no side definition`).toBeDefined();
      expect(
        def!.memberStates,
        `${sideId} holds mostly ${code}, which FACTIONS.md does not list as its own`,
      ).toContain(names.get(code));
      checked += 1;
    }
    // Three of the six reach this region, and all three were checked. If a future
    // deployment changes that, this number has to move with it.
    expect(checked).toBe(3);
  });

  it("opens on the faction's biggest holding inside this region", () => {
    // The territories are national and the region is five states, so a faction's own
    // capital is usually elsewhere: Chicago is the Great Lakes Union's and is not in the
    // Ohio River Valley. The anchor is then the biggest settlement it does hold here,
    // which is a stated fact about the data rather than a substituted capital.
    const lakes = factionRegionFor("great-lakes-union", world)!;
    expect(lakes.territory.capital.name).toBe("Chicago city");
    expect(lakes.anchor).not.toBeNull();
    expect(lakes.anchor!.role).toBe("largest-member");
    expect(lakes.anchor!.name).toBe(lakes.settlements[0]!.name);
    expect(lakes.anchor!.name).toBe("Columbus");
    expect(lakes.anchor!.population).toBe(lakes.settlements[0]!.population);

    const southern = factionRegionFor("southern-compact", world)!;
    expect(southern.anchor!.name).toBe("Lexington-Fayette urban county");

    const corridor = factionRegionFor("atlantic-corridor", world)!;
    expect(corridor.anchor!.name).toBe("Charleston");

    // The anchor is always one of the settlements the region was credited with, and
    // always inside the hull.
    for (const sideId of PLAYABLE_SIDE_IDS) {
      const region = factionRegionFor(sideId, world)!;
      if (!region.anchor) continue;
      const match = region.settlements.find((s) => s.id === region.anchor!.settlementId);
      expect(match, `${sideId} anchor is not one of its settlements`).toBeDefined();
      expect(pointInTerritory(region.anchor!.lon, region.anchor!.lat, region.territory)).toBe(true);
    }
  });

  it("reports the three factions this region cannot show rather than inventing ground", () => {
    // Three of the six hulls are national and do not reach the Ohio River Valley at
    // all. The answer is an empty region, which the caller reads as "frame the whole
    // map" — not a centroid off the edge of the loaded world.
    for (const sideId of ["pacific-compact", "mountain-alliance", "lone-star-frontier"] as const) {
      const region = factionRegionFor(sideId, world)!;
      expect(region.settlements.length, sideId).toBe(0);
      expect(region.bbox, sideId).toBeNull();
      expect(region.anchor, sideId).toBeNull();
    }
  });
});

describe("opening a campaign on the chosen faction", () => {
  const OPTIONS = {
    regionRadius: 34_000,
    minRadius: 7_500,
    isAnchorPlayable: () => true,
  };

  it("opens each faction on its own ground, not on one shared town", () => {
    const projection = makeProjection(world.region, world.heightfield);
    const openings = PLAYABLE_SIDE_IDS.map((sideId) =>
      campaignOpening(factionRegionFor(sideId, world), projection, OPTIONS),
    );
    // Three of the six reach this region, so three openings have an anchor, and they are
    // three different towns in three different states. In `PLAYABLE_SIDE_IDS` order.
    const anchored = openings.filter((o) => o.anchor !== null);
    expect(anchored).toHaveLength(3);
    expect(anchored.map((o) => o.anchor!.name)).toEqual([
      "Columbus", // great-lakes-union, Ohio
      "Lexington-Fayette urban county", // southern-compact, Kentucky
      "Charleston", // atlantic-corridor, West Virginia
    ]);
    expect(anchored.map((o) => o.anchor!.settlementId)).toEqual(["39-18000", "21-46027", "54-14600"]);  });

  it("falls back to the whole region when no faction ground is in this region", () => {
    const projection = makeProjection(world.region, world.heightfield);
    // A faction whose hull does not reach the loaded region.
    for (const sideId of ["pacific-compact", "mountain-alliance", "lone-star-frontier"] as const) {
      const opening = campaignOpening(factionRegionFor(sideId, world), projection, OPTIONS);
      expect(opening.anchor, sideId).toBeNull();
      expect(opening.radius, sideId).toBe(OPTIONS.regionRadius);
    }
    // No side chosen at all: the Wanderer start, or the boot skeleton's own button.
    expect(campaignOpening(null, projection, OPTIONS)).toEqual({
      anchor: null,
      radius: OPTIONS.regionRadius,
    });
  });

  it("falls back to the whole region when the simulation is not running that town", () => {
    const projection = makeProjection(world.region, world.heightfield);
    const lakes = factionRegionFor("great-lakes-union", world)!;
    expect(lakes.anchor).not.toBeNull();
    const opening = campaignOpening(lakes, projection, {
      ...OPTIONS,
      isAnchorPlayable: () => false,
    });
    // The client can place Columbus but has no town state for it, so selecting it would
    // open the "no simulation record" sheet. The camera still frames the region.
    expect(opening.anchor).toBeNull();
    expect(opening.radius).toBe(OPTIONS.regionRadius);
  });

  it("frames the faction's own extent when it can open there", () => {
    const projection = makeProjection(world.region, world.heightfield);
    const lakes = campaignOpening(factionRegionFor("great-lakes-union", world), projection, OPTIONS);
    const corridor = campaignOpening(factionRegionFor("atlantic-corridor", world), projection, OPTIONS);
    expect(lakes.anchor!.name).toBe("Columbus");
    expect(corridor.anchor!.name).toBe("Charleston");
    // Both inside the whole-region frame, and the larger holding gets the wider frame.
    expect(lakes.radius).toBeLessThanOrEqual(OPTIONS.regionRadius);
    expect(corridor.radius).toBeLessThanOrEqual(OPTIONS.regionRadius);
    expect(lakes.radius).toBeGreaterThan(corridor.radius);
  });
});

describe("framing the camera on the faction's ground", () => {
  const REGION_RADIUS = 34_000;
  const TOWN_RADIUS = 7_500;

  it("frames a faction that holds part of the region tighter than the whole region", () => {
    const projection = makeProjection(world.region, world.heightfield);
    const corridor = factionRegionFor("atlantic-corridor", world)!;
    const radius = factionFocusRadius(corridor, projection, REGION_RADIUS, TOWN_RADIUS)!;
    expect(radius).not.toBeNull();
    expect(radius).toBeGreaterThanOrEqual(TOWN_RADIUS);
    expect(radius).toBeLessThan(REGION_RADIUS);
  });

  it("never frames wider than the whole region, however much of it a faction holds", () => {
    const projection = makeProjection(world.region, world.heightfield);
    const lakes = factionRegionFor("great-lakes-union", world)!;
    // The Great Lakes Union holds 419 of the region's 487 settlements, so its frame is
    // region-scale: a campaign as wide as the map rather than a close-up on Columbus.
    const radius = factionFocusRadius(lakes, projection, REGION_RADIUS, TOWN_RADIUS)!;
    expect(radius).toBeLessThanOrEqual(REGION_RADIUS);
    expect(radius).toBeGreaterThan(TOWN_RADIUS * 3);

    // Every faction the region can show stays inside the whole-region frame.
    for (const sideId of PLAYABLE_SIDE_IDS) {
      const r = factionFocusRadius(
        factionRegionFor(sideId, world)!,
        projection,
        REGION_RADIUS,
        TOWN_RADIUS,
      );
      if (r === null) continue;
      expect(r, sideId).toBeGreaterThanOrEqual(TOWN_RADIUS);
      expect(r, sideId).toBeLessThanOrEqual(REGION_RADIUS);
    }
  });

  it("clamps a frame to the region a faction lives on", () => {
    // Synthetic, because the shipped territories cannot produce this: a faction's bbox
    // is measured from settlements inside the loaded region, so its span is always
    // smaller than the region's. The clamp is what holds if that ever stops being true —
    // a territory file whose polygon reaches past the region — so it is exercised here
    // rather than left untested.
    const projection = makeProjection(world.region, world.heightfield);
    const lakes = factionRegionFor("great-lakes-union", world)!;
    const wider: FactionRegion = {
      ...lakes,
      bbox: { south: 20, west: -130, north: 50, east: -60 },
    };
    expect(factionFocusRadius(wider, projection, REGION_RADIUS, TOWN_RADIUS)).toBe(REGION_RADIUS);

    // And the floor: one settlement cannot be framed from further away than a town.
    const single: FactionRegion = {
      ...lakes,
      bbox: lakes.bbox
        ? { south: lakes.bbox.south, west: lakes.bbox.west, north: lakes.bbox.south, east: lakes.bbox.west }
        : null,
      settlements: lakes.settlements.slice(0, 1),
    };
    expect(factionFocusRadius(single, projection, REGION_RADIUS, TOWN_RADIUS)).toBeNull();
  });

  it("has no radius for a faction this region cannot show", () => {
    const projection = makeProjection(world.region, world.heightfield);
    for (const sideId of ["pacific-compact", "mountain-alliance", "lone-star-frontier"] as const) {
      expect(
        factionFocusRadius(factionRegionFor(sideId, world)!, projection, REGION_RADIUS, TOWN_RADIUS),
        sideId,
      ).toBeNull();
    }
  });

  it("grows with the ground a faction holds", () => {
    const projection = makeProjection(world.region, world.heightfield);
    const southern = factionRegionFor("southern-compact", world)!;
    const corridor = factionRegionFor("atlantic-corridor", world)!;
    const southernRadius = factionFocusRadius(southern, projection, REGION_RADIUS, TOWN_RADIUS)!;
    const corridorRadius = factionFocusRadius(corridor, projection, REGION_RADIUS, TOWN_RADIUS)!;
    // Southern Compact spans 318x222 km of this region, Atlantic Corridor 109x271 km.
    expect(southernRadius).toBeGreaterThan(corridorRadius);
  });
});
