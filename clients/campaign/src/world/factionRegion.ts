/**
 * Which part of the loaded map a faction actually holds.
 *
 * The start screen asks the player to pick a side, and the answer was thrown away:
 * every campaign opened on the same region-framing camera with the same
 * highest-unrest town selected, whichever side was chosen. This module is the missing
 * half of that decision — the mapping from a chosen side id to the territory in the
 * loaded region that belongs to it.
 *
 * Two shipped files and nothing else are consulted:
 *
 *  - `public/world/territories.json`, which `build-territories.py` writes by hulling
 *    the national settlement export per section. Six hulls, one per playable side.
 *  - `public/world/settlements.json`, the settlements the region actually loaded.
 *
 * The intersection of the two is the answer. That intersection is not decorative: the
 * territories are national and the region is a metro cluster, so a hull usually covers
 * several states while the region covers five, and the two are not the same shape. The
 * Ohio River Valley region holds all of the Great Lakes Union's Ohio and Indiana
 * claims and none at all of the Pacific Compact's, and both facts are in the data.
 *
 * Nothing here is derived from a constant. Every coordinate is either a real hull
 * vertex or a real settlement position, so a `FactionRegion` for a faction that holds
 * nothing in this region is `null` at the anchor rather than a plausible-looking
 * centroid somewhere off the map. Pure lat/lon, no projection and no scene types, so
 * the whole thing runs in a node test against the committed wire files.
 */

import type { FactionTerritory, Projection, WorldData, WorldSettlement } from "./types.js";

/** Latitude/longitude bounds, the same shape `RegionFile.bbox` uses. */
export interface LatLonBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** The settlement a faction's campaign opens on. */
export interface FactionRegionAnchor {
  settlementId: string;
  name: string;
  lat: number;
  lon: number;
  /** Real Census population, or `null` when no dataset covered this place. */
  population: number | null;
  /**
   * `capital` when this is the faction's own capital and the loaded region contains
   * it, `largest-member` when the capital is outside the region and the anchor is the
   * biggest settlement the faction does hold here.
   *
   * The distinction is load-bearing for the report a player reads: a campaign opening on
   * a faction's real capital reads as "here is your realm", and one opening on the
   * biggest town inside this region reads as "here is your realm, as far as this map
   * goes".
   */
  role: "capital" | "largest-member";
}

export interface FactionRegion {
  /** The side id exactly as the caller spelled it. */
  sideId: string;
  /** The shipped hull this region was cut from. */
  territory: FactionTerritory;
  /**
   * The faction's settlements inside the loaded region, biggest population first.
   * Settlements with no surveyed population sort last rather than being dropped, so
   * the count is the count.
   */
  settlements: WorldSettlement[];
  /** Bounds of those settlements, or `null` when the faction holds nothing here. */
  bbox: LatLonBounds | null;
  /** Where the map opens. `null` when the faction holds nothing in this region. */
  anchor: FactionRegionAnchor | null;
}

/**
 * Fold the two spellings of a faction id onto one key.
 *
 * `territories.json` ships `great_lakes_union` because the pipeline buckets on a
 * snake_case `section_key`, while the client, the simulation and `PLAYABLE_SIDE_IDS` all
 * spell it `great-lakes-union`. Neither is wrong and neither file is going to change,
 * so the join is made here rather than by editing shipped data — CONSTITUTION.md
 * section 1.1 does not let a naming disagreement become invented data.
 */
export function normalizeFactionKey(id: string): string {
  return id.trim().toLowerCase().replace(/_/g, "-");
}

/**
 * Index a territory list by normalized faction key.
 *
 * Last write wins on a duplicate key. The shipped file has six distinct factions, so
 * this never fires today; it is here so a future pipeline that buckets a settlement
 * under two sections produces a stated choice instead of whichever entry happened to
 * be read first.
 */
export function indexTerritories(territories: readonly FactionTerritory[]): Map<string, FactionTerritory> {
  const byKey = new Map<string, FactionTerritory>();
  for (const t of territories) byKey.set(normalizeFactionKey(t.faction), t);
  return byKey;
}

/**
 * Ray casting, on the hull's own `[lon, lat]` order.
 *
 * The half-open rule (`y > lat` versus `y <= lat`) is what stops a point sitting on a
 * vertex from being counted twice, and the division is guarded because a horizontal
 * hull edge produces a zero denominator. A division by zero here would yield
 * `Infinity` or `NaN`, which compares false, so the point falls outside — the same
 * answer as an edge case it cannot belong to.
 */
export function pointInTerritory(lon: number, lat: number, territory: FactionTerritory): boolean {
  const hull = territory.polygon;
  let inside = false;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const a = hull[i];
    const b = hull[j];
    if (!a || !b) continue;
    if (a[1] > lat !== b[1] > lat) {
      const slope = ((b[0] - a[0]) * (lat - a[1])) / (b[1] - a[1]);
      if (lon < a[0] + slope) inside = !inside;
    }
  }
  return inside;
}

function boundsOf(settlements: readonly WorldSettlement[]): LatLonBounds | null {
  if (settlements.length === 0) return null;
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const s of settlements) {
    if (s.lat < south) south = s.lat;
    if (s.lat > north) north = s.lat;
    if (s.lon < west) west = s.lon;
    if (s.lon > east) east = s.lon;
  }
  return { south, west, north, east };
}

/** Biggest surveyed population first; places with no survey sort last, not first. */
function byPopulation(a: WorldSettlement, b: WorldSettlement): number {
  const pa = a.population ?? -1;
  const pb = b.population ?? -1;
  if (pa !== pb) return pb - pa;
  return a.name.localeCompare(b.name);
}

/**
 * Find a settlement by id, then by name.
 *
 * Ids first, because `territories.json` writes the settlement id the pipeline holds.
 * The name fallback exists because the id vocabularies come from different places and a
 * match that only holds on one of them is worth catching rather than dropping — and a
 * case-insensitive name match is exactly as strong here, since a capital name is a
 * capital name.
 */
function matchSettlement(settlements: readonly WorldSettlement[], id: string, name: string): WorldSettlement | null {
  const byId = settlements.find((s) => s.id === id);
  if (byId) return byId;
  const wanted = name.trim().toLowerCase();
  return settlements.find((s) => s.name.trim().toLowerCase() === wanted) ?? null;
}

/**
 * The loaded region intersected with the chosen faction's territory.
 *
 * Returns `null` for an id the territory file does not know, which is a different fact
 * from "the faction holds nothing here": `null` means there is no shipped territory to
 * intersect with (a Wanderer start, or a region deployed without `territories.json`),
 * and a returned region with a `null` anchor means the territory is real and simply
 * does not reach this map. Both are handled by falling back to whole-region framing,
 * and both are distinguished here so the fallback can say which one it is.
 */
export function factionRegionFor(sideId: string, world: WorldData): FactionRegion | null {
  const territory = indexTerritories(world.territories).get(normalizeFactionKey(sideId));
  if (!territory) return null;

  const members = world.settlements
    .filter((s) => pointInTerritory(s.lon, s.lat, territory))
    .sort(byPopulation);

  const capital = matchSettlement(world.settlements, territory.capital.id, territory.capital.name);
  const head = members[0];
  const anchorPlace = capital && pointInTerritory(capital.lon, capital.lat, territory) ? capital : head;

  const anchor: FactionRegionAnchor | null = anchorPlace
    ? {
        settlementId: anchorPlace.id,
        name: anchorPlace.name,
        lat: anchorPlace.lat,
        lon: anchorPlace.lon,
        population: anchorPlace.population,
        role: anchorPlace === capital ? "capital" : "largest-member",
      }
    : null;

  return {
    sideId,
    territory,
    settlements: members,
    bbox: boundsOf(members),
    anchor,
  };
}

/**
 * How many of the region's settlements this faction holds.
 *
 * For the framing decision, and for anything that reports the split. Zero is a
 * legitimate answer that should be shown rather than a number to round away.
 */
export function factionShare(region: FactionRegion, world: WorldData): number {
  if (world.settlements.length === 0) return 0;
  return region.settlements.length / world.settlements.length;
}

/**
 * The camera radius that frames a faction's territory, in world metres.
 *
 * Derived as a proportion of the whole-region framing radius the client already uses
 * for its "open on the campaign, not one street" shot, scaled by how much of the region
 * the faction holds. A ratio of the two real extents rather than a fitted constant,
 * because a FOV-derived conversion would be a number invented here and checked nowhere.
 *
 * Clamped to the range the client already frames at: never wider than the whole region
 * (a faction cannot be shown in more space than the map has) and never tighter than a
 * single town's framing. `null` when the faction holds nothing here, which is the
 * caller's cue to frame the region instead.
 */
export function factionFocusRadius(
  region: FactionRegion,
  projection: Projection,
  regionRadius: number,
  minRadius: number,
): number | null {
  const bbox = region.bbox;
  if (!bbox || region.settlements.length < 2) return null;

  const sw = projection.toWorld(bbox.south, bbox.west);
  const ne = projection.toWorld(bbox.north, bbox.east);
  const factionSpan = Math.hypot(ne.x - sw.x, ne.z - sw.z);
  if (!Number.isFinite(factionSpan) || factionSpan <= 0) return null;

  const regionSpan = Math.hypot(projection.width, projection.depth);
  if (!Number.isFinite(regionSpan) || regionSpan <= 0) return null;

  const radius = (regionRadius * factionSpan) / regionSpan;
  return Math.min(regionRadius, Math.max(minRadius, radius));
}

/** Where a campaign opens: which settlement, and how wide. */
export interface CampaignOpening {
  /**
   * The settlement to open on, or `null` when there is nothing faction-specific to open
   * on and the caller should fall back to the region's own worst town.
   */
  anchor: FactionRegionAnchor | null;
  /** Camera radius in world metres. Always the region radius when `anchor` is `null`. */
  radius: number;
}

export interface CampaignOpeningOptions {
  /** The radius the whole region is framed at. */
  regionRadius: number;
  /** The tightest frame the caller uses, i.e. a single town. */
  minRadius: number;
  /**
   * Whether the simulation is running a town for this settlement.
   *
   * Injected rather than looked up, because the answer is the simulation's and this
   * module reads world files only. A settlement the client can place but the sim has no
   * record for still anchors the camera — the faction's ground is real either way — but
   * it is not selected, because selecting it would open the "no simulation record" sheet
   * where the Why panel's chain should be.
   */
  isAnchorPlayable(settlementId: string): boolean;
}

/**
 * Decide the opening view for a campaign started on `region`.
 *
 * `null` region means no faction to open on: a Wanderer start, a region deployed
 * without `territories.json`, or a caller that never chose. A region with no anchor
 * means the faction's hull does not reach this map. Both open on the whole region, which
 * is what the game did before faction mapping existed and is the only honest answer when
 * the faction's ground is not in the loaded world — framing the camera on a territory
 * off the edge of the region would put the player in empty terrain.
 */
export function campaignOpening(
  region: FactionRegion | null,
  projection: Projection,
  options: CampaignOpeningOptions,
): CampaignOpening {
  const fallback: CampaignOpening = { anchor: null, radius: options.regionRadius };
  if (!region || !region.anchor) return fallback;
  if (!options.isAnchorPlayable(region.anchor.settlementId)) return fallback;

  const radius =
    factionFocusRadius(region, projection, options.regionRadius, options.minRadius) ??
    // A faction with a single settlement here has no extent to scale against, so it is
    // framed as a town rather than as the whole region.
    options.minRadius;
  return { anchor: region.anchor, radius };
}
