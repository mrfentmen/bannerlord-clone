/**
 * MVP unit citation (Rowan solo task 42).
 *
 * Names the battle's top performer from per-unit stats. Score weights
 * kills most, then damage dealt, then holding the line (survival rate).
 * The citation is a one-line honor the after-action screen can print.
 */

export interface UnitPerformance {
  unitId: string;
  name: string;
  kind: string;
  kills: number;
  damageDealt: number;
  started: number;
  ended: number;
}

export interface MvpCitation {
  name: string;
  kind: string;
  kills: number;
  damageDealt: number;
  survivalRate: number;
  score: number;
  citation: string;
}

function survivalRate(p: UnitPerformance): number {
  return p.started > 0 ? p.ended / p.started : 0;
}

/** Weighted score: kills dominate, damage and survival break ties. */
export function mvpScore(p: UnitPerformance): number {
  return p.kills * 10 + p.damageDealt / 100 + survivalRate(p) * 5;
}

/** Pick the MVP. Returns null when no unit has any record. */
export function citeMvp(units: UnitPerformance[]): MvpCitation | null {
  const scored = units
    .filter((u) => u.kills > 0 || u.damageDealt > 0)
    .map((u) => ({ u, score: mvpScore(u) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top) return null;
  const { u, score } = top;
  const rate = survivalRate(u);
  return {
    name: u.name,
    kind: u.kind,
    kills: u.kills,
    damageDealt: Math.round(u.damageDealt),
    survivalRate: rate,
    score,
    citation: `${u.name} (${u.kind}) cited for valor: ${u.kills} kills, ${Math.round(u.damageDealt)} damage dealt, ${Math.round(rate * 100)}% survived.`,
  };
}
