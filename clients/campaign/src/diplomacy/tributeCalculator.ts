/**
 * Tribute calculator (Rowan solo task 86).
 *
 * Suggest a tribute from the power differential: the weaker side pays,
 * and the amount scales with how outmatched they are. The stronger side
 * can demand; the weaker side can offer to buy peace. Pure model.
 */

export interface TributeSuggestion {
  /** Who should pay. */
  payer: "you" | "them";
  /** Suggested seasonal tribute. */
  amount: number;
  /** 0..1 how outmatched the weaker side is. */
  powerGap: number;
  line: string;
}

/**
 * Suggest tribute. `yourPower` and `theirPower` are composite scores;
 * `yourIncome` scales the coin amounts. Deterministic.
 */
export function suggestTribute(yourPower: number, theirPower: number, yourIncome: number): TributeSuggestion {
  if (yourPower < 0 || theirPower < 0) throw new Error("power scores must be non-negative");
  if (yourIncome <= 0) throw new Error("income must be positive");
  const total = yourPower + theirPower;
  if (total === 0) {
    return {
      payer: "them",
      amount: 0,
      powerGap: 0,
      line: "Neither side fields an army — no tribute is owed.",
    };
  }
  const yourShare = yourPower / total;
  const powerGap = Math.round(Math.abs(yourShare - 0.5) * 2 * 100) / 100;
  if (Math.abs(yourShare - 0.5) < 0.1) {
    return {
      payer: "them",
      amount: 0,
      powerGap,
      line: "Powers are balanced — neither side can demand tribute.",
    };
  }
  const strongerIncome = yourShare > 0.5 ? yourIncome : yourIncome * (theirPower / Math.max(1, yourPower));
  const amount = Math.round(strongerIncome * 0.15 * powerGap);
  if (yourShare > 0.5) {
    return {
      payer: "them",
      amount,
      powerGap,
      line: `You are the stronger power (${Math.round(yourShare * 100)}% of combined strength). Demand ${amount}/season in tribute.`,
    };
  }
  return {
    payer: "you",
    amount,
    powerGap,
    line: `They are the stronger power (${Math.round((1 - yourShare) * 100)}% of combined strength). Offer ${amount}/season in tribute to buy peace.`,
  };
}
