/**
 * The wire format for world data, as consumed by this client.
 *
 * This is a strict subset of Contract A in `agents/README.md`. Agent 1's portable
 * export is authoritative: where the two disagree, Agent 1 wins and the client
 * changes. This file is the contract the client offers in return, so the two
 * agents can connect without a negotiation round-trip.
 *
 * Field names follow `SPEC.md` section 3 and `CAUSE_EFFECT.md` section 2, so a
 * reader of the design docs can check the mapping without opening the code.
 */

/** Real public datasets. See `public/world/DATA-MANIFEST.md`. */
export type DataProvenance = "aws-terrarium" | "openstreetmap" | "us-census" | "agent-1-export";

/** One terrarium tile list in `region.json`: the boot list or the detail list. */
export interface ElevationTileList {
  encoding: "terrarium";
  formula: string;
  zoom: number;
  tileSize: number;
  tiles: { z: number; x: number; y: number; path: string }[];
}

/** `region.json`. The client reads its bounds and tile list from here, never a constant. */
export interface RegionFile {
  name: string;
  bbox: { south: number; west: number; north: number; east: number };
  /**
   * The boot list: every tile needed to draw the whole region at startup. Read at
   * full length by `loadHeightfield`, which fetches all of it and fails loudly on a
   * missing tile rather than drawing a hole.
   */
  elevation: ElevationTileList;
  /**
   * The detail list: the same coverage at a finer zoom, for close-zoom terrain and
   * battle maps.
   *
   * Optional because a boot list is enough to run the campaign map, and because a
   * release that ships only `elevation` is a valid region file. When it is present the
   * client validates it and records that it exists; it does not stream it, since
   * progressive loading is not built yet. That is a stated gap rather than a silent
   * one: nothing reads these tiles today, so nothing can quietly depend on them.
   */
  elevationDetail?: ElevationTileList;
  retrieved: string;
  /**
   * What can honestly be said about which state this region is in.
   *
   * OSM nodes here carry no `addr:state` tag, so per-settlement state is null in the
   * export. The region's own state is a fact from the bounding box, and it is recorded
   * with the basis for the claim rather than assumed silently.
   */
  stateCoverage?: {
    region: string;
    regionCode: string;
    basis: string;
    settlementTagsPresent: number;
  };
}

/**
 * The on-disk shape of a settlement record, as written by
 * `tools/fetch-world-data.mjs`. Distinct from `WorldSettlement` because the client
 * normalises ids and drops fields it does not use; keeping the two apart means a
 * change to the export is a change to this type, not a silent drift.
 */
export interface WorldSettlementFile {
  osmId: string;
  name: string;
  place: "city" | "town" | "village";
  lat: number;
  lon: number;
  population: number | null;
  populationSource: string | null;
  populationCensusName: string | null;
  state: string | null;
  stateCode: string | null;
  osmPopulation: number | null;
  osmPopulationDate: string | null;
  wikidata: string | null;
}

/**
 * A settlement lookup that accepts more than one kind of key.
 *
 * The client's own id for a settlement is the OSM node id, because that is what
 * survives a re-fetch. The simulation's id for the same place is its own business:
 * Contract B does not promise the client will use the client's ids. Rather than assume
 * it will, the client indexes settlements by id, by position, and by name, and resolves
 * whichever it is handed. A mismatch shows up as a settlement that silently cannot be
 * routed to, which is exactly the kind of thing that would be very expensive to find
 * later.
 *
 * Names are the reason this cannot be a plain `Map<string, WorldSettlement>` keyed by
 * name. Thirty-six names in the V1 region are held by more than one place: there is an
 * Albany in Indiana and an Albany in Ohio, a Winchester in each of Kentucky, Indiana and
 * Ohio. Keying by bare name made the last one in the file win and the other disappear,
 * so `resolve("Winchester")` returned whichever the file happened to list last and
 * nothing said otherwise. A settlement index that silently drops a town is the exact
 * failure mode the rest of this file works to avoid, so name lookups are:
 *
 *  - exact and position keys, which are unique and always resolve;
 *  - `Name, State` and `Name ST` for every settlement, which is unique per state and
 *    resolves even when the bare name is shared;
 *  - a bare name only when the region holds exactly one place with it.
 *
 * An ambiguous bare name resolves to `undefined` rather than to a guess.
 * `candidatesFor(name)` returns every place carrying that name so a caller can offer the
 * choice instead of making it silently.
 */
export interface SettlementIndex {
  /** OSM node id, the client's own stable id. Unique across the region. */
  byId: Map<string, WorldSettlement>;
  /** `lat,lon` rounded to four decimals, unique in the region. See `positionKey`. */
  byPosition: Map<string, WorldSettlement>;
  /**
   * Bare name, exact as written in the export, for names exactly one place carries.
   * Ambiguous names are absent rather than pointing at one of their holders.
   */
  byName: Map<string, WorldSettlement>;
  /** Lowercased bare name, same rule: absent when the name is ambiguous. */
  byNameFolded: Map<string, WorldSettlement>;
  /** `name, state` and `name st`, for every settlement. Unique per state, so never ambiguous. */
  byStateName: Map<string, WorldSettlement>;
  /** Bare name to every settlement carrying it. Includes the unambiguous ones. */
  byNameAll: Map<string, WorldSettlement[]>;
  /**
   * Resolve any key this index holds: an OSM id, `lat,lon`, `Name, State`, `Name ST`,
   * or an unambiguous bare name in any case. `undefined` when nothing matches, and also
   * when a bare name is ambiguous, because returning one of several places would be a
   * guess dressed as an answer.
   */
  resolve(idOrName: string): WorldSettlement | undefined;
  /** Every place carrying `name`, for a caller that can ask the player to choose. */
  candidatesFor(name: string): WorldSettlement[];
  all(): WorldSettlement[];
}

/** A settlement with real coordinates and, where a real source covers it, a real population. */
export interface WorldSettlement {
  /** Stable id, the OSM node id. Survives a re-fetch, so save files keep working. */
  id: string;
  name: string;
  /** OSM `place` classification: city, town or village. Not a game-side decision. */
  place: "city" | "town" | "village";
  lat: number;
  lon: number;
  /**
   * Real population, or `null` when no real dataset covered this place.
   *
   * `null` is meaningful and the client renders it. Eleven of the 48 mapped places
   * in the V1 region have no Census figure; substituting a band midpoint would be
   * inventing data, which `CONSTITUTION.md` section 1.1 forbids.
   */
  population: number | null;
  populationSource: string | null;
  /** OSM `addr:state`, or `null` when the tag is absent. Never defaulted. */
  state: string | null;
  /** FIPS code for `state`, resolved from the name. `null` when `state` is null. */
  stateCode: string | null;
  /** Kept for provenance only. Never displayed, never used for classification. */
  osmPopulation: number | null;
}

export interface SettlementsFile {
  source: string;
  licence: string;
  retrieved: string;
  settlements: WorldSettlementFile[];
}

export type RoadClass = "motorway" | "trunk" | "primary" | "secondary";

/** The on-disk shape of a road, before the client normalises the class. */
export interface RoadWayFile {
  osmId: string;
  highway: string;
  name: string | null;
  ref: string | null;
  surface: string | null;
  lanes: number | null;
  coords: [number, number][];
}

/** The on-disk shape of a rail line. */
export interface RailWayFile {
  osmId: string;
  name: string | null;
  coords: [number, number][];
}

/** A road after normalisation. `roadClass` is narrowed from OSM's open string. */
export interface RoadWay {
  id: string;
  roadClass: RoadClass;
  name: string | null;
  ref: string | null;
  surface: string | null;
  lanes: number | null;
  /** Flat [lat, lon] pairs. Flat to keep 26,872 polylines small enough to load. */
  coords: [number, number][];
}

export interface RailWay {
  id: string;
  name: string | null;
  coords: [number, number][];
}

export interface NetworkFile {
  source: string;
  licence: string;
  retrieved: string;
  roads: RoadWayFile[];
  rail: RailWayFile[];
}

/** Every dataset, with the provenance the client shows in its data-source panel. */
export interface WorldData {
  region: RegionFile;
  settlements: WorldSettlement[];
  roads: RoadWay[];
  rail: RailWay[];
  /** Raw terrarium pixels, decoded to metres by `elevation.ts`. Keyed `z/x/y`. */
  heightfield: Heightfield;
  provenance: Record<string, DataProvenance>;
}

/** A decoded heightmap. `metres[row * width + col]`, north row first. */
export interface Heightfield {
  width: number;
  height: number;
  /** Elevation in metres above sea level. */
  metres: Float32Array;
  /** Metres per pixel, so a screen-space error can be turned into a real distance. */
  resolutionMetres: number;
  /** Bounds in the region's own lat/lon space, matching `RegionFile.bbox`. */
  bounds: { south: number; west: number; north: number; east: number };
}

/** A point in world space. The client's 1 unit = 1 metre (ART_DIRECTION.md section 7). */
export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Local metric projection for the loaded region. Equirectangular with a single scale
 * factor taken at the region's centre latitude; over 68 km the error against a proper
 * projection is well under a metre, and it keeps the maths in one place.
 */
export interface Projection {
  /** World metres, 1 unit = 1 metre. X east, Z north. */
  toWorld(lat: number, lon: number): WorldPoint;
  toLatLon(x: number, z: number): { lat: number; lon: number };
  /** Ground height in metres at a world position, bilinear from the heightfield. */
  heightAt(x: number, z: number): number;
  width: number;
  depth: number;
  originLat: number;
  originLon: number;
}

/** Geographic helpers, so no component invents its own projection. */
export function metresPerDegreeLat(): number {
  return 111_320;
}

export function metresPerDegreeLon(atLat: number): number {
  return 111_320 * Math.cos((atLat * Math.PI) / 180);
}
