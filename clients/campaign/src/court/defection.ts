/**
 * Clan defection, ported from Bannerlord.
 *
 * Clans leave kingdoms. In Bannerlord a clan whose loyalty has cratered —
 * unpaid, ignored, overruled — can walk away, taking its fiefs or leaving
 * them behind. The old king calls it treason; the clan calls it Tuesday.
 */

export interface DefectionTerms {
  clanName: string;
  kingdomName: string;
  /** 0..100. Below 25, they walk. */
  loyalty: number;
  /** Fiefs the clan holds. */
  fiefs: string[];
  /** If set, the clan joins this kingdom instead of going independent. */
  joinKingdom?: string;
}

export type DefectionResult =
  | {
      ok: true;
      keepsFiefs: boolean;
      line: string;
    }
  | { ok: false; reason: string };

/**
 * Attempt defection. Loyalty under 25 walks free; 25-40 can be talked
 * down (fails here — that's the persuasion system's job); above 40 the
 * clan won't go.
 */
export function defect(terms: DefectionTerms): DefectionResult {
  if (terms.loyalty >= 40) {
    return {
      ok: false,
      reason: `${terms.clanName} is loyal enough to ${terms.kingdomName} (${Math.round(terms.loyalty)}). They won't walk.`,
    };
  }
  if (terms.loyalty >= 25) {
    return {
      ok: false,
      reason: `${terms.clanName} wavers at ${Math.round(terms.loyalty)} loyalty — persuade them, or push them further first.`,
    };
  }
  // Below 25: they walk. Keeping fiefs depends on how far gone they are —
  // under 10, they take everything; otherwise they leave the land behind.
  const keepsFiefs = terms.loyalty < 10 && terms.fiefs.length > 0;
  const destination = terms.joinKingdom ? ` and rides for ${terms.joinKingdom}` : " and answers to no one";
  return {
    ok: true,
    keepsFiefs,
    line: `${terms.clanName} renounces ${terms.kingdomName}${destination}.${keepsFiefs ? ` They keep ${terms.fiefs.join(", ")}.` : terms.fiefs.length > 0 ? " Their fiefs revert to the crown." : ""}`,
  };
}
