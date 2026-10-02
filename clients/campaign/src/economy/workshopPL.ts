/**
 * Workshop P&L statements (Rowan solo task 71).
 *
 * Per-workshop profit and loss over time: record each season's income and
 * costs, then produce statements — totals, per-season lines, and the
 * payback verdict. Persists in localStorage.
 */

export interface WorkshopSeason {
  season: number;
  income: number;
  costs: number;
}

export interface WorkshopPL {
  workshopId: string;
  seasons: WorkshopSeason[];
  totalIncome: number;
  totalCosts: number;
  profit: number;
  /** Seasons recorded. */
  seasonsCount: number;
  line: string;
}

const STORE_KEY = "campaign.workshop-pnl.v1";

function load(): Record<string, WorkshopSeason[]> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return typeof v === "object" && v !== null ? v : {};
  } catch {
    return {};
  }
}

function save(all: Record<string, WorkshopSeason[]>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    // Session-only records.
  }
}

/** Record a season for a workshop (income and costs). */
export function recordWorkshopSeason(workshopId: string, season: number, income: number, costs: number): WorkshopSeason[] {
  const all = load();
  const seasons = all[workshopId] ?? [];
  const existing = seasons.find((s) => s.season === season);
  if (existing) {
    existing.income = income;
    existing.costs = costs;
  } else {
    seasons.push({ season, income, costs });
    seasons.sort((a, b) => a.season - b.season);
  }
  all[workshopId] = seasons;
  save(all);
  return seasons;
}

/** The P&L statement for a workshop. */
export function workshopPL(workshopId: string): WorkshopPL {
  const seasons = load()[workshopId] ?? [];
  const totalIncome = seasons.reduce((s, x) => s + x.income, 0);
  const totalCosts = seasons.reduce((s, x) => s + x.costs, 0);
  const profit = totalIncome - totalCosts;
  const line =
    seasons.length === 0
      ? "No seasons recorded yet."
      : profit >= 0
        ? `Profitable: +${profit} over ${seasons.length} season(s).`
        : `Losing money: ${profit} over ${seasons.length} season(s). Consider selling or improving.`;
  return { workshopId, seasons, totalIncome, totalCosts, profit, seasonsCount: seasons.length, line };
}
