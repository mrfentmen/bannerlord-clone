/**
 * Campaign victory (Rowan solo task 1).
 *
 * A campaign is won by controlling enough of the map. The town count comes
 * from PAX's data layer (settlements/sieges) through the injected
 * VictoryStanding — this module owns the threshold, the evaluation, and the
 * one-time announcement guard. It never reads game state directly.
 */

export const VICTORY_TOWN_THRESHOLD = 4;

/** Minimal campaign standing needed to evaluate victory. Fed by the data layer. */
export interface VictoryStanding {
  townsControlled: number;
  battlesWon: number;
  daysElapsed: number;
  clanName: string;
}

export interface VictoryProgress {
  townsControlled: number;
  townsNeeded: number;
  achieved: boolean;
}

export interface VictoryResult extends VictoryProgress {
  /** Epithet earned, e.g. "Conqueror of the Coast". */
  title: string;
  summaryLines: string[];
}

/**
 * Evaluate the victory condition. Pure — no storage, no side effects.
 * The caller decides when to check (e.g. after a siege resolves) and uses
 * `announced` to fire the panel exactly once per campaign.
 */
export function evaluateVictory(standing: VictoryStanding): VictoryResult {
  const towns = Math.max(0, Math.floor(standing.townsControlled));
  const achieved = towns >= VICTORY_TOWN_THRESHOLD;
  const title = achieved ? `Conqueror — ${standing.clanName}` : "";
  const summaryLines = achieved
    ? [
        `${standing.clanName} holds ${towns} towns after ${standing.daysElapsed} days of campaigning.`,
        `${standing.battlesWon} battles won on the road to dominion.`,
        "The coast is yours. The campaign can continue as a sandbox, or retire in glory.",
      ]
    : [];
  return {
    townsControlled: towns,
    townsNeeded: VICTORY_TOWN_THRESHOLD,
    achieved,
    title,
    summaryLines,
  };
}

/**
 * One-time announcement guard. Returns true when the victory panel should be
 * shown now: achieved and not already announced this campaign.
 */
export function shouldAnnounceVictory(standing: VictoryStanding, announced: boolean): boolean {
  if (announced) return false;
  return evaluateVictory(standing).achieved;
}
