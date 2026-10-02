/**
 * Task 96: pyrrhic victory — won, at a price.
 *
 * The report already prints our casualty numbers; what it does not do is warn
 * that the win cost what it cost. A player who took a third of the army dead and
 * won a field has a decision to make afterwards — press on, or recover — and the
 * report is where that decision is framed.
 *
 * The threshold is a third of the force that started, and the reasoning is in the
 * number: a third dead is where a victory stops being cheap enough to leave
 * unqualified, and it is deliberately below the half that would make the win
 * arguably not worth taking at all. A flawless win cannot be pyrrhic (nobody
 * died), and a defeat is never a victory of any kind, so both are excluded here.
 *
 * Everything is read from the casualty breakdown: the same total the Casualties
 * section prints, so the warning and the numbers beneath it cannot disagree.
 */

import type { AfterActionReport } from "./report.js";

/** Share of our starting force that must be dead for a win to be pyrrhic. */
export const PYRRHIC_LOSS_SHARE = 1 / 3;

export interface PyrrhicVictory {
  /** Troops we started with. */
  ourStrength: number;
  /** Troops we lost. */
  ourLosses: number;
  /** Troops still on the roster when the fighting stopped. */
  survivors: number;
  /** Our losses as a share of the force that started, 0..1. */
  lossShare: number;
  line: string;
}

/**
 * The pyrrhic-win warning, or null when the battle does not warrant one. The
 * threshold is inclusive: exactly a third lost still warns, because a rounding
 * difference should not decide whether the player is told what the win cost.
 */
export function pyrrhicVictory(report: AfterActionReport): PyrrhicVictory | null {
  if (!report.playerWon) return null;
  const ourStrength = report.playerCasualties.totalStarted;
  const ourLosses = report.playerCasualties.totalLost;
  const lossShare = ourStrength > 0 ? ourLosses / ourStrength : 0;
  if (lossShare < PYRRHIC_LOSS_SHARE) return null;
  return {
    ourStrength,
    ourLosses,
    survivors: ourStrength - ourLosses,
    lossShare,
    line:
      `Pyrrhic victory — ${ourLosses} of ${ourStrength} dead ` +
      `(${(lossShare * 100).toFixed(0)}% of the force).`,
  };
}