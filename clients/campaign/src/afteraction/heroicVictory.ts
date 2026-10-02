/**
 * Task 95: heroic victory — winning outnumbered.
 *
 * A victory is heroic when the enemy brought at least twice our numbers and the
 * field still came out ours. Twice is not this module's number: it is the ratio
 * the rest of the client already means by "outnumbered" — `modes/challenge.ts`
 * scales the enemy force by 2 for its Outnumbered handicap, and
 * `meta/achievements.ts` calls 2:1 the deed "Against the Odds". Using the same
 * threshold keeps the bonus, the handicap and the achievement describing one
 * battle rather than three.
 *
 * Strength is read from the casualty breakdowns' `started` totals, which is the
 * force that walked onto the field, not the force that walked off it. Nothing
 * here is estimated: no win is heroic by default, and a battle the player lost is
 * never heroic no matter how lopsided it was.
 *
 * The renown figure is a declared award, the way `XP_VICTORY_BONUS = 15` is in
 * unitXp.ts. No part of the client models renown for battles, so the report is
 * where the award is stated, and it is the same 50 the tournament title prize
 * already offers (`modes/prizes.ts`). The campaign layer applies it; this
 * module only reports what the battle earned.
 */

import type { AfterActionReport } from "./report.js";

/** Enemy troops per our troop at or above which a win counts as outnumbered. */
export const OUTNUMBER_RATIO = 2;

/** Renown for a win fought outnumbered. See the module header for the source. */
export const HEROIC_RENOWN = 50;

export interface HeroicVictory {
  /** Troops we started with. */
  ourStrength: number;
  /** Troops they started with. */
  theirStrength: number;
  /** Enemy troops per our troop, or 0 when we had nobody to divide by. */
  ratio: number;
  /** Renown the campaign layer should award. */
  renown: number;
  line: string;
}

/** Enemy troops per our troop, from what each side started the battle with. */
export function outnumberRatio(report: AfterActionReport): number {
  const ours = report.playerCasualties.totalStarted;
  const theirs = report.enemyCasualties.totalStarted;
  return ours > 0 ? theirs / ours : 0;
}

/**
 * The heroic-win notice, or null when the battle was not one: a loss, an even
 * fight, or a force so lopsided the player never stood a chance are all things
 * the report should not dress up.
 */
export function heroicVictory(report: AfterActionReport): HeroicVictory | null {
  if (!report.playerWon) return null;
  const ourStrength = report.playerCasualties.totalStarted;
  const theirStrength = report.enemyCasualties.totalStarted;
  const ratio = outnumberRatio(report);
  if (ratio < OUTNUMBER_RATIO) return null;
  return {
    ourStrength,
    theirStrength,
    ratio,
    renown: HEROIC_RENOWN,
    line:
      `Heroic victory — ${ourStrength} of ours against ${theirStrength} of theirs ` +
      `(outnumbered ${ratio.toFixed(1)}:1). +${HEROIC_RENOWN} renown.`,
  };
}