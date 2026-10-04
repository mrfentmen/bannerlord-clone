/**
 * Ransom brokers, ported from Bannerlord's ransom broker NPCs.
 *
 * Not every prisoner is worth the wait for their family to pay up.
 * Brokers in the larger towns buy captives outright — no questions, no
 * waiting, but at a steep discount to the ransom value. Fast gold now vs.
 * full gold later is the trade.
 */

export interface BrokerTerms {
  /** Total ransom value of the prisoners being sold. */
  ransomValue: number;
  /** Town prosperity 0..100: richer towns have brokers with deeper pockets. */
  townProsperity: number;
}

/**
 * Fraction of ransom value a broker pays: 55% base, up to 70% in a
 * booming town. Never a good deal — always a fast one.
 */
export function brokerRate(townProsperity: number): number {
  return 0.55 + Math.max(0, Math.min(100, townProsperity)) * 0.0015;
}

/** Gold a broker pays for prisoners worth this ransom value. */
export function brokerOffer(terms: BrokerTerms): number {
  return Math.floor(terms.ransomValue * brokerRate(terms.townProsperity));
}

export interface BrokerDeal {
  gold: number;
  rate: number;
  line: string;
}

/** Sell prisoners to a broker. Instant gold, no relation effects. */
export function sellToBroker(townName: string, prisonerDesc: string, terms: BrokerTerms): BrokerDeal {
  const rate = brokerRate(terms.townProsperity);
  const gold = brokerOffer(terms);
  return {
    gold,
    rate,
    line: `The broker in ${townName} takes the ${prisonerDesc} for ${gold} gold (${Math.round(rate * 100)}% of ransom value). No questions asked.`,
  };
}
