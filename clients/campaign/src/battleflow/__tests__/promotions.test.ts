import { describe, expect, it } from "vitest";
import { promotionCeremony, RANKS, xpForNextRank } from "../promotions.js";

describe("promotion ceremony (solo task 46)", () => {
  it("promotes those with enough XP", () => {
    const result = promotionCeremony([
      { unitId: "u1", name: "Aldric", kind: "infantry", rank: "Recruit", xp: 150 },
      { unitId: "u2", name: "Bryn", kind: "archers", rank: "Soldier", xp: 50 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Aldric", from: "Recruit", to: "Soldier" });
    expect(result[0]!.line).toContain("rises from Recruit to Soldier");
  });

  it("champions cannot be promoted further", () => {
    const result = promotionCeremony([
      { unitId: "u1", name: "Cid", kind: "cavalry", rank: "Champion", xp: 9999 },
    ]);
    expect(result).toHaveLength(0);
    expect(xpForNextRank("Champion")).toBeNull();
  });

  it("XP thresholds rise with rank", () => {
    expect(xpForNextRank("Soldier")).toBeGreaterThan(xpForNextRank("Recruit")!);
  });

  it("presents most senior first", () => {
    const result = promotionCeremony([
      { unitId: "u1", name: "Aldric", kind: "infantry", rank: "Recruit", xp: 150 },
      { unitId: "u2", name: "Bryn", kind: "archers", rank: "Veteran", xp: 500 },
    ]);
    expect(result[0]!.name).toBe("Bryn");
    expect(result[1]!.name).toBe("Aldric");
  });

  it("has five ranks", () => {
    expect(RANKS).toHaveLength(5);
  });
});
