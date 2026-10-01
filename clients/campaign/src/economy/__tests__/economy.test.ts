/**
 * @vitest-environment jsdom
 *
 * Economy tests (MASTER_PLAN 3D, tasks 101-108).
 */

import { describe, expect, it } from "vitest";
import {
  analyzeRoutes,
  buyWorkshop,
  createPriceHistory,
  economicOverview,
  improveWorkshop,
  levyTribute,
  planCaravan,
  repayLoan,
  setTaxRate,
  takeLoan,
  taxIncome,
  taxLoyaltyEffect,
  tickLoan,
  tickTributes,
  workshopIncome,
  WORKSHOP_TYPES,
} from "../index.js";

const PLANNER = {
  priceAt: (good: string, settlement: string) =>
    ({ grain: { harbor: 10, rust: 25 } })[good as "grain"]?.[settlement as "harbor" | "rust"] ?? null,
  distance: (a: string, b: string) => (a === b ? 0 : 40),
};

describe("price viewer (task 101)", () => {
  it("tracks history, averages, and trends", () => {
    const h = createPriceHistory();
    expect(h.latest("grain")).toBeNull();
    expect(h.trend("grain", 4)).toBeNull();
    [10, 12, 14, 16].forEach((p, i) => h.record("grain", i, p));
    expect(h.latest("grain")).toBe(16);
    expect(h.movingAverage("grain", 4)).toBe(13);
    expect(h.trend("grain", 4)).toBe("rising");
    [16, 10, 8, 6].forEach((p, i) => h.record("grain", i + 4, p));
    expect(h.trend("grain", 4)).toBe("falling");
  });
});

describe("caravans and routes (tasks 102, 104)", () => {
  const stops = [
    { settlementId: "harbor", settlementName: "Harbor" },
    { settlementId: "rust", settlementName: "Rust Camp" },
  ];

  it("projects profit before the caravan leaves", () => {
    const { caravan, projection } = planCaravan("First", stops, "grain", 100, 5, PLANNER);
    expect(caravan.stops).toHaveLength(2);
    // Buy 100 @ 10, sell 100 @ 25.
    expect(projection.revenue).toBe(2500);
    expect(projection.profit).toBe(2500 - 1000 - projection.costs.guards - projection.costs.distance);
    expect(projection.profit).toBeGreaterThan(0);
  });

  it("ranks routes by profit per day", () => {
    const long = [
      { settlementId: "harbor", settlementName: "Harbor" },
      { settlementId: "far", settlementName: "Far" },
      { settlementId: "rust", settlementName: "Rust Camp" },
    ];
    const ranked = analyzeRoutes([stops, long], "grain", 100, 5, {
      ...PLANNER,
      priceAt: (_g: string, s: string) => (s === "harbor" ? 10 : 25),
      distance: () => 40,
    });
    expect(ranked[0]!.profitPerDay).toBeGreaterThanOrEqual(ranked[1]!.profitPerDay);
  });
});

describe("workshops (task 103)", () => {
  it("buys, improves, and earns per season", () => {
    expect(WORKSHOP_TYPES.length).toBeGreaterThanOrEqual(5);
    const { workshop, cost } = buyWorkshop("smithy", "harbor");
    expect(cost).toBeGreaterThan(0);
    expect(workshop.tier).toBe(1);
    const improved = improveWorkshop(workshop).workshop;
    expect(improved.tier).toBe(2);
    expect(workshopIncome(improved, 80)).toBeGreaterThan(workshopIncome(workshop, 80));
    expect(workshopIncome(workshop, 90)).toBeGreaterThan(workshopIncome(workshop, 20));
  });
});

describe("taxes, tribute, loans (tasks 105-107)", () => {
  it("tax rates preview loyalty effects", () => {
    expect(taxLoyaltyEffect(10)).toBeGreaterThan(0);
    expect(taxLoyaltyEffect(40)).toBeLessThan(0);
    expect(taxIncome(1000, 20)).toBe(200);
    const policy = setTaxRate([], "harbor", 20);
    expect(setTaxRate(policy, "harbor", 30)).toHaveLength(1);
    expect(() => setTaxRate([], "harbor", 99)).toThrow();
  });

  it("tributes track deadlines and flag overdue", () => {
    const t = levyTribute("Rust Horde", "Harbor Compact", 500, 1);
    const { overdue } = tickTributes(tickTributes([t]).tributes);
    expect(overdue.map((x) => x.id)).toEqual([t.id]);
  });

  it("loans accrue interest and repay cleanly", () => {
    let loan = takeLoan("Shylock", 1000, 0.1, 4);
    loan = tickLoan(loan);
    expect(loan.balance).toBe(1100);
    const { loan: repaid, applied } = repayLoan(loan, 2000);
    expect(applied).toBe(1100);
    expect(repaid.balance).toBe(0);
  });
});

describe("economic overview (task 108)", () => {
  it("shows surplus/deficit and forecasts", () => {
    const view = economicOverview(
      [
        { label: "Taxes", perSeason: 1200 },
        { label: "Workshops", perSeason: 400 },
        { label: "Army wages", perSeason: -900 },
        { label: "Tribute paid", perSeason: -200 },
      ],
      5000,
      4,
    );
    expect(view.income).toBe(1600);
    expect(view.expenses).toBe(1100);
    expect(view.surplus).toBe(500);
    expect(view.forecast).toHaveLength(4);
    expect(view.forecast[3]!.treasury).toBe(7000);
    const deficit = economicOverview([{ label: "War", perSeason: -500 }], 1000, 2);
    expect(deficit.surplus).toBe(-500);
    expect(deficit.forecast[1]!.treasury).toBe(0);
  });
});
