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

/** Appearance presets — face/body options for the character portrait. */
export interface AppearancePreset {
  id: string;
  label: string;
  /** Emoji or symbol for the portrait placeholder. */
  icon: string;
  description: string;
}

export const APPEARANCE_PRESETS: AppearancePreset[] = [
  { id: "preset-1", label: "Rugged", icon: "🧔", description: "Weathered, seen things." },
  { id: "preset-2", label: "Clean-cut", icon: "👨", description: "Sharp, professional." },
  { id: "preset-3", label: "Street", icon: "🧑", description: "Urban, alert." },
  { id: "preset-4", label: "Veteran", icon: "👴", description: "Older, experienced." },
  { id: "preset-5", label: "Young", icon: "👦", description: "Fresh-faced, hungry." },
  { id: "preset-6", label: "Tough", icon: "💪", description: "Built, intimidating." },
];

/** The full character created in the maker. */
export interface GameCharacter {
  firstName: string;
  lastName: string;
  gender: "male" | "female";
  appearanceId: string;
  ethnicityId: string;
  backgroundChoices: Record<string, string>; // categoryId -> optionId
  /** Computed starting skills from backgrounds + ethnicity. */
  startingSkills: Record<string, number>;
  startingCash: number;
  biography: string;
}

/**
 * Compute starting skills and cash from background choices.
 * Base is 1 in every skill; backgrounds add on top.
 */
export function computeCharacterStats(
  backgroundChoices: Record<string, string>,
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

  for (const category of BACKGROUNDS) {
    const optionId = backgroundChoices[category.id];
    const option = category.options.find((o) => o.id === optionId);
    if (!option) continue;
    for (const [skill, bonus] of Object.entries(option.skills)) {
      skills[skill] = (skills[skill] ?? 1) + bonus;
    }
    cash += option.cash;
    storyParts.push(option.story);
  }

  return { skills, cash, biography: storyParts.join(" ") };
}
