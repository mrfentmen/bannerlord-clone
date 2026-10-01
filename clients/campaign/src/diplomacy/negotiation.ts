/**
 * Tasks 110-112: alliance negotiation, non-aggression pacts, vassalage.
 *
 * Negotiation runs in rounds: each side makes an offer, and the
 * counter-offer generator moves the demand toward the middle by a
 * concession step. Rounds are data — the campaign layer's AI decides the
 * actual concession per round; this module computes the structure and the
 * accept odds shown beforehand.
 *
 * Pacts track terms and expiry; violation detection flags a pact the moment
 * a hostile act between the parties is reported.
 *
 * Vassalage terms are built by offer/accept: the overlord proposes, the
 * candidate's acceptance odds show before the offer is sent.
 */

import type { AllianceOffer, NonAggressionPact, VassalageTerms } from "./types.js";

export interface NegotiationRound {
  round: number;
  offer: AllianceOffer;
  counter: AllianceOffer;
  /** 0..1 chance the other side accepts the current offer as-is. */
  acceptOdds: number;
}

/** Accept odds from relation, demand, and reputation. Shown before offering. */
export function allianceAcceptOdds(relation: number, demand: number, reputation: number): number {
  const odds = 0.5 + relation / 200 - demand / 200 + reputation / 400;
  return Math.min(0.97, Math.max(0.03, odds));
}

/** Build the counter-offer: demand moves toward the middle by concession. */
export function counterOffer(offer: AllianceOffer, concession: number): AllianceOffer {
  const middle = 50;
  const demand = offer.demand + Math.sign(middle - offer.demand) * Math.min(concession, Math.abs(middle - offer.demand));
  return { from: offer.to, to: offer.from, terms: [...offer.terms], demand };
}

export function negotiateRound(
  offer: AllianceOffer,
  round: number,
  relation: number,
  reputation: number,
  concession: number,
): NegotiationRound {
  return {
    round,
    offer,
    counter: counterOffer(offer, concession),
    acceptOdds: allianceAcceptOdds(relation, offer.demand, reputation),
  };
}

// --- Non-aggression pacts ---

export function signPact(parties: [string, string], seasons: number, terms: string[]): NonAggressionPact {
  if (parties[0] === parties[1]) throw new Error("a pact needs two distinct parties");
  if (seasons < 1) throw new Error("a pact must last at least one season");
  return { parties, seasonsLeft: seasons, terms: [...terms], violated: false };
}

export function tickPact(pact: NonAggressionPact): NonAggressionPact {
  return { ...pact, seasonsLeft: Math.max(0, pact.seasonsLeft - 1) };
}

/** Report a hostile act; if it is between the parties, the pact is violated. */
export function reportHostileAct(pact: NonAggressionPact, attacker: string, defender: string): NonAggressionPact {
  const [a, b] = pact.parties;
  const between = (attacker === a && defender === b) || (attacker === b && defender === a);
  return between ? { ...pact, violated: true } : pact;
}

// --- Vassalage ---

export function proposeVassalage(
  overlord: string,
  vassal: string,
  tributePerSeason: number,
  militaryObligation: number,
  autonomy: number,
): { terms: VassalageTerms; acceptOdds: number } {
  if (autonomy < 0 || autonomy > 100) throw new Error("autonomy must be 0..100");
  const terms: VassalageTerms = { overlord, vassal, tributePerSeason, militaryObligation, autonomy };
  // Heavy tribute and low autonomy make acceptance unlikely; high autonomy helps.
  const acceptOdds = Math.min(
    0.95,
    Math.max(0.05, 0.6 - tributePerSeason / 2000 + autonomy / 200 - militaryObligation / 500),
  );
  return { terms, acceptOdds };
}
