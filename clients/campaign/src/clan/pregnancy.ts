/**
 * Pregnancy, ported from Bannerlord's family simulation.
 *
 * Married couples of childbearing age can conceive; pregnancy lasts nine
 * months (252 days on our 28-day calendar); birth produces a child through
 * the existing haveChild flow. Childbirth carries a small maternal-death
 * risk that climbs with the mother's age — Bannerlord does not spare
 * anyone, and neither does this.
 */

export interface Pregnancy {
  motherId: string;
  fatherId: string;
  /** Day conception happened. */
  startDay: number;
  /** Day the child is due. */
  dueDay: number;
}

/** Nine months on the 28-day calendar. */
export const PREGNANCY_DAYS = 252;

/** Childbearing age range. */
export const FERTILE_AGE_MIN = 18;
export const FERTILE_AGE_MAX = 45;

/**
 * Daily conception chance for a married couple. Bannerlord's is low per
 * day but relentless over months; fertility fades past 35.
 */
export function conceptionChance(motherAge: number, fatherAge: number): number {
  if (motherAge < FERTILE_AGE_MIN || motherAge > FERTILE_AGE_MAX) return 0;
  if (fatherAge < FERTILE_AGE_MIN || fatherAge > 60) return 0;
  const base = 0.02;
  const ageFactor = motherAge > 35 ? Math.max(0.3, 1 - (motherAge - 35) * 0.1) : 1;
  return base * ageFactor;
}

/** Begin a pregnancy. */
export function startPregnancy(motherId: string, fatherId: string, day: number): Pregnancy {
  return { motherId, fatherId, startDay: day, dueDay: day + PREGNANCY_DAYS };
}

export type PregnancyStatus = "waiting" | "due" | "overdue";

/** Where a pregnancy stands on a given day. */
export function pregnancyStatus(p: Pregnancy, day: number): PregnancyStatus {
  if (day < p.dueDay) return "waiting";
  if (day === p.dueDay) return "due";
  return "overdue";
}

/**
 * Maternal death chance at birth: ~2% at 20, climbing past 10% at 45.
 * Bannerlord's succession crises start exactly here.
 */
export function maternalDeathChance(motherAge: number): number {
  if (motherAge < FERTILE_AGE_MIN) return 0.05;
  const over = Math.max(0, motherAge - 25);
  return Math.min(0.25, 0.02 + over * 0.008);
}

export interface BirthOutcome {
  /** True when the mother survives childbirth. */
  motherSurvives: boolean;
}

/** Resolve the birth: roll maternal survival. The child itself is created by haveChild. */
export function resolveBirth(motherAge: number, roll: () => number): BirthOutcome {
  return { motherSurvives: roll() >= maternalDeathChance(motherAge) };
}
