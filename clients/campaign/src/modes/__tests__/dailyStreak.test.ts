/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  dailyStreak,
  dayNumber,
  recordDailyCompletion,
  streakLabel,
} from "../dailyStreak.js";

beforeEach(() => localStorage.clear());

function dateAtDay(day: number): Date {
  return new Date(day * 86400000);
}

describe("daily challenge streaks (solo task 38)", () => {
  it("starts with no streak", () => {
    expect(dailyStreak().current).toBe(0);
    expect(streakLabel()).toContain("No streak");
  });

  it("builds a streak across consecutive days", () => {
    const base = dayNumber();
    recordDailyCompletion(dateAtDay(base));
    recordDailyCompletion(dateAtDay(base + 1));
    recordDailyCompletion(dateAtDay(base + 2));
    const s = dailyStreak();
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
    expect(streakLabel()).toBe("3-day streak");
  });

  it("a skipped day resets the streak", () => {
    const base = dayNumber();
    recordDailyCompletion(dateAtDay(base));
    recordDailyCompletion(dateAtDay(base + 1));
    recordDailyCompletion(dateAtDay(base + 3)); // skipped base+2
    const s = dailyStreak();
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
    expect(streakLabel()).toContain("best: 2");
  });

  it("same-day completion is idempotent", () => {
    const base = dayNumber();
    recordDailyCompletion(dateAtDay(base));
    recordDailyCompletion(dateAtDay(base));
    expect(dailyStreak().current).toBe(1);
  });

  it("survives reload", () => {
    const base = dayNumber();
    recordDailyCompletion(dateAtDay(base));
    // Fresh reads from localStorage.
    expect(dailyStreak().current).toBe(1);
  });
});
