/**
 * Tax policy simulator (Rowan solo task 74).
 *
 * Preview a tax rate before applying it: predicted seasonal income from
 * the town's prosperity, plus the unrest the new rate will cause. Higher
 * taxes earn more but anger the people — the unrest curve is quadratic
 * past the fair rate. Pure model, no side effects.
 */

export interface TaxPrediction {
  rate: number;
  income: number;
  unrest: number;
  /** Unrest change vs the current rate. */
  unrestDelta: number;
  line: string;
}

/** Rate the townsfolk consider fair — taxes above it breed unrest. */
export const FAIR_TAX_RATE = 0.1;

/** Seasonal income at a rate: prosperity * rate, scaled. */
export function predictedTaxIncome(rate: number, prosperity: number, population: number): number {
  const r = Math.max(0, Math.min(1, rate));
  return Math.round(prosperity * r * population * 0.1);
}

/** Unrest 0..100 from a tax rate. */
export function predictedTaxUnrest(rate: number): number {
  const r = Math.max(0, Math.min(1, rate));
  if (r <= FAIR_TAX_RATE) return Math.round(r * 100);
  const excess = (r - FAIR_TAX_RATE) / (1 - FAIR_TAX_RATE);
  return Math.min(100, Math.round(FAIR_TAX_RATE * 100 + excess * excess * 90));
}

/**
 * Simulate changing the tax rate from `currentRate` to `newRate`:
 * income, unrest, and the unrest delta — before anything is applied.
 */
export function simulateTaxPolicy(
  currentRate: number,
  newRate: number,
  prosperity: number,
  population: number,
): TaxPrediction {
  if (newRate < 0 || newRate > 1) throw new Error("tax rate must be 0..1");
  const income = predictedTaxIncome(newRate, prosperity, population);
  const unrest = predictedTaxUnrest(newRate);
  const unrestDelta = unrest - predictedTaxUnrest(currentRate);
  const line =
    unrestDelta > 10
      ? `Raising taxes to ${Math.round(newRate * 100)}% earns ${income}/season but risks riots (+${unrestDelta} unrest).`
      : unrestDelta < -10
        ? `Cutting taxes to ${Math.round(newRate * 100)}% earns ${income}/season and calms the town (${unrestDelta} unrest).`
        : `Setting taxes to ${Math.round(newRate * 100)}% earns ${income}/season at ${unrest} unrest.`;
  return { rate: newRate, income, unrest, unrestDelta, line };
}
