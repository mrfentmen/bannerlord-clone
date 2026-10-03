/**
 * @vitest-environment jsdom
 *
 * Regression tests for the verified gaps in MASTER_PLAN tasks 138/141.
 *
 * Task 138 accept is "stats accumulate across campaigns", which includes kills
 * and gold earned. Those were permanently zero: the battle layer's after-action
 * view reports both sides' losses and the loot taken, but `onBattleEvent` only
 * carried a string, so main.ts could not read them.
 *
 * Task 141 accept is "top 10 per mode" for quick-battle/arena/tournament. The
 * quick-battle board had no producer at all -- only arena and tournament wrote
 * to it, from a modes menu that is never mounted.
 *
 * These tests pin the two translations that close those gaps, so a future
 * change cannot quietly drop them again.
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  battleReportFromAfterAction,
  loadLifetimeStats,
  recordLifetimeBattle,
} from "../lifetimeStats.js";
import { battleScore, submitScore, topScores } from "../leaderboards.js";
import type { AfterActionView } from "../../battleflow/flow.js";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

/** A finished server encounter: the player attacked, won, took 420 loot. */
function attackerVictory(): AfterActionView {
  return {
    mode: "server",
    winner: "attacker",
    playerWon: true,
    playerIsAttacker: true,
    attackerLosses: 6, // the player's own losses
    defenderLosses: 23, // the enemy's losses == kills
    attackerKilled: 2,
    attackerWounded: 4,
    defenderKilled: 9,
    defenderWounded: 14,
    loot: 420,
    ticks: 40,
    summary: "Victory.",
    // Present but empty: these tests are about the numbers the lifetime-stats
    // translation reads, not the after-action narrative, and `aftermath` became
    // required on `AfterActionView` after this fixture was written.
    aftermath: { warStory: null, rivalLine: null, comparison: null, lootAppraisal: "No spoils." },
  };
}

describe("138: kills and gold come from the real after-action view", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("counts the enemy's losses as kills when the player attacked", () => {
    const report = battleReportFromAfterAction(attackerVictory());
    expect(report).toEqual({ won: true, kills: 23, losses: 6, goldEarned: 420 });
  });

  it("counts the attacker's losses as kills when the player defended", () => {
    const report = battleReportFromAfterAction({
      ...attackerVictory(),
      playerIsAttacker: false,
      playerWon: false,
      attackerLosses: 23,
      defenderLosses: 6,
      loot: 900,
    });
    expect(report).toEqual({ won: false, kills: 23, losses: 6, goldEarned: 0 });
  });

  it("awards loot only on a win -- a defeat yields no spoils", () => {
    const won = battleReportFromAfterAction(attackerVictory());
    const lost = battleReportFromAfterAction({ ...attackerVictory(), playerWon: false });
    expect(won?.goldEarned).toBe(420);
    expect(lost?.goldEarned).toBe(0);
  });

  it("folds real kills and loot into the lifetime record", () => {
    const store = memStorage();
    const report = battleReportFromAfterAction(attackerVictory())!;
    recordLifetimeBattle(report, store);
    const s = loadLifetimeStats(store);
    expect(s.battlesFought).toBe(1);
    expect(s.battlesWon).toBe(1);
    expect(s.kills).toBe(23);
    expect(s.goldEarned).toBe(420);
  });

  it("accumulates kills and gold across separate campaigns", () => {
    const store = memStorage();
    for (let i = 0; i < 3; i++) {
      // Each campaign is a distinct load/write cycle over the same store.
      recordLifetimeBattle(battleReportFromAfterAction(attackerVictory())!, store);
    }
    const s = loadLifetimeStats(store);
    expect(s.battlesFought).toBe(3);
    expect(s.kills).toBe(69);
    expect(s.goldEarned).toBe(1260);
  });

  it("returns null for a view missing the fields, so nothing is invented", () => {
    expect(battleReportFromAfterAction(undefined as never)).toBeNull();
    expect(battleReportFromAfterAction({} as never)).toBeNull();
    expect(
      battleReportFromAfterAction({ ...attackerVictory(), loot: NaN }),
    ).toBeNull();
  });

  it("never reports negative kills or loot", () => {
    const report = battleReportFromAfterAction({
      ...attackerVictory(),
      defenderLosses: -5,
      loot: -100,
    });
    expect(report?.kills).toBe(0);
    expect(report?.goldEarned).toBe(0);
  });
});

describe("141: the quick-battle board has a real producer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("scores a finished bout from its kills and own losses", () => {
    const report = battleReportFromAfterAction(attackerVictory())!;
    const score = battleScore(report.kills ?? 0, report.losses ?? 0, report.won);
    expect(score).toBe(23 * 10 + 100 - 6 * 5);
    expect(score).toBe(300);
  });

  it("lands a campaign-map bout on the quick-battle board", () => {
    const store = memStorage();
    const report = battleReportFromAfterAction(attackerVictory())!;
    const rank = submitScore(
      "quick-battle",
      {
        name: "Dax",
        score: battleScore(report.kills ?? 0, report.losses ?? 0, report.won),
        detail: `${report.kills} kills · victory`,
      },
      store,
    );
    expect(rank).toBe(0);
    const board = topScores("quick-battle", store);
    expect(board).toHaveLength(1);
    expect(board[0]?.name).toBe("Dax");
    expect(board[0]?.score).toBe(300);
    expect(board[0]?.detail).toBe("23 kills · victory");
  });

  it("keeps the quick-battle board at the top 10 under real bouts", () => {
    const store = memStorage();
    for (let i = 0; i < 14; i++) {
      const view = {
        ...attackerVictory(),
        defenderLosses: i + 1,
        loot: 0,
      };
      const report = battleReportFromAfterAction(view)!;
      submitScore(
        "quick-battle",
        { name: `Commander ${i}`, score: battleScore(report.kills ?? 0, 0, true) },
        store,
      );
    }
    const board = topScores("quick-battle", store);
    expect(board).toHaveLength(10);
    expect(board[0]?.score).toBe(14 * 10 + 100);
    expect(board[9]?.score).toBe(5 * 10 + 100);
  });

  it("orders equal scores deterministically (stable, newest last)", () => {
    const store = memStorage();
    for (const name of ["First", "Second", "Third"]) {
      submitScore("quick-battle", { name, score: 500 }, store);
    }
    const board = topScores("quick-battle", store);
    expect(board.map((e) => e.name)).toEqual(["First", "Second", "Third"]);
    // Re-reading from storage must not reshuffle the ties.
    expect(topScores("quick-battle", store).map((e) => e.name)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });
});