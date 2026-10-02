/**
 * Task 120: army cohesion panel (assessment). Cohesion 0..100 from morale,
 * recent defeats, and supply state; below 30 the panel warns before battle
 * (the task's acceptance).
 */

export interface CohesionInput {
  /** 0..100 average morale. */
  morale: number;
  recentDefeats: number;
  /** 0..100 supply level. */
  supply: number;
}

export function armyCohesion(input: CohesionInput): number {
  const raw = input.morale * 0.5 + input.supply * 0.3 - input.recentDefeats * 10;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/** True when cohesion is low enough to warn before battle. */
export function shouldWarnCohesion(cohesion: number): boolean {
  return cohesion < 30;
}

export function cohesionWarning(cohesion: number): string | null {
  if (!shouldWarnCohesion(cohesion)) return null;
  return `Cohesion is ${cohesion} — the army may break. Consider delaying the battle.`;
}
