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
