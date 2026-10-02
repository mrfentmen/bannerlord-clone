/**
 * Resource shortage warnings (Rowan solo task 77).
 *
 * Each season, compare stockpiles against what the garrison and army
 * will consume: flag shortfalls per resource with the number of seasons
 * until the shelves are bare. Pure model — the campaign layer supplies
 * the numbers.
 */

export interface SupplyNeed {
  resource: string;
  /** Units consumed per season by garrison + army. */
  consumption: number;
  /** Units currently stockpiled. */
  stockpile: number;
}

export interface ShortageWarning {
  resource: string;
  /** Seasons until the stockpile runs out (0 = already out). */
  seasonsLeft: number;
  shortfall: number;
  severity: "out" | "critical" | "low";
  line: string;
}

/**
 * Flag shortfalls. `warnBelow` = warn when stock covers fewer than this
 * many seasons (default 2).
 */
export function shortageWarnings(needs: SupplyNeed[], warnBelow = 2): ShortageWarning[] {
  const warnings: ShortageWarning[] = [];
  for (const need of needs) {
    if (need.consumption <= 0) continue;
    const seasonsLeft = Math.floor(need.stockpile / need.consumption);
    if (seasonsLeft >= warnBelow) continue;
    const severity = seasonsLeft <= 0 ? "out" : seasonsLeft < 1 ? "critical" : "low";
    warnings.push({
      resource: need.resource,
      seasonsLeft,
      shortfall: Math.max(0, need.consumption * warnBelow - need.stockpile),
      severity,
      line:
        seasonsLeft <= 0
          ? `${need.resource}: OUT OF STOCK — the army goes hungry this season.`
          : `${need.resource}: only ${seasonsLeft} season(s) left. Stock up now.`,
    });
  }
  return warnings.sort((a, b) => a.seasonsLeft - b.seasonsLeft);
}
