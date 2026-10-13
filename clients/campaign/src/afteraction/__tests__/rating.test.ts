/**
 * @vitest-environment jsdom
 *
 * Battle rating (Buffy task 90).
 *
 * The thresholds are the feature, so they are tested from both sides: every
 * boundary is checked at one point above and one below, which is what stops the
 * scale drifting when the exchange maths changes.
 */

import { describe, expect, it } from "vitest";
import {
  BATTLE_GRADES,
  battleRating,
  buildReport,
  createReportScreen,
  GRADE_THRESHOLDS,
  ratingGrade,
  type AfterActionData,
} from "../index.js";

function battle(ourDead: number, theirDead: number, won = true): AfterActionData {
  return {
    battleLabel: "Dry Fork",
    playerWon: won,
    durationS: 600,
    playerLosses: [{ unitKind: "infantry", started: 100, lost: ourDead }],
    enemyLosses: [{ unitKind: "infantry", started: 100, lost: theirDead }],
    playerKills: theirDead,
    enemyKills: ourDead,
    captures: [],
    timeline: [],
  };
}

/** The exchange a given pair of losses produces, through the real report. */
function exchangeOf(ourDead: number, theirDead: number): number {
  return battleRating(buildReport(battle(ourDead, theirDead), [])).exchange;
}

/** The grade a given pair of losses earns in a victory. */
function exchangeGrade(ourDead: number, theirDead: number): string {
  return ratingGrade(buildReport(battle(ourDead, theirDead), []));
}

describe("battle rating (task 90)", () => {
  it("grades a defeat as D whatever the exchange was", () => {
    const won = battleRating(buildReport(battle(0, 90, true), []));
    expect(won.grade).toBe("S");
    const lost = battleRating(buildReport(battle(90, 0, false), []));
    expect(lost.grade).toBe("D");
    expect(lost.basis).toBe("Defeat");
    expect(lost.line).toContain("Rating D");
  });

  it("grades a flawless victory S", () => {
    const r = battleRating(buildReport(battle(0, 1, true), []));
    expect(r.grade).toBe("S");
    expect(r.flawless).toBe(true);
    expect(r.basis).toBe("No losses");
  });

  it("grades the top of the exchange scale S", () => {
    // 100 dead for 10 lost is a 101:11 exchange, well past S.
    expect(ratingGrade(buildReport(battle(10, 100), []))).toBe("S");
  });

  it("grades A in its band", () => {
    // 30 for 10 is a 31:11 exchange: 2.8, so A.
    expect(exchangeOf(10, 30)).toBeCloseTo(31 / 11, 10);
    expect(ratingGrade(buildReport(battle(10, 30), []))).toBe("A");
  });

  it("grades B in its band", () => {
    // 20 for 10 is 21:11, about 1.9, so B.
    expect(exchangeGrade(10, 20)).toBe("B");
  });

  it("grades C in its band", () => {
    // 10 for 10 is an even trade: a win, but no better than that.
    expect(exchangeGrade(10, 10)).toBe("C");
  });

  it("grades a bloodily-won victory no higher than C", () => {
    const r = battleRating(buildReport(battle(40, 20, true), []));
    expect(r.grade).toBe("C");
    expect(r.flawless).toBe(false);
  });

  it("puts the thresholds where the rule says", () => {
    expect(GRADE_THRESHOLDS).toEqual({ S: 4, A: 2.5, B: 1.5 });
    // Just under and just over each threshold, measured through the real maths.
    expect(exchangeOf(10, 40)).toBeLessThan(GRADE_THRESHOLDS.S);
    expect(exchangeOf(10, 43)).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.S);
    expect(exchangeOf(10, 26)).toBeLessThan(GRADE_THRESHOLDS.A);
    expect(exchangeOf(10, 27)).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.A);
    expect(exchangeOf(10, 15)).toBeLessThan(GRADE_THRESHOLDS.B);
    expect(exchangeOf(10, 16)).toBeGreaterThanOrEqual(GRADE_THRESHOLDS.B);
  });

  it("never grades a defeat above D, whatever the numbers say", () => {
    const cases = [
      [0, 100],
      [1, 100],
      [50, 50],
      [100, 0],
    ] as const;
    for (const [ours, theirs] of cases) {
      expect(ratingGrade(buildReport(battle(ours, theirs, false), []))).toBe("D");
    }
  });

  it("offers the five grades in display order", () => {
    expect(BATTLE_GRADES).toEqual(["S", "A", "B", "C", "D"]);
  });

  it("states the exchange it graded on", () => {
    const r = battleRating(buildReport(battle(10, 30), []));
    expect(r.exchange).toBeCloseTo(31 / 11, 10);
    expect(r.basis).toBe(`Exchange ${r.exchange.toFixed(1)}:1`);
    expect(r.line).toBe(`Rating A — exchange ${r.exchange.toFixed(1)}:1.`);
  });
});

describe("rating on the report screen (task 90)", () => {
  it("stamps the grade beside the title with its grounds", () => {
    const el = createReportScreen(buildReport(battle(10, 30), []), () => {});
    document.body.appendChild(el);

    const stamp = el.querySelector('[data-testid="afteraction-rating"]');
    expect(stamp?.getAttribute("data-grade")).toBe("A");
    expect(stamp?.querySelector(".afteraction-rating__grade")?.textContent).toBe("A");
    expect(stamp?.textContent).toContain("Exchange 2.8:1");
    expect(el.querySelector(".afteraction-header")?.contains(stamp ?? null)).toBe(true);
  });

  it("stamps a D on a defeat", () => {
    const el = createReportScreen(buildReport(battle(10, 30, false), []), () => {});
    document.body.appendChild(el);
    expect(el.querySelector('[data-testid="afteraction-rating"]')?.getAttribute("data-grade")).toBe("D");
    expect(el.querySelector(".afteraction-rating__basis")?.textContent).toBe("Defeat");
  });
});