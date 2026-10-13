/**
 * Task 90: battle rating, S through D.
 *
 * The rule, in one place, so it can be argued with:
 *
 *   A defeat is a D. Nothing else matters — the field was lost.
 *   A victory is graded on the exchange the battle produced (task 78's ratio:
 *   enemy dead per our dead, `+1` on both sides):
 *     S  — flawless, or an exchange of 4:1 or better
 *     A  — 2.5:1 or better
 *     B  — 1.5:1 or better
 *     C  — anything below that, including a win bought with heavy losses
 *
 * Every number in the grade comes from the report's casualty breakdown; nothing
 * here is scored by eye or carried in from a previous battle. The exchange is
 * used rather than the kill counts because a rout kills nobody and still decides
 * a battle, and a rating that rewarded killing would reward the wrong tactic.
 *
 * A pyrrhic win and a flawless win both land inside this scale on purpose: they
 * are separate after-action notices (tasks 96 and 97), so the rating can stay a
 * measure of the fight rather than a summary of every other notice.
 */

import type { AfterActionReport } from "./report.js";
import { killDeathRatio } from "./killDeath.js";

export type BattleGrade = "S" | "A" | "B" | "C" | "D";

export interface BattleRating {
  grade: BattleGrade;
  /** Enemy dead per our dead. Zero losses on our side makes it the ceiling. */
  exchange: number;
  /** True when we won without losing a single troop. */
  flawless: boolean;
  /** The grounds, as printed: "Exchange 4.3:1", "No losses", or "Defeat". */
  basis: string;
  /** One line for the report. */
  line: string;
}

/** The grades, best first, for display order. */
export const BATTLE_GRADES: readonly BattleGrade[] = ["S", "A", "B", "C", "D"];

/** Exchange at which a victory earns each grade. */
export const GRADE_THRESHOLDS = { A: 2.5, B: 1.5, S: 4 } as const;

function gradeFor(exchange: number, flawless: boolean): BattleGrade {
  if (flawless || exchange >= GRADE_THRESHOLDS.S) return "S";
  if (exchange >= GRADE_THRESHOLDS.A) return "A";
  if (exchange >= GRADE_THRESHOLDS.B) return "B";
  return "C";
}

/**
 * Grade a finished battle. `flawless` is taken from the casualty total rather
 * than recomputed from the rows, so it cannot disagree with the number the
 * report prints for losses.
 */
export function battleRating(report: AfterActionReport): BattleRating {
  const { ratio, ourDead } = killDeathRatio(report);
  if (!report.playerWon) {
    return {
      grade: "D",
      exchange: ratio,
      flawless: false,
      basis: "Defeat",
      line: `Rating D — the field was lost, ${ratio.toFixed(1)}:1 exchange.`,
    };
  }
  const flawless = ourDead === 0;
  const grade = gradeFor(ratio, flawless);
  const basis = flawless ? "No losses" : `Exchange ${ratio.toFixed(1)}:1`;
  return {
    grade,
    exchange: ratio,
    flawless,
    basis,
    line: `Rating ${grade} — ${basis.toLowerCase()}.`,
  };
}

/** The grade alone, for a badge. */
export function ratingGrade(report: AfterActionReport): BattleGrade {
  return battleRating(report).grade;
}