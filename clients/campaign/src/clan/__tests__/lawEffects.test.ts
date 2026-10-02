import { describe, expect, it } from "vitest";
import { previewLawEffects } from "../lawEffects.js";
import type { ClanLaws, ClanMember } from "../types.js";

const members: ClanMember[] = [
  { id: "ruler", name: "Rurik", gender: "m", birthYear: 1970, traits: [], skills: {} },
  { id: "c1", name: "Aldric", gender: "m", birthYear: 1995, fatherId: "ruler", traits: [], skills: {} },
  { id: "c2", name: "Bryn", gender: "f", birthYear: 1998, fatherId: "ruler", traits: [], skills: {} },
];
const names = new Map(members.map((m) => [m.id, m.name]));
const laws: ClanLaws = { inheritance: "primogeniture", marriagePolicy: "alliance-first" };
const holdings = ["keep", "mill", "docks"];

describe("law effects preview (solo task 56)", () => {
  it("predicts the heir without enacting", () => {
    const p = previewLawEffects("ultimogeniture", laws, "ruler", members, holdings, names);
    expect(p.heirName).toBe("Bryn");
    expect(p.lawName).toBe("Ultimogeniture");
    expect(p.effects.length).toBeGreaterThanOrEqual(3);
  });

  it("partible warns about splitting", () => {
    const p = previewLawEffects("partible", laws, "ruler", members, holdings, names);
    const split = p.effects.find((e) => e.text.includes("split"));
    expect(split).toBeDefined();
    expect(split!.tone).toBe("bad");
  });

  it("notes when the law is already in force", () => {
    const p = previewLawEffects("primogeniture", laws, "ruler", members, holdings, names);
    expect(p.effects.some((e) => e.text.includes("already in force"))).toBe(true);
  });

  it("warns about changing laws", () => {
    const p = previewLawEffects("elective", laws, "ruler", members, holdings, names);
    expect(p.effects.some((e) => e.text.includes("upset"))).toBe(true);
  });

  it("does not mutate the current laws", () => {
    previewLawEffects("elective", laws, "ruler", members, holdings, names);
    expect(laws.inheritance).toBe("primogeniture");
  });
});
