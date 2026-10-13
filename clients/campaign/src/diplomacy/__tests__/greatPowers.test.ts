import { describe, expect, it } from "vitest";
import { powerScore, rankGreatPowers, type ClanPower } from "../greatPowers.js";

const clan = (over: Partial<ClanPower> = {}): ClanPower => ({
  clanId: "c1",
  clanName: "Ironhold",
  troops: 5000,
  towns: 4,
  treasury: 20000,
  reputation: 60,
  ...over,
});

describe("great power ranking (solo task 90)", () => {
  it("scores composite power", () => {
    expect(powerScore(clan())).toBe(5000 + 4 * 500 + 2000 + 60 * 20);
  });

  it("ranks best-first with gaps", () => {
    const ranked = rankGreatPowers([
      clan({ clanId: "c1", clanName: "Weak", troops: 100 }),
      clan({ clanId: "c2", clanName: "Strong", troops: 9000 }),
    ]);
    expect(ranked[0]!.clanName).toBe("Strong");
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[0]!.gapToLeader).toBe(0);
    expect(ranked[1]!.gapToLeader).toBeGreaterThan(0);
    expect(ranked[0]!.verdict).toContain("great power");
  });

  it("ties share adjacent ranks by score order", () => {
    const ranked = rankGreatPowers([clan({ clanId: "c1" }), clan({ clanId: "c2" })]);
    expect(ranked[0]!.score).toBe(ranked[1]!.score);
  });

  it("empty input yields empty ranking", () => {
    expect(rankGreatPowers([])).toHaveLength(0);
  });

  it("rejects negative inputs", () => {
    expect(() => powerScore(clan({ troops: -1 }))).toThrow("non-negative");
  });

  it("clamps reputation", () => {
    expect(powerScore(clan({ reputation: 500 }))).toBe(powerScore(clan({ reputation: 100 })));
  });
});
