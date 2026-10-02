import { describe, expect, it } from "vitest";
import { suggestTribute } from "../tributeCalculator.js";

describe("tribute calculator (solo task 86)", () => {
  it("the stronger side collects", () => {
    const s = suggestTribute(800, 200, 10000);
    expect(s.payer).toBe("them");
    expect(s.amount).toBeGreaterThan(0);
    expect(s.line).toContain("Demand");
  });

  it("the weaker side pays", () => {
    const s = suggestTribute(200, 800, 10000);
    expect(s.payer).toBe("you");
    expect(s.amount).toBeGreaterThan(0);
    expect(s.line).toContain("Offer");
  });

  it("balanced powers owe nothing", () => {
    const s = suggestTribute(500, 500, 10000);
    expect(s.amount).toBe(0);
    expect(s.line).toContain("balanced");
  });

  it("bigger gaps mean bigger tribute", () => {
    const small = suggestTribute(600, 400, 10000);
    const big = suggestTribute(900, 100, 10000);
    expect(big.amount).toBeGreaterThan(small.amount);
  });

  it("handles no armies", () => {
    const s = suggestTribute(0, 0, 10000);
    expect(s.amount).toBe(0);
  });

  it("rejects bad inputs", () => {
    expect(() => suggestTribute(-1, 100, 10000)).toThrow("non-negative");
    expect(() => suggestTribute(100, 100, 0)).toThrow("positive");
  });
});
