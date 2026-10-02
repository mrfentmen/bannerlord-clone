/**
 * Skirmish map voting (Rowan solo task 33).
 *
 * Before a skirmish, the game offers three map candidates (biome + seed);
 * the player's vote picks the next map. In a multiplayer future the votes
 * tally across players — the tally function already supports that.
 */

import type { BiomeId } from "./types.js";
import { mulberry32, int } from "./rng.js";

export interface MapCandidate {
  id: string;
  biome: BiomeId;
  seed: number;
  label: string;
}

export interface MapVote {
  candidateId: string;
  /** 1 for the local player; multiplayer tallies sum these. */
  weight: number;
}

const BIOMES: BiomeId[] = ["plains", "hills", "forest", "desert", "urban", "coast"];

/** Deal three distinct map candidates from a seed. Deterministic. */
export function dealMapCandidates(seed: number): MapCandidate[] {
  const rng = mulberry32(seed);
  const biomes = [...BIOMES].sort(() => rng() - 0.5).slice(0, 3);
  return biomes.map((biome, i) => {
    const mapSeed = int(rng, 1, 2 ** 31);
    return {
      id: `map-${i}`,
      biome,
      seed: mapSeed,
      label: `${cap(biome)} — seed ${mapSeed.toString(36)}`,
    };
  });
}

/**
 * Tally votes and return the winning candidate. Ties break toward the
 * earliest candidate. Returns null when there are no votes.
 */
export function tallyVotes(candidates: MapCandidate[], votes: MapVote[]): MapCandidate | null {
  if (votes.length === 0) return null;
  const totals = new Map<string, number>();
  for (const v of votes) totals.set(v.candidateId, (totals.get(v.candidateId) ?? 0) + v.weight);
  let best: MapCandidate | null = null;
  let bestTotal = -1;
  for (const c of candidates) {
    const total = totals.get(c.id) ?? 0;
    if (total > bestTotal) {
      bestTotal = total;
      best = c;
    }
  }
  return bestTotal > 0 ? best : null;
}

/** Convenience: the local player's single vote picks the map directly. */
export function pickMap(candidates: MapCandidate[], candidateId: string): MapCandidate | null {
  return tallyVotes(candidates, [{ candidateId, weight: 1 }]);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
