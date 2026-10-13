/**
 * The influence economy, ported from Bannerlord's second currency.
 *
 * Influence existed as a number that only went down (founding a kingdom).
 * Bannerlord's loop is a loop: earn it leading armies and winning the
 * realm's games, spend it bending the realm to your will. Gains and costs
 * here are the client's side of that loop.
 */

export type InfluenceGainSource =
  | "battle-victory"
  | "tournament-win"
  | "quest-complete"
  | "release-lord"
  | "policy-vote"
  | "siege-victory";

const GAINS: Record<InfluenceGainSource, { min: number; max: number }> = {
  "battle-victory": { min: 4, max: 10 },
  "tournament-win": { min: 8, max: 12 },
  "quest-complete": { min: 5, max: 9 },
  "release-lord": { min: 10, max: 15 },
  "policy-vote": { min: 2, max: 4 },
  "siege-victory": { min: 12, max: 20 },
};

/** Influence earned for a deed. Renown multiplies it — the famous are heard. */
export function influenceGain(source: InfluenceGainSource, renown: number, roll: () => number): number {
  const range = GAINS[source];
  const base = range.min + roll() * (range.max - range.min);
  const renownMult = 1 + Math.min(100, Math.max(0, renown)) / 200;
  return Math.round(base * renownMult);
}

export type InfluenceSpendAction =
  | "muster-army"
  | "call-vote"
  | "bribe-lord"
  | "recruit-vassal"
  | "force-policy";

export const INFLUENCE_COSTS: Record<InfluenceSpendAction, number> = {
  "muster-army": 30,
  "call-vote": 20,
  "bribe-lord": 25,
  "recruit-vassal": 50,
  "force-policy": 40,
};

const SPEND_LINES: Record<InfluenceSpendAction, string> = {
  "muster-army": "The banners answer. An army musters under your command.",
  "call-vote": "The council convenes at your word.",
  "bribe-lord": "Gold and promises change a lord's mind.",
  "recruit-vassal": "A lord kneels and swears to your cause.",
  "force-policy": "The policy passes — none dare gainsay the vote.",
};

export type SpendResult = { ok: true; spent: number; line: string } | { ok: false; reason: string };

/** Spend influence on a realm action. */
export function spendInfluence(action: InfluenceSpendAction, have: number): SpendResult {
  const cost = INFLUENCE_COSTS[action];
  if (have < cost) {
    return { ok: false, reason: `Needs ${cost} influence (have ${Math.floor(have)}).` };
  }
  return { ok: true, spent: cost, line: SPEND_LINES[action] };
}
