/**
 * @vitest-environment jsdom
 *
 * After-action tests (MASTER_PLAN 2E, tasks 68-75).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  battleSummaryText,
  buildReport,
  casualtyBreakdown,
  createReplayPlayer,
  createReportScreen,
  createWarStats,
  defeatScreen,
  REPLAY_SPEEDS,
  victoryScreen,
  type AfterActionData,
} from "../index.js";

const DATA: AfterActionData = {
  battleLabel: "Test Field",
  playerWon: true,
  durationS: 300,
  playerLosses: [
    { unitKind: "infantry", started: 60, lost: 12 },
    { unitKind: "archers", started: 24, lost: 6 },
  ],
  enemyLosses: [{ unitKind: "infantry", started: 100, lost: 80 }],
  playerKills: 80,
  enemyKills: 18,
  captures: ["Enemy captain"],
  timeline: [
    { t: 120, label: "Enemy routed", kind: "rout" },
    { t: 10, label: "Charge sounded", kind: "charge" },
  ],
};

const KILLS = [
  { unitKind: "infantry", kills: 50 },
  { unitKind: "archers", kills: 30 },
];

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

describe("report (task 68)", () => {
  it("populates all four sections", () => {
    const r = buildReport(DATA, KILLS);
    expect(r.playerCasualties.totalLost).toBe(18);
    expect(r.enemyCasualties.totalLost).toBe(80);
    expect(r.playerKills).toBe(80);
    expect(r.mvp).toEqual({ unitKind: "infantry", kills: 50 });
    expect(r.timeline.map((e) => e.label)).toEqual(["Charge sounded", "Enemy routed"]);
    expect(r.captures).toEqual(["Enemy captain"]);
  });

  it("renders the four sections to DOM", () => {
    const el = createReportScreen(buildReport(DATA, KILLS), () => {});
    document.body.appendChild(el);
    for (const heading of ["Kills", "Casualties", "MVP unit", "Timeline"]) {
      expect(el.textContent).toContain(heading);
    }
  });
});

describe("casualties (task 69)", () => {
  it("shares sum to the total", () => {
    const b = casualtyBreakdown(DATA.playerLosses);
    const sum = b.rows.reduce((s, r) => s + r.share, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(b.rows[0]!.share).toBeCloseTo(12 / 18, 10);
  });
});

describe("end screens (task 70)", () => {
  it("victory screen offers ransom/recruit when there are captures", () => {
    const s = victoryScreen(buildReport(DATA, KILLS));
    expect(s.headline).toBe("Victory");
    expect(s.choices.map((c) => c.id)).toContain("ransom");
    expect(s.choices.map((c) => c.id)).toContain("recruit");
  });

  it("defeat screen reads as a defeat", () => {
    const s = defeatScreen(buildReport({ ...DATA, playerWon: false }, KILLS));
    expect(s.headline).toBe("Defeat");
    expect(s.lines.join(" ")).toContain("18");
  });
});

describe("war stats (task 71)", () => {
  it("accumulates across battles and persists", () => {
    const w = createWarStats();
    w.recordBattle(true, 80, 18);
    w.recordBattle(false, 10, 40);
    const s = w.stats();
    expect(s.battles).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.kills).toBe(90);
    expect(s.bestStreak).toBe(1);
    expect(s.currentStreak).toBe(0);
    expect(createWarStats().stats().battles).toBe(2);
  });
});

describe("replay (tasks 72-74)", () => {
  const replay = {
    durationS: 100,
    events: [
      { t: 10, kind: "charge", data: {} },
      { t: 50, kind: "rout", data: {} },
    ],
  };

  it("scrubs the timeline", () => {
    const seen: number[] = [];
    const p = createReplayPlayer(replay, { onTick: (t) => seen.push(t.t) });
    p.seek(50);
    expect(p.time()).toBe(50);
    expect(seen.at(-1)).toBe(50);
    p.destroy();
  });

  it("supports the speed steps", () => {
    expect(REPLAY_SPEEDS).toEqual([0.25, 0.5, 1, 2, 4]);
    const p = createReplayPlayer(replay);
    p.setSpeed(2);
    expect(p.speed()).toBe(2);
    expect(() => p.setSpeed(3)).toThrow();
    p.destroy();
  });

  it("plays with a fake clock and emits new events", () => {
    let now = 0;
    const ticks: { t: number; n: number }[] = [];
    const p = createReplayPlayer(replay, {
      now: () => now,
      onTick: (t) => ticks.push({ t: t.t, n: t.newEvents.length }),
    });
    const rafQ: FrameRequestCallback[] = [];
    const origRaf = globalThis.requestAnimationFrame;
    (globalThis as Record<string, unknown>).requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafQ.push(cb);
      return rafQ.length;
    };
    p.play();
    for (let i = 0; i < 130; i++) {
      now += 500;
      rafQ.splice(0).forEach((cb) => cb(now));
    }
    (globalThis as Record<string, unknown>).requestAnimationFrame = origRaf;
    expect(p.time()).toBeGreaterThan(50);
    expect(ticks.some((x) => x.n > 0)).toBe(true);
    p.destroy();
  });
});

describe("shareable summary (task 75)", () => {
  it("builds a compact text card", () => {
    const text = battleSummaryText(buildReport(DATA, KILLS));
    expect(text).toContain("VICTORY — Test Field");
    expect(text).toContain("MVP: infantry (50 kills)");
    expect(text).toContain("Captured: Enemy captain");
  });
});
