import { describe, expect, it } from "vitest";
import { rarityTier, sortAchievementsByRarity } from "../achievementRarity.js";

describe("achievement rarity sorting (solo task 98)", () => {
  it("sorts rarest first by unlock rate", () => {
    const ranked = sortAchievementsByRarity({
      "first-blood": 0.9,
      "unbroken-50": 0.01,
      flawless: 0.05,
    });
    expect(ranked[0]!.achievement.id).toBe("unbroken-50");
    expect(ranked[1]!.achievement.id).toBe("flawless");
    const firstBlood = ranked.findIndex((r) => r.achievement.id === "first-blood");
    expect(firstBlood).toBeGreaterThan(1);
    // Monotonic non-decreasing unlock rates.
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i]!.unlockRate).toBeGreaterThanOrEqual(ranked[i - 1]!.unlockRate);
    }
  });

  it("assigns rarity tiers", () => {
    expect(rarityTier(0.01)).toBe("legendary");
    expect(rarityTier(0.05)).toBe("rare");
    expect(rarityTier(0.2)).toBe("uncommon");
    expect(rarityTier(0.9)).toBe("common");
  });

  it("unknown rates default to common and sort last", () => {
    const ranked = sortAchievementsByRarity({ "unbroken-50": 0.01 });
    const last = ranked[ranked.length - 1]!;
    expect(last.unlockRate).toBe(1);
    expect(last.tier).toBe("common");
  });

  it("covers every achievement", () => {
    const ranked = sortAchievementsByRarity({});
    expect(ranked.length).toBeGreaterThanOrEqual(50);
  });

  it("rejects bad rates", () => {
    expect(() => rarityTier(2)).toThrow("0..1");
    expect(() => sortAchievementsByRarity({ "first-blood": -0.1 })).toThrow("bad unlock rate");
  });
});
