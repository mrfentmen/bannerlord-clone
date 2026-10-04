/**
 * Where a character starts: their heritage and the real map, not a city picker.
 *
 * The locked creation order is heritage, family job, upbringing, home. The home
 * step never asks the player to pick a town off a list: the resolver derives the
 * town from where the player's people actually live (`ETHNICITY_HOME_STATES`, US
 * Census ancestry and place-of-birth tables) and the settlements the loaded
 * region really has. The player picks a state, or lets their heritage decide.
 *
 * A heritage never blocks and a side is never asked: the region the client loads
 * may hold none of a group's strongholds, so the resolver says so in `fallback`
 * and the reason sentence is honest about it instead of pretending.
 */

import type { WorldSettlement } from "../world/types.js";

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
  /**
   * The settlement's name slug. The simulation relocates the player by it
   * (`townByRef` slugs town names the same way), so the POST /v1/character
   * `startCity` field is this value.
   */
  slug: string;
  /** One plain sentence: why this town is home. */
  reason: string;
  /** True when no mapped state is one of the heritage's real strongholds. */
  fallback: boolean;
}

export interface HomeRequest {
  ethnicityId: string;
  /** Display name for the heritage, e.g. "Italian-American", for the reason sentence. */
  ethnicityName: string;
  /**
   * The state the player picked on the home step, when they picked one. Null means
   * the heritage decides. An explicit pick always wins when the state has a mapped
   * town: the home step is the player's choice, and a heritage never blocks.
   */
  stateCode?: string | null;
  settlements: readonly WorldSettlement[];
}

/**
 * The states the loaded region actually has towns in, with the real figures the
 * home step shows: how many mapped towns, their combined Census population, and
 * the state's display name as the survey spells it.
 */
export interface MappedState {
  code: string;
  name: string;
  townCount: number;
  population: number;
}

export function mappedStates(settlements: readonly WorldSettlement[]): MappedState[] {
  const byCode = new Map<string, MappedState>();
  for (const s of settlements) {
    if (!s.stateCode) continue;
    const entry = byCode.get(s.stateCode);
    if (entry) {
      entry.townCount += 1;
      entry.population += s.population ?? 0;
    } else {
      byCode.set(s.stateCode, {
        code: s.stateCode,
        name: s.state ?? s.stateCode,
        townCount: 1,
        population: s.population ?? 0,
      });
    }
  }
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
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

  const mapped = (code: string): boolean => (byState.get(code)?.length ?? 0) > 0;
  const heritage = ETHNICITY_HOME_STATES[input.ethnicityId] ?? [];

  // The best town inside one state: the most populous mapped settlement there,
  // a real Census figure rather than a hand-picked favourite. Ties break on
  // name so the choice is deterministic.
  const bestInState = (code: string): WorldSettlement | undefined => {
    const places = byState.get(code);
    if (!places || places.length === 0) return undefined;
    return [...places].sort(
      (a, b) => (b.population ?? 0) - (a.population ?? 0) || a.name.localeCompare(b.name),
    )[0];
  };

  let chosen: WorldSettlement | undefined;
  let chosenState = "";
  let matched: boolean;
  const picked = input.stateCode ?? null;
  if (picked !== null && mapped(picked)) {
    // The player's own pick wins whenever the state is on the map: the home step
    // is their choice, and a heritage only shapes the default.
    chosen = bestInState(picked);
    chosenState = picked;
    matched = heritage.includes(picked);
  } else {
    const heritageMapped = heritage.filter(mapped);
    if (heritageMapped.length > 0) {
      // Strongest-concentration state first: that order is the data, so the
      // first mapped state on the list is where the heritage actually lives.
      for (const code of heritageMapped) {
        const best = bestInState(code);
        if (best) {
          chosen = best;
          chosenState = code;
          break;
        }
      }
      matched = true;
    } else {
      // No stronghold of this heritage is mapped. The honest default is the
      // region's largest town, so the states are tried biggest-city first and
      // the reason sentence says exactly that.
      const fallbackStates = [...byState.keys()].sort((a, b) => {
        const pa = bestInState(a)?.population ?? 0;
        const pb = bestInState(b)?.population ?? 0;
        return pb - pa || a.localeCompare(b);
      });
      for (const code of fallbackStates) {
        const best = bestInState(code);
        if (best) {
          chosen = best;
          chosenState = code;
          break;
        }
      }
      matched = false;
    }
  }
  if (!chosen) return null;

  const stateName = chosen.state ?? chosenState;
  const reason = matched
    ? `${stateName} is one of the states where ${input.ethnicityName} communities are most concentrated, so you start in ${chosen.name}, the largest mapped town in your part of the state.`
    : `No ${input.ethnicityName} stronghold is mapped in this region yet, so you start in ${chosen.name}, the largest town the map holds.`;
  return {
    settlement: chosen,
    slug: settlementSlug(chosen.name),
    reason,
    fallback: !matched,
  };
}

/**
 * The settlement name slug the simulation's town index matches on.
 *
 * Mirrors the simulation's own `Slug` (lowercase, runs of non-alphanumerics to
 * one dash, no edge dashes) so a `startCity` sent from this resolver resolves
 * server-side without the two ends ever drifting apart.
 */
export function settlementSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
