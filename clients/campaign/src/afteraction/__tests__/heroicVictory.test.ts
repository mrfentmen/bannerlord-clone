/**
 * Heroic victory bonus (Buffy task 95).
 *
 * The threshold is checked against the same 2:1 the rest of the client means by
 * "outnumbered", so the test pins it to the challenge handicap's own scale
 * rather than to a number chosen here.
 */

import { describe, expect, it } from "vitest";
import {
  buildReport,
  HEROIC_RENOWN,
  heroicVictory,
  OUTNUMBER_RATIO,
  outnumberRatio,
  type AfterActionData,
} from "../index.js";
import { applyModifiers } from "../../modes/challenge.js";
import type { BattleConfig } from "../../modes/types.js";

/** A battle config with `ours` of ours and `theirs` of theirs. */
function config(ours: number, theirs: number): BattleConfig {
  return {
    mode: "skirmish",
    label: "test",
    player: { id: "p", name: "Player", units: [{ kind: "infantry", count: ours, tier: 1 }] },
    enemy: { id: "e", name: "Enemy", units: [{ kind: "infantry", count: theirs, tier: 1 }] },
    biome: "plains",
    modifiers: [],
    seed: 1,
  };
}

function battle(ours: number, theirs: number, won = true): AfterActionData {
  return {
    battleLabel: "Dry Fork",
    playerWon: won,
    durationS: 600,
    playerLosses: [{ unitKind: "infantry", started: ours, lost: 5 }],
    enemyLosses: [{ unitKind: "infantry", started: theirs, lost: theirs - 5 }],
    playerKills: theirs - 5,
    enemyKills: 5,
    captures: [],
    timeline: [],
  };
}

describe("outnumbered ratio (task 95)", () => {
  it("reads the forces that started, not the ones that walked off", () => {
    // We finish badly beaten but we started 60 against 140.
    const r = outnumberRatio(buildReport(battle(60, 140), []));
    expect(r).toBeCloseTo(140 / 60, 10);
  });

  it("reports no ratio for a side that never turned up", () => {
    expect(outnumberRatio(buildReport(battle(0, 100), []))).toBe(0);
  });
});

describe("heroic victory (task 95)", () => {
  it("earns the bonus for a win fought outnumbered", () => {
    const h = heroicVictory(buildReport(battle(60, 140), []));
    expect(h).not.toBeNull();
    expect(h?.ratio).toBeCloseTo(140 / 60, 10);
    expect(h?.ourStrength).toBe(60);
    expect(h?.theirStrength).toBe(140);
    expect(h?.renown).toBe(HEROIC_RENOWN);
  });

  it("matches the ratio the Outnumbered handicap actually produces", () => {
    // The handicap is the client\'s own definition of outnumbered, so the bonus
    // threshold is measured against it rather than asserted against a number.
    const handicapped = applyModifiers(config(60, 60), ["outnumbered"]);
    const ours = handicapped.player.units[0]!.count;
    const theirs = handicapped.enemy.units[0]!.count;
    expect(theirs / ours).toBeCloseTo(OUTNUMBER_RATIO, 10);

    // The bonus fires on that handicap, and not one troop short of it.
    expect(heroicVictory(buildReport(battle(ours, theirs), []))).not.toBeNull();
    expect(heroicVictory(buildReport(battle(ours, theirs - 1), []))).toBeNull();
  });

  it("declines the bonus one troop short of twice our numbers", () => {
    // 59 troops against 117 is 1.98:1; against 118 it is exactly twice.
    expect(heroicVictory(buildReport(battle(59, 117), []))).toBeNull();
    expect(heroicVictory(buildReport(battle(59, 118), []))).not.toBeNull();
  });

  it("earns it at exactly twice our numbers", () => {
    expect(heroicVictory(buildReport(battle(60, 120), []))).not.toBeNull();
  });

  it("earns nothing for an even fight", () => {
    expect(heroicVictory(buildReport(battle(100, 100), []))).toBeNull();
  });

  it("earns nothing for losing, however lopsided it was", () => {
    expect(heroicVictory(buildReport(battle(10, 500, false), []))).toBeNull();
  });

  it("earns nothing when we had nobody in the field", () => {
    expect(heroicVictory(buildReport(battle(0, 100), []))).toBeNull();
  });

  it("states the odds and the award in one line", () => {
    const h = heroicVictory(buildReport(battle(60, 140), []));
    expect(h?.line).toBe(
      "Heroic victory — 60 of ours against 140 of theirs (outnumbered 2.3:1). +50 renown.",
    );
  });
});