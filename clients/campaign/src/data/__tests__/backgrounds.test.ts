import { describe, expect, it } from "vitest";
import {
  BACKGROUNDS,
  APPEARANCE_PRESETS,
  START_CITIES,
  AGE_BRACKETS,
  appearancesForEthnicity,
  computeCharacterStats,
} from "../backgrounds.js";

describe("backgrounds", () => {
  it("has 4 categories", () => {
    expect(BACKGROUNDS).toHaveLength(4);
    expect(BACKGROUNDS.map((c) => c.id)).toEqual(["childhood", "youth", "training", "profession"]);
  });

  it("each category has 4 options", () => {
    for (const cat of BACKGROUNDS) {
      expect(cat.options).toHaveLength(4);
    }
  });

  it("each option has skills, cash, and story", () => {
    for (const cat of BACKGROUNDS) {
      for (const opt of cat.options) {
        expect(opt.skills).toBeDefined();
        expect(typeof opt.cash).toBe("number");
        expect(opt.story.length).toBeGreaterThan(0);
      }
    }
  });

  it("computes stats from default choices", () => {
    const choices: Record<string, string> = {};
    for (const cat of BACKGROUNDS) {
      choices[cat.id] = cat.options[0]!.id;
    }
    const { skills, cash, biography } = computeCharacterStats(choices);
    // Base 1 + bonuses from first options.
    expect(skills.combat).toBeGreaterThanOrEqual(1);
    expect(typeof cash).toBe("number");
    expect(biography.length).toBeGreaterThan(0);
  });

  it("military background gives combat bonus", () => {
    const { skills } = computeCharacterStats({
      childhood: "projects",
      youth: "athlete",
      training: "military",
      profession: "cop",
    });
    // military: combat+3, cop: combat+2, base 1 = 6
    expect(skills.combat).toBe(6);
  });

  it("ignores unknown option ids", () => {
    const { skills } = computeCharacterStats({ childhood: "nonexistent" });
    expect(skills.combat).toBe(1); // base, no bonus
  });
});

describe("start cities", () => {
  it("has 4 cities", () => {
    expect(START_CITIES).toHaveLength(4);
  });

  it("each city has a slug, name, tagline, and description", () => {
    for (const city of START_CITIES) {
      expect(city.slug.length).toBeGreaterThan(0);
      expect(city.name.length).toBeGreaterThan(0);
      expect(city.tagline.length).toBeGreaterThan(0);
      expect(city.description.length).toBeGreaterThan(0);
    }
  });

  it("each city has 3 pros and 3 cons with reasons", () => {
    for (const city of START_CITIES) {
      expect(city.pros).toHaveLength(3);
      expect(city.cons).toHaveLength(3);
      for (const pro of city.pros) {
        expect(pro.label.length).toBeGreaterThan(0);
        expect(pro.reason.length).toBeGreaterThan(0);
      }
      for (const con of city.cons) {
        expect(con.label.length).toBeGreaterThan(0);
        expect(con.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("slugs match the city data files", () => {
    const slugs = START_CITIES.map((c) => c.slug);
    expect(slugs).toEqual(["manhattan-sample", "la-downtown", "houston-downtown", "miami-downtown"]);
  });
});

describe("age brackets", () => {
  it("has 4 brackets", () => {
    expect(AGE_BRACKETS).toHaveLength(4);
  });

  it("covers 18 to 70 with no gaps", () => {
    const sorted = [...AGE_BRACKETS].sort((a, b) => a.min - b.min);
    expect(sorted[0]!.min).toBe(18);
    expect(sorted[sorted.length - 1]!.max).toBeGreaterThanOrEqual(70);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i]!.min).toBe(sorted[i - 1]!.max + 1);
    }
  });

  it("each bracket has a label and effect", () => {
    for (const bracket of AGE_BRACKETS) {
      expect(bracket.label.length).toBeGreaterThan(0);
      expect(bracket.effect.length).toBeGreaterThan(0);
    }
  });
});

describe("character stats with age and bonus points", () => {
  it("young (20) gets +2 athletics, -1 leadership", () => {
    const { skills } = computeCharacterStats({}, 20);
    // Base 1, no backgrounds: athletics 1+2=3, leadership max(1, 1-1)=1.
    expect(skills.athletics).toBe(3);
    expect(skills.leadership).toBe(1);
  });

  it("veteran (40) gets +2 leadership, -1 athletics", () => {
    const { skills } = computeCharacterStats({}, 40);
    expect(skills.leadership).toBe(3);
    expect(skills.athletics).toBe(1); // max(1, 1-1)
  });

  it("elder (60) gets +3 leadership, +1 trade, -2 athletics, -1 combat", () => {
    const { skills } = computeCharacterStats({}, 60);
    expect(skills.leadership).toBe(4);
    expect(skills.trade).toBe(2);
    expect(skills.athletics).toBe(1); // max(1, 1-2)
    expect(skills.combat).toBe(1); // max(1, 1-1)
  });

  it("prime age (30) has no modifiers", () => {
    const { skills } = computeCharacterStats({}, 30);
    for (const value of Object.values(skills)) {
      expect(value).toBe(1);
    }
  });

  it("bonus points add to the named skill", () => {
    const { skills } = computeCharacterStats({}, 30, { combat: 3 });
    expect(skills.combat).toBe(4); // base 1 + 3
  });

  it("bonus points stack on background bonuses", () => {
    const { skills } = computeCharacterStats(
      { childhood: "projects", youth: "athlete", training: "military", profession: "cop" },
      30,
      { combat: 2 },
    );
    // backgrounds give combat 6, bonus +2 = 8
    expect(skills.combat).toBe(8);
  });

  it("default args keep old behaviour", () => {
    const choices: Record<string, string> = {};
    for (const cat of BACKGROUNDS) {
      choices[cat.id] = cat.options[0]!.id;
    }
    const withDefaults = computeCharacterStats(choices);
    const explicit = computeCharacterStats(choices, 30, {});
    expect(withDefaults.skills).toEqual(explicit.skills);
    expect(withDefaults.cash).toBe(explicit.cash);
  });
});

describe("appearance presets", () => {
  it("has 40 presets (4 per ethnicity)", () => {
    expect(APPEARANCE_PRESETS).toHaveLength(40);
  });

  it("each ethnicity has 4 presets", () => {
    const ethnicities = ["italian", "irish", "chinese", "korean", "african",
      "jamaican", "mexican", "puerto_rican", "german", "russian"];
    for (const e of ethnicities) {
      expect(appearancesForEthnicity(e)).toHaveLength(4);
    }
  });

  it("each has an icon and ethnicity", () => {
    for (const p of APPEARANCE_PRESETS) {
      expect(p.icon.length).toBeGreaterThan(0);
      expect(p.ethnicityId.length).toBeGreaterThan(0);
    }
  });

  it("returns empty for unknown ethnicity", () => {
    expect(appearancesForEthnicity("nonexistent")).toHaveLength(0);
  });
});
