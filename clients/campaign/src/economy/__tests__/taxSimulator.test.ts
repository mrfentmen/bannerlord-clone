import { describe, expect, it } from "vitest";
import {
  FAIR_TAX_RATE,
  predictedTaxIncome,
  predictedTaxUnrest,
  simulateTaxPolicy,
} from "../taxSimulator.js";

describe("tax policy simulator (solo task 74)", () => {
  it("income grows with rate, prosperity, and population", () => {
    const low = predictedTaxIncome(0.05, 50, 1000);
    const high = predictedTaxIncome(0.2, 50, 1000);
    expect(high).toBeGreaterThan(low);
    expect(predictedTaxIncome(0.1, 100, 1000)).toBeGreaterThan(predictedTaxIncome(0.1, 10, 1000));
  });

  it("unrest is mild at the fair rate, harsh above it", () => {
    expect(predictedTaxUnrest(FAIR_TAX_RATE)).toBe(10);
    expect(predictedTaxUnrest(0)).toBe(0);
    expect(predictedTaxUnrest(0.6)).toBeGreaterThan(30);
    expect(predictedTaxUnrest(1)).toBe(100);
  });

  it("simulates before applying — no side effects", () => {
    const pred = simulateTaxPolicy(0.1, 0.6, 60, 2000);
    expect(pred.income).toBeGreaterThan(0);
    expect(pred.unrestDelta).toBeGreaterThan(0);
    expect(pred.line).toContain("riots");
  });

  it("cutting taxes calms the town", () => {
    const pred = simulateTaxPolicy(0.6, 0.05, 60, 2000);
    expect(pred.unrestDelta).toBeLessThan(0);
    expect(pred.line).toContain("calms");
  });

  it("rejects rates outside 0..1", () => {
    expect(() => simulateTaxPolicy(0.1, 1.5, 60, 2000)).toThrow("0..1");
  });

  it("higher rates never earn less income", () => {
    let last = -1;
    for (const rate of [0, 0.1, 0.25, 0.5, 1]) {
      const income = predictedTaxIncome(rate, 70, 1500);
      expect(income).toBeGreaterThanOrEqual(last);
      last = income;
    }
  });
});
