/**
 * Trade agreement proposals (Rowan solo task 76).
 *
 * Propose a trade deal to a town: you offer coin and/or a price discount,
 * asking for tariff relief and priority market access. The town AI
 * responds — accepts, counter-offers, or refuses — based on relationship
 * and how generous the deal is. Deterministic from a seed.
 */

export interface TradeProposal {
  id: string;
  townId: string;
  townName: string;
  /** 0..100 standing with the town. */
  relationship: number;
  /** Coin offered up front. */
  offer: number;
  /** Discount % you offer on your goods (0..50). */
  discount: number;
  /** Tariff relief % you ask for (0..50). */
  tariffAsk: number;
  /** Priority market access requested. */
  priorityAccess: boolean;
}

export type TownDecision = "accepted" | "countered" | "refused";

export interface TradeAgreement {
  townId: string;
  townName: string;
  decision: TownDecision;
  /** The deal as agreed (may differ from the proposal on counter). */
  tariffRelief: number;
  priorityAccess: boolean;
  yourCost: number;
  line: string;
}

/** Validate and register a proposal. */
export function proposeTradeDeal(
  townId: string,
  townName: string,
  relationship: number,
  offer: number,
  discount: number,
  tariffAsk: number,
  priorityAccess: boolean,
): TradeProposal {
  if (offer < 0) throw new Error("offer must be non-negative");
  if (discount < 0 || discount > 50) throw new Error("discount must be 0..50");
  if (tariffAsk < 0 || tariffAsk > 50) throw new Error("tariff ask must be 0..50");
  return {
    id: `deal-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    townId,
    townName,
    relationship: Math.max(0, Math.min(100, relationship)),
    offer,
    discount,
    tariffAsk,
    priorityAccess,
  };
}

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function draw(seed: number): number {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97);
  return ((s ^ (s >>> 15)) >>> 0) / 4294967296;
}

/**
 * The town AI answers. Goodwill = relationship + offer value + discount
 * generosity − greed of the ask. Deterministic from proposal + seed.
 */
export function answerProposal(proposal: TradeProposal, seed: number): TradeAgreement {
  const greed = proposal.tariffAsk + (proposal.priorityAccess ? 15 : 0);
  const generosity = proposal.offer / 50 + proposal.discount * 2;
  const goodwill = proposal.relationship * 0.6 + generosity - greed + draw(hash(proposal.id) ^ (seed >>> 0)) * 20;
  if (goodwill >= 55) {
    return {
      townId: proposal.townId,
      townName: proposal.townName,
      decision: "accepted",
      tariffRelief: proposal.tariffAsk,
      priorityAccess: proposal.priorityAccess,
      yourCost: proposal.offer,
      line: `${proposal.townName} accepts the deal: ${proposal.tariffAsk}% tariff relief${proposal.priorityAccess ? " and priority market access" : ""}.`,
    };
  }
  if (goodwill >= 30) {
    const relief = Math.max(0, Math.floor(proposal.tariffAsk / 2));
    return {
      townId: proposal.townId,
      townName: proposal.townName,
      decision: "countered",
      tariffRelief: relief,
      priorityAccess: false,
      yourCost: proposal.offer,
      line: `${proposal.townName} counters: ${relief}% tariff relief, no priority access. Take it or leave it.`,
    };
  }
  return {
    townId: proposal.townId,
    townName: proposal.townName,
    decision: "refused",
    tariffRelief: 0,
    priorityAccess: false,
    yourCost: 0,
    line: `${proposal.townName} refuses the deal outright.`,
  };
}
