/**
 * Task 77: marriage alliances. Odds are computed from relation standing,
 * dowry value, rank difference, and clan marriage policy — and shown BEFORE
 * proposing. `propose()` resolves the stored odds with the caller's RNG so
 * tests stay deterministic.
 */

import type { ClanLaws, ClanMember, DowryOffer, MarriageProposal } from "./types.js";

export interface MarriageContext {
  /** -100..100 standing between the two clans. */
  relation: number;
  /** 0..3 rank steps the suitor is above/below the target's house. */
  rankDelta: number;
  laws: ClanLaws;
}

function dowryValue(dowry: DowryOffer): number {
  return dowry.coin + dowry.land.length * 500;
}

/** 0..1 acceptance odds. Pure — safe to call for preview. */
export function marriageOdds(
  suitor: ClanMember,
  target: ClanMember,
  dowry: DowryOffer,
  ctx: MarriageContext,
): number {
  void suitor;
  void target;
  let odds = 0.5 + ctx.relation / 200 - ctx.rankDelta * 0.08;
  odds += Math.min(0.3, dowryValue(dowry) / 10000);
  if (ctx.laws.marriagePolicy === "alliance-first") odds += 0.05;
  if (ctx.laws.marriagePolicy === "dowry-first") odds += Math.min(0.15, dowryValue(dowry) / 20000);
  return Math.min(0.97, Math.max(0.03, odds));
}

export function draftProposal(
  suitor: ClanMember,
  target: ClanMember,
  dowry: DowryOffer,
  ctx: MarriageContext,
): MarriageProposal {
  return {
    suitorId: suitor.id,
    targetId: target.id,
    dowry,
    odds: marriageOdds(suitor, target, dowry, ctx),
  };
}

/** Resolve a proposal; rng defaults to Math.random. */
export function propose(proposal: MarriageProposal, rng: () => number = Math.random): boolean {
  return rng() < proposal.odds;
}
