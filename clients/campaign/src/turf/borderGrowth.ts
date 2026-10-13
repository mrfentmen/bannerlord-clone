/**
 * Influence creep — the slow block-to-block spread of a crew's territory.
 *
 * Ported from `RyanGrieb/OpenCiv`'s `BorderGrowth.ts` (MIT): the Civ 5
 * culture-cost curve (`FIRST_TILE_COST + (10 × tilesAcquired)^1.1`) and
 * the weighted candidate chooser (distance cost vs resource/river
 * priorities). The Civ `Tile`/`MapResources` types are replaced with the
 * minimal `TurfTile` below; `Math.random` tie-breaking takes an injected
 * rng so the sim stays deterministic.
 *
 * Composes with `zones.ts`: creep spreads *influence* block to block;
 * the zone rules decide the actual *takeover* event.
 */
import { TURF_CONFIG } from "./config.js";

const G = TURF_CONFIG.growth;

export type TileResource = "luxury" | "strategic" | "bonus";

export interface TurfTile {
  id: string;
  adjacent: TurfTile[];
  /** Crew id holding this block, or null. */
  owner: string | null;
  resource?: TileResource;
  river?: boolean;
}

export interface Rng {
  next(): number; // 0..1
}

export class BorderGrowth {
  /** Influence cost for a crew to claim its next block. */
  static claimCost(tilesAcquired: number): number {
    return Math.floor(G.firstTileCost + Math.pow(G.laterTileMultiplier * tilesAcquired, G.laterTileExponent));
  }

  /** Ring distances from the centre tile, walking the adjacency graph. */
  static ringDistances(center: TurfTile, maxRing: number): Map<TurfTile, number> {
    const rings = new Map<TurfTile, number>([[center, 0]]);
    let frontier: TurfTile[] = [center];
    for (let ring = 1; ring <= maxRing; ring++) {
      const next: TurfTile[] = [];
      for (const tile of frontier) {
        for (const adj of tile.adjacent) {
          if (rings.has(adj)) continue;
          rings.set(adj, ring);
          next.push(adj);
        }
      }
      frontier = next;
    }
    return rings;
  }

  /**
   * The block a crew's influence spreads into next: an unowned tile
   * touching its territory, within reach, with the lowest influence
   * cost. Ties broken by rng. Undefined when nothing is left to claim.
   */
  static chooseNextTile(center: TurfTile, territory: TurfTile[], rng: Rng): TurfTile | undefined {
    const owned = new Set(territory);
    const candidates: Array<{ tile: TurfTile; cost: number }> = [];
    for (const [tile, distance] of BorderGrowth.ringDistances(center, G.maxAcquireDistance)) {
      if (tile.owner !== null) continue;
      if (!tile.adjacent.some((adj) => owned.has(adj))) continue;
      candidates.push({ tile, cost: BorderGrowth.influenceCost(tile, distance) });
    }
    if (candidates.length === 0) return undefined;
    const lowest = Math.min(...candidates.map((c) => c.cost));
    const cheapest = candidates.filter((c) => c.cost === lowest);
    return cheapest[Math.floor(rng.next() * cheapest.length)]!.tile;
  }

  static influenceCost(tile: TurfTile, distance: number): number {
    return distance * G.distanceCost + BorderGrowth.featureCost(tile);
  }

  private static featureCost(tile: TurfTile): number {
    if (tile.resource === "luxury") return G.luxuryCost;
    if (tile.resource === "strategic") return G.strategicCost;
    if (tile.resource === "bonus") return G.bonusCost;
    if (tile.adjacent.some((adj) => adj.resource !== undefined)) return G.nextToResourceCost;
    if (tile.river) return G.riverCost;
    return 0;
  }
}
