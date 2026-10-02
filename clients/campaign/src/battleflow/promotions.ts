/**
 * Promotion ceremony (Rowan solo task 46).
 *
 * After a battle, units that earned enough XP are promoted: the ceremony
 * presents each promotion with the soldier's old and new rank, in order
 * of seniority. Pure and deterministic.
 */

export const RANKS = [
  "Recruit",
  "Soldier",
  "Veteran",
  "Elite",
  "Champion",
] as const;

export type Rank = (typeof RANKS)[number];

export interface PromotionCandidate {
  unitId: string;
  name: string;
  kind: string;
  rank: Rank;
  /** XP earned this battle. */
  xp: number;
}

/** XP needed to rise from a rank to the next. */
export function xpForNextRank(rank: Rank): number | null {
  const idx = RANKS.indexOf(rank);
  if (idx < 0 || idx >= RANKS.length - 1) return null;
  return (idx + 1) * 100;
}

export interface Promotion {
  unitId: string;
  name: string;
  kind: string;
  from: Rank;
  to: Rank;
  line: string;
}

/**
 * Run the promotion ceremony: every candidate with enough XP for their
 * next rank is promoted (one rank per ceremony). Presented most senior
 * first.
 */
export function promotionCeremony(candidates: PromotionCandidate[]): Promotion[] {
  const seniority = (r: Rank): number => RANKS.indexOf(r);
  return candidates
    .filter((c) => {
      const need = xpForNextRank(c.rank);
      return need !== null && c.xp >= need;
    })
    .map((c) => {
      const to = RANKS[RANKS.indexOf(c.rank) + 1]!;
      return {
        unitId: c.unitId,
        name: c.name,
        kind: c.kind,
        from: c.rank,
        to,
        line: `${c.name} (${c.kind}) rises from ${c.rank} to ${to}.`,
      };
    })
    .sort((a, b) => seniority(b.to) - seniority(a.to));
}
