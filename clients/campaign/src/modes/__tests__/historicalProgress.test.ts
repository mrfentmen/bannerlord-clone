/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  historicalProgress,
  isHistoricalUnlocked,
  recordHistoricalWin,
} from "../historicalProgress.js";
import { HISTORICAL_SCENARIOS } from "../historical.js";

beforeEach(() => localStorage.clear());

describe("historical battle unlock progression (solo task 34)", () => {
  it("unlocks only the first scenario at the start", () => {
    const progress = historicalProgress();
    expect(progress).toHaveLength(3);
    expect(progress[0]!.unlocked).toBe(true);
    expect(progress[1]!.unlocked).toBe(false);
    expect(progress[2]!.unlocked).toBe(false);
  });

  it("a win unlocks the next scenario", () => {
    const first = HISTORICAL_SCENARIOS[0]!.id;
    const unlocked = recordHistoricalWin(first);
    expect(unlocked).toBe(true);
    expect(isHistoricalUnlocked(HISTORICAL_SCENARIOS[1]!.id)).toBe(true);
    expect(isHistoricalUnlocked(HISTORICAL_SCENARIOS[2]!.id)).toBe(false);
  });

  it("the full chain unlocks in sequence", () => {
    for (const s of HISTORICAL_SCENARIOS) recordHistoricalWin(s.id);
    const progress = historicalProgress();
    expect(progress.every((p) => p.unlocked && p.won)).toBe(true);
  });

  it("survives reload", () => {
    recordHistoricalWin(HISTORICAL_SCENARIOS[0]!.id);
    // Simulate a reload: the module reads localStorage fresh each call.
    expect(isHistoricalUnlocked(HISTORICAL_SCENARIOS[1]!.id)).toBe(true);
  });

  it("unknown scenarios are never unlocked", () => {
    expect(isHistoricalUnlocked("nope")).toBe(false);
  });
});
