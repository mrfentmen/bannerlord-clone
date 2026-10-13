/**
 * Clan tiers, ported from Bannerlord's renown ladder.
 *
 * Bannerlord gates what a clan may hold behind renown: 0/50/150/350/900/
 * 2350/6150. Tiers unlock party capacity, companion slots, workshops, and —
 * the anti-snowball rule — how many fiefs one clan may hold. A tier-1 clan
 * sitting on six towns is exactly the runaway-leader problem; the ladder
 * is what stops it.
 */

export const CLAN_TIER_COUNT = 6;

/** Renown needed to reach each tier (index = tier). Tier 0 needs nothing. */
export const TIER_RENOWN: readonly number[] = [0, 50, 150, 350, 900, 2350, 6150] as const;

export const TIER_NAMES: readonly string[] = [
  "Drifters",
  "Rabble",
  "Crew",
  "Outfit",
  "Syndicate",
  "Cartel",
  "Empire",
] as const;

/** Max fiefs a clan may hold at each tier. Tier 6 (Empire) is uncapped. */
export const TIER_FIEF_LIMITS: readonly number[] = [1, 2, 3, 4, 6, 8, Number.POSITIVE_INFINITY] as const;

/** Extra party capacity per tier beyond the 25 base. */
export const PARTY_CAPACITY_PER_TIER = 25;

/** Companion slots open at each tier. */
export const TIER_COMPANION_SLOTS: readonly number[] = [1, 2, 3, 4, 5, 6, 8] as const;

/** Clan tier from lifetime renown. Clamps to 0..6. */
export function tierForRenown(renown: number): number {
  let tier = 0;
  for (let t = 0; t < TIER_RENOWN.length; t++) {
    if (renown >= (TIER_RENOWN[t] ?? 0)) tier = t;
  }
  return tier;
}

/** Human name for a tier index. */
export function tierName(tier: number): string {
  return TIER_NAMES[Math.max(0, Math.min(CLAN_TIER_COUNT, tier))] ?? "Drifters";
}

/** How many fiefs a clan at this tier may hold. */
export function maxFiefsForTier(tier: number): number {
  return TIER_FIEF_LIMITS[Math.max(0, Math.min(CLAN_TIER_COUNT, tier))] ?? 1;
}

/** Party troop capacity for a clan tier: 25 base + 25/tier. */
export function partyCapacityForTier(tier: number): number {
  return 25 + Math.max(0, tier) * PARTY_CAPACITY_PER_TIER;
}

/** Companion slots for a clan tier. */
export function companionSlotsForTier(tier: number): number {
  return TIER_COMPANION_SLOTS[Math.max(0, Math.min(CLAN_TIER_COUNT, tier))] ?? 1;
}

/** Renown still needed to reach the next tier (0 when at max). */
export function renownToNextTier(tier: number, renown: number): number {
  if (tier >= CLAN_TIER_COUNT) return 0;
  return Math.max(0, (TIER_RENOWN[tier + 1] ?? 0) - renown);
}

export interface TierAdvancement {
  advanced: boolean;
  fromTier: number;
  toTier: number;
  newFiefLimit: number;
  line: string;
}

/**
 * Advance a clan's tier from its renown. Returns the advancement (or a
 * no-op) with a narrative line for the feed.
 */
export function advanceTier(currentTier: number, renown: number, clanName: string): TierAdvancement {
  const toTier = tierForRenown(renown);
  if (toTier <= currentTier) {
    return { advanced: false, fromTier: currentTier, toTier: currentTier, newFiefLimit: maxFiefsForTier(currentTier), line: "" };
  }
  return {
    advanced: true,
    fromTier: currentTier,
    toTier,
    newFiefLimit: maxFiefsForTier(toTier),
    line: `${clanName} rises to clan tier ${toTier} — ${tierName(toTier)}. May now hold ${maxFiefsForTier(toTier) === Number.POSITIVE_INFINITY ? "any number of" : maxFiefsForTier(toTier)} fiefs.`,
  };
}

/**
 * Can this clan take another fief? Bannerlord's soft answer is "no" —
 * holding more than the limit invites rebellion and rival claims. Returns
 * the verdict; the caller applies unrest/claim consequences.
 */
export function canHoldFief(tier: number, currentFiefs: number): { ok: boolean; reason: string } {
  const limit = maxFiefsForTier(tier);
  if (currentFiefs < limit) return { ok: true, reason: "" };
  return {
    ok: false,
    reason: `Clan tier ${tier} (${tierName(tier)}) may hold ${limit} fief${limit === 1 ? "" : "s"}. Rise to tier ${tier + 1} (${tierName(tier + 1)}, ${TIER_RENOWN[tier + 1]} renown) to hold more.`,
  };
}
