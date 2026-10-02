import { describe, expect, it } from "vitest";
import { armorSetBonuses, ARMOR_SETS } from "../armorSets.js";

describe("armor set bonuses (solo task 97)", () => {
  it("defines multiple sets", () => {
    expect(ARMOR_SETS.length).toBeGreaterThanOrEqual(3);
  });

  it("two pieces unlock the minor bonus", () => {
    const [result] = armorSetBonuses(["ironclad-helm", "ironclad-cuirass"]);
    expect(result!.setName).toBe("Ironclad");
    expect(result!.equipped).toBe(2);
    expect(result!.active).toHaveLength(1);
    expect(result!.active[0]!.stats.armor).toBe(5);
    expect(result!.line).toContain("+5 armor");
  });

  it("four pieces unlock the major bonus", () => {
    const [result] = armorSetBonuses([
      "ironclad-helm",
      "ironclad-cuirass",
      "ironclad-gauntlets",
      "ironclad-boots",
    ]);
    expect(result!.active).toHaveLength(2);
    expect(result!.next).toBeNull();
  });

  it("shows the next threshold", () => {
    const [result] = armorSetBonuses(["scout-hood"]);
    expect(result!.active).toHaveLength(0);
    expect(result!.next!.pieces).toBe(2);
    expect(result!.line).toContain("no bonus yet");
  });

  it("ignores unrelated pieces", () => {
    expect(armorSetBonuses(["some-sword", "random-hat"])).toHaveLength(0);
  });

  it("evaluates multiple sets at once", () => {
    const results = armorSetBonuses(["ironclad-helm", "ironclad-cuirass", "scout-hood"]);
    expect(results).toHaveLength(2);
  });
});
