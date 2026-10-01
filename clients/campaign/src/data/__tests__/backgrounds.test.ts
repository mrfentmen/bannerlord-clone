import { describe, expect, it } from "vitest";
import { BACKGROUNDS, APPEARANCE_PRESETS, appearancesForEthnicity, computeCharacterStats } from "../backgrounds.js";

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
