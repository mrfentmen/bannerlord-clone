/**
 * The six attributes and the eighteen skills (CHARACTER.md sections 2 and 3).
 *
 * The catalog here is the client's copy of `services/world-data/data/skills.json`:
 * the same six attribute ids, the same eighteen skill ids, the same governing
 * attribute for each skill, and the same perk thresholds. `attributes.test.ts`
 * reads that JSON off disk and asserts all four agree, so the two cannot drift
 * without a test failing rather than a character silently governed by the wrong
 * attribute.
 *
 * Why the client keeps a copy at all: `skills.json` is world data the client only
 * ever sees if a running world-data service happens to be reachable, and a character
 * sheet cannot be conditional on a network fetch. The test is the contract.
 *
 * Two scales live here and they are not interchangeable. A *skill level* is the
 * number perks trigger on, so it runs to hundreds. A *focus point* is a budget a
 * character spends at creation and is a small whole number. Conflating them is the
 * mistake `ClanMember.skills` (documented 0-100) and this module would otherwise
 * invite, which is why the conversions are named constants below rather than
 * arithmetic sprinkled through the panels.
 */

/** The six attributes, in the order `skills.json` lists them. */
export const ATTRIBUTE_IDS = [
  "vigor",
  "control",
  "endurance",
  "cunning",
  "social",
  "intelligence",
] as const;

export type AttributeId = (typeof ATTRIBUTE_IDS)[number];

/** The eighteen skills, in the order `skills.json` lists them: three per attribute. */
export const SKILL_IDS = [
  "one_handed",
  "two_handed",
  "polearm",
  "bow",
  "crossbow",
  "throwing",
  "riding",
  "athletics",
  "smithing",
  "scouting",
  "tactics",
  "roguery",
  "charm",
  "leadership",
  "trade",
  "steward",
  "medicine",
  "engineering",
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export interface AttributeDef {
  id: AttributeId;
  name: string;
  description: string;
  /** The three skill ids this attribute governs. */
  skills: readonly SkillId[];
}

export interface SkillDef {
  id: SkillId;
  name: string;
  /** The attribute that caps this skill's growth. */
  attribute: AttributeId;
  description: string;
  /** Perk unlock thresholds, ascending. Eight per skill in `skills.json`. */
  perkThresholds: readonly number[];
}

/**
 * Perk thresholds, from the `skills.json` header comment: "Perks at thresholds
 * 25/50/75/100/125/175/200/275". Every skill has all eight.
 */
export const PERK_THRESHOLDS: readonly number[] = [25, 50, 75, 100, 125, 175, 200, 275];

export const ATTRIBUTES: readonly AttributeDef[] = [
  {
    id: "vigor",
    name: "Vigor",
    description: "Melee combat. Street fighting, physical intimidation.",
    skills: ["one_handed", "two_handed", "polearm"],
  },
  {
    id: "control",
    name: "Control",
    description: "Ranged. Firearms, throwing.",
    skills: ["bow", "crossbow", "throwing"],
  },
  {
    id: "endurance",
    name: "Endurance",
    description: "Movement, crafting. Driving, athletics, repair.",
    skills: ["riding", "athletics", "smithing"],
  },
  {
    id: "cunning",
    name: "Cunning",
    description: "Recon, trickery. Scouting, tactics, roguery.",
    skills: ["scouting", "tactics", "roguery"],
  },
  {
    id: "social",
    name: "Social",
    description: "People. Charm, leadership, trade.",
    skills: ["charm", "leadership", "trade"],
  },
  {
    id: "intelligence",
    name: "Intelligence",
    description: "Support. Medicine, engineering, steward.",
    skills: ["steward", "medicine", "engineering"],
  },
];

export const SKILLS: readonly SkillDef[] = [
  {
    id: "one_handed",
    name: "One-Handed",
    attribute: "vigor",
    description: "Bats, machetes, knives. Fast, versatile.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "two_handed",
    name: "Two-Handed",
    attribute: "vigor",
    description: "Sledgehammers, fire axes. Slow, devastating.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "polearm",
    name: "Polearm",
    attribute: "vigor",
    description: "Long reach. Crowbars, improvised spears.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "bow",
    name: "Bow",
    attribute: "control",
    description: "Hunting bows, compound bows. Silent, ammo-efficient.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "crossbow",
    name: "Crossbow",
    attribute: "control",
    description: "Pistols, rifles. Loud, powerful.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "throwing",
    name: "Throwing",
    attribute: "control",
    description: "Molotovs, knives, bricks.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "riding",
    name: "Driving",
    attribute: "endurance",
    description: "Vehicles, motorcycles. (Port of Riding)",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "athletics",
    name: "Athletics",
    attribute: "endurance",
    description: "Running, climbing, stamina.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "smithing",
    name: "Repair",
    attribute: "endurance",
    description: "Fix weapons, vehicles, gear. (Port of Smithing)",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "scouting",
    name: "Scouting",
    attribute: "cunning",
    description: "Spotting enemies, tracking.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "tactics",
    name: "Tactics",
    attribute: "cunning",
    description: "Battlefield command.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "roguery",
    name: "Roguery",
    attribute: "cunning",
    description: "Stealth, lockpicking, crime.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "charm",
    name: "Charm",
    attribute: "social",
    description: "Persuasion, negotiation.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "leadership",
    name: "Leadership",
    attribute: "social",
    description: "Commanding troops.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "trade",
    name: "Trade",
    attribute: "social",
    description: "Buying low, selling high.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "steward",
    name: "Steward",
    attribute: "intelligence",
    description: "Managing party, logistics.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "medicine",
    name: "Medicine",
    attribute: "intelligence",
    description: "Healing wounded.",
    perkThresholds: PERK_THRESHOLDS,
  },
  {
    id: "engineering",
    name: "Engineering",
    attribute: "intelligence",
    description: "Breaching, building.",
    perkThresholds: PERK_THRESHOLDS,
  },
];

const SKILL_BY_ID: ReadonlyMap<SkillId, SkillDef> = new Map(SKILLS.map((s) => [s.id, s]));
const ATTRIBUTE_BY_ID: ReadonlyMap<AttributeId, AttributeDef> = new Map(
  ATTRIBUTES.map((a) => [a.id, a]),
);

/** A skill by id, or undefined when the id is not one of the eighteen. */
export function skillDef(id: string): SkillDef | undefined {
  return SKILL_BY_ID.get(id as SkillId);
}

/** An attribute by id, or undefined when the id is not one of the six. */
export function attributeDef(id: string): AttributeDef | undefined {
  return ATTRIBUTE_BY_ID.get(id as AttributeId);
}

/** True when `id` is one of the eighteen skill ids. */
export function isSkillId(id: string): id is SkillId {
  return SKILL_BY_ID.has(id as SkillId);
}

/** True when `id` is one of the six attribute ids. */
export function isAttributeId(id: string): id is AttributeId {
  return ATTRIBUTE_BY_ID.has(id as AttributeId);
}

/** The display name for a skill id, or the id made readable if it is unknown. */
export function skillLabel(id: string): string {
  return SKILL_BY_ID.get(id as SkillId)?.name ?? humanise(id);
}

/** The display name for an attribute id, or the id made readable if it is unknown. */
export function attributeLabel(id: string): string {
  return ATTRIBUTE_BY_ID.get(id as AttributeId)?.name ?? humanise(id);
}

/**
 * `polearm` reads as `Polearm` and `bg-childhood` as `Bg childhood`. Used only
 * for ids the catalog does not know, so a skill nobody has heard of still prints
 * something the player can look up instead of a bare identifier or a blank row.
 */
function humanise(id: string): string {
  const words = id.replace(/[_-]+/g, " ").trim();
  return words.length === 0 ? id : words[0]!.toUpperCase() + words.slice(1);
}

// -- allocation rules --------------------------------------------------------

/**
 * CHARACTER.md, "Character Creation In Detail" step 2: "Distribute 30 points
 * across 6 attributes (min 3, max 8 each)". Six at the floor is 18 and six at the
 * ceiling is 48, so 30 sits inside the reachable band and the budget is spendable
 * with no illegal combinations left over.
 *
 * The parenthetical in that same line names Strength, Agility, Endurance,
 * Intellect, Charisma, and Luck, which is a different, D&D-flavoured list and
 * contradicts the attribute table earlier in the same document. `skills.json`
 * agrees with the table, so the table wins and these are the ids that ship.
 */
export const ATTRIBUTE_POINTS_TOTAL = 30;
export const ATTRIBUTE_MIN = 3;
export const ATTRIBUTE_MAX = 8;

/** Focus points a new character may spend on individual skills. */
export const FOCUS_POINTS_TOTAL = 5;

/**
 * What one level of an attribute is worth, in skill points, to each skill it governs.
 *
 * Four, not five, and the arithmetic is the reason. Thirty points over six
 * attributes is an even spread of five, and five fives is exactly the first perk
 * threshold of 25 — so a factor of five would hand every character in the game
 * their first perk in all eighteen skills for free, and a perk that everyone has
 * is not a choice. At four, the starting sheet sits at 20 in every skill: 5 short
 * of the first perk, which is less than the 10 a single focus point is worth. So
 * the first perk in any given skill is a choice about which skills to put it in,
 * rather than something every character already has everywhere.
 */
export const ATTRIBUTE_LEVEL_XP = 4;

/** What one focus point is worth, in skill points, to the skill it is spent on. */
export const FOCUS_POINT_XP = 10;

/**
 * What one background skill bonus is worth, in skill points.
 *
 * Backgrounds in `backgrounds.ts` speak in small whole bonuses (1 to 3) because
 * they were written against the old nine-skill sheet. Carrying those numbers
 * across as skill points would leave every background worth under 5, which is
 * below the first perk threshold and therefore invisible; ten is what makes a
 * two-point background bonus able to reach the threshold at 25.
 */
export const LEGACY_BONUS_XP = 10;

/**
 * The old nine-skill ids the background and age data still use, mapped onto the
 * eighteen.
 *
 * Five are renames or direct carries. Four are approximations, and they are
 * approximations because the canonical eighteen have no equivalent, not because
 * the mapping is arbitrary:
 *
 * - `streetwise` is `roguery`, which `skills.json` names as Streetcraft's port.
 * - `stealth` folds into `scouting`, the closest of the eighteen for moving
 *   unseen; there is no separate stealth skill.
 * - `survival` folds into `riding`, the mobility skill; there is no separate
 *   outdoor-craft skill.
 * - `combat` carries the whole generic bonus to `one_handed`, which is the
 *   melee half of it. The ranged skills are deliberately left out rather than
 *   credited the same points a second time, because a generic combat bonus is
 *   not a promise of six separate combat specialisations.
 */
export const LEGACY_SKILL_ALIASES: Readonly<Record<string, SkillId>> = {
  combat: "one_handed",
  leadership: "leadership",
  trade: "trade",
  medicine: "medicine",
  engineering: "engineering",
  athletics: "athletics",
  streetwise: "roguery",
  stealth: "scouting",
  survival: "riding",
};

/**
 * The six attributes with the budget spread evenly: 30 over 6 is 5 each, which is
 * legal under both the floor and the ceiling. The maker opens on this so the
 * player starts from a valid sheet rather than an empty one.
 */
export function evenAttributes(): Record<AttributeId, number> {
  const per = Math.floor(ATTRIBUTE_POINTS_TOTAL / ATTRIBUTE_IDS.length);
  const out = {} as Record<AttributeId, number>;
  for (const id of ATTRIBUTE_IDS) out[id] = per;
  return out;
}

/** Points spent across the six, ignoring ids that are not attributes. */
export function attributePointsSpent(attributes: Partial<Record<AttributeId, number>>): number {
  let total = 0;
  for (const id of ATTRIBUTE_IDS) total += attributes[id] ?? 0;
  return total;
}

/** Points left to spend. Negative once the budget is exceeded. */
export function attributePointsRemaining(attributes: Partial<Record<AttributeId, number>>): number {
  return ATTRIBUTE_POINTS_TOTAL - attributePointsSpent(attributes);
}

/** True when the sheet spends the whole budget with no attribute under the floor or over the ceiling. */
export function attributesComplete(attributes: Partial<Record<AttributeId, number>>): boolean {
  if (attributePointsSpent(attributes) !== ATTRIBUTE_POINTS_TOTAL) return false;
  for (const id of ATTRIBUTE_IDS) {
    const value = attributes[id] ?? 0;
    if (!Number.isInteger(value) || value < ATTRIBUTE_MIN || value > ATTRIBUTE_MAX) return false;
  }
  return true;
}

/** True when this attribute could take another point: under the ceiling, budget left. */
export function canRaiseAttribute(
  attributes: Partial<Record<AttributeId, number>>,
  id: AttributeId,
): boolean {
  return (attributes[id] ?? 0) < ATTRIBUTE_MAX && attributePointsRemaining(attributes) > 0;
}

/** True when this attribute could give a point back: over the floor. */
export function canLowerAttribute(
  attributes: Partial<Record<AttributeId, number>>,
  id: AttributeId,
): boolean {
  return (attributes[id] ?? 0) > ATTRIBUTE_MIN;
}

/**
 * A complete, legal attribute sheet from anything shaped like a partial one.
 *
 * Unknown ids are dropped, non-integers are refused (returned as the even spread
 * rather than silently rounded), every attribute is clamped into the floor and
 * ceiling, and the budget is honoured by trimming from the highest attributes down
 * until the total fits. A sheet arriving from a save file or a caller that knows
 * nothing about the rules therefore still produces something the maker can show
 * and `startingSkillLevels` can read.
 */
export function normaliseAttributes(raw: unknown): Record<AttributeId, number> {
  const out = evenAttributes();
  if (typeof raw !== "object" || raw === null) return out;
  const source = raw as Record<string, unknown>;

  for (const id of ATTRIBUTE_IDS) {
    const value = source[id];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const whole = Math.round(value);
    if (whole !== value) return evenAttributes();
    out[id] = Math.min(ATTRIBUTE_MAX, Math.max(ATTRIBUTE_MIN, whole));
  }

  // Over budget: trim the highest attributes, never below the floor. The total is
  // the sum of the sheet rather than of the keys the caller supplied, because the
  // ones the caller left out are already sitting at the even spread and count too.
  let total = attributePointsSpent(out);
  while (total > ATTRIBUTE_POINTS_TOTAL) {
    let tallest: AttributeId | null = null;
    let tallestValue = ATTRIBUTE_MIN;
    for (const id of ATTRIBUTE_IDS) {
      if (out[id] > tallestValue) {
        tallest = id;
        tallestValue = out[id];
      }
    }
    if (tallest === null) return evenAttributes();
    out[tallest] = tallestValue - 1;
    total -= 1;
  }
  return out;
}

/** A focus sheet with no points in it. */
export function emptyFocus(): Record<SkillId, number> {
  const out = {} as Record<SkillId, number>;
  for (const id of SKILL_IDS) out[id] = 0;
  return out;
}

/** Focus points spent across the eighteen. */
export function focusSpent(focus: Partial<Record<SkillId, number>>): number {
  let total = 0;
  for (const id of SKILL_IDS) total += focus[id] ?? 0;
  return total;
}

/** Points left to spend on skills. */
export function focusRemaining(focus: Partial<Record<SkillId, number>>, total: number): number {
  return total - focusSpent(focus);
}

/** True when this skill could take another focus point: the budget has room. */
export function canSpendFocus(
  focus: Partial<Record<SkillId, number>>,
  total: number,
): boolean {
  return focusRemaining(focus, total) > 0;
}

/**
 * A complete focus sheet from anything shaped like a partial one: unknown ids
 * dropped, negative counts floored at zero, and the budget honoured by taking
 * points back from the most-invested skills first so an over-budget sheet lands on
 * a legal one instead of being refused.
 */
export function normaliseFocus(raw: unknown, total: number = FOCUS_POINTS_TOTAL): Record<SkillId, number> {
  const out = emptyFocus();
  if (typeof raw !== "object" || raw === null) return out;
  const source = raw as Record<string, unknown>;

  for (const id of SKILL_IDS) {
    const value = source[id];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const whole = Math.round(value);
    if (whole !== value) return emptyFocus();
    if (whole > 0) out[id] = whole;
  }

  let spent = focusSpent(out);
  while (spent > total) {
    let deepest: SkillId | null = null;
    let deepestValue = 0;
    for (const id of SKILL_IDS) {
      if (out[id] > deepestValue) {
        deepest = id;
        deepestValue = out[id];
      }
    }
    if (deepest === null) break;
    out[deepest] = deepestValue - 1;
    spent -= 1;
  }
  return out;
}

/**
 * The eighteen starting skill levels.
 *
 * A skill's level is its governing attribute's level (every attribute level is
 * worth `ATTRIBUTE_LEVEL_XP` to each of its three skills), plus whatever focus was
 * spent on it directly, plus whatever the background sheet granted.
 *
 * The attribute floor of 3 is worth 12 points and the starting spread of 5 is
 * worth 20, both under the first perk threshold of 25. Attributes decide how fast
 * a skill grows and where its ceiling is; a focus point or a background bonus is
 * what actually buys the first perk, which is why the gap is left open rather than
 * closed for the player.
 *
 * `legacySkills` is the background sheet's own bonus map — the result of
 * `computeCharacterStats` minus the base 1 every skill starts on — because it names
 * the old nine ids and `LEGACY_SKILL_ALIASES` is the one place that knows how to
 * read them.
 */
export function startingSkillLevels(
  attributes: Partial<Record<AttributeId, number>>,
  focus: Partial<Record<SkillId, number>>,
  legacySkills: Record<string, number> = {},
  base: number = 1,
): Record<SkillId, number> {
  const out = {} as Record<SkillId, number>;
  for (const skill of SKILLS) {
    const level = attributes[skill.attribute] ?? ATTRIBUTE_MIN;
    out[skill.id] = level * ATTRIBUTE_LEVEL_XP + (focus[skill.id] ?? 0) * FOCUS_POINT_XP;
  }

  for (const [legacyId, points] of Object.entries(legacySkills)) {
    const bonus = (points - base) * LEGACY_BONUS_XP;
    if (bonus === 0) continue;
    const skillId = LEGACY_SKILL_ALIASES[legacyId];
    if (skillId === undefined) continue;
    out[skillId] = Math.max(0, out[skillId] + bonus);
  }
  return out;
}

/**
 * How many of a skill's perks its level has earned.
 *
 * Counted rather than looked up because the perk names live in world data, not
 * here: the client knows the eight thresholds and what they are called, and the
 * panels that print a skill say "3 of 8 perks" rather than naming perks this build
 * has never read.
 */
export function perksEarned(level: number, thresholds: readonly number[] = PERK_THRESHOLDS): number {
  // Only NaN is refused. An infinite level is nonsense data, but it is nonsense
  // that is *more* of everything, and counting it as zero perks would make the
  // function non-monotonic — a bigger number buying fewer perks.
  if (typeof level !== "number" || Number.isNaN(level)) return 0;
  let earned = 0;
  for (const threshold of thresholds) {
    if (level >= threshold) earned += 1;
  }
  return earned;
}

/** The next threshold this level has not reached, or null once they are all earned. */
export function nextPerkThreshold(
  level: number,
  thresholds: readonly number[] = PERK_THRESHOLDS,
): number | null {
  for (const threshold of thresholds) {
    if (level < threshold) return threshold;
  }
  return null;
}