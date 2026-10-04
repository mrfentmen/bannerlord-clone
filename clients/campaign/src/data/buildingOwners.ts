/**
 * Building owners: named proprietors for workshops, taverns, and other
 * establishments (del order 2026-10-04).
 *
 * In Bannerlord, every workshop and tavern has a named owner. This file
 * provides the client-side roster of building proprietors, generated from
 * the name generator with fixed seeds per city.
 */

import { personName, createNameRng } from "./names.js";

export interface BuildingOwner {
  id: string;
  cityId: string;
  buildingType: "tavern" | "workshop" | "market" | "stable" | "smithy";
  buildingName: string;
  ownerName: string;
  ownerTitle: string;
  ethnicityId: string;
  gender: "male" | "female";
  portraitKey: string;
  lore: string;
}

const BUILDING_TYPES = [
  { type: "tavern", name: "Tavern", title: "Tavern Keeper" },
  { type: "workshop", name: "Workshop", title: "Master Craftsman" },
  { type: "market", name: "Market Stall", title: "Market Trader" },
  { type: "stable", name: "Stable", title: "Stable Master" },
  { type: "smithy", name: "Smithy", title: "Blacksmith" },
] as const;

const CITY_SEEDS: Record<string, number> = {
  denver: 2001, boulder: 2002, golden: 2003,
  "new-york": 2004, "los-angeles": 2005, houston: 2006, miami: 2007,
  chicago: 2008, seattle: 2009, atlanta: 2010, dallas: 2011, phoenix: 2012,
  "san-francisco": 2013, boston: 2014, philadelphia: 2015, "new-orleans": 2016,
  detroit: 2017, nashville: 2018, "las-vegas": 2019,
  "san-antonio": 2020, "san-diego": 2021, "san-jose": 2022, austin: 2023,
  jacksonville: 2024, "fort-worth": 2025, columbus: 2026, charlotte: 2027,
  indianapolis: 2028, washington: 2029, "el-paso": 2030, "oklahoma-city": 2031,
  portland: 2032, memphis: 2033, louisville: 2034, milwaukee: 2035,
  baltimore: 2036, albuquerque: 2037, tucson: 2038, fresno: 2039,
  sacramento: 2040, mesa: 2041, "kansas-city": 2042, omaha: 2043,
  raleigh: 2044, "long-beach": 2045, "virginia-beach": 2046, oakland: 2047,
  tulsa: 2048, tampa: 2049, arlington: 2050, wichita: 2051,
};

const CITY_ETHNICITIES: Record<string, string[]> = {
  denver: ["german", "mexican", "irish"],
  boulder: ["german", "irish", "chinese"],
  golden: ["irish", "german", "mexican"],
  "new-york": ["italian", "irish", "jamaican"],
  "los-angeles": ["mexican", "korean", "chinese"],
  houston: ["mexican", "african", "german"],
  miami: ["jamaican", "mexican", "italian"],
  chicago: ["irish", "italian", "african"],
  seattle: ["german", "chinese", "korean"],
  atlanta: ["african", "german", "mexican"],
  dallas: ["mexican", "german", "african"],
  phoenix: ["mexican", "german", "irish"],
  "san-francisco": ["chinese", "korean", "italian"],
  boston: ["irish", "italian", "german"],
  philadelphia: ["italian", "irish", "african"],
  "new-orleans": ["african", "jamaican", "italian"],
  detroit: ["african", "german", "italian"],
  nashville: ["african", "german", "irish"],
  "las-vegas": ["italian", "mexican", "german"],
  "san-antonio": ["mexican", "german", "african"],
  "san-diego": ["mexican", "german", "chinese"],
  "san-jose": ["mexican", "chinese", "german"],
  austin: ["mexican", "german", "african"],
  jacksonville: ["african", "german", "irish"],
  "fort-worth": ["mexican", "german", "african"],
  columbus: ["german", "african", "irish"],
  charlotte: ["african", "german", "mexican"],
  indianapolis: ["german", "african", "irish"],
  washington: ["african", "german", "irish"],
  "el-paso": ["mexican", "german"],
  "oklahoma-city": ["german", "african", "mexican"],
  portland: ["german", "irish", "chinese"],
  memphis: ["african", "german", "irish"],
  louisville: ["german", "african", "irish"],
  milwaukee: ["german", "african", "irish"],
  baltimore: ["african", "german", "irish"],
  albuquerque: ["mexican", "german", "irish"],
  tucson: ["mexican", "german", "irish"],
  fresno: ["mexican", "german", "chinese"],
  sacramento: ["mexican", "chinese", "german"],
  mesa: ["mexican", "german", "irish"],
  "kansas-city": ["german", "african", "irish"],
  omaha: ["german", "irish", "african"],
  raleigh: ["african", "german", "irish"],
  "long-beach": ["mexican", "chinese", "african"],
  "virginia-beach": ["african", "german", "irish"],
  oakland: ["african", "chinese", "mexican"],
  tulsa: ["german", "african", "irish"],
  tampa: ["italian", "mexican", "african"],
  arlington: ["mexican", "german", "african"],
  wichita: ["german", "african", "irish"],
};

const TAVERN_NAMES = [
  "The Gilded Wagon", "The Rusty Nail", "The Howling Wolf", "The Copper Pot",
  "The Drunken Mule", "The Silver Spur", "The Broken Wheel", "The Golden Grain",
];

const WORKSHOP_NAMES = [
  "Iron & Oak", "The Craft Hall", "Masterworks", "The Tannery",
  "Copperline Forge", "The Loom House", "Stone & Steel", "The Workshop",
];

function generateBuildingOwners(): Record<string, BuildingOwner[]> {
  const result: Record<string, BuildingOwner[]> = {};

  for (const [cityId, seed] of Object.entries(CITY_SEEDS)) {
    const rng = createNameRng(seed);
    const ethnicities = CITY_ETHNICITIES[cityId]!;
    const owners: BuildingOwner[] = [];

    // 2 taverns, 3 workshops, 1 market, 1 stable, 1 smithy per city = 8 buildings
    const buildings = [
      { ...BUILDING_TYPES[0]!, name: TAVERN_NAMES[Math.floor(rng() * TAVERN_NAMES.length)]! },
      { ...BUILDING_TYPES[0]!, name: TAVERN_NAMES[Math.floor(rng() * TAVERN_NAMES.length)]! },
      { ...BUILDING_TYPES[1]!, name: WORKSHOP_NAMES[Math.floor(rng() * WORKSHOP_NAMES.length)]! },
      { ...BUILDING_TYPES[1]!, name: WORKSHOP_NAMES[Math.floor(rng() * WORKSHOP_NAMES.length)]! },
      { ...BUILDING_TYPES[1]!, name: WORKSHOP_NAMES[Math.floor(rng() * WORKSHOP_NAMES.length)]! },
      { ...BUILDING_TYPES[2]!, name: "Central Market" },
      { ...BUILDING_TYPES[3]!, name: "City Stables" },
      { ...BUILDING_TYPES[4]!, name: "The Forge" },
    ];

    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i]!;
      const ethnicity = ethnicities[Math.floor(rng() * ethnicities.length)]!;
      const gender = rng() < 0.5 ? "male" : "female";
      const person = personName(ethnicity, rng, gender);

      owners.push({
        id: `${cityId}-building-${i + 1}`,
        cityId,
        buildingType: b.type,
        buildingName: b.name,
        ownerName: `${person.firstName} ${person.lastName}`,
        ownerTitle: b.title,
        ethnicityId: ethnicity,
        gender,
        portraitKey: `${ethnicity}-${gender}`,
        lore: `${person.firstName} ${person.lastName} runs the ${b.name}, ${b.type === "tavern" ? "pouring drinks and hearing secrets" : b.type === "workshop" ? "crafting goods for the city's trade" : "serving the community's needs"}. A fixture of the local scene.`,
      });
    }

    result[cityId] = owners;
  }

  return result;
}

export const BUILDING_OWNERS: Record<string, BuildingOwner[]> = generateBuildingOwners();

export function buildingOwnersForCity(cityId: string): BuildingOwner[] {
  return BUILDING_OWNERS[cityId] ?? [];
}
