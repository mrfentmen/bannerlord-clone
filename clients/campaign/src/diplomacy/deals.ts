/**
 * Task 109: diplomacy screen (deal registry). One place that lists every
 * active deal — alliances, pacts, tributes, trade terms — with parties,
 * terms, and expiry. Expired deals drop off the active list automatically.
 */

export type DealKind = "alliance" | "pact" | "tribute" | "trade";

export interface Deal {
  id: string;
  kind: DealKind;
  parties: [string, string];
  terms: string[];
  /** Campaign day the deal expires. */
  expiryDay: number;
  signedDay: number;
}

let nextDeal = 1;

export function signDeal(
  kind: DealKind,
  parties: [string, string],
  terms: string[],
  expiryDay: number,
  signedDay: number,
): Deal {
  return { id: `deal-${nextDeal++}`, kind, parties, terms: [...terms], expiryDay, signedDay };
}

/** Deals still in force on `day`, soonest expiry first. */
export function activeDeals(deals: Deal[], day: number): Deal[] {
  return deals
    .filter((d) => d.expiryDay > day)
    .sort((a, b) => a.expiryDay - b.expiryDay);
}

/** Days remaining on a deal (negative when expired). */
export function daysLeft(deal: Deal, day: number): number {
  return deal.expiryDay - day;
}
