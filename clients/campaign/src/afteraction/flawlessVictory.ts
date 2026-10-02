/**
 * Task 97: flawless victory — the whole army walks home.
 *
 * The definition is the repo's own: `meta/achievements.ts` records "Flawless" as
 * the deed "win a battle without losing a unit", so a flawless battle is a win
 * with zero losses, read from the casualty breakdown's total rather than from the
 * rows — so this can never claim a flawless battle that the report above it
 * counted a single death in.
 *
 * The award is declared, the way `XP_VICTORY_BONUS = 15` is in unitXp.ts, because
 * no part of the client models renown for battles. It sits above the heroic
 * award (task 95) for the obvious reason: winning outnumbered can be done at a
 * price, while winning without losing anybody cannot be bought. A battle can
 * earn both — winning 3:1 down with nobody dead pays both — and the campaign
 * layer adds them; this module only reports what each battle earned.
 *
 * The notices module also gives tasks 95, 96 and 97 a home on screen: three
 * functions nobody renders are three functions nobody gets.
 */

import type { AfterActionReport } from "./report.js";

/** Renown for a battle won without losing a troop. See the header for the scale. */
export const FLAWLESS_RENOWN = 75;

export interface FlawlessVictory {
  /** Troops we started with, all of them still on the roster. */
  ourStrength: number;
  /** Renown the campaign layer should award. */
  renown: number;
  line: string;
}

/**
 * The flawless-win notice, or null when the battle was not one. A defeat with no
 * losses is a retreat, not a flawless victory, so the win is required.
 */
export function flawlessVictory(report: AfterActionReport): FlawlessVictory | null {
  if (!report.playerWon) return null;
  const ourStrength = report.playerCasualties.totalStarted;
  if (report.playerCasualties.totalLost > 0) return null;
  return {
    ourStrength,
    renown: FLAWLESS_RENOWN,
    line: `Flawless victory — all ${ourStrength} of ours came back. +${FLAWLESS_RENOWN} renown.`,
  };
}