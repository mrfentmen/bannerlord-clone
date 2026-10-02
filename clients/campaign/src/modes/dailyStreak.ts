/**
 * Daily challenge streaks (Rowan solo task 38).
 *
 * Tracks consecutive calendar days the player completed the daily
 * challenge. A streak counts when the daily is completed on back-to-back
 * days; skipping a day resets it to 1 on the next completion. Persists in
 * localStorage. All date math is on UTC day numbers (timezone-safe).
 */

const STORE_KEY = "campaign.daily-streak.v1";

export interface DailyStreak {
  /** Consecutive days completed, ending with the last completion. */
  current: number;
  /** Best streak ever. */
  best: number;
  /** UTC day number of the last completion, or 0. */
  lastDay: number;
}

const EMPTY: DailyStreak = { current: 0, best: 0, lastDay: 0 };

/** UTC day number for a date (midnight UTC boundary). */
export function dayNumber(date: Date = new Date()): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000);
}

function load(): DailyStreak {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...EMPTY };
    const v = JSON.parse(raw) as Partial<DailyStreak>;
    return {
      current: typeof v.current === "number" ? v.current : 0,
      best: typeof v.best === "number" ? v.best : 0,
      lastDay: typeof v.lastDay === "number" ? v.lastDay : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

function save(s: DailyStreak): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // Session-only streak.
  }
}

/** Record a daily completion. Idempotent within the same day. */
export function recordDailyCompletion(date: Date = new Date()): DailyStreak {
  const s = load();
  const today = dayNumber(date);
  if (today === s.lastDay) return s; // already counted today
  if (today === s.lastDay + 1) {
    s.current += 1;
  } else {
    s.current = 1; // gap (or first ever): streak restarts
  }
  s.lastDay = today;
  s.best = Math.max(s.best, s.current);
  save(s);
  return { ...s };
}

/** Current streak state. */
export function dailyStreak(): DailyStreak {
  return load();
}

/** One-line display, e.g. "3-day streak". */
export function streakLabel(s: DailyStreak = load()): string {
  if (s.current <= 0) return "No streak yet — complete today's daily!";
  return `${s.current}-day streak${s.best > s.current ? ` (best: ${s.best})` : ""}`;
}

export function resetDailyStreak(): void {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}
