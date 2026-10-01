/**
 * Task 66: daily challenge. The seed comes from the calendar date, so every
 * player gets the same setup on the same day. Scores persist in a local
 * leaderboard keyed by date.
 */

import type { BattleConfig } from "./types.js";
import { dailySeed } from "./rng.js";
import { generateSkirmish } from "./skirmish.js";

const STORE_KEY = "campaign.daily.v1";
const MAX_ENTRIES = 50;

export interface DailyScore {
  date: number;
  name: string;
  score: number;
  won: boolean;
}

/** The daily setup: a skirmish on the day's seed, labeled as the daily. */
export function dailyChallenge(date: Date = new Date()): BattleConfig {
  const seed = dailySeed(date);
  const config = generateSkirmish(seed);
  return { ...config, mode: "daily", label: `Daily challenge — ${seed}` };
}

function load(): DailyScore[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as DailyScore[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(scores: DailyScore[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(scores.slice(0, MAX_ENTRIES)));
  } catch {
    // Session-only leaderboard.
  }
}

/** Record a score; returns the sorted leaderboard. */
export function recordDailyScore(entry: DailyScore): DailyScore[] {
  const scores = [...load(), entry].sort((a, b) => b.score - a.score || a.date - b.date);
  save(scores);
  return scores.slice(0, MAX_ENTRIES);
}

export function dailyLeaderboard(): DailyScore[] {
  return load();
}
