/**
 * Peace concessions sliders (Rowan solo task 84).
 *
 * Slide your offer and demands for a peace deal: coin paid, towns ceded,
 * tribute promised — against what you demand. The AI shows acceptance
 * odds live as you slide, computed from war score, weariness, and the
 * generosity of the terms. Pure model.
 */

export interface PeaceTerms {
  /** Coin you pay (0+). */
  coinOffered: number;
  /** Towns you cede (0+). */
  townsCeded: number;
  /** Seasonal tribute you promise (0+). */
  tributePromised: number;
  /** Coin you demand (0+). */
  coinDemanded: number;
  /** Towns you demand (0+). */
  townsDemanded: number;
}

export interface PeaceNegotiation {
  enemyName: string;
  /** -100..100, positive means you are winning. */
  warScore: number;
  /** 0..100 their war weariness. */
  theirWeariness: number;
  terms: PeaceTerms;
  /** 0..1 chance they accept these exact terms. */
  acceptanceOdds: number;
  line: string;
}

/**
 * Acceptance odds for the terms. Winning the war and their exhaustion
 * help; greedy demands hurt; generous offers help. Deterministic.
 */
export function acceptanceOdds(terms: PeaceTerms, warScore: number, theirWeariness: number): number {
  for (const [k, v] of Object.entries(terms)) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`peace term ${k} must be non-negative`);
  }
  const generosity = terms.coinOffered / 1000 + terms.townsCeded * 8 + terms.tributePromised / 200;
  const greed = terms.coinDemanded / 1000 + terms.townsDemanded * 8;
  const score = 0.35 + generosity * 0.06 - greed * 0.08 + warScore / 400 + theirWeariness / 400;
  return Math.max(0.02, Math.min(0.98, Math.round(score * 100) / 100));
}

/** Build a negotiation view: terms plus live odds. */
export function negotiatePeace(enemyName: string, warScore: number, theirWeariness: number, terms: PeaceTerms): PeaceNegotiation {
  const odds = acceptanceOdds(terms, warScore, theirWeariness);
  const line =
    odds >= 0.7
      ? `${enemyName} will likely accept (${Math.round(odds * 100)}%). Send the envoy.`
      : odds >= 0.4
        ? `${enemyName} might accept (${Math.round(odds * 100)}%) — sweeten the offer or press the war.`
        : `${enemyName} will refuse (${Math.round(odds * 100)}%). Your terms insult them.`;
  return { enemyName, warScore, theirWeariness, terms: { ...terms }, acceptanceOdds: odds, line };
}

export const EMPTY_PEACE_TERMS: PeaceTerms = {
  coinOffered: 0,
  townsCeded: 0,
  tributePromised: 0,
  coinDemanded: 0,
  townsDemanded: 0,
};
