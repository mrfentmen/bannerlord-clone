/**
 * Task 90: trial events. Judge a dispute between two parties; the verdict
 * moves town loyalty and the winner's relation. Loyalty deltas are the
 * decision — the sim/campaign applies them to the town.
 */

import type { TrialCase, Verdict } from "./types.js";

export interface TrialOutcome {
  verdict: Verdict;
  /** Town loyalty delta. */
  loyalty: number;
  /** plaintiffId -> relation delta, defendantId -> relation delta. */
  relations: Record<string, number>;
  text: string;
}

/**
 * Judge a case. `evidence` 0..1 favors the plaintiff; `harshness` 0..1 is the
 * judge's temperament. Deterministic: the same inputs always give the same
 * verdict, so the UI can preview it.
 */
export function judgeTrial(
  trial: TrialCase,
  evidence: number,
  harshness: number,
): TrialOutcome {
  if (evidence < 0 || evidence > 1) throw new Error("evidence must be 0..1");
  const score = evidence * 0.7 + (1 - harshness) * 0.3;
  const verdict: Verdict = score > 0.66 ? "for-plaintiff" : score < 0.33 ? "for-defendant" : "compromise";
  const loyalty = verdict === "compromise" ? 4 : harshness > 0.7 ? -6 : 2;
  const relations: Record<string, number> =
    verdict === "for-plaintiff"
      ? { [trial.plaintiff]: 8, [trial.defendant]: -10 }
      : verdict === "for-defendant"
        ? { [trial.plaintiff]: -10, [trial.defendant]: 8 }
        : { [trial.plaintiff]: 3, [trial.defendant]: 3 };
  return {
    verdict,
    loyalty,
    relations,
    text: `${trial.title}: judged ${verdict.replace("-", " ")}. Town loyalty ${loyalty >= 0 ? "+" : ""}${loyalty}.`,
  };
}
