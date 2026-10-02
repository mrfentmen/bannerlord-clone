/**
 * Task 110: notable relationship panel. Lists the notables the campaign
 * knows about with their relationship scores, over an injected source —
 * the data comes from Hana's notables wire when present; the panel never
 * invents notables (empty source = honest empty state).
 */

export interface NotableRelation {
  id: string;
  name: string;
  townId: string;
  /** -100..100. */
  relation: number;
  title?: string;
}

export type NotableSource = () => NotableRelation[];

/** Best relations first, for the panel. */
export function sortNotables(source: NotableSource): NotableRelation[] {
  return [...source()].sort((a, b) => b.relation - a.relation);
}

export function relationBand(relation: number): "hostile" | "cold" | "neutral" | "warm" | "allied" {
  if (relation <= -50) return "hostile";
  if (relation < 0) return "cold";
  if (relation < 30) return "neutral";
  if (relation < 70) return "warm";
  return "allied";
}
