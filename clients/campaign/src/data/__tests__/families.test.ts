/**
 * The family stage of character creation: six modern-American family
 * archetypes, modernized from Bannerlord's ancestry stage (Baron's Retainers,
 * Urban Merchants, Yeomen, Urban Blacksmiths, Hunters, Mercenaries).
 *
 * These tests pin the shape the maker depends on: six options, each with a
 * valid +1 attribute, skill bonuses that actually map onto real skills, and
 * wiring into the stage list, stat computation, and starting scenarios.
 */

import { describe, expect, it } from "vitest";

import {
  ATTRIBUTE_IDS,
  ATTRIBUTE_MAX,
  LEGACY_SKILL_ALIASES,
} from "../attributes.js";
import {
  BACKGROUNDS,
  CHARACTER_STAGES,
  STARTING_SCENARIOS,
  computeCharacterStats,
} from "../backgrounds.js";
import {
  FAMILIES,
  FAMILY_CATEGORY,
  attributesWithFamilyBonus,
  familyById,
} from "../families.js";

describe("the six families", () => {
  it("has exactly six archetypes with unique ids", () => {
    expect(FAMILIES).toHaveLength(6);
    expect(new Set(FAMILIES.map((f) => f.id)).size).toBe(6);
  });

  it("gives every family a label, a description, and a story", () => {
    for (const family of FAMILIES) {
      expect(family.label.length, family.id).toBeGreaterThan(0);
      expect(family.description.length, family.id).toBeGreaterThan(0);
      expect(family.story.length, family.id).toBeGreaterThan(0);
    }
  });

  it("grants +1 to a real attribute, Bannerlord-style", () => {
    for (const family of FAMILIES) {
      expect(family.attributeBonus.points, family.id).toBe(1);
      expect(ATTRIBUTE_IDS as readonly string[], family.id).toContain(
        family.attributeBonus.attribute,
      );
    }
  });

  it("only uses skill bonuses that map onto real skills", () => {
    // computeCharacterStats sums the loose nine-skill vocabulary and
    // startingSkillLevels reads it through LEGACY_SKILL_ALIASES; a key
    // outside that map would be silently dropped.
    for (const family of FAMILIES) {
      for (const skill of Object.keys(family.skills)) {
        expect(
          LEGACY_SKILL_ALIASES[skill],
          `${family.id} grants unmapped skill ${skill}`,
        ).toBeDefined();
      }
    }
  });

  it("covers the six Bannerlord archetypes in modern dress", () => {
    expect(FAMILIES.map((f) => f.id).sort()).toEqual(
      ["badge", "contractor", "farm", "merchant", "outdoors", "trade"].sort(),
    );
  });
});

describe("the family stage", () => {
  it("is a well-formed background category", () => {
    expect(FAMILY_CATEGORY.id).toBe("family");
    expect(FAMILY_CATEGORY.question.length).toBeGreaterThan(0);
    expect(FAMILY_CATEGORY.options).toBe(FAMILIES);
  });

  it("comes first in the character stages, ahead of the life stages", () => {
    expect(CHARACTER_STAGES[0]).toBe(FAMILY_CATEGORY);
    expect(CHARACTER_STAGES).toHaveLength(BACKGROUNDS.length + 1);
    expect(CHARACTER_STAGES.slice(1)).toEqual(BACKGROUNDS);
  });

  it("looks families up by id", () => {
    expect(familyById("merchant")?.label).toBe("Merchant Family");
    expect(familyById("nope")).toBeUndefined();
  });
});

describe("attributesWithFamilyBonus", () => {
  const base = { vigor: 5, control: 5, endurance: 5, cunning: 5, social: 5, intelligence: 5 } as const;

  it("adds the family's +1 on top of the point-buy", () => {
    const out = attributesWithFamilyBonus({ ...base }, "badge");
    expect(out.social).toBe(6);
    expect(out.vigor).toBe(5);
  });

  it("caps the bonus at the attribute max", () => {
    const out = attributesWithFamilyBonus({ ...base, social: ATTRIBUTE_MAX }, "badge");
    expect(out.social).toBe(ATTRIBUTE_MAX);
  });

  it("leaves attributes alone for an unknown family", () => {
    expect(attributesWithFamilyBonus({ ...base }, "nope")).toEqual(base);
    expect(attributesWithFamilyBonus({ ...base }, undefined)).toEqual(base);
  });

  it("does not mutate its input", () => {
    const input = { ...base };
    attributesWithFamilyBonus(input, "badge");
    expect(input).toEqual(base);
  });
});

describe("family wiring into stats and scenarios", () => {
  it("folds the family story, cash, and skills into the character", () => {
    const { skills, cash, biography } = computeCharacterStats(
      { family: "merchant", childhood: "suburbs", youth: "student", training: "self", profession: "mechanic" },
      30,
      {},
    );
    expect(biography).toContain("You learned margins before manners");
    expect(cash).toBeGreaterThan(1200); // family cash plus the life stages
    expect(skills.trade).toBeGreaterThan(1);
  });

  it("ignores a missing family choice the way it ignores any missing stage", () => {
    const { biography } = computeCharacterStats({ childhood: "suburbs" }, 30, {});
    expect(biography.length).toBeGreaterThan(0);
  });

  it("wires the new family triggers onto real option ids", () => {
    // NOTE: several pre-existing triggers ("dropout", "small-business",
    // "college", "church", "organizer", "farmhand") predate the current
    // background set and never match; they are left for the design owner.
    // This pins the family triggers this change adds.
    const optionIds = new Set(
      CHARACTER_STAGES.flatMap((c) => c.options.map((o) => o.id)),
    );
    for (const familyId of ["badge", "merchant", "trade", "farm", "outdoors"]) {
      expect(optionIds.has(familyId), `${familyId} is a real option`).toBe(true);
      const wired = STARTING_SCENARIOS.some((s) => s.triggers.includes(familyId));
      expect(wired, `${familyId} triggers a scenario`).toBe(true);
    }
  });

  it("gives badge, merchant, trade, farm, and outdoors families a starting scenario", () => {
    const scenarioFor = (familyId: string) =>
      STARTING_SCENARIOS.find((s) => s.triggers.includes(familyId))?.id ?? null;
    expect(scenarioFor("badge")).toBe("military-call");
    expect(scenarioFor("merchant")).toBe("family-business");
    expect(scenarioFor("trade")).toBe("family-business");
    expect(scenarioFor("farm")).toBe("farm-crisis");
    expect(scenarioFor("outdoors")).toBe("farm-crisis");
  });
});
