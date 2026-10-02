/**
 * Task 108: smuggling. Run contraband past the town watch: profit scales
 * with volume and heat, and getting caught means a fine plus a reputation
 * hit (the task's acceptance).
 */

export interface SmugglingPlan {
  good: string;
  volume: number;
  /** 0..100 watch heat on the route. */
  heat: number;
  /** 0..1 chance of getting caught. */
  detectionOdds: number;
  /** Profit if the run lands. */
  profit: number;
}

/** Detection rises with heat and volume; profit rises with volume. */
export function planSmuggling(good: string, volume: number, heat: number): SmugglingPlan {
  const v = Math.max(1, Math.round(volume));
  const h = Math.min(100, Math.max(0, heat));
  const detectionOdds = Math.min(0.95, 0.05 + (h / 100) * 0.5 + Math.min(0.3, v / 1000));
  return { good, volume: v, heat: h, detectionOdds, profit: v * 4 };
}

export type SmugglingOutcome =
  | { caught: false; profit: number }
  | { caught: true; fine: number; repLoss: number };

/** Resolve the run. `roll` 0..1 under the odds = caught. */
export function resolveSmuggling(plan: SmugglingPlan, roll: () => number): SmugglingOutcome {
  if (roll() < plan.detectionOdds) {
    return {
      caught: true,
      fine: Math.round(plan.profit * 1.5),
      repLoss: 10 + Math.round(plan.heat / 10),
    };
  }
  return { caught: false, profit: plan.profit };
}
