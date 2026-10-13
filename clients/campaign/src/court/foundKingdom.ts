/**
 * Founding your own kingdom, ported from Bannerlord.
 *
 * The endgame fantasy: stop serving kings and become one. Bannerlord gates
 * it behind clan tier 4, independence, and holding a fief for a capital.
 * Founding spends influence (crowning yourself is politics, and politics
 * is expensive) and the old kingdom answers with war if you took their
 * land on the way out — see court/defection.ts.
 */

export interface FoundKingdomTerms {
  clanName: string;
  /** Clan tier; must be 4+. */
  tier: number;
  /** Fiefs held; the first becomes the capital. Must hold at least one. */
  fiefs: string[];
  /** True when still sworn to a kingdom — must defect first. */
  isVassal: boolean;
  /** Kingdom being left, if any (for the war consequence). */
  formerKingdom?: string;
  /** Did the clan keep its fiefs when it left? Then the old king wants them back. */
  keptFiefsOnDefection: boolean;
  /** Influence available to spend on the coronation. */
  influence: number;
  /** Proposed name for the new realm. */
  kingdomName: string;
}

/** Influence burned to proclaim a kingdom. */
export const FOUND_KINGDOM_INFLUENCE_COST = 100;

/** Minimum clan tier to found a kingdom. */
export const FOUND_KINGDOM_MIN_TIER = 4;

export type FoundKingdomResult =
  | {
      ok: true;
      kingdomName: string;
      capital: string;
      warWithFormer: boolean;
      influenceSpent: number;
      line: string;
    }
  | { ok: false; reason: string };

/** Check-only version: why can't this clan found a kingdom yet? */
export function canFoundKingdom(terms: FoundKingdomTerms): { ok: true; reason: string } | { ok: false; reason: string } {
  if (terms.isVassal) {
    return {
      ok: false,
      reason: `${terms.clanName} still swears fealty${terms.formerKingdom ? ` to ${terms.formerKingdom}` : ""}. Renounce them first — then crown yourself.`,
    };
  }
  if (terms.tier < FOUND_KINGDOM_MIN_TIER) {
    return {
      ok: false,
      reason: `A kingdom needs a clan of tier ${FOUND_KINGDOM_MIN_TIER} or higher. ${terms.clanName} is tier ${terms.tier}.`,
    };
  }
  if (terms.fiefs.length === 0) {
    return {
      ok: false,
      reason: "A kingdom needs a capital. Hold at least one fief first.",
    };
  }
  if (terms.influence < FOUND_KINGDOM_INFLUENCE_COST) {
    return {
      ok: false,
      reason: `Proclaiming a kingdom costs ${FOUND_KINGDOM_INFLUENCE_COST} influence (have ${Math.floor(terms.influence)}).`,
    };
  }
  if (!terms.kingdomName.trim()) {
    return { ok: false, reason: "Give the new realm a name." };
  }
  return { ok: true, reason: "" };
}

/**
 * Found the kingdom. The capital is the first fief; the former kingdom
 * declares war when you kept their land on the way out.
 */
export function foundKingdom(terms: FoundKingdomTerms): FoundKingdomResult {
  const check = canFoundKingdom(terms);
  if (!check.ok) return check;

  const capital = terms.fiefs[0]!;
  const warWithFormer =
    !!terms.formerKingdom && terms.keptFiefsOnDefection;
  const line = warWithFormer
    ? `${terms.clanName} raises the banner of ${terms.kingdomName} over ${capital}. ${terms.formerKingdom} calls it treason and declares war — they want their land back.`
    : `${terms.clanName} raises the banner of ${terms.kingdomName} over ${capital}. A new power in the land; the old kings will be watching.`;
  return {
    ok: true,
    kingdomName: terms.kingdomName.trim(),
    capital,
    warWithFormer,
    influenceSpent: FOUND_KINGDOM_INFLUENCE_COST,
    line,
  };
}

export interface VassalOffer {
  clanName: string;
  /** 0..100 relationship with the clan's leader. */
  relation: number;
  /** 0..100. Higher = more likely to bend the knee. */
  persuasionRoll: number;
  /** Renown of the new kingdom (legitimacy). */
  kingdomRenown: number;
}

/**
 * Recruit a vassal clan to the new kingdom. Bannerlord's version is a
 * persuasion minigame; this is the single-roll resolution: relation +
 * kingdom legitimacy vs their pride.
 */
export function recruitVassal(offer: VassalOffer): { ok: boolean; line: string } {
  const score = offer.relation * 0.5 + offer.kingdomRenown * 0.02 + offer.persuasionRoll * 0.5;
  if (score >= 60) {
    return {
      ok: true,
      line: `${offer.clanName} bends the knee and rides under your banner.`,
    };
  }
  return {
    ok: false,
    line: `${offer.clanName} refuses — "Call us when your kingdom is more than a name." (needed 60, got ${Math.round(score)})`,
  };
}
