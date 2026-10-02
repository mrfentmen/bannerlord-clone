/**
 * @vitest-environment jsdom
 *
 * Kill/death exchange (Buffy task 78).
 */

import { describe, expect, it } from "vitest";
import {
  buildReport,
  createReportScreen,
  killDeathRatio,
  killDeathSummary,
  ratioLine,
  type AfterActionData,
} from "../index.js";

const DATA: AfterActionData = {
  battleLabel: "Dry Fork",
  playerWon: true,
  durationS: 600,
  playerLosses: [
    { unitKind: "infantry", started: 60, lost: 12 },
    { unitKind: "archers", started: 24, lost: 6 },
  ],
  enemyLosses: [{ unitKind: "infantry", started: 100, lost: 80 }],
  playerKills: 80,
  enemyKills: 18,
  captures: [],
  timeline: [],
};

describe("kill/death ratio (task 78)", () => {
  it("measures the exchange from the casualty breakdown", () => {
    const r = killDeathRatio(buildReport(DATA, []));
    expect(r.ourDead).toBe(18);
    expect(r.theirDead).toBe(80);
    // (80 + 1) / (18 + 1) = 4.263...
    expect(r.ratio).toBeCloseTo(81 / 19, 10);
    expect(ratioLine(r.ratio)).toBe("4.3:1");
  });

  it("reports an even trade as 1.0", () => {
    const even: AfterActionData = {
      ...DATA,
      playerLosses: [{ unitKind: "infantry", started: 40, lost: 10 }],
      enemyLosses: [{ unitKind: "infantry", started: 40, lost: 10 }],
    };
    const r = killDeathRatio(buildReport(even, []));
    expect(ratioLine(r.ratio)).toBe("1.0:1");
  });

  it("reports a losing exchange as below one", () => {
    const bad: AfterActionData = {
      ...DATA,
      playerLosses: [{ unitKind: "infantry", started: 60, lost: 50 }],
      enemyLosses: [{ unitKind: "infantry", started: 60, lost: 20 }],
    };
    expect(ratioLine(killDeathRatio(buildReport(bad, [])).ratio)).toBe("0.4:1");
  });

  it("survives a battle with no losses at all", () => {
    const clean: AfterActionData = {
      ...DATA,
      playerLosses: [{ unitKind: "infantry", started: 30, lost: 0 }],
      enemyLosses: [{ unitKind: "infantry", started: 30, lost: 0 }],
    };
    const r = killDeathRatio(buildReport(clean, []));
    expect(r.ratio).toBe(1);
    expect(ratioLine(r.ratio)).toBe("1.0:1");
  });

  it("names both sides in the summary line", () => {
    const summary = killDeathSummary(buildReport(DATA, []));
    expect(summary).toBe("4.3:1 exchange — 80 of theirs against 18 of ours.");
  });

  it("prints the exchange on the report screen", () => {
    const el = createReportScreen(buildReport(DATA, []), () => {});
    document.body.appendChild(el);
    expect(el.querySelector(".afteraction-exchange")?.textContent).toBe(
      "4.3:1 exchange — 80 of theirs against 18 of ours.",
    );
  });
});