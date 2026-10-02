import { describe, expect, it } from "vitest";
import { answerProposal, proposeTradeDeal } from "../tradeDeals.js";

const friendly = () => proposeTradeDeal("t1", "Harbor Town", 90, 2000, 20, 20, true);
const hostile = () => proposeTradeDeal("t1", "Harbor Town", 5, 0, 0, 50, true);

describe("trade agreement proposals (solo task 76)", () => {
  it("a generous deal with a friendly town is accepted", () => {
    const agreement = answerProposal(friendly(), 1);
    expect(agreement.decision).toBe("accepted");
    expect(agreement.tariffRelief).toBe(20);
    expect(agreement.priorityAccess).toBe(true);
    expect(agreement.line).toContain("Harbor Town");
  });

  it("a greedy deal with a hostile town is refused", () => {
    const agreement = answerProposal(hostile(), 1);
    expect(agreement.decision).toBe("refused");
    expect(agreement.tariffRelief).toBe(0);
    expect(agreement.yourCost).toBe(0);
  });

  it("middling deals draw counters", () => {
    const seen = new Set(
      Array.from({ length: 20 }, (_, s) =>
        answerProposal(proposeTradeDeal("t1", "Harbor Town", 45, 600, 10, 20, false), s).decision,
      ),
    );
    expect(seen.has("countered")).toBe(true);
  });

  it("counters halve the tariff relief", () => {
    const proposal = proposeTradeDeal("t1", "Harbor Town", 40, 800, 5, 30, false);
    const agreement = answerProposal(proposal, 3);
    if (agreement.decision === "countered") {
      expect(agreement.tariffRelief).toBe(15);
      expect(agreement.priorityAccess).toBe(false);
    }
  });

  it("is deterministic per seed", () => {
    expect(answerProposal(friendly(), 42)).toEqual(answerProposal(friendly(), 42));
  });

  it("rejects invalid proposals", () => {
    expect(() => proposeTradeDeal("t1", "Town", 50, -1, 10, 10, false)).toThrow("non-negative");
    expect(() => proposeTradeDeal("t1", "Town", 50, 0, 60, 10, false)).toThrow("discount");
    expect(() => proposeTradeDeal("t1", "Town", 50, 0, 10, 60, false)).toThrow("tariff ask");
  });
});
