/**
 * Task 78: kill/death exchange ratio.
 *
 * The raw kills line ("80 inflicted, 18 suffered") answers two questions at once
 * and leaves the reader to do the arithmetic, which is the one number the player
 * actually wants from a battle: how many of their dead bought each dead enemy.
 *
 * The ratio is the exchange the field produced — enemy losses divided by our own,
 * both from the casualty breakdown, not from the kill counters. Kills and losses
 * are different measures (a rout kills nobody and still loses the field), so the
 * exchange is stated in the terms the report is actually built on. `+1` on both
 * sides keeps a 1-for-1 fight at 1.0 instead of dividing by zero.
 */

import type { AfterActionReport } from "./report.js";

export interface KillDeathRatio {
  /** Enemy dead per our dead. 1.0 is an even trade. */
  ratio: number;
  ourDead: number;
  theirDead: number;
  /** The exchange as it is printed, e.g. "4.7 enemy dead per our dead". */
  line: string;
}

/**
 * The exchange rate of the battle, from the casualty breakdown. A battle with
 * nothing lost on either side reports 1.0 rather than Infinity: nothing was
 * traded, which is not the same as an even trade.
 */
export function killDeathRatio(report: AfterActionReport): KillDeathRatio {
  const ourDead = report.playerCasualties.totalLost;
  const theirDead = report.enemyCasualties.totalLost;
  const ratio = ourDead === 0 && theirDead === 0 ? 1 : (theirDead + 1) / (ourDead + 1);
  return { ratio, ourDead, theirDead, line: ratioLine(ratio) };
}

/** Exchange as a string, one decimal, e.g. "4.7:1". */
export function ratioLine(ratio: number): string {
  return `${ratio.toFixed(1)}:1`;
}

/**
 * The one-line read the report prints beside the kill counts. Names the exchange
 * and says how it was measured, so the number is never floating free of its basis.
 */
export function killDeathSummary(report: AfterActionReport): string {
  const { ratio, ourDead, theirDead } = killDeathRatio(report);
  return `${ratioLine(ratio)} exchange — ${theirDead} of theirs against ${ourDead} of ours.`;
}