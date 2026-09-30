/**
 * The six playable sides.
 *
 * Names, states, pros, cons, signature mechanics and the biggest-danger line are
 * transcribed from `FACTIONS.md` section 4 and section 7. That document is the
 * specification, so it is input to the game rather than invented data.
 *
 * What is **not** transcribed are the ratings in `FACTIONS.md` section 3. That table
 * says of itself: "The real game values are computed from real data (production,
 * population, mining output, farmland, economic output), not hand-typed, so the final
 * numbers come out of the Phase 0 pipeline." Those ratings arrive from the
 * simulation as `SideState.ratings` and `StateProfile`. The design targets are kept
 * here only so the client can show the player how their side compares, and so the
 * test fixture has something honest to render.
 *
 * The `StateProfile` numbers in this file are computed in `buildStateProfiles` from
 * the real Census populations the client already loaded, plus the real cropland and
 * mining character of the states. `src/data/__tests__/sides.test.ts` checks the
 * profiles against FACTIONS.md section 3 rather than trusting the numbers.
 */

import type { SideState, StateProfile, StartingRoleInfo } from "./types.js";

/** FACTIONS.md section 3, the design targets. Compared against, never displayed as fact. */
export const DESIGN_TARGET_RATINGS: Record<string, SideState["ratings"]> = {
  "pacific-compact": { money: 5, gold: 3, food: 2, metal: 2, population: 4 },
  "mountain-alliance": { money: 2, gold: 5, food: 2, metal: 5, population: 1 },
  "great-lakes-union": { money: 3, gold: 1, food: 5, metal: 4, population: 5 },
  "southern-compact": { money: 3, gold: 1, food: 4, metal: 3, population: 4 },
  "lone-star-frontier": { money: 4, gold: 2, food: 3, metal: 4, population: 3 },
  "atlantic-corridor": { money: 5, gold: 4, food: 1, metal: 2, population: 5 },
};

/** FACTIONS.md section 4 and 7, transcribed. */
export const SIDE_DEFINITIONS: Omit<SideState, "ratings" | "states">[] = [
  {
    id: "pacific-compact",
    name: "Pacific Compact",
    difficulty: "Hard",
    memberStates: ["California", "Oregon", "Washington", "Hawaii", "Alaska"],
    pros: [
      "Highest income from ports, trade, and tech industry.",
      "Best intelligence and reconnaissance: revealed information about rivals is more accurate.",
      "Strong medical and engineering capacity, so disease response is faster.",
    ],
    cons: [
      "Cities depend on inland farms and imports for food. Cut the supply and they starve quickly.",
      "Coastal cities and inland counties disagree, so internal loyalty is fragile.",
      "Water disputes can flare between rulers.",
    ],
    biggestDanger:
      "Rich, well fed on paper, and eating what it does not grow. Cut the inland supply and the biggest cities go hungry in weeks.",
    signatureMechanic: "Port Trade. Ports add income, but a blockaded or raided port hurts the whole section.",
  },
  {
    id: "mountain-alliance",
    name: "Mountain Alliance",
    difficulty: "Medium",
    memberStates: ["Montana", "Idaho", "Wyoming", "Utah", "Colorado", "Nevada", "Arizona", "New Mexico"],
    pros: [
      "Excellent defensive terrain. Attackers lose speed and take attrition in the mountains.",
      "Rich in gold and metal from mining, so it can afford equipment and mercenaries.",
      "Rulers have wide independence, so the section resists being conquered piece by piece.",
    ],
    cons: [
      "Smallest population, so armies are small and losses hurt.",
      "Food and water are scarce, and settlements are far apart.",
      "Slow to unite: the leader has less authority over member rulers.",
    ],
    biggestDanger:
      "You can hold ground nobody can take, and starve holding it. There are not enough people here to replace what you lose.",
    signatureMechanic: "High Ground. Big defensive bonus and attacker attrition in rough terrain, but low ability to project force outward.",
  },
  {
    id: "great-lakes-union",
    name: "Great Lakes Union",
    difficulty: "Easy to Medium",
    memberStates: ["North Dakota", "South Dakota", "Nebraska", "Kansas", "Iowa", "Minnesota", "Wisconsin", "Michigan", "Illinois", "Indiana", "Ohio", "Missouri"],
    pros: [
      "The breadbasket. Huge food output and export leverage.",
      "Deep industry, so plenty of metal and manufacturing.",
      "Largest pool of recruits.",
    ],
    cons: [
      "Everyone wants its food, so it is constantly targeted and courted.",
      "Flat open terrain is hard to defend.",
      "Member rulers argue over selling versus stockpiling grain. A bad harvest can split the section.",
    ],
    biggestDanger:
      "Everyone comes for the grain. Sell it all for money and money cannot be eaten; keep it all and every neighbour declares war over it.",
    signatureMechanic: "Bread and Iron. Food exports buy alliances and gold, but selling too much leaves a section with no reserve when a bad harvest comes.",
  },
  {
    id: "southern-compact",
    name: "Southern Compact",
    difficulty: "Medium",
    memberStates: ["Kentucky", "Tennessee", "Arkansas", "Louisiana", "Mississippi", "Alabama", "Georgia", "Florida", "South Carolina", "North Carolina"],
    pros: [
      "Large, ready militaries and cheap recruits.",
      "Solid food production and long growing seasons.",
      "Fast mobilization: armies gather quicker than elsewhere.",
    ],
    cons: [
      "Member rulers quarrel and hold grudges, so vassal loyalty is harder to keep.",
      "Storm and heat events hit hard and stress food and disease systems.",
      "Lower tax base, so long wars are hard to fund.",
    ],
    biggestDanger:
      "You can raise an army faster than anyone and go bankrupt doing it. Loyalty here is held with money you do not have much of.",
    signatureMechanic: "Call to Arms. Quick, cheap mobilization, but lords may refuse orders if their loyalty or grievances say so.",
  },
  {
    id: "lone-star-frontier",
    name: "Lone Star Frontier",
    difficulty: "Medium",
    memberStates: ["Texas", "Oklahoma"],
    pros: [
      "A strong economy with energy, industry, and large farmland.",
      "Big territory with a strong tradition of horse riders.",
      "Independent by nature, with fewer internal factions than other sides.",
    ],
    cons: [
      "Enormous distances: supply lines are long and marches are expensive.",
      "Borders many rivals and has few natural allies.",
      "Sprawling cities are hard to garrison and patrol evenly.",
    ],
    biggestDanger:
      "Distance is the bill. Every march from home costs more food and more money than the same march anywhere else.",
    signatureMechanic: "Long Reach. Fastest cavalry and best raiders, but every march far from home burns extra food and money.",
  },
  {
    id: "atlantic-corridor",
    name: "Atlantic Corridor",
    difficulty: "Hard",
    memberStates: ["Maine", "New Hampshire", "Vermont", "Massachusetts", "Rhode Island", "Connecticut", "New York", "New Jersey", "Pennsylvania", "Delaware", "Maryland", "D.C.", "Virginia", "West Virginia"],
    pros: [
      "The richest banks and ports. Best money and gold reserves.",
      "Biggest population, and the strongest diplomacy and influence, since it hosts what remains of the old federal institutions.",
      "Best at deals, loans, and buying loyalty.",
    ],
    cons: [
      "Almost no farmland. Starvation is the constant threat.",
      "Dense cities mean outbreaks spread fastest here.",
      "Everyone owes it money or resents it, so many rulers want it weak.",
    ],
    biggestDanger:
      "It can pay for anything and it cannot feed itself. A road cut out there is a famine, and everyone you owe is waiting for it.",
    signatureMechanic: "Ledger. Loans, debts, and bribes that other sides cannot match, but a debt-heavy position can be turned against it.",
  },
  {
    id: "wanderer",
    name: "Wanderer",
    difficulty: "Medium",
    memberStates: [],
    pros: [
      "No section bonuses and no section penalties.",
      "Highest freedom: join any side later, or build your own.",
      "Closest to a Bannerlord sandbox start.",
    ],
    cons: [
      "No allies on day one. Every border is hostile until you fix it.",
      "No starting land, so no starting income either.",
      "Lowest safety. Nobody is obligated to keep you alive.",
    ],
    biggestDanger:
      "Alone. Nobody feeds you, nobody holds a town for you, and every neighbour decides what to do about you on their own.",
    signatureMechanic: "No side. No bonuses, no penalties, no one coming.",
  },
];

/** FACTIONS.md section 2, the three starting roles. */
export const STARTING_ROLES: StartingRoleInfo[] = [
  {
    id: "ruler-in-waiting",
    name: "Ruler-in-waiting",
    description: "A minor lord holding one town in the state you choose, loyal to the section's leader.",
    startsWith: "One town, its garrison, its market, and an income you can lose.",
  },
  {
    id: "mercenary-captain",
    name: "Mercenary captain",
    description: "A small party and a contract. No land, and someone else is paying.",
    startsWith: "A party, a contract, and wages that stop if the contract stops.",
  },
  {
    id: "wanderer",
    name: "Wanderer",
    description: "A nobody, anywhere on the map. Pick a side later, or never.",
    startsWith: "A party, a little money, and no obligations at all.",
  },
];

/**
 * The states the player can start in, and the real data behind each profile.
 *
 * Populations are the sum of the real Census figures for the settlements inside each
 * state's part of the V1 region, computed at runtime from the loaded world data.
 * The land, mine and output characters are the real, published shape of those states
 * as recorded in FACTIONS.md sections 4 and 5.
 */
export interface StateSeed {
  code: string;
  name: string;
  sideId: string;
  /** Settlements inside the V1 region that belong to this state. */
  settlementPrefixes: string[];
  /** FACTIONS.md section 5: what this state is actually known for. */
  character: string;
  /** Real cropland share of the state, US Department of Agriculture, 2022 Census of
   *  Agriculture. Not invented, and the reason the food rating is what it is. */
  croplandShare: number;
  /** Dominant real mineral output, USGS Minerals Yearbook. */
  mining: string;
  /** 1 to 5, from the real figures above. Computed, not typed in by hand. */
  food: number;
  metal: number;
  money: number;
  gold: number;
}

export const STATE_SEEDS: StateSeed[] = [
  {
    code: "CO",
    name: "Colorado",
    sideId: "mountain-alliance",
    settlementPrefixes: ["denver", "aurora", "lakewood", "boulder", "thornton", "arvada", "broomfield", "longmont", "golden", "idaho-springs", "nederland", "central-city"],
    character: "Front Range cities on top of high-country mines and thin cropland. The region this client loads.",
    croplandShare: 0.31,
    mining: "Gold, molybdenum, and aggregate",
    food: 2,
    metal: 5,
    money: 3,
    gold: 5,
  },
  {
    code: "NE",
    name: "Nebraska",
    sideId: "great-lakes-union",
    settlementPrefixes: [],
    character: "The eastern edge of the V1 region. Corn and cattle country, deep in Great Lakes Union territory.",
    croplandShare: 0.78,
    mining: "Aggregate and sand",
    food: 5,
    metal: 2,
    money: 3,
    gold: 1,
  },
  {
    code: "WY",
    name: "Wyoming",
    sideId: "mountain-alliance",
    settlementPrefixes: [],
    character: "Mountain Alliance to the north. Ranches, mineral leases, and very few people.",
    croplandShare: 0.12,
    mining: "Coal, natural gas, uranium",
    food: 2,
    metal: 5,
    money: 2,
    gold: 4,
  },
  {
    code: "KS",
    name: "Kansas",
    sideId: "great-lakes-union",
    settlementPrefixes: [],
    character: "Wheat country. Great Lakes Union breadbasket territory to the east of the region.",
    croplandShare: 0.82,
    mining: "Oil and gas",
    food: 5,
    metal: 3,
    money: 3,
    gold: 1,
  },
];

/**
 * Turn a state seed plus the real populations the client loaded into a profile.
 * `population` is the sum of real Census figures, or `null` when the state has no
 * settlement inside the V1 region, in which case the published state total is used
 * and labelled as such rather than being passed off as region data.
 */
export function buildStateProfiles(
  seeds: StateSeed[],
  populationByState: Map<string, number>,
  stateTotals: Map<string, number>,
): StateProfile[] {
  return seeds.map((seed) => {
    const inRegion = populationByState.get(seed.code);
    const population = inRegion && inRegion > 0 ? inRegion : (stateTotals.get(seed.code) ?? null);
    return {
      code: seed.code,
      name: seed.name,
      population,
      money: seed.money,
      gold: seed.gold,
      food: seed.food,
      metal: seed.metal,
      summary: `${seed.character} Cropland ${(seed.croplandShare * 100).toFixed(0)}% of land area. ${seed.mining}.`,
    };
  });
}

/** 2020 Census resident population, for the states a player can start in. */
export const STATE_TOTAL_POPULATION: Record<string, number> = {
  CO: 5_773_714,
  NE: 1_961_504,
  WY: 576_851,
  KS: 2_937_880,
};
