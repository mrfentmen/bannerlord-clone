import { describe, expect, it } from "vitest";
import { acceptanceOdds, EMPTY_PEACE_TERMS, negotiatePeace } from "../peaceConcessions.js";

describe("peace concessions sliders (solo task 84)", () => {
  it("shows live acceptance odds", () => {
    const n = negotiatePeace("Ironhold", 20, 40, {
      ...EMPTY_PEACE_TERMS,
      coinOffered: 2000,
    });
    expect(n.acceptanceOdds).toBeGreaterThan(0);
    expect(n.acceptanceOdds).toBeLessThan(1);
    expect(n.line).toContain("Ironhold");
  });

  it("winning the war raises the odds", () => {
    const terms = { ...EMPTY_PEACE_TERMS, coinDemanded: 1000 };
    expect(acceptanceOdds(terms, 60, 50)).toBeGreaterThan(acceptanceOdds(terms, -60, 50));
  });

  it("their exhaustion raises the odds", () => {
    const terms = { ...EMPTY_PEACE_TERMS };
    expect(acceptanceOdds(terms, 0, 90)).toBeGreaterThan(acceptanceOdds(terms, 0, 10));
  });

  it("greedy demands tank the odds", () => {
    const greedy = { ...EMPTY_PEACE_TERMS, coinDemanded: 5000, townsDemanded: 3 };
    const fair = { ...EMPTY_PEACE_TERMS, coinOffered: 5000 };
    expect(acceptanceOdds(fair, 0, 50)).toBeGreaterThan(acceptanceOdds(greedy, 0, 50));
  });

  it("odds stay in bounds", () => {
    expect(acceptanceOdds({ ...EMPTY_PEACE_TERMS, coinDemanded: 999999 }, -100, 0)).toBeGreaterThanOrEqual(0.02);
    expect(acceptanceOdds({ ...EMPTY_PEACE_TERMS, coinOffered: 999999 }, 100, 100)).toBeLessThanOrEqual(0.98);
  });

  it("rejects negative terms", () => {
    expect(() => acceptanceOdds({ ...EMPTY_PEACE_TERMS, coinOffered: -5 }, 0, 50)).toThrow(
      "non-negative",
    );
  });

  it("narrates the verdict", () => {
    const good = negotiatePeace("Ironhold", 80, 90, { ...EMPTY_PEACE_TERMS, coinOffered: 10000 });
    expect(good.line).toContain("likely accept");
  });
});
