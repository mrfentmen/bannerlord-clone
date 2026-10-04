/**
 * Courtship, ported from Bannerlord's romance flow.
 *
 * Bannerlord's wooing is a multi-stage persuasion game: express interest,
 * and if they don't laugh you out of the hall, court them — gifts, visits,
 * deeds — until affection is high enough to propose. Rejection stings
 * (relation loss); a rival can spoil it. This is the state machine; the
 * persuasion rolls come from campaign/fortune.ts.
 */

export type CourtshipStage = "interested" | "courting" | "betrothed" | "rejected";

export interface Courtship {
  suitorId: string;
  targetId: string;
  stage: CourtshipStage;
  /** 0..100. Proposal needs 70+. */
  affection: number;
  startedDay: number;
  /** Failed proposals so far; each one makes the next harder. */
  rejections: number;
}

/** Affection needed to propose. */
export const PROPOSAL_AFFECTION = 70;

export interface CourtshipTerms {
  suitorId: string;
  targetId: string;
  suitorName: string;
  targetName: string;
  /** 0..100 relation between the two. */
  relation: number;
  /** Charm/persuasion roll 0..100 for the approach. */
  approachRoll: number;
  day: number;
}

export type CourtshipResult =
  | { ok: true; courtship: Courtship; line: string }
  | { ok: false; reason: string };

/**
 * Express romantic interest. Needs a decent first impression:
 * relation + approach roll must clear 50, and the already-married or
 * the dead need not apply (checked by the caller).
 */
export function expressInterest(terms: CourtshipTerms): CourtshipResult {
  const score = terms.relation * 0.4 + terms.approachRoll * 0.6;
  if (score < 50) {
    return {
      ok: false,
      reason: `${terms.targetName} is not interested. (first impression ${Math.round(score)}/50)`,
    };
  }
  return {
    ok: true,
    courtship: {
      suitorId: terms.suitorId,
      targetId: terms.targetId,
      stage: "courting",
      affection: Math.round(score * 0.5),
      startedDay: terms.day,
      rejections: 0,
    },
    line: `${terms.targetName} accepts ${terms.suitorName}'s courtship.`,
  };
}

export type CourtAction = "gift" | "visit" | "deed" | "poem";

const ACTION_AFFECTION: Record<CourtAction, { min: number; max: number }> = {
  gift: { min: 4, max: 10 },
  visit: { min: 2, max: 6 },
  deed: { min: 6, max: 14 },
  poem: { min: 1, max: 8 },
};

/**
 * A courting action. Affection moves by a roll in the action's range;
 * poems are high-variance (a bad poem is worse than no poem).
 */
export function courtAction(courtship: Courtship, action: CourtAction, roll: () => number): Courtship {
  if (courtship.stage !== "courting") return courtship;
  const range = ACTION_AFFECTION[action];
  let gain = range.min + roll() * (range.max - range.min);
  if (action === "poem" && roll() < 0.25) gain = -gain; // the poem bombs
  return {
    ...courtship,
    affection: Math.max(0, Math.min(100, courtship.affection + Math.round(gain))),
  };
}

export interface ProposalResult {
  accepted: boolean;
  courtship: Courtship;
  line: string;
}

/**
 * Propose marriage. Needs 70+ affection; each past rejection adds 10 to
 * the bar. Acceptance moves to "betrothed" — the caller then marries them.
 */
export function propose(courtship: Courtship, suitorName: string, targetName: string): ProposalResult {
  if (courtship.stage !== "courting") {
    return { accepted: false, courtship, line: "There is no active courtship." };
  }
  const bar = PROPOSAL_AFFECTION + courtship.rejections * 10;
  if (courtship.affection >= bar) {
    return {
      accepted: true,
      courtship: { ...courtship, stage: "betrothed" },
      line: `${targetName} says yes! ${suitorName} and ${targetName} are betrothed.`,
    };
  }
  return {
    accepted: false,
    courtship: { ...courtship, stage: "rejected", rejections: courtship.rejections + 1 },
    line: `${targetName} refuses the proposal. The courtship is over — for now. (needed ${bar} affection, had ${Math.round(courtship.affection)})`,
  };
}
