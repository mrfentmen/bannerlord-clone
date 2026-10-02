import { describe, expect, it } from "vitest";
import { awardUnitXp, xpForLevel, xpGainLine, XP_BASE, XP_PER_KILL, XP_VICTORY_BONUS } from "../unitXp.js";

const UNITS = [
  { id: "a", name: "Militia", kills: 3, survived: true, xpBefore: 0 },
  { id: "b", name: "Veterans", kills: 0, survived: true, xpBefore: 90 },
  { id: "c", name: "Fallen", kills: 5, survived: false, xpBefore: 40 },
];

describe("unit XP display in after-action (solo task 26)", () => {
  it("awards base + kills + victory bonus to survivors", () => {
    const [militia] = awardUnitXp(UNITS, true);
    expect(militia!.xpGained).toBe(XP_BASE + 3 * XP_PER_KILL + XP_VICTORY_BONUS);
  });

  it("gives no victory bonus on defeat", () => {
    const [militia] = awardUnitXp(UNITS, false);
    expect(militia!.xpGained).toBe(XP_BASE + 3 * XP_PER_KILL);
  });

  it("the fallen earn nothing", () => {
    const gains = awardUnitXp(UNITS, true);
    expect(gains[2]!.xpGained).toBe(0);
    expect(gains[2]!.xpAfter).toBe(40);
  });

  it("detects level-ups", () => {
    const gains = awardUnitXp(UNITS, true);
    // Veterans at 90 XP + 35 = 125 -> level 2.
    expect(gains[1]!.leveledUp).toBe(true);
    expect(gains[1]!.levelAfter).toBe(2);
    expect(gains[0]!.leveledUp).toBe(false);
  });

  it("xpForLevel thresholds", () => {
    expect(xpForLevel(0)).toBe(1);
    expect(xpForLevel(99)).toBe(1);
    expect(xpForLevel(100)).toBe(2);
  });

  it("formats report lines with level-up callouts", () => {
    const gains = awardUnitXp(UNITS, true);
    expect(xpGainLine(gains[1]!)).toContain("LEVEL UP");
    expect(xpGainLine(gains[0]!)).not.toContain("LEVEL UP");
  });
});
