/**
 * Loading and decoding the real world files.
 *
 * `CONSTITUTION.md` section 1.3: every external call is treated as untrusted and
 * every failure path is handled loudly. A missing tile, a corrupt PNG, or a
 * settlement with no real population all produce something the UI can render and
 * explain, never a silent fallback to a plausible-looking number.
 *
 * ## Elevation tiles: a reversible prototype, not the final strategy
 *
 * `public/world/DATA-MANIFEST.md` section 5.0 leaves the elevation strategy open
 * (runtime AWS fetch vs. lower zoom vs. smaller bbox vs. progressive loading). This
 * module therefore supports two sources and neither is committed to:
 *
 * 1. The tile paths listed in `region.json`, resolved against the bundle root. This
 *    is what the boot path used before the Ohio wire format listed 2,236 tiles.
 * 2. A runtime tile service, when `elevationBaseUrl` is passed: tiles come from
 *    `${elevationBaseUrl}/{z}/{x}/{y}.png`, which is the AWS Open Data terrarium
 *    layout verbatim.
 *
 * In both cases a tile that will not load degrades that tile to flat ground and the
 * load continues, because a 250 MB tile list where one tile is absent should not
 * cost the player the map. The degradation is never silent: the count is returned
 * on the heightfield and logged once, so the UI can say "part of the terrain is
 * missing" rather than drawing plausible fake hills (CONSTITUTION.md 1.3).
 */

import type {
  Heightfield,
  NetworkFile,
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

async function getJson<T>(url: string, what: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
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
 * How many decoded elevation tiles are held in memory.
 *
 * A zoom-12 tile is 256 x 256 px, and an `ImageData` view of one is 256 KiB. The
 * Ohio tile list is 2,236 tiles, which is 572 MiB if every decoded tile is kept —
 * more than the tab should be asked to hold. The cache is a Map, so the first key
 * it yields is the oldest, and dropping it is a two-line least-recently-used
 * policy. Tiles in flight are stored as promises so a second request for the same
 * tile joins the first rather than issuing a second GET.
 */
const ELEVATION_TILE_CACHE_LIMIT = 512;

/** Decoded RGBA pixels by absolute tile URL. Module-level so it outlives one load. */
const elevationTileCache = new Map<string, Promise<Uint8ClampedArray>>();

/** Drop every cached tile. Tests use this; so would a "refetch terrain" action. */
export function clearElevationTileCache(): void {
  elevationTileCache.clear();
}

/** How many tiles are currently cached. Exposed for tests and boot diagnostics. */
export function elevationTileCacheSize(): number {
  return elevationTileCache.size;
}

function rememberTile(url: string, pixels: Promise<Uint8ClampedArray>): void {
  elevationTileCache.set(url, pixels);
  while (elevationTileCache.size > ELEVATION_TILE_CACHE_LIMIT) {
    const oldest = elevationTileCache.keys().next();
    if (oldest.done) return;
    elevationTileCache.delete(oldest.value);
  }
}

/** How many of a load's tiles failed are named in the log line before it is truncated. */
const FAILURES_NAMED_IN_LOG = 5;

/** What the loader did about elevation, for the UI and for the log. Never hidden. */
export interface ElevationReport {
  /** Tiles `region.json` listed. */
  listed: number;
  /** Tiles that decoded from real pixels. */
  decoded: number;
  /** Tiles that fell back to flat ground, zero metres. */
  flat: number;
  /** `z/x/y` of the first few failures, so the log is actionable. */
  firstFailures: string[];
}

export type LoadedHeightfield = Heightfield & { elevation: ElevationReport };

export interface HeightfieldOptions {
  /**
   * Fetch tiles from `${elevationBaseUrl}/{z}/{x}/{y}.png` instead of the paths
   * listed in `region.json`. Unset means the bundled tiles.
   */
  elevationBaseUrl?: string;
}

/** Where one tile comes from, as a browser-resolvable absolute URL. */
function tileUrl(
  tile: { z: number; x: number; y: number; path: string },
  root: string,
  elevationBaseUrl: string | undefined,
): string {
  if (elevationBaseUrl !== undefined) {
    const base = elevationBaseUrl.endsWith("/") ? elevationBaseUrl : `${elevationBaseUrl}/`;
    return new URL(`${base}${tile.z}/${tile.x}/${tile.y}.png`, location.href).href;
  }
  return new URL(tile.path, root).href;
}

/**
 * Fetch one tile and read back its raw pixels. Rejects on any failure so the caller
 * can decide what a failure means for the whole load.
 */
async function fetchTilePixels(
  url: string,
  tileSize: number,
  ctx: CanvasRenderingContext2D,
): Promise<Uint8ClampedArray> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const bitmap = await createImageBitmap(await response.blob());
  try {
    ctx.clearRect(0, 0, tileSize, tileSize);
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, tileSize, tileSize).data;
  } finally {
    bitmap.close();
  }
}

/**
 * One tile from cache, or from the network and then the cache.
 *
 * A rejected tile is evicted rather than cached, so a transient network failure is
 * retried on the next load instead of being frozen in as a permanent hole.
 */
async function tilePixels(
  url: string,
  tileSize: number,
  ctx: CanvasRenderingContext2D,
): Promise<Uint8ClampedArray> {
  const cached = elevationTileCache.get(url);
  if (cached !== undefined) return cached;
  const pending = fetchTilePixels(url, tileSize, ctx);
  rememberTile(url, pending);
  try {
    return await pending;
  } catch (err) {
    elevationTileCache.delete(url);
    throw err;
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
 *
 * A tile that cannot be fetched or decoded leaves its own pixels at zero and the
 * loop continues; see the file header for why that is reported rather than silent.
 */
export async function loadHeightfield(
  region: RegionFile,
  baseUrl: string,
  onProgress?: (loaded: number, total: number) => void,
  options: HeightfieldOptions = {},
): Promise<LoadedHeightfield> {
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
  let flat = 0;
  const firstFailures: string[] = [];
  for (const tile of tiles) {
    const url = tileUrl(tile, baseUrl, options.elevationBaseUrl);
    let data: Uint8ClampedArray;
    try {
      data = await tilePixels(url, tileSize, ctx);
    } catch (err) {
      // The Float32Array is zero-initialised, so leaving the tile alone is exactly
      // the flat fallback. Only the log and the count record that it happened.
      flat += 1;
      if (firstFailures.length < FAILURES_NAMED_IN_LOG) firstFailures.push(`${tile.z}/${tile.x}/${tile.y}`);
      console.warn(
        `elevation tile ${tile.z}/${tile.x}/${tile.y} unavailable from ${url} (${String(err)}); ` +
          `that tile is drawn flat.`,
      );
      loaded += 1;
      onProgress?.(loaded, tiles.length);
      continue;
    }

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

  // One summary line, whatever the count. CONSTITUTION.md 1.3 forbids a silent
  // fallback, and a per-tile line for 2,236 tiles is its own kind of unusable.
  if (flat > 0) {
    const named = firstFailures.join(", ");
    const more = flat > firstFailures.length ? ` and ${flat - firstFailures.length} more` : "";
    console.warn(
      `elevation: ${flat} of ${tiles.length} tiles fell back to flat ground (${named}${more}). ` +
        `The rest are real terrain. The tile service may be incomplete or unreachable.`,
    );
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
    elevation: { listed: tiles.length, decoded: tiles.length - flat, flat, firstFailures },
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

function toRoadClass(highway: string): RoadClass | null {
  if (highway === "motorway" || highway === "trunk" || highway === "primary" || highway === "secondary") {
    return highway;
  }
  return null;
}

export interface LoadOptions {
  baseUrl: string;
  onStage?: (stage: string, loaded: number, total: number) => void;
  /**
   * Optional runtime tile service for elevation, read as
   * `${elevationBaseUrl}/{z}/{x}/{y}.png`. Leave it unset to use the tile paths
   * listed in `region.json` against the bundle. Either way a tile that will not
   * load falls back to flat ground and is counted, rather than failing the load.
   *
   * The AWS Open Data terrarium service answers at
   * `https://s3.amazonaws.com/elevation-tiles-prod/terrarium`. That is the shape
   * this expects, not a recommendation: which source ships is still open in
   * `public/world/DATA-MANIFEST.md` section 5.0.
   */
  elevationBaseUrl?: string;
}

/**
 * Load the whole real world.
 *
 * The survey files, regions, settlements, and network are strict: any failure
 * throws a `WorldDataError` the UI can show with a way to recover. Elevation is
 * the one exception, and only because a 2,236-tile list where one tile is absent
 * should not cost the player the map; it degrades per tile and reports it. See the
 * file header and `ElevationReport`.
 */
export async function loadWorldData(options: LoadOptions): Promise<WorldData> {
  const { baseUrl, onStage } = options;
  // A trailing slash matters: `new URL("/world", origin).href` has none, so
  // `${root}region.json` would resolve to "/worldregion.json".
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const root = new URL(base, location.href).href;

  onStage?.("survey", 0, 3);
  const [region, settlementFile, network] = await Promise.all([
    getJson<RegionFile>(`${root}region.json`, "region"),
    getJson<SettlementsFile>(`${root}settlements.json`, "settlements"),
    getJson<NetworkFile>(`${root}network.json`, "road network"),
  ]);

  validateRegion(region);
  validateSettlements(settlementFile);
  validateNetwork(network);

  onStage?.("terrain", 0, region.elevation.tiles.length);
  const heightfield = await loadHeightfield(
    region,
    root,
    (loaded, total) => onStage?.("terrain", loaded, total),
    options.elevationBaseUrl === undefined ? {} : { elevationBaseUrl: options.elevationBaseUrl },
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

  return {
    region,
    settlements,
    roads,
    rail: network.rail.map((r) => ({
      id: r.osmId.replace(/^way\//, ""),
      name: r.name,
      coords: r.coords,
    })),
    heightfield,
    provenance: { elevation: "aws-terrarium", network: "openstreetmap", population: "us-census" },
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
