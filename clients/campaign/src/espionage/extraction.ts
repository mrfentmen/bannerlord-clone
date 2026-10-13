/**
 * Spy extraction missions (Rowan solo task 68).
 *
 * When a spy's cover collapses, send an extraction team: success odds
 * come from the team's skill vs the post's heat, shown up front. The
 * outcome is deterministic from a seed — the spy escapes, or is lost.
 */

export interface ExtractionPlan {
  spyId: string;
  spyName: string;
  postId: string;
  /** 0..100 heat at the post. */
  heat: number;
  /** 0..10 extraction team skill. */
  teamSkill: number;
  /** 0..1 chance of getting the spy out. */
  successChance: number;
  line: string;
}

export type ExtractionOutcome =
  | { result: "extracted"; spyId: string; line: string }
  | { result: "lost"; spyId: string; line: string };

/** Plan an extraction: computes and shows the success odds. */
export function planExtraction(
  spyId: string,
  spyName: string,
  postId: string,
  heat: number,
  teamSkill: number,
): ExtractionPlan {
  const h = Math.max(0, Math.min(100, heat));
  const skill = Math.max(0, Math.min(10, teamSkill));
  const successChance = Math.max(0.05, Math.min(0.95, 0.5 + skill * 0.05 - h / 200));
  return {
    spyId,
    spyName,
    postId,
    heat: h,
    teamSkill: skill,
    successChance: Math.round(successChance * 100) / 100,
    line: `Extracting ${spyName} from ${postId}: ${Math.round(successChance * 100)}% success (heat ${h}, team skill ${skill}).`,
  };
}

function hash(text: string): number {
  let hh = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hh ^= text.charCodeAt(i);
    hh = Math.imul(hh, 0x01000193);
  }
  return hh >>> 0;
}

function draw(seed: number): number {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
  s = Math.imul(s ^ (s >>> 15), 0x735a2d97);
  return ((s ^ (s >>> 15)) >>> 0) / 4294967296;
}

/** Run the extraction. Deterministic from spy + seed. */
export function runExtraction(plan: ExtractionPlan, seed: number): ExtractionOutcome {
  const roll = draw(hash(plan.spyId) ^ (seed >>> 0));
  if (roll < plan.successChance) {
    return {
      result: "extracted",
      spyId: plan.spyId,
      line: `${plan.spyName} is out — smuggled through the ${plan.postId} gates before dawn.`,
    };
  }
  return {
    result: "lost",
    spyId: plan.spyId,
    line: `${plan.spyName} was caught at the ${plan.postId} gates. The network mourns.`,
  };
}
