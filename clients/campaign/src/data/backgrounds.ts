/**
 * Character maker data: Bannerlord-style background choices for modern America.
 *
 * Like Bannerlord's culture + background system, each choice gives starting
 * skill bonuses and a bit of story. Two pros, one con per ethnicity (already
 * in `ethnicities.ts`). These backgrounds stack on top.
 *
 * Each background option grants:
 * - skill bonuses (applied to starting skills)
 * - a starting item or cash bonus
 * - flavor text for the character story
 */

import type { AttributeId, SkillId } from "./attributes.js";
import { FAMILY_CATEGORY } from "./families.js";

/** A single background choice (childhood, youth, training, etc.). */
export interface BackgroundOption {
  id: string;
  label: string;
  description: string;
  /** Skill bonuses: skill name -> points. */
  skills: Record<string, number>;
  /** Starting cash bonus (can be negative). */
  cash: number;
  /** Flavor text for the character biography. */
  story: string;
}

/** A background category (e.g. "Childhood", "Youth"). */
export interface BackgroundCategory {
  id: string;
  label: string;
  question: string;
  options: BackgroundOption[];
}

export const BACKGROUNDS: BackgroundCategory[] = [
  {
    id: "childhood",
    label: "Childhood",
    question: "Where did you grow up?",
    options: [
      {
        id: "projects",
        label: "Housing Projects",
        description: "Concrete towers, thin walls, thick skin.",
        skills: { streetwise: 2, athletics: 1 },
        cash: 0,
        story: "You learned to read a room before you could read a book.",
      },
      {
        id: "suburbs",
        label: "Suburbs",
        description: "Quiet streets, good schools, big expectations.",
        skills: { leadership: 1, trade: 1 },
        cash: 500,
        story: "You had every advantage and knew exactly what it cost.",
      },
      {
        id: "rural",
        label: "Small Town",
        description: "Everyone knows your name and your business.",
        skills: { survival: 2, athletics: 1 },
        cash: 200,
        story: "You learned to fix things because there was no one else to call.",
      },
      {
        id: "foster",
        label: "Foster Care",
        description: "Moved house to house, learned to adapt fast.",
        skills: { streetwise: 1, stealth: 2 },
        cash: 0,
        story: "You learned to pack light and trust slow.",
      },
    ],
  },
  {
    id: "youth",
    label: "Youth",
    question: "What did you do as a teenager?",
    options: [
      {
        id: "athlete",
        label: "Athlete",
        description: "You lived for the game.",
        skills: { athletics: 3, leadership: 1 },
        cash: 0,
        story: "The field was the only place where the rules were fair.",
      },
      {
        id: "hustler",
        label: "Hustler",
        description: "You learned to make money move.",
        skills: { trade: 2, streetwise: 2 },
        cash: 300,
        story: "You could sell ice to a snowman and knew every corner's price.",
      },
      {
        id: "student",
        label: "Student",
        description: "Books over streets.",
        skills: { medicine: 1, engineering: 2 },
        cash: 0,
        story: "You stayed late in the library while the block stayed loud outside.",
      },
      {
        id: "gang",
        label: "Ran with a Crew",
        description: "Loyalty was everything.",
        skills: { combat: 2, streetwise: 1 },
        cash: 100,
        story: "You learned that family isn't always blood.",
      },
    ],
  },
  {
    id: "training",
    label: "Training",
    question: "How did you learn to fight?",
    options: [
      {
        id: "military",
        label: "Military Service",
        description: "Discipline, tactics, and a DD-214.",
        skills: { combat: 3, leadership: 2, medicine: 1 },
        cash: 1000,
        story: "You served your country and came home with skills no civilian has.",
      },
      {
        id: "boxing",
        label: "Boxing Gym",
        description: "Old-school sweet science.",
        skills: { combat: 3, athletics: 2 },
        cash: 0,
        story: "The gym smelled like leather and bleach. You learned to take a hit.",
      },
      {
        id: "street",
        label: "Street Fighting",
        description: "No rules, no refs, no mercy.",
        skills: { combat: 2, stealth: 2, streetwise: 1 },
        cash: 0,
        story: "You learned to fight where losing meant more than a bruise.",
      },
      {
        id: "self",
        label: "Self-Taught",
        description: "YouTube tutorials and stubbornness.",
        skills: { combat: 1, engineering: 1, survival: 1 },
        cash: 200,
        story: "Nobody taught you. You figured it out the hard way.",
      },
    ],
  },
  {
    id: "profession",
    label: "Profession",
    question: "What did you do before all this?",
    options: [
      {
        id: "mechanic",
        label: "Mechanic",
        description: "You can fix anything with an engine.",
        skills: { engineering: 3, trade: 1 },
        cash: 800,
        story: "Grease under your nails and a reputation for honest work.",
      },
      {
        id: "medic",
        label: "EMT / Medic",
        description: "You've seen the worst and stayed calm.",
        skills: { medicine: 3, leadership: 1 },
        cash: 600,
        story: "You learned to keep a steady hand when everyone else panics.",
      },
      {
        id: "dealer",
        label: "Car Salesman",
        description: "You can talk anyone into anything.",
        skills: { trade: 3, streetwise: 1 },
        cash: 1200,
        story: "You sold lemons as lemonade and slept just fine.",
      },
      {
        id: "cop",
        label: "Police Officer",
        description: "You wore the badge.",
        skills: { combat: 2, leadership: 2, streetwise: 1 },
        cash: 900,
        story: "You saw the system from the inside. Now you're outside it.",
      },
    ],
  },
];

/**
 * Every stage of character creation in order, Bannerlord-style: the family
 * you were born into first, then the four life stages. The maker renders
 * these, and `computeCharacterStats` / `scenarioForBackgrounds` read them.
 * `BACKGROUNDS` stays exported unchanged for anything that only wants the
 * life stages.
 */
export const CHARACTER_STAGES: BackgroundCategory[] = [FAMILY_CATEGORY, ...BACKGROUNDS];

/** Appearance presets — face/body options for the character portrait. */
export interface AppearancePreset {
  id: string;
  label: string;
  /** Emoji or symbol for the portrait placeholder. */
  icon: string;
  description: string;
  /** Ethnicity this preset belongs to. "all" shows for every heritage. */
  ethnicityId: string;
}

/**
 * 4 appearance presets per ethnicity (40 total).
 * Icons are placeholders until the 3D portrait renderer lands.
 */
export const APPEARANCE_PRESETS: AppearancePreset[] = [
  // Italian-American
  { id: "italian-1", label: "Don", icon: "🤵", description: "Sharp suit, old-school respect.", ethnicityId: "italian" },
  { id: "italian-2", label: "Tradesman", icon: "👷", description: "Work boots, calloused hands.", ethnicityId: "italian" },
  { id: "italian-3", label: "Nonna's Favorite", icon: "🧑", description: "Charming, well-fed.", ethnicityId: "italian" },
  { id: "italian-4", label: "Street Kid", icon: "🧒", description: "Grew up on Mulberry St.", ethnicityId: "italian" },
  // Irish-American
  { id: "irish-1", label: "Southie", icon: "👨", description: "Boston tough, loyal to the core.", ethnicityId: "irish" },
  { id: "irish-2", label: "Cop", icon: "👮", description: "Third-generation badge.", ethnicityId: "irish" },
  { id: "irish-3", label: "Bartender", icon: "🧔", description: "Knows everyone's story.", ethnicityId: "irish" },
  { id: "irish-4", label: "Fighter", icon: "🥊", description: "Golden Gloves hopeful.", ethnicityId: "irish" },
  // Chinese-American
  { id: "chinese-1", label: "Scholar", icon: "👓", description: "Quiet, observant, precise.", ethnicityId: "chinese" },
  { id: "chinese-2", label: "Chef", icon: "👨‍🍳", description: "Wok hei in their veins.", ethnicityId: "chinese" },
  { id: "chinese-3", label: "Engineer", icon: "👨‍💻", description: "Builds things that last.", ethnicityId: "chinese" },
  { id: "chinese-4", label: "Lion Dancer", icon: "🦁", description: "Carries tradition forward.", ethnicityId: "chinese" },
  // Korean-American
  { id: "korean-1", label: "Shopkeeper", icon: "🧑‍💼", description: "Family business, 18-hour days.", ethnicityId: "korean" },
  { id: "korean-2", label: "Veteran", icon: "🎖️", description: "ROK Army discipline.", ethnicityId: "korean" },
  { id: "korean-3", label: "Student", icon: "🎓", description: "Top of the class, hungry for more.", ethnicityId: "korean" },
  { id: "korean-4", label: "Pastor", icon: "🙏", description: "Community pillar.", ethnicityId: "korean" },
  // African-American
  { id: "african-1", label: "Preacher", icon: "👔", description: "Voice that moves crowds.", ethnicityId: "african" },
  { id: "african-2", label: "Athlete", icon: "🏀", description: "Built for the game.", ethnicityId: "african" },
  { id: "african-3", label: "Organizer", icon: "✊", description: "Knows every block captain.", ethnicityId: "african" },
  { id: "african-4", label: "Musician", icon: "🎺", description: "Carries the culture in every note.", ethnicityId: "african" },
  // Jamaican-American
  { id: "jamaican-1", label: "Rude Boy", icon: "😎", description: "Sharp dresser, sharper wit.", ethnicityId: "jamaican" },
  { id: "jamaican-2", label: "Soundman", icon: "🎧", description: "Controls the vibe.", ethnicityId: "jamaican" },
  { id: "jamaican-3", label: "Runner", icon: "🏃", description: "Fastest on the block.", ethnicityId: "jamaican" },
  { id: "jamaican-4", label: "Elder", icon: "🧓", description: "Respected, connected.", ethnicityId: "jamaican" },
  // Mexican-American
  { id: "mexican-1", label: "Vaquero", icon: "🤠", description: "Ranch-raised, self-reliant.", ethnicityId: "mexican" },
  { id: "mexican-2", label: "Lowrider", icon: "🚗", description: "Cruises slow, shines bright.", ethnicityId: "mexican" },
  { id: "mexican-3", label: "Abuela's Pride", icon: "🧑", description: "Family first, always.", ethnicityId: "mexican" },
  { id: "mexican-4", label: "Luchador", icon: "🎭", description: "Mask on, fear off.", ethnicityId: "mexican" },
  // Puerto Rican-American
  { id: "puerto_rican-1", label: "Boricua", icon: "🇵🇷", description: "Island pride, city hustle.", ethnicityId: "puerto_rican" },
  { id: "puerto_rican-2", label: "Salsa King", icon: "💃", description: "Moves like water.", ethnicityId: "puerto_rican" },
  { id: "puerto_rican-3", label: "Bodega Owner", icon: "🏪", description: "Knows the whole neighborhood.", ethnicityId: "puerto_rican" },
  { id: "puerto_rican-4", label: "Boxer", icon: "🥊", description: "Hands of stone.", ethnicityId: "puerto_rican" },
  // German-American
  { id: "german-1", label: "Craftsman", icon: "🔨", description: "Precision in every joint.", ethnicityId: "german" },
  { id: "german-2", label: "Brewer", icon: "🍺", description: "Old-world recipes.", ethnicityId: "german" },
  { id: "german-3", label: "Engineer", icon: "⚙️", description: "If it ain't broke, improve it.", ethnicityId: "german" },
  { id: "german-4", label: "Farmer", icon: "🌾", description: "Worked the land for generations.", ethnicityId: "german" },
  // Russian-American
  { id: "russian-1", label: "Veteran", icon: "🎖️", description: "Served, survived, remembers.", ethnicityId: "russian" },
  { id: "russian-2", label: "Hacker", icon: "💻", description: "Sees systems others miss.", ethnicityId: "russian" },
  { id: "russian-3", label: "Weightlifter", icon: "🏋️", description: "Built like a tank.", ethnicityId: "russian" },
  { id: "russian-4", label: "Chess Master", icon: "♟️", description: "Thinks five moves ahead.", ethnicityId: "russian" },
];

/** Get appearance presets for a specific ethnicity. */
export function appearancesForEthnicity(ethnicityId: string): AppearancePreset[] {
  return APPEARANCE_PRESETS.filter((p) => p.ethnicityId === ethnicityId);
}

/** The full character created in the maker. */
export interface GameCharacter {
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  appearanceId: string;
  ethnicityId: string;
  backgroundChoices: Record<string, string>; // categoryId -> optionId
  /**
   * The six attributes as the player allocated them (`src/data/attributes.ts`).
   *
   * These, plus `skillFocus`, are the record CHARACTER.md describes; they are not
   * derived from the background sheet, which cannot express six attributes because
   * it was written before the client had any.
   */
  attributes: Record<AttributeId, number>;
  /** Focus points the player spent on individual skills: skill id -> points. */
  skillFocus: Record<SkillId, number>;
  /**
   * The settlement the campaign starts the player in, resolved from side and
   * heritage by `src/data/homes.ts`. The simulation resolves the slug with
   * `townByRef` and relocates the player's ruler and party there.
   */
  startCity: string;
  /** Character age. */
  age: number;
  /** Difficulty id. */
  difficulty: string;
  /**
   * The nine broad skills the background and age sheets speak in: base 1 plus what
   * the choices granted. The canonical eighteen are derived from this plus the
   * attributes by `startingSkillLevels`; the two are kept side by side because the
   * clan roster and the simulation's `ClanMember.skills` are on this sheet's scale.
   */
  startingSkills: Record<string, number>;
  startingCash: number;
  biography: string;
}

/** Clan/family names with meanings. Your last name becomes your clan name. */
export interface ClanName {
  name: string;
  meaning: string;
  ethnicityId: string;
}

export const CLAN_NAMES: ClanName[] = [
  // Italian
  { name: "Corleone", meaning: "Lion heart — commands respect", ethnicityId: "italian" },
  { name: "Marchetti", meaning: "Walkers — always moving forward", ethnicityId: "italian" },
  { name: "Ferraro", meaning: "Blacksmith — forged in fire", ethnicityId: "italian" },
  // Irish
  { name: "O'Malley", meaning: "Descendant of the chief — born leaders", ethnicityId: "irish" },
  { name: "Kavanagh", meaning: "Gentle birth — noble blood", ethnicityId: "irish" },
  { name: "Byrne", meaning: "Raven — clever and watchful", ethnicityId: "irish" },
  // Chinese
  { name: "Long", meaning: "Dragon — power and wisdom", ethnicityId: "chinese" },
  { name: "Chen", meaning: "Dawn — new beginnings", ethnicityId: "chinese" },
  { name: "Wang", meaning: "King — destined to rule", ethnicityId: "chinese" },
  // Korean
  { name: "Kim", meaning: "Gold — precious and enduring", ethnicityId: "korean" },
  { name: "Park", meaning: "Gourd — humble strength", ethnicityId: "korean" },
  { name: "Choi", meaning: "High mountain — unshakeable", ethnicityId: "korean" },
  // African-American
  { name: "Freeman", meaning: "Free man — earned liberty", ethnicityId: "african" },
  { name: "Justice", meaning: "Righteous — fights for what's right", ethnicityId: "african" },
  { name: "King", meaning: "Royalty — carries dignity", ethnicityId: "african" },
  // Jamaican
  { name: "Marley", meaning: "From the lake — flows like water", ethnicityId: "jamaican" },
  { name: "Campbell", meaning: "Crooked mouth — speaks truth", ethnicityId: "jamaican" },
  { name: "Brown", meaning: "Strong — solid foundation", ethnicityId: "jamaican" },
  // Mexican
  { name: "Guerrero", meaning: "Warrior — born fighter", ethnicityId: "mexican" },
  { name: "Vargas", meaning: "Steep slope — climbs high", ethnicityId: "mexican" },
  { name: "Reyes", meaning: "Kings — royal blood", ethnicityId: "mexican" },
  // Puerto Rican
  { name: "Rivera", meaning: "Riverbank — life flows through", ethnicityId: "puerto_rican" },
  { name: "Santiago", meaning: "Saint James — protected", ethnicityId: "puerto_rican" },
  { name: "Torres", meaning: "Towers — stands tall", ethnicityId: "puerto_rican" },
  // German
  { name: "Schmidt", meaning: "Smith — crafts with precision", ethnicityId: "german" },
  { name: "Weber", meaning: "Weaver — connects threads", ethnicityId: "german" },
  { name: "Fischer", meaning: "Fisher — patient hunter", ethnicityId: "german" },
  // Russian
  { name: "Volkov", meaning: "Wolf — hunts in packs", ethnicityId: "russian" },
  { name: "Petrov", meaning: "Son of Peter — rock solid", ethnicityId: "russian" },
  { name: "Sokolov", meaning: "Falcon — strikes from above", ethnicityId: "russian" },
];

/** Get clan name suggestions for an ethnicity. */
export function clanNamesForEthnicity(ethnicityId: string): ClanName[] {
  return CLAN_NAMES.filter((c) => c.ethnicityId === ethnicityId);
}

/** Starting scenarios — first quest hooks based on background choices. */
export interface StartingScenario {
  id: string;
  title: string;
  description: string;
  /** Background option IDs that trigger this scenario. */
  triggers: string[];
  objective: string;
  reward: string;
}

export const STARTING_SCENARIOS: StartingScenario[] = [
  {
    id: "debt-collector",
    title: "The Debt",
    description: "You owe money to the wrong people. They found you.",
    triggers: ["street", "hustler"],
    objective: "Pay off $2,000 or deal with the collector",
    reward: "Clear your name, gain street rep",
  },
  {
    id: "family-business",
    title: "Family Business",
    description: "Your family's shop is failing. You're the only hope.",
    triggers: ["suburbs", "merchant", "trade"],
    objective: "Earn $5,000 to save the shop",
    reward: "Family workshop, +trade skill",
  },
  {
    id: "military-call",
    title: "Old Unit",
    description: "Your old CO calls. He needs people he can trust.",
    triggers: ["military", "cop", "athlete", "badge"],
    objective: "Complete 3 missions for the unit",
    reward: "Military contacts, combat gear",
  },
  {
    id: "church-mission",
    title: "Community Call",
    description: "The neighborhood church needs protection from gangs.",
    triggers: ["projects"],
    objective: "Drive out the gang threat",
    reward: "Community loyalty, recruitment bonus",
  },
  {
    id: "farm-crisis",
    title: "The Farm",
    description: "Drought hit. The family farm is dying.",
    triggers: ["rural", "farm", "outdoors"],
    objective: "Find water or new income for the farm",
    reward: "Land, +survival skill",
  },
];

/** Get the starting scenario for a set of background choices. */
export function scenarioForBackgrounds(backgroundChoices: Record<string, string>): StartingScenario | null {
  const chosen = Object.values(backgroundChoices);
  for (const scenario of STARTING_SCENARIOS) {
    if (scenario.triggers.some((t) => chosen.includes(t))) {
      return scenario;
    }
  }
  return STARTING_SCENARIOS[0] ?? null; // Default to first
}

/** Difficulty levels with real mechanical effects. */
export interface Difficulty {
  id: string;
  label: string;
  tagline: string;
  description: string;
  pros: { label: string; reason: string }[];
  cons: { label: string; reason: string }[];
}

export const DIFFICULTIES: Difficulty[] = [
  {
    id: "story",
    label: "Story",
    tagline: "Enjoy the ride.",
    description: "For players who want the narrative without the grind. Enemies are weaker, money flows easier, and mistakes don't hurt as much.",
    pros: [
      { label: "Enemies -30% strength", reason: "Focus on story, not survival" },
      { label: "+50% trade profits", reason: "Money comes easy" },
      { label: "Forgiving", reason: "Mistakes cost less" },
    ],
    cons: [
      { label: "Less renown", reason: "Legends aren't made on easy mode" },
    ],
  },
  {
    id: "normal",
    label: "Normal",
    tagline: "The intended experience.",
    description: "Balanced as designed. The streets are tough but fair. This is how the game is meant to be played.",
    pros: [
      { label: "Balanced", reason: "No modifiers either way" },
    ],
    cons: [
      { label: "No bonuses", reason: "You earn everything" },
    ],
  },
  {
    id: "hard",
    label: "Hard",
    tagline: "Prove yourself.",
    description: "For veterans. Enemies hit harder, money is tighter, and every decision matters. Only the ruthless survive.",
    pros: [
      { label: "2x renown gain", reason: "Glory means more when it's hard" },
      { label: "Bragging rights", reason: "You beat it on hard" },
    ],
    cons: [
      { label: "Enemies +30% strength", reason: "They want you dead" },
      { label: "-25% trade profits", reason: "Every dollar is a fight" },
      { label: "Harsher consequences", reason: "Mistakes can end runs" },
    ],
  },
  {
    id: "ironman",
    label: "Ironman",
    tagline: "One life. No saves.",
    description: "Hard mode with permadeath. If you fall, your character is gone — but your clan remembers. For the truly fearless.",
    pros: [
      { label: "3x renown gain", reason: "Immortal glory" },
      { label: "Unique titles", reason: "Ironman survivors get special recognition" },
    ],
    cons: [
      { label: "Permadeath", reason: "Death is permanent" },
      { label: "Enemies +50% strength", reason: "The game wants you dead" },
      { label: "No manual saves", reason: "Live with your choices" },
    ],
  },
];

/** Age brackets with mechanical effects. */
export interface AgeBracket {
  min: number;
  max: number;
  label: string;
  tagline: string;
  description: string;
  pros: { label: string; reason: string }[];
  cons: { label: string; reason: string }[];
}

export const AGE_BRACKETS: AgeBracket[] = [
  {
    min: 18, max: 25, label: "Young (18-25)",
    tagline: "Hungry and fast.",
    description: "You're young, quick, and have everything to prove. The streets respect energy. What you lack in wisdom you make up for in raw speed and recklessness.",
    pros: [
      { label: "+2 Athletics", reason: "Young legs — you outrun everyone" },
      { label: "Faster XP gain", reason: "Young minds learn combat quicker" },
    ],
    cons: [
      { label: "-1 Leadership", reason: "Nobody follows a kid... yet" },
      { label: "Less starting cash", reason: "You haven't had time to save" },
    ],
  },
  {
    min: 26, max: 35, label: "Prime (26-35)",
    tagline: "The sweet spot.",
    description: "Old enough to know the game, young enough to play it hard. This is when legends are made — your body and mind are both at their peak.",
    pros: [
      { label: "No penalties", reason: "Balanced in every direction" },
      { label: "Best all-rounder", reason: "No wasted potential" },
    ],
    cons: [
      { label: "No bonuses either", reason: "Jack of all trades, master of none" },
    ],
  },
  {
    min: 36, max: 50, label: "Veteran (36-50)",
    tagline: "Been there, done that.",
    description: "You've seen things. People listen when you talk because you've earned it. Your body isn't what it was, but your mind and your network are sharper than ever.",
    pros: [
      { label: "+2 Leadership", reason: "Respect is earned — and you earned it" },
      { label: "More starting cash", reason: "Years of work = savings" },
    ],
    cons: [
      { label: "-1 Athletics", reason: "The knees don't lie" },
    ],
  },
  {
    min: 51, max: 70, label: "Elder (51+)",
    tagline: "The old lion.",
    description: "You're a living legend or a cautionary tale — either way, people know your name. You don't fight with your fists anymore. You fight with your mind, your money, and your people.",
    pros: [
      { label: "+3 Leadership", reason: "Decades of command" },
      { label: "+1 Trade", reason: "You know where every dollar is" },
      { label: "Most starting cash", reason: "A lifetime of accumulation" },
    ],
    cons: [
      { label: "-2 Athletics", reason: "Running is for the young" },
      { label: "-1 Combat", reason: "Your hands aren't as fast" },
    ],
  },
];

/**
 * Compute starting skills and cash from background choices, age, and bonus points.
 * Base is 1 in every skill; backgrounds add on top.
 */
export function computeCharacterStats(
  backgroundChoices: Record<string, string>,
  age: number = 30,
  bonusPoints: Record<string, number> = {},
): { skills: Record<string, number>; cash: number; biography: string } {
  const skills: Record<string, number> = {
    combat: 1,
    leadership: 1,
    trade: 1,
    medicine: 1,
    engineering: 1,
    athletics: 1,
    streetwise: 1,
    stealth: 1,
    survival: 1,
  };
  let cash = 0;
  const storyParts: string[] = [];

  for (const category of CHARACTER_STAGES) {
    const optionId = backgroundChoices[category.id];
    const option = category.options.find((o) => o.id === optionId);
    if (!option) continue;
    for (const [skill, bonus] of Object.entries(option.skills)) {
      skills[skill] = (skills[skill] ?? 1) + bonus;
    }
    cash += option.cash;
    storyParts.push(option.story);
  }

  // Age modifiers.
  if (age <= 25) {
    skills.athletics = (skills.athletics ?? 1) + 2;
    skills.leadership = Math.max(1, (skills.leadership ?? 1) - 1);
    cash = Math.max(0, cash - 200); // Young: less savings
  } else if (age >= 36 && age <= 50) {
    skills.leadership = (skills.leadership ?? 1) + 2;
    skills.athletics = Math.max(1, (skills.athletics ?? 1) - 1);
    cash += 500; // Veteran: savings
  } else if (age > 50) {
    skills.leadership = (skills.leadership ?? 1) + 3;
    skills.trade = (skills.trade ?? 1) + 1;
    skills.athletics = Math.max(1, (skills.athletics ?? 1) - 2);
    skills.combat = Math.max(1, (skills.combat ?? 1) - 1);
    cash += 1000; // Elder: lifetime of accumulation
  }

  // Player-allocated bonus points.
  for (const [skill, pts] of Object.entries(bonusPoints)) {
    skills[skill] = (skills[skill] ?? 1) + pts;
  }

  return { skills, cash, biography: storyParts.join(" ") };
}
