import { describe, expect, it } from "vitest";
import { appraiseLoot, appraisalSummary } from "../loot.js";

const lots = [
  { id: "l1", description: "Captured spears", category: "weapons" as const, quantity: 40, unitValue: 12 },
  { id: "l2", description: "Officer's signet", category: "valuables" as const, quantity: 1, unitValue: 800 },
  { id: "l3", description: "Grain sacks", category: "supplies" as const, quantity: 25, unitValue: 6 },
];

describe("loot appraisal (solo task 43)", () => {
  it("values each lot and totals them", () => {
    const a = appraiseLoot(lots);
    expect(a.total).toBe(40 * 12 + 800 + 25 * 6);
  });

  it("sorts most valuable first", () => {
    const a = appraiseLoot(lots);
    expect(a.lots[0]!.id).toBe("l2");
  });

  it("says the values are estimates", () => {
    const a = appraiseLoot(lots);
    expect(a.note).toContain("Estimates");
  });

  it("summarises", () => {
    const a = appraiseLoot(lots);
    expect(appraisalSummary(a)).toContain("3 lots");
    expect(appraisalSummary(a)).toContain("worth ~");
  });

  it("handles empty loot", () => {
    const a = appraiseLoot([]);
    expect(a.total).toBe(0);
    expect(appraisalSummary(a)).toContain("0 lots");
  });
});
