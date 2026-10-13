/**
 * Historical battle unlock progression (Rowan solo task 34).
 *
 * The three historical scenarios unlock in sequence: the first is always
 * open, each later one unlocks when the previous is won. Wins persist in
 * localStorage so the progression survives reloads.
 */

import { HISTORICAL_SCENARIOS } from "./historical.js";

const STORE_KEY = "campaign.historical-progress.v1";

export interface HistoricalProgress {
  /** Scenario ids the player has won. */
  wins: string[];
}

const EMPTY: HistoricalProgress = { wins: [] };

function load(): HistoricalProgress {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...EMPTY, wins: [] };
    const v = JSON.parse(raw) as Partial<HistoricalProgress>;
    return { wins: Array.isArray(v.wins) ? v.wins : [] };
  } catch {
    return { ...EMPTY, wins: [] };
  }
}

function save(p: HistoricalProgress): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    // Session-only progress. Not worth interrupting the player.
  }
}

/** True when the scenario is unlocked (first always; later ones need the previous win). */
export function isHistoricalUnlocked(scenarioId: string): boolean {
  const idx = HISTORICAL_SCENARIOS.findIndex((s) => s.id === scenarioId);
  if (idx < 0) return false;
  if (idx === 0) return true;
  const p = load();
  return p.wins.includes(HISTORICAL_SCENARIOS[idx - 1]!.id);
}

/** Record a win; returns true when it unlocked the next scenario. */
export function recordHistoricalWin(scenarioId: string): boolean {
  const p = load();
  const wasUnlocked = isHistoricalUnlocked(scenarioId);
  if (!p.wins.includes(scenarioId)) {
    p.wins.push(scenarioId);
    save(p);
  }
  if (!wasUnlocked) return false;
  const idx = HISTORICAL_SCENARIOS.findIndex((s) => s.id === scenarioId);
  const next = HISTORICAL_SCENARIOS[idx + 1];
  return next !== undefined && !p.wins.includes(next.id);
}

/** All scenarios with their unlock state, in order. */
export function historicalProgress(): { id: string; title: string; unlocked: boolean; won: boolean }[] {
  const p = load();
  return HISTORICAL_SCENARIOS.map((s) => ({
    id: s.id,
    title: s.title,
    unlocked: isHistoricalUnlocked(s.id),
    won: p.wins.includes(s.id),
  }));
}

/** Clear progression (settings reset). */
export function resetHistoricalProgress(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}
