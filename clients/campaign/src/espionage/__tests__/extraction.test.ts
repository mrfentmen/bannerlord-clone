import { describe, expect, it } from "vitest";
import { planExtraction, runExtraction } from "../extraction.js";

describe("spy extraction missions (solo task 68)", () => {
  it("shows success odds up front", () => {
    const plan = planExtraction("s1", "Whisper", "harbor", 20, 8);
    expect(plan.successChance).toBeGreaterThan(0.5);
    expect(plan.line).toContain("Whisper");
    expect(plan.line).toContain("% success");
  });

  it("heat lowers the odds, skill raises them", () => {
    const hot = planExtraction("s1", "Whisper", "harbor", 90, 2);
    const cool = planExtraction("s1", "Whisper", "harbor", 10, 8);
    expect(cool.successChance).toBeGreaterThan(hot.successChance);
  });

  it("odds stay in bounds", () => {
    const plan = planExtraction("s1", "Whisper", "harbor", 100, 0);
    expect(plan.successChance).toBeGreaterThanOrEqual(0.05);
    expect(plan.successChance).toBeLessThanOrEqual(0.95);
  });

  it("runs to extracted or lost", () => {
    const plan = planExtraction("s1", "Whisper", "harbor", 20, 8);
    const outcomes = new Set(Array.from({ length: 20 }, (_, s) => runExtraction(plan, s).result));
    expect(outcomes.has("extracted")).toBe(true);
  });

  it("a hopeless extraction usually fails", () => {
    const plan = planExtraction("s1", "Whisper", "harbor", 100, 0);
    const lost = Array.from({ length: 20 }, (_, s) => runExtraction(plan, s).result).filter(
      (r) => r === "lost",
    ).length;
    expect(lost).toBeGreaterThan(15);
  });

  it("is deterministic per seed", () => {
    const plan = planExtraction("s1", "Whisper", "harbor", 20, 8);
    expect(runExtraction(plan, 42)).toEqual(runExtraction(plan, 42));
  });
});
