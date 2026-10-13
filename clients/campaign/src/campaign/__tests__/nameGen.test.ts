/**
 * Bannerlord name generator and RNG systems.
 */

import { describe, expect, it } from "vitest";
import {
  randomName,
  clanName,
  generateWeaponName,
} from "../namePools.js";
import {
  rollChildTraits,
  rollPersuasion,
  rollBattleDeath,
  CHILD_TRAITS,
} from "../fortune.js";

const FACTIONS = [
  "pacific-compact",
  "mountain-alliance",
  "great-lakes-union",
  "southern-compact",
  "lone-star-frontier",
  "atlantic-corridor",
];

describe("namePools (Bannerlord preset lookup)", () => {
  it("every faction has male and female pools that return real names", () => {
    for (const f of FACTIONS) {
      const male = randomName(f, "male", () => 0);
      const female = randomName(f, "female", () => 0.99);
      expect(male.length).toBeGreaterThan(1);
      expect(female.length).toBeGreaterThan(1);
      expect(male).not.toBe("Alex");
    }
  });

  it("unknown factions fall back instead of throwing", () => {
    expect(randomName("nope", "male", () => 0.5).length).toBeGreaterThan(1);
  });

  it("the lookup is deterministic given the RNG", () => {
    expect(randomName("lone-star-frontier", "male", () => 0.1)).toBe(
      randomName("lone-star-frontier", "male", () => 0.1),
    );
  });

  it("pools are fixed lists — repeats happen, like Calradia", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(randomName("southern-compact", "female", Math.random));
    // 48 names in the pool: 400 draws must repeat.
    expect(seen.size).toBeLessThanOrEqual(48);
  });
});

describe("clanName (Bannerlord cultural formulas, modernized)", () => {
  it("mountain-alliance uses -son/-sen patronymics (Sturgia parallel)", () => {
    const name = clanName("mountain-alliance", "Erik", () => 0.1);
    expect(name).toMatch(/son|sen$/);
  });

  it("great-lakes-union uses 'of {town}' (Vlandia parallel)", () => {
    expect(clanName("great-lakes-union", "Gary", () => 0)).toBe("of Gary");
  });

  it("lone-star-frontier uses ranch style (Khuzait parallel)", () => {
    expect(clanName("lone-star-frontier", "King", () => 0)).toBe("King Ranch");
  });

  it("southern-compact uses family style (Battania parallel)", () => {
    expect(clanName("southern-compact", "Beaumont", () => 0)).toBe("the Beaumonts");
  });

  it("pacific-compact uses collective style (Aserai parallel)", () => {
    expect(clanName("pacific-compact", "Vance", () => 0)).toBe("Vance Collective");
  });

  it("atlantic-corridor uses House style (Empire parallel)", () => {
    expect(clanName("atlantic-corridor", "Harrington", () => 0)).toBe("House Harrington");
  });
});

describe("generateWeaponName (Bannerlord smithing stitching)", () => {
  it("always ends with the base item", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateWeaponName("AR-15", Math.random).endsWith("AR-15")).toBe(true);
    }
  });

  it("produces one-, two-, and three-part names", () => {
    const names = new Set<string>();
    for (let i = 0; i < 100; i++) names.add(generateWeaponName("Suppressor", Math.random));
    const partCounts = new Set([...names].map((n) => n.split(" ").length));
    // Single-part is just the base; two- and three-part must both appear.
    expect(partCounts.has(2)).toBe(true);
    expect(partCounts.has(3)).toBe(true);
  });

  it("is deterministic given the RNG", () => {
    expect(generateWeaponName("AR-15", () => 0.9)).toBe(generateWeaponName("AR-15", () => 0.9));
  });
});

describe("fortune (Bannerlord RNG)", () => {
  it("child traits come from the trait list, flat random", () => {
    for (let i = 0; i < 20; i++) {
      const traits = rollChildTraits(Math.random);
      expect(traits.length).toBeGreaterThanOrEqual(1);
      expect(traits.length).toBeLessThanOrEqual(2);
      for (const t of traits) expect(CHILD_TRAITS).toContain(t);
    }
  });

  it("persuasion chance centers on 50% and moves with charm", () => {
    const even = rollPersuasion(5, 5, () => 0.49);
    expect(even.chance).toBeCloseTo(0.5, 2);
    expect(even.success).toBe(true);
    const skilled = rollPersuasion(10, 0, () => 0.5);
    expect(skilled.chance).toBeGreaterThan(even.chance);
    const hopeless = rollPersuasion(0, 10, () => 0.5);
    expect(hopeless.success).toBe(false);
  });

  it("persuasion clamps to 5-95%", () => {
    expect(rollPersuasion(100, 0, () => 0).chance).toBeLessThanOrEqual(0.95);
    expect(rollPersuasion(0, 100, () => 0).chance).toBeGreaterThanOrEqual(0.05);
  });

  it("battle death is ~10%", () => {
    let deaths = 0;
    for (let i = 0; i < 1000; i++) if (rollBattleDeath(Math.random)) deaths++;
    expect(deaths).toBeGreaterThan(50);
    expect(deaths).toBeLessThan(160);
  });
});
