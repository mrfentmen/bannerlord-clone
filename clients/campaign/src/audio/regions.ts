/**
 * What part of America the player is in, and what that sounds like.
 *
 * The game has six regions and they are real: FACTIONS.md section 4 splits the
 * states between six sides, `world_data.toml` `[sections]` transcribes that
 * membership, and `public/world/territories.json` is the drawn result. This
 * module reads the same six keys and gives each one an ambient bed, a radio
 * station and a music scene, so the soundtrack changes as the player crosses
 * the country instead of staying on one bed for the whole campaign.
 *
 * The state lists are copied from `world_data.toml` rather than invented, and
 * `regions.test.ts` re-reads that file to check they have not drifted. A state
 * in neither list, or in two, is reported rather than guessed at.
 */

import type { SfxId } from "./AudioManager.js";

/** The six sides from `world_data.toml` `[sections]`, spelled as in that file. */
export type RegionId =
  | "pacific_compact"
  | "mountain_alliance"
  | "great_lakes_union"
  | "southern_compact"
  | "lone_star_frontier"
  | "atlantic_corridor";

export const REGION_IDS: readonly RegionId[] = [
  "pacific_compact",
  "mountain_alliance",
  "great_lakes_union",
  "southern_compact",
  "lone_star_frontier",
  "atlantic_corridor",
];

/**
 * State -> region, transcribed from `world_data.toml` `[sections]`. Names are
 * the full state names used there, not USPS codes, because that is the key the
 * world data joins on.
 */
export const STATE_REGION: Readonly<Record<string, RegionId>> = {
  "California": "pacific_compact",
  "Oregon": "pacific_compact",
  "Washington": "pacific_compact",
  "Hawaii": "pacific_compact",
  "Alaska": "pacific_compact",

  "Montana": "mountain_alliance",
  "Idaho": "mountain_alliance",
  "Wyoming": "mountain_alliance",
  "Utah": "mountain_alliance",
  "Colorado": "mountain_alliance",
  "Nevada": "mountain_alliance",
  "Arizona": "mountain_alliance",
  "New Mexico": "mountain_alliance",

  "North Dakota": "great_lakes_union",
  "South Dakota": "great_lakes_union",
  "Nebraska": "great_lakes_union",
  "Kansas": "great_lakes_union",
  "Iowa": "great_lakes_union",
  "Minnesota": "great_lakes_union",
  "Wisconsin": "great_lakes_union",
  "Michigan": "great_lakes_union",
  "Illinois": "great_lakes_union",
  "Indiana": "great_lakes_union",
  "Ohio": "great_lakes_union",
  "Missouri": "great_lakes_union",

  "Kentucky": "southern_compact",
  "Tennessee": "southern_compact",
  "Arkansas": "southern_compact",
  "Louisiana": "southern_compact",
  "Mississippi": "southern_compact",
  "Alabama": "southern_compact",
  "Georgia": "southern_compact",
  "Florida": "southern_compact",
  "South Carolina": "southern_compact",
  "North Carolina": "southern_compact",

  "Texas": "lone_star_frontier",
  "Oklahoma": "lone_star_frontier",

  "Maine": "atlantic_corridor",
  "New Hampshire": "atlantic_corridor",
  "Vermont": "atlantic_corridor",
  "Massachusetts": "atlantic_corridor",
  "Rhode Island": "atlantic_corridor",
  "Connecticut": "atlantic_corridor",
  "New York": "atlantic_corridor",
  "New Jersey": "atlantic_corridor",
  "Pennsylvania": "atlantic_corridor",
  "Delaware": "atlantic_corridor",
  "Maryland": "atlantic_corridor",
  "District of Columbia": "atlantic_corridor",
  "Virginia": "atlantic_corridor",
  "West Virginia": "atlantic_corridor",
};

/** USPS abbreviations, for the settlement feed which reports `stateCode`. */
const STATE_CODE: Readonly<Record<string, string>> = {
  CA: "California", OR: "Oregon", WA: "Washington", HI: "Hawaii", AK: "Alaska",
  MT: "Montana", ID: "Idaho", WY: "Wyoming", UT: "Utah", CO: "Colorado",
  NV: "Nevada", AZ: "Arizona", NM: "New Mexico",
  ND: "North Dakota", SD: "South Dakota", NE: "Nebraska", KS: "Kansas",
  IA: "Iowa", MN: "Minnesota", WI: "Wisconsin", MI: "Michigan", IL: "Illinois",
  IN: "Indiana", OH: "Ohio", MO: "Missouri",
  KY: "Kentucky", TN: "Tennessee", AR: "Arkansas", LA: "Louisiana",
  MS: "Mississippi", AL: "Alabama", GA: "Georgia", FL: "Florida",
  SC: "South Carolina", NC: "North Carolina",
  TX: "Texas", OK: "Oklahoma",
  ME: "Maine", NH: "New Hampshire", VT: "Vermont", MA: "Massachusetts",
  RI: "Rhode Island", CT: "Connecticut", NY: "New York", NJ: "New Jersey",
  PA: "Pennsylvania", DE: "Delaware", MD: "Maryland", DC: "District of Columbia",
  VA: "Virginia", WV: "West Virginia",
};

/** The region a state name belongs to, or null when it is in no section. */
export function regionForState(state: string): RegionId | null {
  return STATE_REGION[state] ?? null;
}

/** The region a USPS code belongs to, or null. */
export function regionForStateCode(code: string): RegionId | null {
  const name = STATE_CODE[code.toUpperCase()];
  return name ? (STATE_REGION[name] ?? null) : null;
}

/**
 * The region a coordinate falls in, by nearest membership. `states` is the
 * list of state names to consider; the returned region is the one that owns
 * most of them. This is a containment test by membership rather than by
 * geometry: the client has no polygon test on this path, and the drawn
 * territories are in `public/world/territories.json` for the scene to use.
 *
 * A caller that knows the settlement's own state should prefer
 * {@link regionForState}; this is for the case where it does not.
 */
export function regionForStates(states: readonly string[]): RegionId | null {
  const tally = new Map<RegionId, number>();
  for (const state of states) {
    const region = regionForState(state);
    if (region) tally.set(region, (tally.get(region) ?? 0) + 1);
  }
  let best: RegionId | null = null;
  let bestCount = 0;
  for (const [region, count] of tally) {
    if (count > bestCount) {
      best = region;
      bestCount = count;
    }
  }
  return best;
}

/**
 * One region's voice. The beds are the 29 real `sfx/ambience` loops and the six
 * station beds, chosen for what the place is rather than for a mood board:
 *
 *   pacific      open coast and pine; the wind off the water
 *   mountain     high desert, thin air, exposed rock
 *   great lakes  farmland going flat to cold water
 *   southern     humid, wooded, close and loud
 *   lone star    dry scrub, big sky, dust
 *   atlantic     dense city, narrow streets, harbour
 */
export interface RegionVoice {
  /** Display name, from FACTIONS.md. */
  readonly name: string;
  /** The bed for the region's open country. */
  readonly dayBed: SfxId;
  /** The bed after dark. Both regions fall back to the town bed off-road. */
  readonly nightBed: SfxId;
  /** The bed inside one of the region's towns. */
  readonly townBed: SfxId;
  /** The station id in `radio.ts`. */
  readonly station: string;
  /** The music scene the region plays on the campaign map. */
  readonly scene: "campaign" | "town" | "battle" | "court";
  /** The road bed while the player's party is moving here. */
  readonly roadBed: SfxId;
}

export const REGION_VOICES: Readonly<Record<RegionId, RegionVoice>> = {
  pacific_compact: {
    name: "Pacific Compact",
    dayBed: "sfx-ambience-wind",
    nightBed: "sfx-ambience-town-night",
    townBed: "sfx-ambience-town-day",
    station: "west-coast-synth",
    scene: "campaign",
    roadBed: "sfx-ambience-highway-bed",
  },
  mountain_alliance: {
    name: "Mountain Alliance",
    dayBed: "sfx-ambience-wind",
    nightBed: "sfx-ambience-arctic",
    townBed: "sfx-ambience-town-day",
    station: "high-desert-night",
    scene: "campaign",
    roadBed: "sfx-ambience-highway-bed",
  },
  great_lakes_union: {
    name: "Great Lakes Union",
    dayBed: "sfx-ambience-meadow-day",
    nightBed: "sfx-ambience-swamp-night",
    townBed: "sfx-ambience-town-day",
    station: "heartland-rock",
    scene: "campaign",
    roadBed: "sfx-ambience-highway-bed",
  },
  southern_compact: {
    name: "Southern Compact",
    dayBed: "sfx-ambience-forest",
    nightBed: "sfx-ambience-swamp-night",
    townBed: "sfx-ambience-town-day",
    station: "corner-talk",
    scene: "campaign",
    roadBed: "sfx-ambience-highway-bed",
  },
  lone_star_frontier: {
    name: "Lone Star Frontier",
    dayBed: "sfx-ambience-desert-wind",
    nightBed: "sfx-ambience-desert-night",
    townBed: "sfx-ambience-town-day",
    station: "country-lope",
    scene: "campaign",
    roadBed: "sfx-ambience-dust-storm",
  },
  atlantic_corridor: {
    name: "Atlantic Corridor",
    dayBed: "sfx-ambience-market-crowd",
    nightBed: "sfx-ambience-town-night",
    townBed: "sfx-ambience-town-day",
    station: "street-radio",
    scene: "town",
    roadBed: "sfx-ambience-highway-bed",
  },
};

/**
 * The bed for a region at this time of day. Dusk takes the night bed: an
 * American town goes quiet in the evening, and the changeover should land
 * before it is properly dark.
 */
export function regionBed(
  region: RegionId | null,
  time: "dawn" | "day" | "dusk" | "night",
  inTown: boolean,
): SfxId {
  if (!region) return inTown ? "sfx-ambience-town-day" : "sfx-ambience-wind";
  const voice = REGION_VOICES[region];
  if (inTown) return time === "night" || time === "dusk" ? voice.nightBed : voice.townBed;
  return time === "night" || time === "dusk" ? voice.nightBed : voice.dayBed;
}