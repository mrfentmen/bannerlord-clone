/**
 * Mercenary contracts, ported from Bannerlord.
 *
 * In Bannerlord you can serve a kingdom as a mercenary without swearing
 * fealty: you fight their enemies, get paid per victory plus a daily
 * retainer, and walk away when the contract ends. No fiefs, no votes,
 * no permanent ties — but breaking a contract early burns relations.
 */

export interface MercenaryContract {
  factionId: string;
  factionName: string;
  /** Days remaining on the contract. */
  daysLeft: number;
  /** Gold per victorious battle fought for the faction. */
  payPerVictory: number;
  /** Daily retainer. */
  dailyPay: number;
  /** Renown required to sign. */
  renownRequired: number;
}

export interface ContractTerms {
  factionId: string;
  factionName: string;
  days: number;
  payPerVictory: number;
  dailyPay: number;
  renownRequired: number;
}

/** Standard contract terms scale with faction wealth. */
export function contractTerms(
  factionId: string,
  factionName: string,
  factionWealth: number, // 0..10
): ContractTerms {
  return {
    factionId,
    factionName,
    days: 30,
    payPerVictory: Math.round(150 + factionWealth * 60),
    dailyPay: Math.round(8 + factionWealth * 4),
    renownRequired: 50,
  };
}

export type ContractResult =
  | { ok: true; contract: MercenaryContract }
  | { ok: false; reason: string };

/** Sign a mercenary contract. Requires the renown, and no active contract. */
export function signContract(
  terms: ContractTerms,
  renown: number,
  activeContract: MercenaryContract | null,
): ContractResult {
  if (activeContract) {
    return { ok: false, reason: `Already under contract to ${activeContract.factionName}.` };
  }
  if (renown < terms.renownRequired) {
    return {
      ok: false,
      reason: `${terms.factionName} wants ${terms.renownRequired} renown; you have ${Math.round(renown)}.`,
    };
  }
  return {
    ok: true,
    contract: {
      factionId: terms.factionId,
      factionName: terms.factionName,
      daysLeft: terms.days,
      payPerVictory: terms.payPerVictory,
      dailyPay: terms.dailyPay,
      renownRequired: terms.renownRequired,
    },
  };
}

/** One day passes: retainer accrues, contract ticks down. */
export function tickContract(
  contract: MercenaryContract,
): { contract: MercenaryContract | null; pay: number; expired: boolean } {
  const pay = contract.dailyPay;
  const daysLeft = contract.daysLeft - 1;
  if (daysLeft <= 0) {
    return { contract: null, pay, expired: true };
  }
  return { contract: { ...contract, daysLeft }, pay, expired: false };
}

/**
 * Breaking a contract early: you keep what you earned, but the faction
 * remembers. Returns the relation penalty.
 */
export function breakContract(contract: MercenaryContract): { relationPenalty: number; line: string } {
  return {
    relationPenalty: -15,
    line: `You broke your contract with ${contract.factionName}. Word travels fast — ${contract.daysLeft} days left unpaid.`,
  };
}
