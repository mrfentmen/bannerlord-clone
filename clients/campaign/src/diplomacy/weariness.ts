/**
 * Task 111: war weariness. Long wars exhaust the realm: weariness 0..100
 * climbs with battles fought and seasons at war, and high weariness
 * penalizes recruitment (the task's acceptance).
 */

export interface WearinessInput {
  battlesFought: number;
  seasonsAtWar: number;
  recentDefeats: number;
}

/** 0..100. */
export function warWeariness(input: WearinessInput): number {
  const raw =
    input.battlesFought * 2 + input.seasonsAtWar * 6 + input.recentDefeats * 8;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Recruitment penalty 0..1: none below 40 weariness, scaling to half
 * recruitment at 100.
 */
export function recruitmentPenalty(weariness: number): number {
  if (weariness < 40) return 0;
  return Math.min(0.5, ((weariness - 40) / 60) * 0.5);
}

/** Recruits actually raised from a base muster. */
export function musterWithWeariness(base: number, weariness: number): number {
  return Math.max(0, Math.round(base * (1 - recruitmentPenalty(weariness))));
}
