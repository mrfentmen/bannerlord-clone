/**
 * Character maker data: family backgrounds, modernized from Bannerlord's
 * ancestry stage.
 *
 * In Bannerlord the first choice is the family you were born into \u2014 six
 * archetypes (Baron's Retainers, Urban Merchants, Yeomen, Urban Blacksmiths,
 * Hunters, Mercenaries), each granting +1 attribute and skill focus. This file
 * is the modern-American version of that stage: the same six archetypes,
 * translated to the country the game is set in.
 *
 * The mapping:
 * - Baron's Retainers (knight's household) -> Badge Family (cops, troopers, Guard)
 * - Urban Merchants (caravan guild)         -> Merchant Family (storefronts, trucking)
 * - Yeomen / Farmers (freeholders)          -> Farm Family (worked their own land)
 * - Urban Blacksmiths (city smithy)         -> Trade Family (mechanics, welders, machinists)
 * - Hunters (poachers, trappers)            -> Outdoors Family (guides, trappers)
 * - Mercenaries (sellswords)                -> Contractor Family (private security, convoy guards)
 *
 * Each family grants +1 to one attribute (applied on top of the maker's
 * point-buy at review), skill bonuses in the same nine-skill vocabulary the
 * life stages use (`data/backgrounds.ts`, mapped to the canonical eighteen
 * by `LEGACY_SKILL_ALIASES` in `data/attributes.ts`), a starting cash bonus,
 * and a story line for the biography.
 */

import type { AttributeId } from "./attributes.js";
import { ATTRIBUTE_MAX } from "./attributes.js";
import type { BackgroundCategory, BackgroundOption } from "./backgrounds.js";

/** A family background choice: a background option plus its attribute bonus. */
export interface FamilyOption extends BackgroundOption {
  /** The attribute this family grants +1 in, Bannerlord-style. */
  attributeBonus: {
    attribute: AttributeId;
    points: number;
  };
}

function family(
  id: string,
  label: string,
  description: string,
  attribute: AttributeId,
  skills: Record<string, number>,
  cash: number,
  story: string,
): FamilyOption {
  return {
    id,
    label,
    description,
    skills,
    cash,
    story,
    attributeBonus: { attribute, points: 1 },
  };
}

/** The six family archetypes. */
export const FAMILIES: FamilyOption[] = [
  family(
    "badge",
    "Badge Family",
    "Your father wore the badge or the uniform \u2014 cop, trooper, or Guard.",
    "social",
    { leadership: 2, combat: 1 },
    400,
    "You grew up standing straight, speaking clearly, and knowing exactly how the system works.",
  ),
  family(
    "merchant",
    "Merchant Family",
    "Your family ran a business \u2014 a storefront, a trucking line, a warehouse.",
    "intelligence",
    { trade: 2, leadership: 1 },
    1200,
    "You learned margins before manners, and you can smell a bad deal at fifty paces.",
  ),
  family(
    "farm",
    "Farm Family",
    "Freeholders who worked their own land and answered to no one.",
    "endurance",
    { athletics: 2, survival: 1 },
    300,
    "You were up before dawn and useful by eight. Hard work never scared you.",
  ),
  family(
    "trade",
    "Trade Family",
    "Mechanics, welders, machinists \u2014 the shop was the family church.",
    "vigor",
    { engineering: 2, combat: 1 },
    600,
    "You can fix anything with moving parts and you are not afraid of a fight in the parking lot.",
  ),
  family(
    "outdoors",
    "Outdoors Family",
    "Guides, trappers, and people who never quite lived indoors.",
    "control",
    { stealth: 2, survival: 1 },
    200,
    "You learned to read sign, move quiet, and live off what the land gives.",
  ),
  family(
    "contractor",
    "Contractor Family",
    "Private security, convoy guards, camp followers \u2014 war was the family business.",
    "vigor",
    { combat: 2, athletics: 1 },
    500,
    "You grew up around people who got paid to be dangerous, and some of it rubbed off.",
  ),
];

/** The family stage: the first category of character creation. */
export const FAMILY_CATEGORY: BackgroundCategory = {
  id: "family",
  label: "Family",
  question: "What family were you born into?",
  options: FAMILIES,
};

/** Look up a family option by id. */
export function familyById(id: string): FamilyOption | undefined {
  return FAMILIES.find((f) => f.id === id);
}

/**
 * The attribute bonus a family choice grants, Bannerlord-style: +1 to one
 * attribute, free, on top of the maker's point-buy.
 *
 * The maker's stored attributes stay a pure 30-point buy (the campaign wire
 * and its tests pin that), so the bonus is applied at derivation time \u2014
 * here in the review step, and by the campaign whenever it derives starting
 * skill levels from a stored character. Capped at the attribute max so a
 * family can never push a maxed attribute past it.
 */
export function attributesWithFamilyBonus(
  attributes: Record<AttributeId, number>,
  familyId: string | undefined,
): Record<AttributeId, number> {
  const out = { ...attributes };
  const fam = familyId ? familyById(familyId) : undefined;
  const bonus = fam?.attributeBonus;
  if (bonus) {
    const current = out[bonus.attribute] ?? 0;
    out[bonus.attribute] = Math.min(ATTRIBUTE_MAX, current + bonus.points);
  }
  return out;
}
