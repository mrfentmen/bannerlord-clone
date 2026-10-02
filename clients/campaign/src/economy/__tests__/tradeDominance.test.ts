import { describe, expect, it } from "vitest";
import { DOMINANCE_THRESHOLD, dominanceBar, tradeDominance } from "../tradeDominance.js";

describe("trade dominance progress (solo task 80)", () => {
  it("computes share of trade", () => {
    const p = tradeDominance(600, 400);
    expect(p.dominance).toBe(0.6);
    expect(p.percent).toBe(60);
    expect(p.achieved).toBe(true);
    expect(p.line).toContain("Economic victory");
  });

  it("falls short below the threshold", () => {
    const p = tradeDominance(300, 700);
    expect(p.achieved).toBe(false);
    expect(p.line).toContain(`${Math.round(DOMINANCE_THRESHOLD * 100)}%`);
  });

  it("draws a 20-cell progress bar", () => {
    expect(dominanceBar(0)).toBe("░".repeat(20));
    expect(dominanceBar(1)).toBe("█".repeat(20));
    expect(dominanceBar(0.5)).toBe("█".repeat(10) + "░".repeat(10));
    expect(tradeDominance(600, 400).bar).toBe("█".repeat(12) + "░".repeat(8));
  });

  it("handles zero trade", () => {
    const p = tradeDominance(0, 0);
    expect(p.dominance).toBe(0);
    expect(p.achieved).toBe(false);
  });

  it("rejects negative volumes", () => {
    expect(() => tradeDominance(-1, 100)).toThrow("non-negative");
  });

  it("monopoly is total dominance", () => {
    const p = tradeDominance(1000, 0);
    expect(p.dominance).toBe(1);
    expect(p.achieved).toBe(true);
  });
});
