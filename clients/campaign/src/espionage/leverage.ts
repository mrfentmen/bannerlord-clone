/**
 * Blackmail leverage tracker (Rowan solo task 66).
 *
 * Leverage points per target: secrets and favors build leverage, spending
 * it buys compliance, and unused leverage decays each season — old dirt
 * loses its sting. Persists in localStorage.
 */

export interface LeverageRecord {
  target: string;
  points: number;
  lastSeason: number;
}

const STORE_KEY = "campaign.leverage.v1";
/** Points lost per season of disuse. */
export const LEVERAGE_DECAY = 2;

function load(): LeverageRecord[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(records: LeverageRecord[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(records));
  } catch {
    // Session-only leverage.
  }
}

function decayed(points: number, seasonsIdle: number): number {
  return Math.max(0, points - seasonsIdle * LEVERAGE_DECAY);
}

/** Current leverage against a target, decayed to the given season. */
export function leverage(target: string, currentSeason: number): number {
  const rec = load().find((r) => r.target === target);
  if (!rec) return 0;
  return decayed(rec.points, Math.max(0, currentSeason - rec.lastSeason));
}

/** Add leverage (new dirt). Returns the new total. */
export function addLeverage(target: string, points: number, currentSeason: number): number {
  if (points <= 0) throw new Error("leverage gained must be positive");
  const records = load();
  const rec = records.find((r) => r.target === target);
  const current = rec ? decayed(rec.points, Math.max(0, currentSeason - rec.lastSeason)) : 0;
  const total = current + points;
  if (rec) {
    rec.points = total;
    rec.lastSeason = currentSeason;
  } else {
    records.push({ target, points: total, lastSeason: currentSeason });
  }
  save(records);
  return total;
}

/**
 * Spend leverage. Returns true when the target had enough (and deducts
 * it), false otherwise. Spending refreshes the decay clock.
 */
export function spendLeverage(target: string, points: number, currentSeason: number): boolean {
  if (points <= 0) throw new Error("leverage spent must be positive");
  const records = load();
  const rec = records.find((r) => r.target === target);
  if (!rec) return false;
  const current = decayed(rec.points, Math.max(0, currentSeason - rec.lastSeason));
  if (current < points) return false;
  rec.points = current - points;
  rec.lastSeason = currentSeason;
  save(records);
  return true;
}

/** All targets with current (decayed) leverage, highest first. */
export function leverageBoard(currentSeason: number): { target: string; points: number }[] {
  return load()
    .map((r) => ({ target: r.target, points: decayed(r.points, Math.max(0, currentSeason - r.lastSeason)) }))
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points);
}
