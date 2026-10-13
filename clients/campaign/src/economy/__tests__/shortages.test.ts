import { describe, expect, it } from "vitest";
import { shortageWarnings } from "../shortages.js";

describe("resource shortage warnings (solo task 77)", () => {
  it("flags out-of-stock resources", () => {
    const warnings = shortageWarnings([{ resource: "grain", consumption: 100, stockpile: 0 }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe("out");
    expect(warnings[0]!.line).toContain("OUT OF STOCK");
  });

  it("warns when coverage falls below the threshold", () => {
    const warnings = shortageWarnings([{ resource: "grain", consumption: 100, stockpile: 150 }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.seasonsLeft).toBe(1);
    expect(warnings[0]!.severity).toBe("low");
  });

  it("stays quiet when stocked", () => {
    expect(
      shortageWarnings([{ resource: "grain", consumption: 100, stockpile: 500 }]),
    ).toHaveLength(0);
  });

  it("sorts worst first", () => {
    const warnings = shortageWarnings([
      { resource: "grain", consumption: 100, stockpile: 150 },
      { resource: "ale", consumption: 50, stockpile: 0 },
    ]);
    expect(warnings[0]!.resource).toBe("ale");
  });

  it("reports the shortfall amount", () => {
    const warnings = shortageWarnings([{ resource: "grain", consumption: 100, stockpile: 150 }]);
    expect(warnings[0]!.shortfall).toBe(50);
  });

  it("custom thresholds work", () => {
    expect(
      shortageWarnings([{ resource: "grain", consumption: 100, stockpile: 150 }], 1),
    ).toHaveLength(0);
  });
});
