/**
 * Pyrrhic victory warning (Buffy task 96).
 *
 * A third of the force dead is the threshold, and the boundary is tested from
 * both sides so a rounding change to the report cannot quietly move it.
 */

import { describe, expect, it } from "vitest";
import {
  buildReport,
  PYRRHIC_LOSS_SHARE,
  pyrrhicVictory,
  type AfterActionData,
} from "../index.js";

function battle(started: number, lost: number, won = true): AfterActionData {
  return {
    battleLabel: "Dry Fork",
    playerWon: won,
    durationS: 600,
    playerLosses: [{ unitKind: "infantry", started, lost }],
    enemyLosses: [{ unitKind: "infantry", started: 100, lost: 40 }],
    playerKills: 40,
    enemyKills: lost,
    captures: [],
    timeline: [],
  };
}

describe("pyrrhic victory (task 96)", () => {
  it("warns when a third of the force is dead", () => {
    const p = pyrrhicVictory(buildReport(battle(60, 20), []));
    expect(p).not.toBeNull();
    expect(p?.ourLosses).toBe(20);
    expect(p?.ourStrength).toBe(60);
    expect(p?.survivors).toBe(40);
    expect(p?.lossShare).toBeCloseTo(1 / 3, 10);
  });

  it("stays quiet just under the threshold", () => {
    // 19 of 60 is 31.7%, a hair under a third.
    expect(pyrrhicVictory(buildReport(battle(60, 19), []))).toBeNull();
  });

  it("warns at exactly the threshold, rounding aside", () => {
    // 20 of 60 is exactly a third.
    expect(pyrrhicVictory(buildReport(battle(60, 20), []))).not.toBeNull();
    expect(PYRRHIC_LOSS_SHARE).toBeCloseTo(1 / 3, 10);
  });

  it("warns on losses spread across several unit types", () => {
    const data: AfterActionData = {
      ...battle(100, 1),
      playerLosses: [
        { unitKind: "infantry", started: 60, lost: 25 },
        { unitKind: "archers", started: 40, lost: 10 },
      ],
    };
    const p = pyrrhicVictory(buildReport(data, []));
    // 35 dead of 100, taken from the same total the Casualties section prints.
    expect(p?.ourLosses).toBe(35);
    expect(p?.lossShare).toBeCloseTo(0.35, 10);
  });

  it("says nothing about a defeat", () => {
    expect(pyrrhicVictory(buildReport(battle(60, 50, false), []))).toBeNull();
  });

  it("says nothing about a cheap win", () => {
    expect(pyrrhicVictory(buildReport(battle(100, 4), []))).toBeNull();
  });

  it("says nothing when we had nobody in the field", () => {
    expect(pyrrhicVictory(buildReport(battle(0, 0), []))).toBeNull();
  });

  it("states the cost in troops and in share", () => {
    expect(pyrrhicVictory(buildReport(battle(60, 30), []))?.line).toBe(
      "Pyrrhic victory — 30 of 60 dead (50% of the force).",
    );
  });
});
