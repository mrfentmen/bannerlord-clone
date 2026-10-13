/**
 * Great power ranking (Rowan solo task 90).
 *
 * Rank clans by a composite power score: troops, towns, treasury, and
 * reputation — weighted into one number. Ranks, gaps to the leader, and
 * a one-line verdict per clan. Pure model.
 */

export interface ClanPower {
  clanId: string;
  clanName: string;
  /** Soldiers under arms. */
  troops: number;
  /** Towns held. */
  towns: number;
  /** Treasury coin. */
  treasury: number;
  /** 0..100 diplomatic reputation. */
  reputation: number;
}

export interface PowerRank {
  rank: number;
  clanId: string;
  clanName: string;
  score: number;
  /** Points behind the leader. */
  gapToLeader: number;
  verdict: string;
}

/** Composite score: troops + towns*500 + treasury/10 + reputation*20. */
export function powerScore(clan: ClanPower): number {
  if (clan.troops < 0 || clan.towns < 0 || clan.treasury < 0) {
    throw new Error("power inputs must be non-negative");
  }
  return Math.round(
    clan.troops + clan.towns * 500 + clan.treasury / 10 + Math.max(0, Math.min(100, clan.reputation)) * 20,
  );
}

function verdict(rank: number, gapToLeader: number): string {
  if (rank === 1) return "The great power. Everyone else schemes against them.";
  if (gapToLeader < 2000) return "A contender — within striking distance of the top.";
  if (gapToLeader < 8000) return "A middling power. Relevant, not feared.";
  return "A minor clan. Prey, unless clever.";
}

/** Rank clans best-first by composite power. */
export function rankGreatPowers(clans: ClanPower[]): PowerRank[] {
  const scored = clans.map((c) => ({ clan: c, score: powerScore(c) }));
  scored.sort((a, b) => b.score - a.score);
  const leader = scored[0]?.score ?? 0;
  return scored.map((s, i) => ({
    rank: i + 1,
    clanId: s.clan.clanId,
    clanName: s.clan.clanName,
    score: s.score,
    gapToLeader: leader - s.score,
    verdict: verdict(i + 1, leader - s.score),
  }));
}
