/**
 * Pre-battle scouting report (Rowan solo task 21).
 *
 * The encounter API gives troops and power per side — no unit breakdown.
 * The scouting report turns those two numbers into an honest ESTIMATE of
 * enemy composition: power-per-troop implies quality (cavalry and elites
 * cost more power per head), and the report always carries its confidence
 * so the player knows it is an estimate, not intel.
 */

export type ScoutUnitKind = "infantry" | "archers" | "cavalry";

export interface ScoutEstimate {
  kind: ScoutUnitKind;
  /** Estimated headcount. */
  count: number;
  /** Share of the enemy force, 0..1. */
  share: number;
}

export type ScoutConfidence = "low" | "medium" | "high";

export interface ScoutingReport {
  estimates: ScoutEstimate[];
  confidence: ScoutConfidence;
  /** Human-readable summary, e.g. "Mostly infantry, some cavalry". */
  summary: string;
  note: string;
}

/**
 * Estimate enemy composition from troop count and aggregate power.
 * Heuristic: power-per-troop above 1.2 suggests cavalry weight, below 0.8
 * suggests levy infantry. Deterministic — same inputs, same report.
 */
export function scoutEnemy(troops: number, power: number): ScoutingReport {
  const safeTroops = Math.max(1, Math.floor(troops));
  const ppt = Math.max(0, power / safeTroops); // power per troop
  // Cavalry share rises with power-per-troop; archers stay roughly flat.
  const cavalryShare = clamp01((ppt - 0.7) / 1.1) * 0.45;
  const archerShare = 0.22 + clamp01((ppt - 0.9) / 2) * 0.08;
  const infantryShare = Math.max(0.05, 1 - cavalryShare - archerShare);

  const estimates: ScoutEstimate[] = [
    { kind: "infantry", count: Math.round(safeTroops * infantryShare), share: infantryShare },
    { kind: "archers", count: Math.round(safeTroops * archerShare), share: archerShare },
    { kind: "cavalry", count: Math.round(safeTroops * cavalryShare), share: cavalryShare },
  ];
  const confidence: ScoutConfidence = safeTroops >= 100 ? "high" : safeTroops >= 30 ? "medium" : "low";
  const dominant = estimates.reduce((a, b) => (a.share >= b.share ? a : b));
  const summary = `${cap(dominant.kind)}-heavy force of ~${safeTroops} troops`;
  return {
    estimates,
    confidence,
    summary,
    note: `Estimate only (${confidence} confidence) — scouts count banners, not men.`,
  };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
