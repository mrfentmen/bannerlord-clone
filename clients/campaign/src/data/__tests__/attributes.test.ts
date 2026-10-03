/**
 * The client copy of the six attributes and the eighteen skills, pinned against
 * the world-data file it was transcribed from.
 *
 * This is the test that makes the copy in `src/data/attributes.ts` safe. The
 * client's copy exists because a character sheet cannot depend on a network fetch
 * (`skills.json` ships with world data, not with the client bundle), and a
 * hand-maintained duplicate of another lane's data is exactly the sort of thing
 * that rots quietly. So the file is read off disk here — the test is in the same
 * repository, and a missing or renamed file is a failure worth having.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  ATTRIBUTES,
  ATTRIBUTE_IDS,
  ATTRIBUTE_LEVEL_XP,
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  ATTRIBUTE_POINTS_TOTAL,
  FOCUS_POINT_XP,
  FOCUS_POINTS_TOTAL,
  LEGACY_BONUS_XP,
  LEGACY_SKILL_ALIASES,
  PERK_THRESHOLDS,
  SKILLS,
  SKILL_IDS,
  attributeLabel,
  attributesComplete,
  attributePointsRemaining,
  attributePointsSpent,
  attributeDef,
  canLowerAttribute,
  canRaiseAttribute,
  emptyFocus,
  evenAttributes,
  focusRemaining,
  focusSpent,
  isAttributeId,
  isSkillId,
  nextPerkThreshold,
  normaliseAttributes,
  normaliseFocus,
  perksEarned,
  skillDef,
  skillLabel,
  startingSkillLevels,
} from "../attributes.js";

// src/data/__tests__ -> src/data -> src -> clients/campaign -> clients -> repo root.
const SKILLS_JSON = fileURLToPath(
  new URL("../../../../../services/world-data/data/skills.json", import.meta.url),
);

interface WorldSkills {
  attributes: Record<string, { name: string; description: string; skills: string[] }>;
  skills: Record<string, { name: string; attribute: string; description: string; perks: unknown[] }>;
}

const world: WorldSkills = JSON.parse(readFileSync(SKILLS_JSON, "utf8"));

describe("attribute and skill catalog matches world data", () => {
  it("has the same six attributes in the same order", () => {
    expect(ATTRIBUTE_IDS).toEqual(Object.keys(world.attributes));
    expect(ATTRIBUTE_IDS).toHaveLength(6);
  });

  it("has the same eighteen skills in the same order", () => {
    expect(SKILL_IDS).toEqual(Object.keys(world.skills));
    expect(SKILL_IDS).toHaveLength(18);
  });

  it("copies every attribute's name, description, and governed skills", () => {
    for (const def of ATTRIBUTES) {
      const source = world.attributes[def.id]!;
      expect(source, def.id).toBeDefined();
      expect(def.name, def.id).toBe(source.name);
      expect(def.description, def.id).toBe(source.description);
      expect(def.skills, def.id).toEqual(source.skills);
    }
  });

  it("copies every skill's name, description, and governing attribute", () => {
    for (const def of SKILLS) {
      const source = world.skills[def.id]!;
      expect(source, def.id).toBeDefined();
      expect(def.name, def.id).toBe(source.name);
      expect(def.description, def.id).toBe(source.description);
      expect(def.attribute, def.id).toBe(source.attribute);
      expect(isAttributeId(def.attribute), `${def.id} -> ${def.attribute}`).toBe(true);
    }
  });

  it("gives every skill eight perks at the documented thresholds", () => {
    // The thresholds live in the file's header comment rather than per skill, so
    // the assertion is that the count agrees and the thresholds are the documented
    // eight — a per-skill threshold list in the JSON would be caught by the count.
    for (const def of SKILLS) {
      expect(world.skills[def.id]!.perks, def.id).toHaveLength(8);
      expect(def.perkThresholds, def.id).toEqual(PERK_THRESHOLDS);
    }
    expect(PERK_THRESHOLDS).toEqual([25, 50, 75, 100, 125, 175, 200, 275]);
  });

  it("gives every attribute exactly three skills, and every skill exactly one attribute", () => {
    for (const attr of ATTRIBUTES) expect(attr.skills, attr.id).toHaveLength(3);
    const governed = ATTRIBUTES.flatMap((a) => [...a.skills]);
    expect(new Set(governed).size).toBe(18);
    for (const skill of SKILLS) {
      expect(world.attributes[skill.attribute]!.skills, skill.id).toContain(skill.id);
    }
  });
});

describe("lookups", () => {
  it("finds every skill and attribute by id and refuses unknown ids", () => {
    for (const id of SKILL_IDS) expect(skillDef(id)?.id).toBe(id);
    for (const id of ATTRIBUTE_IDS) expect(attributeDef(id)?.id).toBe(id);
    expect(skillDef("swordplay")).toBeUndefined();
    expect(attributeDef("luck")).toBeUndefined();
    expect(isSkillId("swordplay")).toBe(false);
    expect(isAttributeId("luck")).toBe(false);
  });

  it("labels a known id with its name and an unknown one readably", () => {
    expect(skillLabel("smithing")).toBe("Repair");
    expect(attributeLabel("vigor")).toBe("Vigor");
    // An id nobody has heard of still prints something a player can look up,
    // rather than a bare identifier or a blank row.
    expect(skillLabel("swordplay")).toBe("Swordplay");
    expect(attributeLabel("charisma")).toBe("Charisma");
    expect(skillLabel("bow_shooting")).toBe("Bow shooting");
    expect(attributeLabel("")).toBe("");
  });
});

describe("attribute allocation", () => {
  it("opens on an even spread that is already a complete sheet", () => {
    const even = evenAttributes();
    expect(Object.values(even)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(attributePointsSpent(even)).toBe(ATTRIBUTE_POINTS_TOTAL);
    expect(attributesComplete(even)).toBe(true);
  });

  it("makes the whole budget spendable: six floors are under it and six ceilings over", () => {
    expect(ATTRIBUTE_IDS.length * ATTRIBUTE_MIN).toBeLessThan(ATTRIBUTE_POINTS_TOTAL);
    expect(ATTRIBUTE_IDS.length * ATTRIBUTE_MAX).toBeGreaterThan(ATTRIBUTE_POINTS_TOTAL);
  });

  it("refuses to raise past the ceiling or spend a spent point", () => {
    const maxed = normaliseAttributes({ vigor: ATTRIBUTE_MAX, control: 8, endurance: 8, cunning: 4, social: 1, intelligence: 1 });
    expect(canRaiseAttribute(maxed, "vigor")).toBe(false);
    // Budget is already gone, so nothing else can take a point either.
    expect(canRaiseAttribute(maxed, "social")).toBe(false);
  });

  it("refuses to lower below the floor", () => {
    const floored = normaliseAttributes({ vigor: ATTRIBUTE_MIN, control: 4, endurance: 6, cunning: 6, social: 5, intelligence: 5 });
    expect(canLowerAttribute(floored, "vigor")).toBe(false);
    expect(canLowerAttribute(floored, "control")).toBe(true);
  });

  it("counts only real attribute ids towards the budget", () => {
    expect(attributePointsSpent({ vigor: 4, luck: 99 } as Record<string, number>)).toBe(4);
    expect(attributePointsRemaining({ vigor: 4 })).toBe(ATTRIBUTE_POINTS_TOTAL - 4);
  });

  it("completes a sheet only when the budget is spent and every attribute is in band", () => {
    expect(attributesComplete({ vigor: 5, control: 5, endurance: 5, cunning: 5, social: 5, intelligence: 5 })).toBe(true);
    expect(attributesComplete({ vigor: 5, control: 5, endurance: 5, cunning: 5, social: 5, intelligence: 4 })).toBe(false);
    expect(attributesComplete({ vigor: 2, control: 5, endurance: 5, cunning: 5, social: 5, intelligence: 6 })).toBe(false);
    expect(attributesComplete({ vigor: 9, control: 5, endurance: 5, cunning: 5, social: 5, intelligence: 1 })).toBe(false);
    expect(attributesComplete({})).toBe(false);
  });
});

describe("normaliseAttributes", () => {
  it("clamps every attribute into the floor and ceiling", () => {
    const out = normaliseAttributes({ vigor: 99, control: -5, endurance: 4, cunning: 4, social: 4, intelligence: 4 });
    expect(out.vigor).toBe(ATTRIBUTE_MAX);
    expect(out.control).toBe(ATTRIBUTE_MIN);
  });

  it("trims the tallest attributes until the budget fits", () => {
    const out = normaliseAttributes({ vigor: 8, control: 8, endurance: 8, cunning: 8, social: 8, intelligence: 8 });
    expect(attributePointsSpent(out)).toBe(ATTRIBUTE_POINTS_TOTAL);
    for (const id of ATTRIBUTE_IDS) {
      expect(out[id], id).toBeGreaterThanOrEqual(ATTRIBUTE_MIN);
      expect(out[id], id).toBeLessThanOrEqual(ATTRIBUTE_MAX);
    }
    expect(attributesComplete(out)).toBe(true);
  });

  it("fills in the attributes a partial sheet left out", () => {
    const out = normaliseAttributes({ vigor: 6, control: 4 });
    expect(out.vigor).toBe(6);
    expect(out.control).toBe(4);
    for (const id of ATTRIBUTE_IDS) expect(out[id], id).toBeGreaterThanOrEqual(ATTRIBUTE_MIN);
    expect(attributesComplete(out)).toBe(true);
  });

  it("trims the supplied attribute back when the rest default to the even spread", () => {
    // 6 plus five untouched attributes at 5 is 31, so the budget wins and the
    // surplus comes off the tallest.
    const out = normaliseAttributes({ vigor: 6 });
    expect(attributesComplete(out)).toBe(true);
    expect(attributePointsSpent(out)).toBe(ATTRIBUTE_POINTS_TOTAL);
  });

  it("falls back to the even spread on nonsense", () => {
    for (const raw of [undefined, null, "nope", 42, [], { vigor: Number.NaN }, { vigor: Number.POSITIVE_INFINITY }]) {
      expect(normaliseAttributes(raw)).toEqual(evenAttributes());
    }
  });

  it("falls back to the even spread rather than rounding a fractional sheet", () => {
    // Rounding 5.5 attributes would quietly change a character's budget without
    // telling anyone, so a non-integer sheet is refused outright.
    expect(normaliseAttributes({ vigor: 5.5 })).toEqual(evenAttributes());
  });
});

describe("focus allocation", () => {
  it("starts empty and counts what is spent", () => {
    const focus = emptyFocus();
    expect(focusSpent(focus)).toBe(0);
    expect(focusRemaining(focus, FOCUS_POINTS_TOTAL)).toBe(FOCUS_POINTS_TOTAL);
    expect(focusRemaining({ one_handed: 2, trade: 1 }, FOCUS_POINTS_TOTAL)).toBe(
      FOCUS_POINTS_TOTAL - 3,
    );
  });

  it("normalises a partial sheet, dropping unknown ids and negatives", () => {
    const out = normaliseFocus({ one_handed: 2, swordplay: 3, trade: -1 }, 10);
    expect(out.one_handed).toBe(2);
    expect(out.trade).toBe(0);
    expect(focusSpent(out)).toBe(2);
  });

  it("takes points back from the deepest skill until an over-budget sheet is legal", () => {
    const out = normaliseFocus({ one_handed: 5, trade: 5, bow: 5 }, 4);
    expect(focusSpent(out)).toBe(4);
    for (const id of SKILL_IDS) expect(out[id], id).toBeLessThanOrEqual(5);
    // Draining the deepest first spreads the budget across the three skills that
    // had it rather than zeroing one and leaving two full.
    expect(Object.values(out).filter((v) => v > 0).length).toBe(3);
  });

  it("falls back to empty on nonsense rather than rounding", () => {
    expect(normaliseFocus(undefined)).toEqual(emptyFocus());
    expect(normaliseFocus("nope")).toEqual(emptyFocus());
    expect(normaliseFocus({ one_handed: 1.5 })).toEqual(emptyFocus());
  });
});

describe("starting skill levels", () => {
  it("gives every skill its attribute's contribution and nothing else", () => {
    const levels = startingSkillLevels(evenAttributes(), emptyFocus());
    expect(Object.keys(levels).sort()).toEqual([...SKILL_IDS].sort());
    for (const skill of SKILLS) {
      expect(levels[skill.id], skill.id).toBe(5 * ATTRIBUTE_LEVEL_XP);
    }
  });

  it("leaves the starting sheet short of the first perk by less than a focus point", () => {
    // Otherwise the first perk is free in all eighteen skills for every character.
    const levels = startingSkillLevels(evenAttributes(), emptyFocus());
    for (const skill of SKILLS) {
      expect(levels[skill.id], skill.id).toBeLessThan(PERK_THRESHOLDS[0]!);
    }
    // The gap is real but smaller than one focus point, so the first perk in a
    // given skill is a choice about which skills get one.
    const gap = PERK_THRESHOLDS[0]! - 5 * ATTRIBUTE_LEVEL_XP;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThanOrEqual(FOCUS_POINT_XP);
  });

  it("crosses the first perk on one focus point", () => {
    const levels = startingSkillLevels(evenAttributes(), { ...emptyFocus(), trade: 1 });
    expect(perksEarned(levels.trade)).toBe(1);
    expect(perksEarned(levels.charm)).toBe(0);
  });

  it("lets a maxed attribute reach the first perk on its own", () => {
    // 8 levels at 4 points is 32, which is past 25: pouring an attribute into one
    // skill is a legitimate second route to the first perk.
    const levels = startingSkillLevels({ vigor: ATTRIBUTE_MAX }, emptyFocus());
    expect(levels.one_handed).toBe(ATTRIBUTE_MAX * ATTRIBUTE_LEVEL_XP);
    expect(perksEarned(levels.one_handed)).toBe(1);
    // A skill under an attribute left at the floor is nowhere near it.
    expect(levels.charm).toBe(ATTRIBUTE_MIN * ATTRIBUTE_LEVEL_XP);
    expect(perksEarned(levels.charm)).toBe(0);
  });

  it("adds a focus point to the skill it was spent on and no other", () => {
    const focus = { ...emptyFocus(), trade: 3 };
    const levels = startingSkillLevels(evenAttributes(), focus);
    expect(levels.trade).toBe(5 * ATTRIBUTE_LEVEL_XP + 3 * FOCUS_POINT_XP);
    const others = SKILLS.filter((s) => s.id !== "trade");
    for (const skill of others) expect(levels[skill.id], skill.id).toBe(5 * ATTRIBUTE_LEVEL_XP);
  });

  it("maps every legacy background bonus onto a canonical skill", () => {
    for (const legacyId of Object.keys(LEGACY_SKILL_ALIASES)) {
      expect(isSkillId(LEGACY_SKILL_ALIASES[legacyId]!), `${legacyId} -> ${LEGACY_SKILL_ALIASES[legacyId]}`).toBe(true);
    }
    // Every skill the backgrounds actually name has somewhere to go.
    for (const legacyId of ["combat", "streetwise", "stealth", "survival"]) {
      expect(LEGACY_SKILL_ALIASES[legacyId], legacyId).toBeDefined();
    }
  });

  it("converts a background bonus above the base into skill points, once", () => {
    const base = startingSkillLevels(evenAttributes(), emptyFocus(), {});
    // `computeCharacterStats` gives base 1 plus bonuses; the base is not a bonus.
    const withBonus = startingSkillLevels(evenAttributes(), emptyFocus(), { combat: 3 });
    expect(withBonus.one_handed - base.one_handed).toBe(2 * LEGACY_BONUS_XP);
    // The generic combat bonus is not a promise of six separate specialisations, so
    // the ranged skills stay where they were.
    expect(withBonus.crossbow).toBe(base.crossbow);
  });

  it("ignores a legacy id with no mapping and floors a negative bonus at zero", () => {
    const base = startingSkillLevels(evenAttributes(), emptyFocus(), {});
    const unknown = startingSkillLevels(evenAttributes(), emptyFocus(), { swordplay: 9 });
    expect(unknown).toEqual(base);

    // A negative that only just exceeds the attribute's own share trims to what is
    // left rather than wrapping.
    const trimmed = startingSkillLevels({ vigor: ATTRIBUTE_MAX }, emptyFocus(), { combat: -2 });
    expect(trimmed.one_handed).toBe(ATTRIBUTE_MAX * ATTRIBUTE_LEVEL_XP - 3 * LEGACY_BONUS_XP);

    // A negative that swamps it floors, because a skill is never below nothing.
    const floored = startingSkillLevels(
      { vigor: ATTRIBUTE_MIN },
      emptyFocus(),
      { combat: -9 },
    );
    expect(floored.one_handed).toBe(0);
    expect(floored.one_handed).toBeGreaterThanOrEqual(0);
  });

  it("lets a big background bonus reach the first perk threshold", () => {
    const levels = startingSkillLevels(evenAttributes(), emptyFocus(), { combat: 3 });
    expect(perksEarned(levels.one_handed)).toBe(1);
  });
});

describe("perk thresholds", () => {
  it("counts the thresholds earned", () => {
    expect(perksEarned(0)).toBe(0);
    expect(perksEarned(24)).toBe(0);
    expect(perksEarned(25)).toBe(1);
    expect(perksEarned(200)).toBe(7);
    expect(perksEarned(275)).toBe(8);
    expect(perksEarned(10_000)).toBe(8);
  });

  it("reports the next threshold, and none once they are all earned", () => {
    expect(nextPerkThreshold(0)).toBe(25);
    expect(nextPerkThreshold(24)).toBe(25);
    expect(nextPerkThreshold(25)).toBe(50);
    expect(nextPerkThreshold(275)).toBeNull();
  });

  it("counts nothing for a level that is not a number", () => {
    expect(perksEarned(Number.NaN)).toBe(0);
    expect(perksEarned(Number.POSITIVE_INFINITY)).toBe(8);
  });
});