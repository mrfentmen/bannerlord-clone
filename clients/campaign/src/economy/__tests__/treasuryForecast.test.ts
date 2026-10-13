import { describe, expect, it } from "vitest";
import { forecastTreasury } from "../treasuryForecast.js";

const income = [{ name: "taxes", perDay: 100 }];
const expenses = [{ name: "wages", perDay: 60 }];

describe("treasury 30-day forecast (solo task 78)", () => {
  it("projects 30 days of balances", () => {
    const f = forecastTreasury(1000, income, expenses);
    expect(f.days).toHaveLength(30);
    expect(f.endBalance).toBe(1000 + 40 * 30);
    expect(f.brokeOnDay).toBeNull();
  });

  it("spots the day the treasury breaks", () => {
    const f = forecastTreasury(500, income, [{ name: "wages", perDay: 200 }]);
    expect(f.brokeOnDay).not.toBeNull();
    expect(f.line).toContain(`day ${f.brokeOnDay}`);
    expect(f.lowest.balance).toBeLessThan(0);
  });

  it("draws a sparkline chart", () => {
    const f = forecastTreasury(1000, income, expenses);
    expect(f.chart).toHaveLength(30);
  });

  it("balances step by the net daily amount", () => {
    const f = forecastTreasury(1000, income, expenses);
    for (let i = 1; i < f.days.length; i++) {
      expect(f.days[i]!.balance - f.days[i - 1]!.balance).toBe(40);
    }
  });

  it("multiple income and expense lines combine", () => {
    const f = forecastTreasury(
      0,
      [
        { name: "taxes", perDay: 100 },
        { name: "trade", perDay: 50 },
      ],
      [{ name: "wages", perDay: 60 }],
    );
    expect(f.endBalance).toBe(90 * 30);
  });

  it("rejects bad horizons", () => {
    expect(() => forecastTreasury(1000, income, expenses, 0)).toThrow("horizon");
  });
});
