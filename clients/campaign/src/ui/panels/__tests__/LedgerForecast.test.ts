/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { ledgerPanel } from "../LedgerPanel.js";
import type { Ledger, ResourceWarning } from "../../../data/types.js";

const ledger = {
  day: 100,
  income: [
    { id: "i1", label: "Taxes", resource: "money", amount: 200, perDay: 200 },
    { id: "i2", label: "Grain sales", resource: "food", amount: 50, perDay: 50 },
  ],
  expenses: [
    { id: "e1", label: "Wages", resource: "money", amount: -120, perDay: -120 },
  ],
  netPerDay: { money: 80, food: 50 },
} as unknown as Ledger;

describe("ledger panel treasury forecast (integration)", () => {
  it("renders the 30-day forecast from money lines", () => {
    const root = ledgerPanel({ ledger, warnings: [] as ResourceWarning[], treasuryBalance: 1000 });
    document.body.innerHTML = "";
    document.body.appendChild(root);

    const chart = root.querySelector('[data-testid="treasury-chart"]');
    expect(chart).not.toBeNull();
    expect(chart!.textContent!.length).toBeGreaterThan(0);
    const line = root.querySelector('[data-testid="treasury-forecast"]');
    expect(line).not.toBeNull();
    // +200/day income, -120/day expenses → net +80/day from 1000.
    expect(line!.textContent).toContain("30 days");
  });

  it("omits the forecast without a balance", () => {
    const root = ledgerPanel({ ledger, warnings: [] as ResourceWarning[] });
    expect(root.querySelector('[data-testid="treasury-forecast"]')).toBeNull();
  });

  it("warns when the treasury goes broke", () => {
    const poor = {
      ...ledger,
      income: [{ id: "i1", label: "Taxes", resource: "money", amount: 20, perDay: 20 }],
      expenses: [{ id: "e1", label: "Wages", resource: "money", amount: -120, perDay: -120 }],
    } as unknown as Ledger;
    const root = ledgerPanel({ ledger: poor, warnings: [] as ResourceWarning[], treasuryBalance: 50 });
    const line = root.querySelector('[data-testid="treasury-forecast"]')!;
    expect(line.textContent).toContain("goes broke on day 1");
  });
});
