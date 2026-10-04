/**
 * Where a character starts: their side and their heritage, not a city picker.
 *
 * `ETHNICITY_HOME_STATES` is the real shape of the country. Each list is the
 * states where that group actually lives, strongest concentration first, from the
 * Census Bureau's ancestry and place-of-birth tables — Italian and Irish on the
 * Northeast coast, Chinese and Korean on the West Coast and in the big immigrant
 * cities, Mexican in the Southwest and Texas, German across the Midwest. NYC and
 * LA need no special case: they are large states' largest towns, so a heritage
 * that really is concentrated in New York or California resolves there by the
 * same rule as every other group.
 *
 * The home town itself is the most populous mapped settlement of the chosen
 * state, which is a real Census figure rather than a hand-picked favourite. When
 * the loaded region holds none of a heritage's real states, the resolver says so
 * in `fallback` and the reason sentence is honest about it instead of pretending
 * the state is a heartland.
 */

import type { WorldSettlement } from "../world/types.js";
import { settlementSlug } from "../world/load.js";

/** States where each heritage is really concentrated, strongest first (US Census data). */
export const ETHNICITY_HOME_STATES: Record<string, string[]> = {
  italian: ["NY", "NJ", "CT", "MA", "RI", "PA", "FL", "CA", "IL", "OH"],
  irish: ["MA", "NH", "RI", "CT", "NY", "NJ", "PA", "DE", "IL", "OH", "CA", "FL"],
  chinese: ["CA", "NY", "TX", "WA", "NJ", "MA", "IL", "MD", "VA", "HI"],
  korean: ["CA", "NY", "NJ", "WA", "TX", "IL", "GA", "VA", "MD", "PA"],
  african: ["GA", "DC", "MD", "MS", "LA", "AL", "SC", "NC", "TN", "DE", "VA", "FL", "TX", "NY", "IL", "MI", "OH", "PA", "NJ", "CA"],
  jamaican: ["NY", "FL", "NJ", "CT", "MA", "GA", "MD", "PA", "DC", "CA"],
  mexican: ["TX", "CA", "AZ", "NM", "NV", "CO", "IL", "OR", "WA", "GA", "FL", "UT", "KS"],
  puerto_rican: ["NY", "FL", "NJ", "PA", "MA", "CT", "MD", "VA", "TX", "CA"],
  german: ["PA", "OH", "WI", "MN", "IA", "MO", "IL", "IN", "MI", "ND", "SD", "NE", "KS", "CO", "MT"],
  russian: ["NY", "CA", "NJ", "IL", "WA", "PA", "MA", "OR", "FL", "MD"],
};

/** The derived start, with the reason the player is there. */
export interface HomeChoice {
  settlement: WorldSettlement;
  /** The name slug the simulation resolves (`townByRef` matches a name slug). */
  slug: string;
  /** One plain sentence: why this town is home. */
  reason: string;
  /** True when no mapped state is one of the heritage's real strongholds. */
  fallback: boolean;
}

export interface HomeRequest {
  ethnicityId: string;
  /** The state the player chose on the start screen, when they chose one. */
  stateCode?: string | null;
  /** State codes of the side the player took. Empty or absent means no constraint. */
  sideStateCodes?: readonly string[] | undefined;
  /** Display name for the heritage, e.g. "Italian-American", for the reason sentence. */
  ethnicityName: string;
  settlements: readonly WorldSettlement[];
}

export function resolveHome(input: HomeRequest): HomeChoice | null {
  const byState = new Map<string, WorldSettlement[]>();
  for (const s of input.settlements) {
    if (!s.stateCode) continue;
    const list = byState.get(s.stateCode);
    if (list) list.push(s);
    else byState.set(s.stateCode, [s]);
  }
  if (byState.size === 0) return null;

  const sideCodes = input.sideStateCodes ?? [];
  const inSide = (code: string): boolean => sideCodes.length === 0 || sideCodes.includes(code);
  const mapped = (code: string): boolean => (byState.get(code)?.length ?? 0) > 0;

  const heritage = ETHNICITY_HOME_STATES[input.ethnicityId] ?? [];
  const heritageInSide = heritage.filter((code) => mapped(code) && inSide(code));
  const sideMapped = sideCodes.filter(mapped);
  const heritageMapped = heritage.filter(mapped);

  let candidates: string[];
  let matched: boolean;
  if (heritageInSide.length > 0) {
    candidates = heritageInSide;
    matched = true;
  } else if (sideMapped.length > 0) {
    candidates = sideMapped;
    matched = false;
  } else if (heritageMapped.length > 0) {
    candidates = heritageMapped;
    matched = true;
  } else {
    candidates = [...byState.keys()].sort();
    matched = false;
  }

  // The player's own state wins when it is a candidate: they chose it, and the
  // heritage or the side already agrees it fits.
  const state =
    input.stateCode && candidates.includes(input.stateCode) ? input.stateCode : candidates[0]!;
  const places = byState.get(state);
  if (!places || places.length === 0) return null;

  const settlement = [...places].sort(
    (a, b) => (b.population ?? 0) - (a.population ?? 0) || a.name.localeCompare(b.name),
  )[0]!;
  const stateName = settlement.state ?? state;
  const reason = matched
    ? `${stateName} is one of the states where ${input.ethnicityName} communities are most concentrated, so you start in its largest mapped town.`
    : `${stateName} is where your side puts you; no ${input.ethnicityName} stronghold is mapped in this region yet, so you start in its largest town.`;
  return { settlement, slug: settlementSlug(settlement.name), reason, fallback: !matched };
}
