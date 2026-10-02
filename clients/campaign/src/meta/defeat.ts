/**
 * Campaign defeat (Rowan solo task 2).
 *
 * When the clan is wiped out the campaign ends. Unlike a lost battle, there
 * is no army left to rally — but if an heir survives elsewhere (or the
 * succession law names one), the story can continue under a new ruler.
 * Member data comes from PAX's data layer through the injected standing.
 */

export interface DefeatStanding {
  /** Living clan members. Zero means the clan is wiped out. */
  livingMembers: number;
  clanName: string;
  daysElapsed: number;
  battlesWon: number;
}

export interface DefeatResult {
  wipedOut: boolean;
  epitaph: string;
  summaryLines: string[];
}

/** Pure evaluation: is the campaign over? */
export function evaluateDefeat(standing: DefeatStanding): DefeatResult {
  const wipedOut = standing.livingMembers <= 0;
  const epitaph = wipedOut ? `The line of ${standing.clanName} ends here.` : "";
  const summaryLines = wipedOut
    ? [
        `${standing.clanName} survived ${standing.daysElapsed} days and won ${standing.battlesWon} battles.`,
        "No living members remain to carry the banner.",
      ]
    : [];
  return { wipedOut, epitaph, summaryLines };
}

/**
 * One-time announcement guard, mirroring the victory guard: show the panel
 * once, when wiped out and not already announced.
 */
export function shouldAnnounceDefeat(standing: DefeatStanding, announced: boolean): boolean {
  if (announced) return false;
  return evaluateDefeat(standing).wipedOut;
}
