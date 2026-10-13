/**
 * Prisoner conformity, ported from Bannerlord's second recruitment economy.
 *
 * Prisoners don't join you because you paid them — they join when they've
 * given up going home. Conformity builds daily toward a need that scales
 * with the troop's tier; only willing prisoners can be recruited, and
 * pressing them into service costs the party's morale. This is the slow
 * economy next to the market's fast one.
 */

export interface ConformityTerms {
  /** Troop tier of the prisoner stack. */
  tier: number;
  /** Current conformity 0..need. */
  conformity: number;
  /** Player's Leadership skill (speeds the breaking-in). */
  leadership: number;
}

/**
 * Conformity needed before a prisoner of this tier will enlist.
 * Bannerlord's curve: need = (level+6)^2 - 10, adapted to tiers.
 */
export function conformityNeed(tier: number): number {
  const t = Math.max(1, tier);
  return (t + 6) * (t + 6) - 10;
}

/**
 * Daily conformity gain: a base trickle plus Leadership's steady pressure.
 * A tier-1 captive (need 39) breaks in ~3 days; a tier-4 (need 90) takes
 * ~6 at Leadership 10.
 */
export function dailyConformityGain(leadership: number): number {
  return 10 + Math.max(0, leadership) * 0.5;
}

/** Advance one stack's conformity by a day. Returns the new value. */
export function tickConformity(terms: ConformityTerms): number {
  const need = conformityNeed(terms.tier);
  return Math.min(need, terms.conformity + dailyConformityGain(terms.leadership));
}

/** Is this stack willing to enlist? */
export function isWilling(tier: number, conformity: number): boolean {
  return conformity >= conformityNeed(tier);
}

/**
 * Morale cost of recruiting willing prisoners: the old hands resent
 * fighting beside yesterday's enemy. Scales with count.
 */
export function recruitmentMoraleCost(count: number): number {
  return Math.min(20, 2 + count * 0.5);
}

export interface ConformityCheck {
  willing: boolean;
  need: number;
  have: number;
  reason: string;
}

/** Why can't these prisoners be recruited yet? */
export function checkConformity(tier: number, conformity: number): ConformityCheck {
  const need = conformityNeed(tier);
  if (conformity >= need) {
    return { willing: true, need, have: conformity, reason: "" };
  }
  return {
    willing: false,
    need,
    have: conformity,
    reason: `These prisoners aren't broken in yet (${Math.floor(conformity)}/${need} conformity). Give it time.`,
  };
}
