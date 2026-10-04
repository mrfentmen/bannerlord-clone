/**
 * Loading and decoding the real world files.
 *
 * `CONSTITUTION.md` section 1.3: every external call is treated as untrusted and
 * every failure path is handled loudly. A missing tile, a corrupt PNG, or a
 * settlement with no real population all produce something the UI can render and
 * explain, never a silent fallback to a plausible-looking number.
 */

import type {
  BoundariesFile,
  FactionTerritoriesFile,
  Heightfield,
  NetworkFile,
  PlaceBoundary,
  RegionFile,
  RoadClass,
  RoadWay,
  SettlementsFile,
  SettlementIndex,
  WorldData,
  WorldPoint,
  WorldSettlement,
} from "./types.js";
import { metresPerDegreeLat, metresPerDegreeLon, type Projection } from "./types.js";
import { terrainBands, tokens, type TownClassName } from "../design/tokens.js";
import { BUILD_HASH } from "../buildHash.js";

/** An error the UI can show a player, with a way to recover (CONSTITUTION.md §1.3). */
export class WorldDataError extends Error {
  readonly kind: "network" | "decode" | "missing" | "empty";
  /** Plain sentence for the player, written in the product's voice (3.3). */
  readonly playerMessage: string;
  readonly developerDetail: string;
  readonly retryable: boolean;

  constructor(
    kind: WorldDataError["kind"],
    playerMessage: string,
    developerDetail: string,
    retryable = true,
  ) {
    super(developerDetail);
    this.name = "WorldDataError";
    this.kind = kind;
    this.playerMessage = playerMessage;
    this.developerDetail = developerDetail;
    this.retryable = retryable;
  }
}

/**
 * The highest `wire_version` this client knows how to read.
 *
 * Bumped when `src/world/types.ts` changes shape - a field renamed, a nesting level
 * added - so a redeploy of newer world data is refused rather than half-read. It is the
 * client-side twin of `CACHE_FORMAT_VERSION` in `services/world-data`, which guards the
 * same thing for the pipeline's own stage cache: both exist because the failure they
 * prevent is silent. A stale route cache or an unrecognised wire revision does not
 * throw; it produces a map with pieces quietly missing.
 *
 * Currently 2, the version the shipped Ohio River Valley files carry.
 */
export const SUPPORTED_WIRE_VERSION = 2;

/**
 * Add the build hash to a world-data URL so the browser's HTTP cache cannot serve a
 * file from a previous deployment.
 *
 * The world files are static and keep their names across redeploys, so nothing about
 * the request changes when their contents do. Without this, a player who loaded the
 * map once and came back after a new deployment could get yesterday's `region.json`
 * out of the cache inside today's bundle - and the failure is invisible, because the
 * JSON is still perfectly valid, it just describes the wrong region. That is the
 * failure `loadRegion.test.ts` was written for, arriving through the cache instead of
 * through a stale file on disk.
 *
 * Keyed on the build hash rather than the clock so the 154 boot tiles and the four
 * wire files are still cached for the length of a session - a reload does not refetch
 * 8 MB of terrain - and are refetched exactly once per deployment.
 *
 * The hash is a query parameter, not a path segment: these files are served from
 * `public/world/`, and a path that does not exist would 404 rather than serve the file.
 */
export function cacheBust(url: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}b=${encodeURIComponent(BUILD_HASH)}`;
}

/**
 * Refuse a wire file whose `wire_version` this client does not know.
 *
 * Only files that carry the stamp are checked. `region.json` and `boundaries.json` ship
 * without one today, and a stamp that is absent is an honest "this file is unversioned",
 * not a claim to be validated.
 *
 * A stamp from the future is the dangerous direction and is refused: the client cannot
 * know which fields were renamed, so it cannot read the file, and reading it anyway
 * yields a map missing whatever changed. An older stamp is refused too, for the
 * opposite reason - the deploy tool carries this field forward across redeploys
 * specifically so it does not silently regress, so an older number on disk means a file
 * was replaced by something that bypassed that.
 *
 * CONSTITUTION.md section 1.3: loud, with a way to recover, never a silent fallback.
 */
function validateWireVersion(name: string, file: { wire_version?: number }): void {
  const stamp = file.wire_version;
  if (stamp === undefined) return;
  if (stamp === SUPPORTED_WIRE_VERSION) return;
  throw new WorldDataError(
    "decode",
    `The world survey data is a different version than this game understands, so the map cannot be drawn. Update the game, or re-fetch the world data.`,
    `${name}.json carries wire_version ${stamp}; this client reads up to ${SUPPORTED_WIRE_VERSION}. ` +
      `Deploy with services/world-data/tools/deploy-wire-to-client.py so the version is carried forward, ` +
      `or bump SUPPORTED_WIRE_VERSION in src/world/load.ts if this client really does read it.`,
    false,
  );
}

async function getJson<T>(url: string, what: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(cacheBust(url));
  } catch (err) {
    // A network-level failure. Thrown by fetch before any status code exists.
    throw new WorldDataError(
      "network",
      `The world survey could not be reached. Check the connection and try again.`,
      `fetch(${url}) threw for ${what}: ${String(err)}`,
    );
  }
  if (!response.ok) {
    throw new WorldDataError(
      response.status === 404 ? "missing" : "network",
      response.status === 404
        ? `The world survey is missing the ${what} file. It has not been fetched yet.`
        : `The world survey returned an error loading the ${what} file.`,
      `GET ${url} -> HTTP ${response.status} ${response.statusText}`,
    );
  }
  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new WorldDataError(
      "decode",
      `The world survey file for ${what} is damaged. Fetch the world data again.`,
      `JSON.parse of ${url} threw: ${String(err)}`,
    );
  }
}

/**
 * Fetch a file the client can do without.
 *
 * Returns `null` for a 404 and throws for everything else. The distinction is the point:
 * `boundaries.json` is a separate wire build that a region may legitimately predate, and
 * a client that treated its absence as a failure could not load the region at all. A 500,
 * a truncated response or unparseable bytes is a different thing — the file was meant to be
 * there and is not readable — and CONSTITUTION.md section 1.3 says that has to be loud.
 */
async function getOptionalJson<T>(url: string, what: string): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(cacheBust(url));
  } catch (err) {
    throw new WorldDataError(
      "network",
      `The world survey could not be reached. Check the connection and try again.`,
      `fetch(${url}) threw for ${what}: ${String(err)}`,
    );
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new WorldDataError(
      "network",
      `The world survey returned an error loading the ${what} file.`,
      `GET ${url} -> HTTP ${response.status} ${response.statusText}`,
    );
  }
  try {
    return (await response.json()) as T;
  } catch (err) {
    throw new WorldDataError(
      "decode",
      `The ${what} file is damaged. Fetch the world data again.`,
      `JSON.parse of ${url} threw: ${String(err)}`,
    );
  }
}

/**
 * Decode terrarium tiles into one heightfield in metres.
 *
 * Terrarium packs elevation as `R * 256 + G + B / 256 - 32768`. Verified against
 * hand-decoded pixel values in `__tests__/elevation.test.ts`.
 *
 * Returns metres north-row-first, which matches how a row of image data reads. The
 * mesh builder flips Y when it turns that into geometry.
 */
export async function loadHeightfield(
  region: RegionFile,
  baseUrl: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Heightfield> {
  const { zoom, tileSize, tiles } = region.elevation;
  if (tiles.length === 0) {
    throw new WorldDataError(
      "empty",
      "The world survey has no elevation tiles listed. Fetch the world data again.",
      "region.json listed zero elevation tiles",
      false,
    );
  }

  const cols = Math.max(...tiles.map((t) => t.x)) - Math.min(...tiles.map((t) => t.x)) + 1;
  const rows = Math.max(...tiles.map((t) => t.y)) - Math.min(...tiles.map((t) => t.y)) + 1;
  const width = cols * tileSize;
  const height = rows * tileSize;
  const metres = new Float32Array(width * height);

  const minX = Math.min(...tiles.map((t) => t.x));
  const minY = Math.min(...tiles.map((t) => t.y));

  const canvas = document.createElement("canvas");
  canvas.width = tileSize;
  canvas.height = tileSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new WorldDataError(
      "decode",
      "This browser would not give the map a drawing surface to read terrain with.",
      "canvas.getContext('2d') returned null",
      false,
    );
  }

  let loaded = 0;
  for (const tile of tiles) {
    const url = cacheBust(new URL(tile.path, new URL(baseUrl, location.href)).href);
    let bitmap: ImageBitmap;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bitmap = await createImageBitmap(await response.blob());
    } catch (err) {
      throw new WorldDataError(
        "network",
        `Part of the terrain survey is missing, so the map cannot be drawn. Try again.`,
        `elevation tile ${tile.z}/${tile.x}/${tile.y} from ${url} failed: ${String(err)}`,
      );
    }

    ctx.clearRect(0, 0, tileSize, tileSize);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, tileSize, tileSize);

    const ox = (tile.x - minX) * tileSize;
    const oy = (tile.y - minY) * tileSize;
    for (let py = 0; py < tileSize; py += 1) {
      const src = py * tileSize * 4;
      const dst = (oy + py) * width + ox;
      for (let px = 0; px < tileSize; px += 1) {
        const i = src + px * 4;
        metres[dst + px] = data[i]! * 256 + data[i + 1]! + data[i + 2]! / 256 - 32768;
      }
    }

    loaded += 1;
    onProgress?.(loaded, tiles.length);
  }

  // One tile spans 360 / 2^zoom degrees of longitude. At zoom 12 that is about 30 m
  // per pixel at this latitude; computed rather than assumed.
  const metresPerPixelX =
    (metresPerDegreeLon((region.bbox.north + region.bbox.south) / 2) * 360) / (Math.PI * 2 ** zoom * tileSize);
  const metresPerPixelY = (metresPerDegreeLat() * 360) / (Math.PI * 2 ** zoom * tileSize);

  return {
    width,
    height,
    metres,
    resolutionMetres: (metresPerPixelX + metresPerPixelY) / 2,
    bounds: { ...region.bbox },
  };
}


/**
 * Build a local metric projection centred on the region.
 *
 * Equirectangular with a single scale factor taken at the region's centre
 * latitude. Over 68 km of longitude the error against a proper projection is well
 * under a metre, and it keeps the maths in one place instead of scattered through
 * every component.
 */
export function makeProjection(region: RegionFile, hf: Heightfield): Projection {
  const { south, west, north, east } = region.bbox;
  const originLat = south;
  const originLon = west;
  const widthMetres = metresPerDegreeLon(originLat) * (east - west);
  const depthMetres = metresPerDegreeLat() * (north - south);

  const toWorld = (lat: number, lon: number): WorldPoint => ({
    x: metresPerDegreeLon(originLat) * (lon - originLon),
    y: 0,
    z: metresPerDegreeLat() * (lat - originLat),
  });

  const toLatLon = (x: number, z: number) => ({
    lat: originLat + z / metresPerDegreeLat(),
    lon: originLon + x / metresPerDegreeLon(originLat),
  });

  const heightAt = (x: number, z: number): number => {
    const u = (x / widthMetres) * (hf.width - 1);
    const v = (z / depthMetres) * (hf.height - 1);
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    if (x0 < 0 || z0 < 0 || x0 >= hf.width - 1 || z0 >= hf.height - 1) return 0;
    const fx = u - x0;
    const fz = v - z0;
    const m = hf.metres;
    const a = m[z0 * hf.width + x0]!;
    const b = m[z0 * hf.width + x0 + 1]!;
    const c = m[(z0 + 1) * hf.width + x0]!;
    const d = m[(z0 + 1) * hf.width + x0 + 1]!;
    return a * (1 - fx) * (1 - fz) + b * fx * (1 - fz) + c * (1 - fx) * fz + d * fx * fz;
  };

  return { toWorld, toLatLon, heightAt, width: widthMetres, depth: depthMetres, originLat, originLon };
}

/**
 * Classify a settlement by real population (PHASES.md Phase 0, TASKS.md
 * "Write classification logic from real population thresholds").
 *
 * A place with no real population figure gets `village` and a flag, never a
 * guessed population. Eleven places in the V1 region land here.
 */
/** Build the settlement lookup described in `SettlementIndex`. */
export function indexSettlements(settlements: WorldSettlement[]): SettlementIndex {
  const byId = new Map<string, WorldSettlement>();
  const byName = new Map<string, WorldSettlement>();
  for (const s of settlements) {
    byId.set(s.id, s);
    byName.set(s.name, s);
    byName.set(s.name.toLowerCase(), s);
  }
  return {
    byId,
    byName,
    resolve(input) {
      return byId.get(input) ?? byName.get(input) ?? byName.get(input.toLowerCase());
    },
    all: () => settlements,
  };
}

export function classifySettlement(settlement: WorldSettlement): {
  klass: TownClassName;
  /** True when the class came from a real population figure rather than the default. */
  fromRealData: boolean;
} {
  if (settlement.population === null) {
    return { klass: "village", fromRealData: false };
  }
  if (settlement.population >= tokens.townClass.city.minPopulation) return { klass: "city", fromRealData: true };
  if (settlement.population >= tokens.townClass.town.minPopulation) return { klass: "town", fromRealData: true };
  return { klass: "village", fromRealData: true };
}

/** Hypsometric band name for an elevation, used by the terrain legend. */
export function bandFor(elevationMetres: number): (typeof terrainBands)[number] {
  for (const band of terrainBands) {
    if (elevationMetres < band.upTo) return band;
  }
  return terrainBands[terrainBands.length - 1]!;
}

/**
 * Turn the wire's boundary outlines into world-space polygons.
 *
 * Every check that matters happens here rather than at the point of drawing, because a
 * tessellator handed a ring with a `NaN` in it produces an empty mesh and no message, and
 * a mesh that is missing a town's outline looks exactly like a town that has none.
 *
 * Three things are refused outright rather than skipped:
 *
 *  - a boundary naming a settlement that `settlements.json` does not carry. That is what a
 *    half-completed region change looks like: the two files deployed from different
 *    regions, each internally valid, which is exactly the failure this whole loader exists
 *    to make loud.
 *  - a ring that is not closed. An unclosed ring is a corrupt read, and drawing it leaves a
 *    gap the client cannot explain.
 *  - a ring with fewer than four points, which cannot enclose any area.
 *
 * A multipolygon place keeps all its polygons. Taking only the largest would silently
 * delete real land — Columbus is 29 polygons, and 26 of them are the slivers
 * `to_multipolygon` kept rather than discard.
 */
export function projectBoundaries(
  file: BoundariesFile,
  settlements: WorldSettlement[],
  projection: Projection,
): PlaceBoundary[] {
  if (!Array.isArray(file.boundaries)) {
    throw new WorldDataError(
      "decode",
      "The settlement outlines in the world survey are damaged.",
      "boundaries.json has no boundaries array",
      false,
    );
  }
  const known = new Set(settlements.map((s) => s.id));
  const byId = new Map(settlements.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const out: PlaceBoundary[] = [];

  for (const entry of file.boundaries) {
    if (typeof entry?.placeKey !== "string" || !known.has(entry.placeKey)) {
      throw new WorldDataError(
        "decode",
        "The world survey's town outlines and its town list disagree, so the map cannot be drawn.",
        `boundaries.json names place key ${JSON.stringify(entry?.placeKey)}, which is not among the ` +
          `${known.size} settlements in settlements.json`,
        false,
      );
    }
    if (seen.has(entry.placeKey)) {
      throw new WorldDataError(
        "decode",
        "The world survey lists the same town outline twice.",
        `boundaries.json has two entries for place key ${entry.placeKey}`,
        false,
      );
    }
    seen.add(entry.placeKey);

    const centroid = entry.centroid;
    if (
      !centroid ||
      !Number.isFinite(centroid.lat) ||
      !Number.isFinite(centroid.lon)
    ) {
      throw new WorldDataError(
        "decode",
        `${entry.name || entry.placeKey} has no usable position in the survey.`,
        `boundaries.json ${entry.placeKey} centroid is ${JSON.stringify(centroid)}`,
        false,
      );
    }
    if (!Array.isArray(entry.polygons) || entry.polygons.length === 0) {
      throw new WorldDataError(
        "decode",
        `${entry.name || entry.placeKey} has no outline in the survey.`,
        `boundaries.json ${entry.placeKey} has ${Array.isArray(entry.polygons) ? 0 : "no"} polygons`,
        false,
      );
    }

    const polygons: WorldPoint[][][] = [];
    let vertexCount = 0;
    for (const polygon of entry.polygons) {
      if (!Array.isArray(polygon) || polygon.length === 0) {
        throw new WorldDataError(
          "decode",
          `${entry.name || entry.placeKey} has an outline with no shape in it.`,
          `boundaries.json ${entry.placeKey} has an empty polygon`,
          false,
        );
      }
      const rings: WorldPoint[][] = [];
      for (const ring of polygon) {
        if (!Array.isArray(ring) || ring.length < 4) {
          throw new WorldDataError(
            "decode",
            `Part of ${entry.name || entry.placeKey}'s outline is too short to be a shape.`,
            `boundaries.json ${entry.placeKey} has a ring of ` +
              `${Array.isArray(ring) ? ring.length : "no"} points`,
            false,
          );
        }
        const points: WorldPoint[] = [];
        for (const point of ring) {
          if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
            throw new WorldDataError(
              "decode",
              `Part of ${entry.name || entry.placeKey}'s outline has no usable position.`,
              `boundaries.json ${entry.placeKey} has a malformed point ${JSON.stringify(point)}`,
              false,
            );
          }
          points.push(projection.toWorld(point[0], point[1]));
        }
        const first = points[0]!;
        const last = points[points.length - 1]!;
        if (first.x !== last.x || first.z !== last.z) {
          throw new WorldDataError(
            "decode",
            `Part of ${entry.name || entry.placeKey}'s outline does not close.`,
            `boundaries.json ${entry.placeKey} has a ring ending at ` +
              `[${last.x.toFixed(3)}, ${last.z.toFixed(3)}] that starts at ` +
              `[${first.x.toFixed(3)}, ${first.z.toFixed(3)}]`,
            false,
          );
        }
        rings.push(points);
        vertexCount += points.length;
      }
      polygons.push(rings);
    }

    const settlement = byId.get(entry.placeKey)!;
    out.push({
      settlementId: entry.placeKey,
      name: typeof entry.name === "string" && entry.name ? entry.name : settlement.name,
      displayName:
        typeof entry.displayName === "string" && entry.displayName
          ? entry.displayName
          : settlement.name,
      sizeClass: typeof entry.sizeClass === "string" ? entry.sizeClass : null,
      lsadCode: typeof entry.lsadCode === "string" ? entry.lsadCode : null,
      landAreaKm2: Number.isFinite(entry.landAreaKm2) ? entry.landAreaKm2 : null,
      centroid: projection.toWorld(centroid.lat, centroid.lon),
      polygonCount: polygons.length,
      vertexCount,
      polygons,
    });
  }

  return out;
}

/**
 * Settlements in the region that carry no outline.
 *
 * Reported rather than hidden. A settlement with no boundary is a real gap in the survey,
 * and the honest presentation is the count and the names, not a circle drawn where the
 * outline should be.
 */
export function settlementsWithoutBoundaries(
  settlements: WorldSettlement[],
  boundaries: PlaceBoundary[],
): WorldSettlement[] {
  const covered = new Set(boundaries.map((b) => b.settlementId));
  return settlements.filter((s) => !covered.has(s.id));
}

function toRoadClass(highway: string): RoadClass | null {
  if (highway === "motorway" || highway === "trunk" || highway === "primary" || highway === "secondary") {
    return highway;
  }
  return null;
}

/**
 * Check a territory file the client is about to make a gameplay decision from.
 *
 * A territory carries a hull and a capital, and `factionRegion.ts` picks the anchor
 * town and frames the camera on it. A hull with a transposed coordinate pair, or a
 * capital outside the country, would not fail — it would quietly open the campaign on
 * the wrong town — so the shape is checked here where the failure can still be loud.
 */
function validateTerritories(file: FactionTerritoriesFile): void {
  if (!Array.isArray(file.territories)) {
    throw new WorldDataError(
      "decode",
      "The faction territory survey is damaged.",
      "territories.json has no territories array",
      false,
    );
  }
  for (const t of file.territories) {
    const where = `territories.json entry ${t.faction ?? "<unnamed>"}`;
    if (
      typeof t.faction !== "string" ||
      typeof t.label !== "string" ||
      !Array.isArray(t.polygon) ||
      t.polygon.length < 3
    ) {
      throw new WorldDataError(
        "decode",
        "A faction territory in the survey has no usable shape, so it cannot be shown on the map.",
        `${where} is malformed: ${JSON.stringify(t).slice(0, 200)}`,
        false,
      );
    }
    for (const [lon, lat] of t.polygon) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new WorldDataError(
          "decode",
          `The boundary of ${t.label} is damaged, so it cannot be shown on the map.`,
          `${where} has a non-finite hull vertex`,
          false,
        );
      }
    }
    if (!Number.isFinite(t.capital?.lat) || !Number.isFinite(t.capital?.lon)) {
      throw new WorldDataError(
        "decode",
        `The capital of ${t.label} has no usable position.`,
        `${where} capital is ${JSON.stringify(t.capital)}`,
        false,
      );
    }
  }
}

export interface LoadOptions {
  baseUrl: string;
  onStage?: (stage: string, loaded: number, total: number) => void;
}

/** Load the whole real world. Throws `WorldDataError` on any failure, never degrades. */
export async function loadWorldData(options: LoadOptions): Promise<WorldData> {
  const { baseUrl, onStage } = options;
  // A trailing slash matters: `new URL("/world", origin).href` has none, so
  // `${root}region.json` would resolve to "/worldregion.json".
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const root = new URL(base, location.href).href;

  onStage?.("survey", 0, 5);
  const [region, settlementFile, network, boundaryFile, territoryFile] = await Promise.all([
    // `getJson` and `getOptionalJson` add the cache-busting build hash themselves, so
    // every world URL in this module goes through exactly one code path for it.
    getJson<RegionFile>(`${root}region.json`, "region"),
    getJson<SettlementsFile>(`${root}settlements.json`, "settlements"),
    getJson<NetworkFile>(`${root}network.json`, "road network"),
    // Optional, so a 404 resolves to null rather than failing the whole load. See
    // `getOptionalJson`.
    getOptionalJson<BoundariesFile>(`${root}boundaries.json`, "town outlines"),
    // The per-faction region wire file. Optional for the same reason: a region that
    // predates the territory build loads and opens on the whole region rather than
    // refusing to start. It is what `factionRegion.ts` reads to answer "which part of
    // this map does the chosen faction hold".
    getOptionalJson<FactionTerritoriesFile>(`${root}territories.json`, "faction territories"),
  ]);

  // Format first, then shape: a file from a newer wire revision may be shaped nothing
  // like what the validators below expect, and reporting "broken elevation format" for
  // a rename would send whoever is reading the log after the wrong problem entirely.
  validateWireVersion("region", region);
  validateWireVersion("settlements", settlementFile);
  validateWireVersion("network", network);
  if (boundaryFile) validateWireVersion("boundaries", boundaryFile);
  if (territoryFile) validateWireVersion("territories", territoryFile);

  validateRegion(region);
  validateSettlements(settlementFile);
  validateNetwork(network);
  if (territoryFile) validateTerritories(territoryFile);

  onStage?.("terrain", 0, region.elevation.tiles.length);
  const heightfield = await loadHeightfield(region, root, (loaded, total) =>
    onStage?.("terrain", loaded, total),
  );

  const settlements: WorldSettlement[] = settlementFile.settlements.map((s) => ({
    id: s.osmId.replace(/^node\//, ""),
    name: s.name,
    place: s.place,
    lat: s.lat,
    lon: s.lon,
    population: s.population,
    populationSource: s.populationSource,
    state: s.state,
    // A settlement with no OSM state tag takes the region's declared state, which the
    // region file states with its basis. Null when the region does not declare one.
    stateCode: s.stateCode ?? region.stateCoverage?.regionCode ?? null,
    osmPopulation: s.osmPopulation ?? null,
  }));

  // Drop ways with an unusable class rather than guessing one. The fetch script only
  // asks for the four classes it keeps, so this is a guard, not a filter.
  const roads: RoadWay[] = [];
  for (const way of network.roads) {
    const roadClass = toRoadClass(way.highway);
    if (!roadClass || way.coords.length < 2) continue;
    roads.push({
      id: way.osmId.replace(/^way\//, ""),
      roadClass,
      name: way.name,
      ref: way.ref,
      surface: way.surface,
      lanes: way.lanes,
      coords: way.coords,
    });
  }

  // Projected only once the projection exists, which needs the heightfield: the outlines
  // are rings in lat/lon and every point in them has to go through `toWorld`.
  const boundaries = boundaryFile
    ? projectBoundaries(boundaryFile, settlements, makeProjection(region, heightfield))
    : [];

  return {
    region,
    settlements,
    roads,
    rail: network.rail.map((r) => ({
      id: r.osmId.replace(/^way\//, ""),
      name: r.name,
      coords: r.coords,
    })),
    boundaries,
    territories: territoryFile ? territoryFile.territories : [],
    heightfield,
    provenance: {
      elevation: "aws-terrarium",
      network: "openstreetmap",
      population: "us-census",
      boundaries: "us-census",
    },
  };
}

function validateRegion(region: RegionFile): void {
  const { south, west, north, east } = region.bbox;
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) {
    throw new WorldDataError(
      "decode",
      "The world survey has a broken region boundary, so the map cannot be drawn.",
      `region.json bbox is not a valid box: ${JSON.stringify(region.bbox)}`,
      false,
    );
  }
  if (region.elevation.encoding !== "terrarium") {
    throw new WorldDataError(
      "decode",
      `The world survey uses an elevation format this client cannot read (${region.elevation.encoding}).`,
      `region.json elevation.encoding is ${region.elevation.encoding}, expected terrarium`,
      false,
    );
  }
}

function validateSettlements(file: SettlementsFile): void {
  if (!Array.isArray(file.settlements)) {
    throw new WorldDataError("decode", "The settlement survey is damaged.", "settlements.json has no settlements array", false);
  }
  for (const s of file.settlements) {
    if (typeof s.name !== "string" || !Number.isFinite(s.lat) || !Number.isFinite(s.lon)) {
      throw new WorldDataError(
        "decode",
        "A settlement in the survey has no usable position, so the map cannot place it.",
        `settlements.json entry is malformed: ${JSON.stringify(s).slice(0, 200)}`,
        false,
      );
    }
    if (s.population !== null && (!Number.isFinite(s.population) || s.population < 0)) {
      throw new WorldDataError(
        "decode",
        `${s.name} has an impossible population figure in the survey.`,
        `settlements.json ${s.name} population is ${s.population}`,
        false,
      );
    }
  }
}

function validateNetwork(file: NetworkFile): void {
  if (!Array.isArray(file.roads) || !Array.isArray(file.rail)) {
    throw new WorldDataError("decode", "The road survey is damaged.", "network.json is missing roads or rail", false);
  }
  for (const way of file.roads) {
    if (!Array.isArray(way.coords) || way.coords.length < 2) {
      throw new WorldDataError(
        "decode",
        "A road in the survey has no shape, so it cannot be drawn.",
        `network.json way ${way.osmId} has ${Array.isArray(way.coords) ? way.coords.length : "no"} coordinates`,
        false,
      );
    }
  }
}
