/**
 * The 10 playable ethnicities (cultures). Bannerlord pattern: 2 pros + 1 con
 * per culture, verified against the real game data (see docs/bannerlord-mechanics-port.md
 * section 11 and the modding docs: github.com/litauen/docs.bannerlordmodding.lt).
 *
 * All bonuses are institutional/community/logistical tradeoffs — never biological.
 * Each ethnicity has a home region where recruitment is cheaper, a signature
 * unit line, and mechanical pros/cons that shape playstyle.
 */

export interface EthnicityBonus {
  /** Machine-readable key, e.g. "trade_profits". */
  id: string;
  /** Human-readable, e.g. "+15% trade profits". */
  label: string;
  /** Flavor explanation, e.g. "merchant family networks". */
  reason: string;
  /** True = pro (green), false = con (red). */
  pro: boolean;
}

export interface Ethnicity {
  id: string;
  name: string;
  /** Short tagline for the picker. */
  tagline: string;
  homeRegion: string;
  signatureUnit: string;
  signatureUnitDesc: string;
  bonuses: EthnicityBonus[];
}

/** Numeric effects, applied by the simulation. Values are multipliers or percents. */
export interface EthnicityEffects {
  tradeProfitMult: number;      // 1.15 = +15%
  workshopCostMult: number;     // 0.8 = 20% cheaper
  workshopOutputMult: number;
  troopWageMult: number;        // 1.1 = +10%
  partyMoraleBonus: number;     // flat, e.g. 0.2 = +20%
  charmXpMult: number;
  athleticsXpMult: number;
  rogueryXpMult: number;
  foodConsumptionMult: number;
  mapSpeedMult: number;
  constructionSpeedMult: number;
  siegeBuildSpeedMult: number;
  recruitSpeedMult: number;
  sellPriceMult: number;
  routResistanceMult: number;    // >1 = rout slower
  snowCombatMult: number;
  desertMoralePenalty: number;  // flat penalty
  authorityRelationPenalty: number; // flat, e.g. -10
}

const BASE_EFFECTS: EthnicityEffects = {
  tradeProfitMult: 1, workshopCostMult: 1, workshopOutputMult: 1,
  troopWageMult: 1, partyMoraleBonus: 0, charmXpMult: 1, athleticsXpMult: 1,
  rogueryXpMult: 1, foodConsumptionMult: 1, mapSpeedMult: 1,
  constructionSpeedMult: 1, siegeBuildSpeedMult: 1, recruitSpeedMult: 1,
  sellPriceMult: 1, routResistanceMult: 1, snowCombatMult: 1,
  desertMoralePenalty: 0, authorityRelationPenalty: 0,
};

export const ETHNICITIES: Ethnicity[] = [
  {
    id: "italian",
    name: "Italian-American",
    tagline: "Merchant families and construction trades.",
    homeRegion: "Northeast cities",
    signatureUnit: "Enforcers",
    signatureUnitDesc: "Tough melee fighters, loyal to the family.",
    bonuses: [
      { id: "trade_profits", label: "+15% trade profits", reason: "merchant family networks", pro: true },
      { id: "workshop_cost", label: "Workshops 20% cheaper", reason: "construction trades connections", pro: true },
      { id: "troop_wages", label: "+10% troop wages", reason: "strong union tradition — they negotiate hard", pro: false },
    ],
  },
  {
    id: "irish",
    name: "Irish-American",
    tagline: "Political machines and neighborhood bonds.",
    homeRegion: "Boston, NYC",
    signatureUnit: "Brawlers",
    signatureUnitDesc: "High-morale shock troops who don't back down.",
    bonuses: [
      { id: "morale", label: "+20% party morale", reason: "tight-knit community bonds", pro: true },
      { id: "charm_xp", label: "Charm XP +25%", reason: "storytelling and political tradition", pro: true },
      { id: "food", label: "+10% food consumption", reason: "large extended families to feed", pro: false },
    ],
  },
  {
    id: "chinese",
    name: "Chinese-American",
    tagline: "Engineering excellence and manufacturing ties.",
    homeRegion: "West Coast cities",
    signatureUnit: "Engineers",
    signatureUnitDesc: "Siege specialists and disciplined rifle line.",
    bonuses: [
      { id: "construction", label: "Construction 25% faster", reason: "engineering education emphasis", pro: true },
      { id: "workshop_output", label: "+10% workshop output", reason: "manufacturing networks", pro: true },
      { id: "map_speed", label: "-5% campaign map speed", reason: "consensus decision-making takes time", pro: false },
    ],
  },
  {
    id: "korean",
    name: "Korean-American",
    tagline: "Discipline and small-business grit.",
    homeRegion: "LA, NYC",
    signatureUnit: "Marksmen",
    signatureUnitDesc: "Elite riflemen, patient and precise.",
    bonuses: [
      { id: "rout_resist", label: "Troops rout 25% slower", reason: "discipline emphasis", pro: true },
      { id: "city_trade", label: "+15% trade profits in cities", reason: "small business networks", pro: true },
      { id: "recruit_speed", label: "Recruitment 10% slower", reason: "selective, trust-based hiring", pro: false },
    ],
  },
  {
    id: "african",
    name: "African-American",
    tagline: "Church networks and cultural strength.",
    homeRegion: "South, major cities",
    signatureUnit: "Street Soldiers",
    signatureUnitDesc: "Balanced fighters with heart.",
    bonuses: [
      { id: "athletics_xp", label: "Athletics XP +25%", reason: "sports culture", pro: true },
      { id: "recruit_speed2", label: "+15% recruitment speed", reason: "church and community organizing networks", pro: true },
      { id: "authority", label: "Authority factions start at -10 relation", reason: "historical tension with institutions", pro: false },
    ],
  },
  {
    id: "jamaican",
    name: "Jamaican-American",
    tagline: "Hustle and street wisdom.",
    homeRegion: "NYC, Miami",
    signatureUnit: "Runners",
    signatureUnitDesc: "Fast skirmishers who hit and fade.",
    bonuses: [
      { id: "map_speed2", label: "+10% campaign map speed", reason: "hustle culture", pro: true },
      { id: "roguery_xp", label: "Roguery XP +25%", reason: "street smarts", pro: true },
      { id: "siege_build", label: "-15% siege build speed", reason: "prefers action over waiting", pro: false },
    ],
  },
  {
    id: "mexican",
    name: "Mexican-American",
    tagline: "Family food networks and skilled trades.",
    homeRegion: "Southwest, Texas",
    signatureUnit: "Vaqueros",
    signatureUnitDesc: "Mobile fighters, masters of open ground.",
    bonuses: [
      { id: "food2", label: "-20% food consumption", reason: "resourceful family food networks", pro: true },
      { id: "construction2", label: "+10% construction speed", reason: "skilled trades tradition", pro: true },
      { id: "sell_price", label: "-10% sell prices", reason: "competitive markets", pro: false },
    ],
  },
  {
    id: "puerto_rican",
    name: "Puerto Rican-American",
    tagline: "Island pride and block-by-block organizing.",
    homeRegion: "NYC, Florida",
    signatureUnit: "Islanders",
    signatureUnitDesc: "Versatile infantry, proud and loud.",
    bonuses: [
      { id: "recruit_speed3", label: "+15% recruitment speed", reason: "community networks", pro: true },
      { id: "morale2", label: "+10% party morale", reason: "cultural pride", pro: true },
      { id: "troop_wages2", label: "+5% troop wages", reason: "they know their value", pro: false },
    ],
  },
  {
    id: "german",
    name: "German-American",
    tagline: "Engineering precision and Midwest roots.",
    homeRegion: "Midwest",
    signatureUnit: "Organizers",
    signatureUnitDesc: "Defensive line, methodical and unbreakable.",
    bonuses: [
      { id: "workshop_output2", label: "+10% workshop output", reason: "engineering and manufacturing tradition", pro: true },
      { id: "construction3", label: "+10% construction speed", reason: "build it right the first time", pro: true },
      { id: "charm_xp2", label: "Charm XP -10%", reason: "direct communication style", pro: false },
    ],
  },
  {
    id: "russian",
    name: "Russian-American",
    tagline: "Winter-hardened and stubborn.",
    homeRegion: "Northeast",
    signatureUnit: "Heavies",
    signatureUnitDesc: "Hard-hitting infantry who endure.",
    bonuses: [
      { id: "snow", label: "+20% combat in snow/winter", reason: "winter familiarity", pro: true },
      { id: "siege_defense", label: "+15% siege defense", reason: "stubborn defenders", pro: true },
      { id: "desert", label: "-10% morale in desert/heat", reason: "built for the cold", pro: false },
    ],
  },
];

/** Numeric effects per ethnicity, for the simulation to apply. */
export const ETHNICITY_EFFECTS: Record<string, EthnicityEffects> = {
  italian: { ...BASE_EFFECTS, tradeProfitMult: 1.15, workshopCostMult: 0.8, troopWageMult: 1.1 },
  irish: { ...BASE_EFFECTS, partyMoraleBonus: 0.2, charmXpMult: 1.25, foodConsumptionMult: 1.1 },
  chinese: { ...BASE_EFFECTS, constructionSpeedMult: 1.25, workshopOutputMult: 1.1, mapSpeedMult: 0.95 },
  korean: { ...BASE_EFFECTS, routResistanceMult: 1.25, tradeProfitMult: 1.15, recruitSpeedMult: 0.9 },
  african: { ...BASE_EFFECTS, athleticsXpMult: 1.25, recruitSpeedMult: 1.15, authorityRelationPenalty: -10 },
  jamaican: { ...BASE_EFFECTS, mapSpeedMult: 1.1, rogueryXpMult: 1.25, siegeBuildSpeedMult: 0.85 },
  mexican: { ...BASE_EFFECTS, foodConsumptionMult: 0.8, constructionSpeedMult: 1.1, sellPriceMult: 0.9 },
  puerto_rican: { ...BASE_EFFECTS, recruitSpeedMult: 1.15, partyMoraleBonus: 0.1, troopWageMult: 1.05 },
  german: { ...BASE_EFFECTS, workshopOutputMult: 1.1, constructionSpeedMult: 1.1, charmXpMult: 0.9 },
  russian: { ...BASE_EFFECTS, snowCombatMult: 1.2, desertMoralePenalty: -0.1 },
};

export function getEthnicity(id: string): Ethnicity | undefined {
  return ETHNICITIES.find((e) => e.id === id);
}

export function getEthnicityEffects(id: string): EthnicityEffects {
  return ETHNICITY_EFFECTS[id] ?? { ...BASE_EFFECTS };
}
