/**
 * Trade dominance progress (Rowan solo task 80).
 *
 * Progress toward the economic victory: your share of total trade across
 * towns. Dominance = your trade volume / all trade volume. Hit the
 * threshold and the economy is yours. Pure model with a progress-bar
 * friendly 0..1 value.
 */

/** 0..1 share of trade needed to claim economic victory. */
export const DOMINANCE_THRESHOLD = 0.6;

export interface DominanceProgress {
  /** 0..1 your share of total trade. */
  dominance: number;
  /** 0..100 for the progress bar. */
  percent: number;
  achieved: boolean;
  yourTrade: number;
  totalTrade: number;
  line: string;
  bar: string;
}

/** ASCII progress bar, 20 cells wide. */
export function dominanceBar(dominance: number): string {
  const filled = Math.max(0, Math.min(20, Math.round(dominance * 20)));
  return "█".repeat(filled) + "░".repeat(20 - filled);
}

/**
 * Compute dominance. `yourTrade` = your seasonal trade volume,
 * `rivalTrade` = everyone else's combined seasonal trade volume.
 */
export function tradeDominance(yourTrade: number, rivalTrade: number): DominanceProgress {
  if (yourTrade < 0 || rivalTrade < 0) throw new Error("trade volumes must be non-negative");
  const total = yourTrade + rivalTrade;
  const dominance = total === 0 ? 0 : yourTrade / total;
  const achieved = dominance >= DOMINANCE_THRESHOLD;
  const percent = Math.round(dominance * 100);
  const line = achieved
    ? `Economic victory: you control ${percent}% of trade. The markets are yours.`
    : `${percent}% of trade controlled — need ${Math.round(DOMINANCE_THRESHOLD * 100)}% for economic victory.`;
  return {
    dominance: Math.round(dominance * 1000) / 1000,
    percent,
    achieved,
    yourTrade,
    totalTrade: total,
    line,
    bar: dominanceBar(dominance),
  };
}
