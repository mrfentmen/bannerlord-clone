/**
 * Achievement rarity sorting (Rowan solo task 98).
 *
 * Sort achievements by unlock rate — rarest first. Unlock rates come
 * from community statistics the meta layer supplies; each achievement
 * gets a rarity tier from its rate. Pure model.
 */

import { ACHIEVEMENTS } from "./achievements.js";
import type { Achievement } from "./types.js";

export type RarityTier = "common" | "uncommon" | "rare" | "legendary";

/** Unlock rate 0..1 per achievement id (fraction of players who unlocked it). */
export type UnlockRates = Record<string, number>;

export function rarityTier(rate: number): RarityTier {
  if (rate < 0 || rate > 1) throw new Error("unlock rate must be 0..1");
  if (rate < 0.02) return "legendary";
  if (rate < 0.1) return "rare";
  if (rate < 0.4) return "uncommon";
  return "common";
}

export interface RankedAchievement {
  achievement: Achievement;
  /** 0..1, default 1 (everyone) when unknown. */
  unlockRate: number;
  tier: RarityTier;
}

/**
 * Sort achievements by unlock rate, rarest first. Unknown rates default
 * to 1 (treated as common, sorted last).
 */
export function sortAchievementsByRarity(rates: UnlockRates): RankedAchievement[] {
  return ACHIEVEMENTS.map((achievement) => {
    const unlockRate = rates[achievement.id] ?? 1;
    if (unlockRate < 0 || unlockRate > 1) throw new Error(`bad unlock rate for ${achievement.id}`);
    return { achievement, unlockRate, tier: rarityTier(unlockRate) };
  }).sort((a, b) => a.unlockRate - b.unlockRate);
}
