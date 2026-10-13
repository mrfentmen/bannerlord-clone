import { describe, it, expect } from "vitest";
import { calculateEndingProgress, checkVictory, ENDINGS } from "../index.js";

describe("endings", () => {
  it("defines all five endings", () => {
    expect(Object.keys(ENDINGS)).toEqual([
      "unifier",
      "kingmaker",
      "breadlord",
      "ghost",
      "survivor",
    ]);
  });

  it("tracks unifier progress", () => {
    const progress = calculateEndingProgress({
      statesHeld: 13,
      daysHeld: 182,
      puppetsOnThrones: 0,
      titlesHeld: 1,
      foodControl: 0,
      mercenaryReputation: 0,
      mercenaryWealth: 0,
      homeTown: null,
      homeTownYearsSurvived: 0,
    });
    const unifier = progress.find((p) => p.id === "unifier")!;
    expect(unifier.progress).toBeCloseTo(50, 0); // Half states, half days
    expect(unifier.status).toContain("13/26");
  });

  it("kingmaker is not viable if you hold titles", () => {
    const progress = calculateEndingProgress({
      statesHeld: 0,
      daysHeld: 0,
      puppetsOnThrones: 3,
      titlesHeld: 1, // Disqualified!
      foodControl: 0,
      mercenaryReputation: 0,
      mercenaryWealth: 0,
      homeTown: null,
      homeTownYearsSurvived: 0,
    });
    const kingmaker = progress.find((p) => p.id === "kingmaker")!;
    expect(kingmaker.viable).toBe(false);
  });

  it("detects victory", () => {
    const progress = calculateEndingProgress({
      statesHeld: 26,
      daysHeld: 365,
      puppetsOnThrones: 0,
      titlesHeld: 1,
      foodControl: 0,
      mercenaryReputation: 0,
      mercenaryWealth: 0,
      homeTown: null,
      homeTownYearsSurvived: 0,
    });
    expect(checkVictory(progress)).toBe("unifier");
  });

  it("returns null when no victory", () => {
    const progress = calculateEndingProgress({
      statesHeld: 5,
      daysHeld: 100,
      puppetsOnThrones: 1,
      titlesHeld: 0,
      foodControl: 0.2,
      mercenaryReputation: 30,
      mercenaryWealth: 5000,
      homeTown: "Springfield",
      homeTownYearsSurvived: 5,
    });
    expect(checkVictory(progress)).toBeNull();
  });
});
