/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { markTerm, signTreaty, treatyCompliance } from "../treaties.js";

beforeEach(() => localStorage.clear());

const terms = () => [
  { text: "No raids across the border", party: "us" },
  { text: "Yearly tribute of 500", party: "f1" },
];

describe("treaty compliance tracker (solo task 82)", () => {
  it("lists terms with compliance status", () => {
    const treaty = signTreaty("Border Pact", "f1", "Ironhold", 1, terms());
    expect(treaty.terms.every((t) => t.status === "pending")).toBe(true);
    const status = treatyCompliance();
    expect(status).toHaveLength(1);
    expect(status[0]!.line).toContain("all 2 term(s) honored");
  });

  it("flags treaties under strain", () => {
    const treaty = signTreaty("Border Pact", "f1", "Ironhold", 1, terms());
    markTerm(treaty.id, treaty.terms[0]!.id, false);
    const [status] = treatyCompliance();
    expect(status!.underStrain).toBe(true);
    expect(status!.brokenTerms).toBe(1);
    expect(status!.line).toContain("under strain");
  });

  it("kept terms accrue seasons", () => {
    const treaty = signTreaty("Border Pact", "f1", "Ironhold", 1, terms());
    markTerm(treaty.id, treaty.terms[0]!.id, true);
    markTerm(treaty.id, treaty.terms[0]!.id, true);
    const updated = treatyCompliance()[0]!.treaty;
    expect(updated.terms[0]!.seasonsKept).toBe(2);
  });

  it("requires at least one term", () => {
    expect(() => signTreaty("Empty", "f1", "Ironhold", 1, [])).toThrow("at least one term");
  });

  it("rejects unknown treaties and terms", () => {
    expect(() => markTerm("nope", "nope", true)).toThrow("no treaty");
    const treaty = signTreaty("Border Pact", "f1", "Ironhold", 1, terms());
    expect(() => markTerm(treaty.id, "nope", true)).toThrow("no term");
  });
});
