/**
 * Barter, ported from Bannerlord's negotiation screen.
 *
 * Bannerlord resolves deals — peace, tribute, prisoner swaps — as an
 * exchange of value: gold, goods, prisoners, and terms on a scale until
 * both sides accept. This is the valuation engine: everything offered has
 * a price, and the deal closes when the gap is bridged.
 */

export interface BarterOffer {
  /** Gold offered (positive = you give, negative = you demand). */
  gold: number;
  /** Goods: goodId -> quantity offered. */
  goods: Record<string, number>;
  /** Prisoners offered: count. */
  prisoners: number;
  /** Daily tribute offered (positive = you pay). */
  dailyTribute: number;
  tributeDays: number;
}

export interface BarterTerms {
  /** What acceptance requires: the value both sides agree on. */
  demandValue: number;
  /** Good prices for valuation. */
  prices: Record<string, number>;
  /** Value of one prisoner. */
  prisonerValue: number;
}

/** Value your offer in gold-equivalent. */
export function offerValue(offer: BarterOffer, terms: BarterTerms): number {
  let value = offer.gold;
  for (const [goodId, qty] of Object.entries(offer.goods)) {
    value += (terms.prices[goodId] ?? 0) * qty;
  }
  value += offer.prisoners * terms.prisonerValue;
  value += offer.dailyTribute * offer.tributeDays;
  return value;
}

export interface BarterResult {
  accepted: boolean;
  /** How far short (positive) or over (negative) the offer fell. */
  gap: number;
  line: string;
}

/**
 * Present an offer. Accepted when its value meets the demand; near-misses
 * get a counter-hint instead of a flat refusal.
 */
export function barter(offer: BarterOffer, terms: BarterTerms): BarterResult {
  const value = offerValue(offer, terms);
  const gap = terms.demandValue - value;
  if (gap <= 0) {
    return {
      accepted: true,
      gap,
      line: gap < -terms.demandValue * 0.2
        ? "They accept quickly — perhaps too quickly. You overpaid."
        : "They weigh the offer, nod once. Deal.",
    };
  }
  if (gap < terms.demandValue * 0.25) {
    return {
      accepted: false,
      gap,
      line: `Close. They want about ${Math.ceil(gap)} more in value.`,
    };
  }
  return {
    accepted: false,
    gap,
    line: `They laugh. You're ${Math.ceil(gap)} short of serious.`,
  };
}
