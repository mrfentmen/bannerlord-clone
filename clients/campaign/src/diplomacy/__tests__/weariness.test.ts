/** Task 111: high weariness penalizes recruitment. */

import { describe, expect, it } from "vitest";
import { musterWithWeariness, recruitmentPenalty, warWeariness } from "../weariness.js";

describe("war weariness (task 111)", () => {
  it("climbs with battles, seasons, and defeats, capped at 100", () => {
    expect(warWeariness({ battlesFought: 0, seasonsAtWar: 0, recentDefeats: 0 })).toBe(0);
    expect(warWeariness({ battlesFought: 10, seasonsAtWar: 4, recentDefeats: 2 })).toBe(60);
    expect(warWeariness({ battlesFought: 99, seasonsAtWar: 99, recentDefeats: 99 })).toBe(100);
  });

  it("no penalty below 40, up to half at 100", () => {
    expect(recruitmentPenalty(39)).toBe(0);
    expect(recruitmentPenalty(40)).toBe(0);
    expect(recruitmentPenalty(70)).toBeGreaterThan(0);
    expect(recruitmentPenalty(100)).toBe(0.5);
  });

  it("high weariness shrinks the muster", () => {
    expect(musterWithWeariness(100, 0)).toBe(100);
    expect(musterWithWeariness(100, 100)).toBe(50);
  });
});
