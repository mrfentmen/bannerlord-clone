/**
 * Casualty breakdown by unit type (Rowan solo task 41).
 *
 * The after-action screen lists per-type losses. Two entry points:
 * - breakdown(): exact per-unit before/after snapshots.
 * - apportion(): when only total losses are known (e.g. auto-resolve),
 *   losses are spread across the force's composition deterministically.
 */

export interface UnitSnapshot {
  kind: string;
  started: number;
  ended: number;
}

export interface CasualtyEntry {
  kind: string;
  started: number;
  lost: number;
  /** Loss rate for this type, 0..1. */
  lossRate: number;
}

/** Exact breakdown from before/after snapshots. */
export function breakdown(units: UnitSnapshot[]): CasualtyEntry[] {
  return units
    .map((u) => ({
      kind: u.kind,
      started: u.started,
      lost: Math.max(0, u.started - u.ended),
      lossRate: u.started > 0 ? Math.max(0, u.started - u.ended) / u.started : 0,
    }))
    .filter((e) => e.lost > 0)
    .sort((a, b) => b.lost - a.lost);
}

/**
 * Apportion total losses across a composition deterministically.
 * Shares are proportional to headcount; remainders go to the largest
 * units first (largest remainder method).
 */
export function apportion(totalLost: number, composition: Array<{ kind: string; count: number }>): CasualtyEntry[] {
  const total = composition.reduce((s, u) => s + u.count, 0);
  if (total <= 0 || totalLost <= 0) return [];
  const lost = Math.min(totalLost, total);
  const shares = composition.map((u) => ({
    kind: u.kind,
    started: u.count,
    exact: (u.count / total) * lost,
  }));
  const base = shares.map((s) => Math.floor(s.exact));
  let assigned = base.reduce((s, n) => s + n, 0);
  const remainders = shares
    .map((s, i) => ({ i, frac: s.exact - base[i]! }))
    .sort((a, b) => b.frac - a.frac);
  for (const r of remainders) {
    if (assigned >= lost) break;
    base[r.i]! += 1;
    assigned += 1;
  }
  return shares
    .map((s, i) => ({
      kind: s.kind,
      started: s.started,
      lost: base[i]!,
      lossRate: s.started > 0 ? base[i]! / s.started : 0,
    }))
    .filter((e) => e.lost > 0)
    .sort((a, b) => b.lost - a.lost);
}

/** One-line summary, e.g. "infantry 12, archers 5". */
export function casualtySummary(entries: CasualtyEntry[]): string {
  return entries.map((e) => `${e.kind} ${e.lost}`).join(", ");
}
