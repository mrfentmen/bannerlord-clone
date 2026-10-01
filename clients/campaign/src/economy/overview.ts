/**
 * Task 108: economic overview dashboard data. Aggregate realm income and
 * expenses into a surplus/deficit view with a short forecast. The dashboard
 * reads numbers the campaign layer supplies; it never invents them.
 */

export interface LedgerLine {
  label: string;
  /** Positive = income, negative = expense. */
  perSeason: number;
}

export interface EconomicOverview {
  income: number;
  expenses: number;
  surplus: number;
  lines: LedgerLine[];
  /** Projected treasury after N seasons at current rates. */
  forecast: { season: number; treasury: number }[];
}

export function economicOverview(
  lines: LedgerLine[],
  currentTreasury: number,
  forecastSeasons: number,
): EconomicOverview {
  const income = lines.filter((l) => l.perSeason > 0).reduce((s, l) => s + l.perSeason, 0);
  const expenses = -lines.filter((l) => l.perSeason < 0).reduce((s, l) => s + l.perSeason, 0);
  const surplus = income - expenses;
  const forecast: { season: number; treasury: number }[] = [];
  for (let i = 1; i <= forecastSeasons; i++) {
    forecast.push({ season: i, treasury: currentTreasury + surplus * i });
  }
  return { income, expenses, surplus, lines: [...lines], forecast };
}
