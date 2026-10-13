import { describe, expect, it } from "vitest";
import { analyzeSmugglingRun, planSmuggling } from "../smuggling.js";

describe("smuggling risk calculator (solo task 75)", () => {
  it("shows odds and expected value before the run", () => {
    const plan = planSmuggling("spice", 100, 10);
    const analysis = analyzeSmugglingRun(plan);
    expect(analysis.interceptionChance).toBeGreaterThan(0);
    expect(analysis.profitOnSuccess).toBe(plan.profit);
    expect(analysis.lossOnFailure).toBeGreaterThan(plan.profit);
    expect(analysis.line).toContain("spice");
  });

  it("recommends calm runs", () => {
    const analysis = analyzeSmugglingRun(planSmuggling("spice", 100, 0));
    expect(analysis.recommendation).toBe("run");
    expect(analysis.expectedValue).toBeGreaterThan(0);
  });

  it("warns off hot runs", () => {
    const analysis = analyzeSmugglingRun(planSmuggling("spice", 900, 100));
    expect(analysis.recommendation).toBe("too-risky");
    expect(analysis.expectedValue).toBeLessThan(0);
    expect(analysis.line).toContain("Too risky");
  });

  it("EV math is consistent", () => {
    const plan = planSmuggling("spice", 200, 40);
    const a = analyzeSmugglingRun(plan);
    const expected = (1 - a.interceptionChance) * a.profitOnSuccess - a.interceptionChance * a.lossOnFailure;
    expect(Math.abs(a.expectedValue - Math.round(expected))).toBeLessThanOrEqual(1);
  });
});
