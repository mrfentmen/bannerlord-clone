/**
 * @vitest-environment jsdom
 *
 * MVP unit highlight (Buffy task 79).
 *
 * The report's per-kind MVP line is unchanged; this covers the per-soldier
 * highlight built from the sim's own citation, including the case where the
 * citation and the board disagree — the citation wins, because it is the sim's
 * answer and a report must not contradict it.
 */

import { describe, expect, it } from "vitest";
import {
  buildReport,
  boardLines,
  createReportScreen,
  leaderLine,
  mvpBoard,
  type AfterActionData,
} from "../index.js";
import { citeMvp, type UnitPerformance } from "../../battleflow/mvp.js";

const DATA: AfterActionData = {
  battleLabel: "Dry Fork",
  playerWon: true,
  durationS: 600,
  playerLosses: [{ unitKind: "archers", started: 24, lost: 4 }],
  enemyLosses: [{ unitKind: "infantry", started: 100, lost: 60 }],
  playerKills: 60,
  enemyKills: 8,
  captures: [],
  timeline: [],
};

const UNITS: UnitPerformance[] = [
  { unitId: "u1", name: "Kova", kind: "archers", kills: 21, damageDealt: 1400, started: 24, ended: 20 },
  { unitId: "u2", name: "Aldis", kind: "infantry", kills: 14, damageDealt: 900, started: 60, ended: 47 },
  { unitId: "u3", name: "Rell", kind: "archers", kills: 14, damageDealt: 2600, started: 24, ended: 24 },
];

describe("mvp highlight (task 79)", () => {
  it("ranks the field and highlights one unit", () => {
    const board = mvpBoard(UNITS);
    expect(board.rows.map((r) => r.unitId)).toEqual(["u1", "u3", "u2"]);
    expect(board.leader?.unitId).toBe("u1");
    expect(board.leader?.isLeader).toBe(true);
    expect(board.rows.filter((r) => r.isLeader)).toHaveLength(1);
  });

  it("orders ties by damage, then survival, then id", () => {
    const tie: UnitPerformance[] = [
      { unitId: "b", name: "B", kind: "k", kills: 5, damageDealt: 10, started: 10, ended: 5 },
      { unitId: "a", name: "A", kind: "k", kills: 5, damageDealt: 10, started: 10, ended: 5 },
    ];
    expect(mvpBoard(tie).rows.map((r) => r.unitId)).toEqual(["a", "b"]);

    const byDamage: UnitPerformance[] = [
      { unitId: "b", name: "B", kind: "k", kills: 5, damageDealt: 10, started: 10, ended: 5 },
      { unitId: "a", name: "A", kind: "k", kills: 5, damageDealt: 99, started: 10, ended: 5 },
    ];
    expect(mvpBoard(byDamage).leader?.unitId).toBe("a");
  });

  it("computes survival from what the unit started and ended with", () => {
    const board = mvpBoard(UNITS);
    expect(board.leader?.survivalRate).toBeCloseTo(20 / 24, 10);
  });

  it("takes the sim's citation as the leader, even against its own ranking", () => {
    // The sim weights kills x10, then damage/100, so 21 kills beats 14 by more than
    // Rell's damage makes up. Force a disagreement and check the citation wins.
    const citation = { ...citeMvp(UNITS)!, name: "Rell", kind: "archers" };
    const board = mvpBoard(UNITS, citation);
    expect(board.leader?.unitId).toBe("u3");
    expect(board.rows[0]?.isLeader).toBe(false);
    // The board keeps rank order; the citation flags the leader rather than
    // moving it, so the list still reads as a ranking.
    expect(board.rows[1]?.isLeader).toBe(true);
    expect(board.rows.map((r) => r.unitId)).toEqual(["u1", "u3", "u2"]);
  });

  it("prints the sim's own citation when there is one", () => {
    const citation = citeMvp(UNITS);
    expect(citation).not.toBeNull();
    expect(mvpBoard(UNITS, citation).line).toBe(citation!.citation);
  });

  it("composes the line from the board when there is no citation", () => {
    const board = mvpBoard(UNITS);
    expect(board.line).toBe(leaderLine(board.leader!));
    expect(board.line).toContain("Kova (archers) — 21 kills");
    expect(board.line).toContain("83% survived");
  });

  it("says nothing for a field nobody fought in", () => {
    const empty = mvpBoard([]);
    expect(empty.leader).toBeNull();
    expect(empty.rows).toEqual([]);
    expect(empty.line).toBe("");
  });

  it("lists the whole field under the highlight", () => {
    expect(boardLines(mvpBoard(UNITS))).toEqual([
      "Kova (archers) — 21 kills",
      "Rell (archers) — 14 kills",
      "Aldis (infantry) — 14 kills",
    ]);
  });

  it("renders the highlight on the report screen", () => {
    const report = buildReport(DATA, [{ unitKind: "archers", kills: 35 }]);
    const el = createReportScreen(report, () => {}, { units: UNITS, citation: citeMvp(UNITS) });
    document.body.appendChild(el);

    const highlight = el.querySelector('[data-testid="afteraction-mvp"]');
    expect(highlight?.querySelector(".afteraction-mvp__name")?.textContent).toBe("Kova (archers)");
    expect(el.querySelectorAll(".afteraction-mvp-row")).toHaveLength(3);
    expect(el.querySelectorAll(".afteraction-mvp-row--leader")).toHaveLength(1);
    // The per-kind line is still there: two grains of report, not a replacement.
    expect(el.textContent).toContain("archers — 35 kills");
  });

  it("renders the report unchanged when the sim reported no individuals", () => {
    const el = createReportScreen(buildReport(DATA, []), () => {});
    document.body.appendChild(el);
    expect(el.querySelector('[data-testid="afteraction-mvp"]')).toBeNull();
    expect(el.querySelector(".afteraction-mvp-row")).toBeNull();
  });
});