/**
 * Side records for the test fixture: the FACTIONS.md design targets for ratings,
 * with state profiles built from the real Census populations the client loaded.
 *
 * See `src/data/sides.ts` for why the design targets are labelled as targets and not
 * presented as the real computed values.
 */

import type { SideState } from "../types.js";
import { SIDE_DEFINITIONS, DESIGN_TARGET_RATINGS, STATE_SEEDS, STATE_TOTAL_POPULATION, buildStateProfiles } from "../sides.js";
import { populationsByState } from "../../world/context.js";

export function buildFixtureSides(): SideState[] {
  // Real Census populations for the settlements inside the region, published by the
  // world loader. Read here rather than passed in, so main.ts never imports this folder.
  const regionPopulations = populationsByState();
  const stateTotals = new Map(Object.entries(STATE_TOTAL_POPULATION));
  return SIDE_DEFINITIONS.map((def) => {
    const states = STATE_SEEDS.filter((s) => s.sideId === def.id).map((seed) =>
      buildStateProfiles([seed], regionPopulations, stateTotals)[0]!,
    );
    return {
      ...def,
      ratings: DESIGN_TARGET_RATINGS[def.id] ?? { money: 3, gold: 3, food: 3, metal: 3, population: 3 },
      states,
    };
  });
}
