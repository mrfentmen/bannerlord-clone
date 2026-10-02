/**
 * Task 112: supply convoy planner. Plan a convoy — guards cost coin, more
 * guards cut the ambush odds — then resolve it: the convoy arrives with
 * its cargo, or it gets ambushed (the task's acceptance) and the cargo is
 * lost.
 */

export interface ConvoyPlan {
  from: string;
  to: string;
  cargoValue: number;
  guards: number;
  /** 0..1 chance of ambush. */
  ambushOdds: number;
  guardCost: number;
}

export function planConvoy(from: string, to: string, cargoValue: number, guards: number): ConvoyPlan {
  const g = Math.max(0, Math.round(guards));
  const guardCost = g * 15;
  const ambushOdds = Math.min(0.9, Math.max(0.05, 0.45 - g * 0.06));
  return { from, to, cargoValue: Math.max(0, Math.round(cargoValue)), guards: g, ambushOdds, guardCost };
}

export type ConvoyOutcome =
  | { fate: "arrived"; delivered: number; guardCost: number }
  | { fate: "ambushed"; lost: number; guardCost: number };

/** Resolve the run. `roll` 0..1 under the odds = ambushed. */
export function resolveConvoy(plan: ConvoyPlan, roll: () => number): ConvoyOutcome {
  if (roll() < plan.ambushOdds) {
    return { fate: "ambushed", lost: plan.cargoValue, guardCost: plan.guardCost };
  }
  return { fate: "arrived", delivered: plan.cargoValue, guardCost: plan.guardCost };
}
