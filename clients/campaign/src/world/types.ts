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

/**
 * The `wire_version` stamp every wire file may carry.
 *
 * `services/world-data/tools/deploy-wire-to-client.py` carries this field across a
 * redeploy rather than letting the fresh wire build drop it, because it is the one
 * field in a wire file that describes *the shape of the rest of the file* rather than
 * the data in it. Populations and polylines change without notice; the names and
 * nesting they arrive under change only when the format is deliberately revised.
 *
 * So it is the field that says whether this client can read these files at all.
 * `validateWireVersion` in `load.ts` checks it and refuses anything it does not
 * recognise, because CONSTITUTION.md section 1.3 says an untrusted input gets a loud
 * failure rather than a silent fallback - and a wire v3 that renamed a field does not
 * fail, it renders a map with the roads missing.
 *
 * Optional, and deliberately so: `region.json` and `boundaries.json` ship without it
 * today, because `build-territories.py` stamps it onto `territories.json` and nothing
 * stamps the other two. A file with no stamp is read as an unversioned file, which is
 * what it is. A file with a stamp this client does not know is refused.
 *
 * The stamp means *the shape of that one file* moved, not that a whole wire generation
 * did, which is why the shapes are written out in this file rather than summarised here:
 * `boundaries.json` and `settlements.json` both read 2 for unrelated reasons, and
 * `territories.json`'s 2 is the MultiPolygon described on `TerritoriesFile`. Check the
 * type for the file you are reading, not the stamp alone.
 *
 * Spelled `wire_version` and not `wireVersion` because that is what the file says, the
 * same way `travelEdgesMeta.matched_settlements` keeps its underscore. The build
 * camel-cases most multi-word fields; these two are the exception, and renaming them
 * here would mean the client stopped reading the field it is meant to check.
 */
export interface WireStamped {
  wire_version?: number;
}

/** One elevation tile tier: a zoom, a tile size, and the tiles themselves. */
export interface ElevationTier {
  encoding: "terrarium";
  formula: string;
  zoom: number;
  tileSize: number;
  tiles: { z: number; x: number; y: number; path: string }[];
}

/**
 * `region.json`. The client reads its bounds and tile list from here, never a constant.
 *
 * The region is the Ohio River Valley (see `public/world/DATA-MANIFEST.md`), built by
 * `services/world-data` from Census TIGER/Line data and published as
 * `exports/wire/region.json`.
 */
export interface RegionFile extends WireStamped {
  name: string;
  /**
   * The region's id in `public/world/regions.json`'s index (e.g. "nyc-metro").
   * Present in multi-region wire builds; the legacy default region's file
   * predates the index and carries no id.
   */
  regionId?: string;
  bbox: { south: number; west: number; north: number; east: number };
  /**
   * The boot tier: every tile the loader fetches before it draws anything.
   *
   * Zoom 10 over this region is 154 tiles, about 8 MB. The detail tier below is
   * 2,236 tiles and about 250 MB, which is why it is a separate, lazily-fetched
   * list rather than what the game blocks on. The loader reads only this tier, so
   * a region file with no boot tier would draw nothing.
   */
  elevation: ElevationTier;
  /**
   * The full-resolution tile list. The list itself is committed here; the ~250 MB of
   * PNGs it names are not — they are fetched on demand with
   * `worlddata fetch-elevation --tier detail`. Optional, because a region file with
   * only a boot tier is valid and is what a region without a detail tier ships.
   */
  elevationDetail?: ElevationTier;
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
 * A settlement lookup that accepts more than one kind of id.
 *
 * The client's own id for a settlement is the OSM node id, because that is what
 * survives a re-fetch. The simulation's id for the same place is its own business:
 * Contract B does not promise the client will use the client's ids. Rather than assume
 * it will, the client indexes settlements by id, by exact name, and by normalised name,
 * and resolves whichever it is handed. A mismatch shows up as a settlement that
 * silently cannot be routed to, which is exactly the kind of thing that would be very
 * expensive to find later.
 */
export interface SettlementIndex {
  byId: Map<string, WorldSettlement>;
  byName: Map<string, WorldSettlement>;
  resolve(idOrName: string): WorldSettlement | undefined;
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

export interface SettlementsFile extends WireStamped {
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

export interface TravelEdgeFile {
  from: number;
  to: number;
  length_km: number;
  road_class: string;
  kind: string;
  minutes: number;
  method: string;
}

export interface NetworkFile extends WireStamped {
  source: string;
  licence: string;
  retrieved: string;
  roads: RoadWayFile[];
  rail: RailWayFile[];
  /** v2: settlement-to-settlement weighted edges for pathfinding. */
  travelEdges?: TravelEdgeFile[];
  travelEdgesMeta?: { count: number; matched_settlements: number; note: string };
}

/**
 * `boundaries.json`: the real Census Bureau outline of each settlement in the region.
 *
 * Optional, and separately built. `worlddata wire` cannot produce it, because the
 * pipeline's `place_boundaries` table throws the polygon rings away as soon as it has taken
 * the interior point out of them; `services/world-data/tools/build-wire-place-boundaries.py`
 * reads the Cartographic Boundary file again and keeps them. So a region can be deployed
 * without this file, and the loader treats "absent" as "this region has no footprints"
 * rather than as a fault — while a file that *is* there and cannot be read is a fault,
 * because that is a corrupted deployment.
 *
 * Coordinates are `[lat, lon]`, the same order as every other coordinate in this file, and
 * rings run the way `ringOrder` states: exterior clockwise, holes counter-clockwise. A
 * renderer can classify a ring by winding rather than recomputing areas, and the wire
 * build guarantees the classification is correct for every ring it ships.
 */
export interface PlaceBoundaryFile {
  /** The settlement's own id, matching `settlements.json`'s `osmId`. Join on this, never on name. */
  placeKey: string;
  /** The Census Bureau's own name with its area type, e.g. "Columbus city". */
  name: string;
  /** The display name the settlement is known by, e.g. "Columbus". */
  displayName: string | null;
  /** The wire settlement's own classification: city, town or village. */
  sizeClass: string | null;
  /** The Census Bureau's LSAD area-type code, e.g. "25" for city. Not the same thing as `sizeClass`. */
  lsadCode: string | null;
  /** Census Bureau's own ALAND figure in km². Not an area this client computed. */
  landAreaKm2: number | null;
  /** The pipeline's interior point for this place — equal to the settlement's lat/lon. */
  centroid: { lat: number; lon: number };
  polygonCount: number;
  ringCount: number;
  vertexCount: number;
  /**
   * Each polygon is the exterior ring followed by its holes; each ring is a closed
   * `[lat, lon]` list. A multipolygon place (islands, or a sliver kept as its own piece)
   * is more than one entry here, and drawing only `polygons[0]` would drop real land.
   */
  polygons: [number, number][][][];
}

export interface BoundariesFile extends WireStamped {
  source: string;
  licence: string;
  retrieved: string;
  coordinateOrder: string;
  ringOrder: string;
  cartoYear: number;
  settlementCount: number;
  polygonCount: number;
  ringCount: number;
  vertexCount: number;
  note: string;
  boundaries: PlaceBoundaryFile[];
}

/**
 * `territories.json`: the six factions' regions, as built by
 * `services/world-data/tools/build-territories.py`.
 *
 * **Coordinates are `[lon, lat]` in this file, not the `[lat, lon]` every other wire file
 * uses.** It is GeoJSON order, it is what the file has always carried, and the file states
 * it in `coordinateOrder` so a renderer reads the order rather than assuming it. This is
 * the one wire file in `public/world/` whose order differs; anything that draws from two of
 * them has to swap one of them.
 *
 * **A faction's `polygon` is a MultiPolygon, not a ring.** Faction membership is a list of
 * states (`config/world_data.toml [sections]`) and the honest polygon is the union of those
 * states' Census rings, which is 8 polygons for the Mountain Alliance and 657 for the Pacific
 * Compact, because each state is itself a multipolygon of islands and lake shorelines.
 * Sections partition the states - `worlddata.config` refuses a build where a state is in two
 * sections or in none - so no two polygons here overlap and a renderer fills all of them.
 *
 * It used to be a single convex hull of the faction's *settlement points*, which is the shape
 * this replaced: a hull of settlement points necessarily contains every other settlement
 * inside it, so 783 settlements - 5.9% of the country - were drawn inside a territory that
 * was not theirs. Reading `polygon[0]` is not a cheaper version of this file, it is the
 * western states of one faction and nothing else.
 *
 * `wire_version` 2 is this MultiPolygon shape. The hull shipped under the same stamp, which
 * is the reason the stamp alone was never a reliable signal here; the shape is the contract.
 * Nothing in `src/` reads this file yet, so no renderer has to be taught the old shape - but
 * this type is the shape any renderer is to be written against.
 */
export interface FactionTerritory {
  /** `section_key` from the pipeline, e.g. "great_lakes_union". Joins to nothing else; it is the faction's own id. */
  faction: string;
  /** The faction's display name, e.g. "Great Lakes Union". */
  label: string;
  /** Display colour, from the banners/art palette. */
  color: string;
  /** The member states, by Census name, in `config/world_data.toml [sections]` order. */
  states: string[];
  /** The same member states by FIPS, same order. */
  state_fips: string[];
  /** Placed settlements in this faction. Excludes settlements with no coordinates; see `no_position`. */
  settlement_count: number;
  /** Sum of the populations of those settlements. Real Census figures, not modelled ones. */
  total_population: number;
  capital: { id: string; name: string; lat: number; lon: number; population: number };
  /** Each polygon is the exterior ring followed by its holes; each ring is a closed `[lon, lat]` list. */
  polygon: [number, number][][];
  polygon_count: number;
  ring_count: number;
  vertex_count: number;
  /**
   * Settlements sampled within 50 km of another faction's settlement. A *sample*: both sides
   * are strided, so this is an estimate of the count and not the count.
   */
  border_settlement_sample: number;
}

export interface TerritoriesFile extends WireStamped {
  wire_version: 2;
  source: string;
  licence: string;
  coordinateOrder: string;
  ringOrder: string;
  /** When this build ran, UTC. A run stamp, not a typed-in date. */
  generated: string;
  faction_count: number;
  /** Placed settlements across all six factions: the file's denominator. */
  settlement_count: number;
  /**
   * Settlements with no latitude or longitude. They are in no territory, in no faction's
   * population and in no faction's settlement count, and this is where a reader finds out.
   */
  no_position: { count: number; settlements: string[] };
  /**
   * Settlements that fall inside no polygon in this file, because the 500k state
   * generalisation carries the state but not the island their own place polygon covers.
   */
  outside_every_territory: { count: number; settlements: string[] };
  territories: FactionTerritory[];
}

/**
 * A place boundary after validation, projected-ready: rings in world metres.
 *
 * Kept as a distinct type from `PlaceBoundaryFile` for the same reason `WorldSettlement`
 * is distinct from `WorldSettlementFile`: the on-disk shape is the contract with
 * `services/world-data`, and this is the shape the rest of the client draws from.
 */
export interface PlaceBoundary {
  settlementId: string;
  name: string;
  displayName: string;
  sizeClass: string | null;
  lsadCode: string | null;
  landAreaKm2: number | null;
  centroid: WorldPoint;
  polygonCount: number;
  vertexCount: number;
  /** Projected rings in world metres, still in lat/lon winding order. */
  polygons: WorldPoint[][][];
}

/** Every dataset, with the provenance the client shows in its data-source panel. */
export interface WorldData {
  region: RegionFile;
  settlements: WorldSettlement[];
  roads: RoadWay[];
  rail: RailWay[];
  /**
   * Real settlement outlines, when the region ships them. Empty for a region deployed
   * without `boundaries.json` — which is a fact about the data, recorded rather than
   * papered over with a circle around each town.
   */
  boundaries: PlaceBoundary[];
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
