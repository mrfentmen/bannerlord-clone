/**
 * Tasks 92-93: war council and peace treaties.
 *
 * War council: vassals vote on a war plan with weights; a weighted majority
 * carries the plan. The declaration itself is the campaign layer's.
 *
 * Peace treaty: the builder assembles terms (reparations, border
 * concessions, duration, prisoner exchange). The returned terms are a
 * contract for the sim to enforce — this module never touches the sim.
 */

import type { TreatyTerms, VassalVote, WarPlan } from "./types.js";

export interface WarCouncilResult {
  plan: WarPlan;
  votes: VassalVote[];
  forWeight: number;
  againstWeight: number;
  carried: boolean;
}

export function holdWarCouncil(plan: WarPlan, votes: VassalVote[]): WarCouncilResult {
  if (votes.length === 0) throw new Error("war council needs vassal votes");
  let forWeight = 0;
  let againstWeight = 0;
  for (const v of votes) {
    if (v.inFavor) forWeight += v.weight;
    else againstWeight += v.weight;
  }
  return { plan, votes, forWeight, againstWeight, carried: forWeight > againstWeight };
}

export interface TreatyDraft {
  parties: [string, string];
  reparations: number;
  borderConcessions: string[];
  durationSeasons: number;
  prisonerExchange: boolean;
}

export function buildTreaty(draft: TreatyDraft): TreatyTerms {
  if (draft.parties[0] === draft.parties[1]) {
    throw new Error("a treaty needs two distinct parties");
  }
  if (draft.reparations < 0) throw new Error("reparations cannot be negative");
  if (draft.durationSeasons < 1) throw new Error("treaty must last at least one season");
  return { ...draft, borderConcessions: [...draft.borderConcessions] };
}

/** One-line summary for the treaty list UI. */
export function treatySummary(terms: TreatyTerms): string {
  const [a, b] = terms.parties;
  const parts = [`${a}–${b} peace`, `${terms.durationSeasons} seasons`];
  if (terms.reparations > 0) parts.push(`${terms.reparations} coin reparations`);
  if (terms.borderConcessions.length > 0) parts.push(`${terms.borderConcessions.length} border concessions`);
  if (terms.prisonerExchange) parts.push("prisoner exchange");
  return parts.join(" · ");
}
