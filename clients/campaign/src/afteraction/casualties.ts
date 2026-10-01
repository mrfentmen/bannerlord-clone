/**
 * Task 69: casualty breakdown. Per-unit losses with percentages; the row
 * shares always sum to the side total (within rounding).
 */

import type { CasualtyBreakdown, UnitLoss } from "./types.js";

export function casualtyBreakdown(losses: UnitLoss[]): CasualtyBreakdown {
  const totalLost = losses.reduce((s, u) => s + u.lost, 0);
  const totalStarted = losses.reduce((s, u) => s + u.started, 0);
  const rows = losses.map((u) => ({
    ...u,
    share: totalLost > 0 ? u.lost / totalLost : 0,
  }));
  return { rows, totalLost, totalStarted };
}

/** Percentage string for a row, e.g. "37.5%". */
export function sharePct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}
