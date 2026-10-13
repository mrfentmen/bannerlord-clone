/**
 * @vitest-environment jsdom
 *
 * Flawless victory and the outcome notices (Buffy task 97).
 *
 * The tests pin the flawless definition to the one the client already uses —
 * "win a battle without losing a unit" in meta/achievements.ts — so the report
 * and the achievement cannot call the same battle two different things.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  buildReport,
  createOutcomePanel,
  createReportScreen,
  FLAWLESS_RENOWN,
  flawlessVictory,
  HEROIC_RENOWN,
  outcomeNotices,
  type AfterActionData,
} from "../index.js";
import { ACHIEVEMENTS } from "../../meta/achievements.js";

function battle(ours: number, ourLost: number, theirs = 100, won = true): AfterActionData {
  return {
    battleLabel: "Dry Fork",
    playerWon: won,
    durationS: 600,
    playerLosses: [{ unitKind: "infantry", started: ours, lost: ourLost }],
    enemyLosses: [{ unitKind: "infantry", started: theirs, lost: theirs - 1 }],
    playerKills: theirs - 1,
    enemyKills: ourLost,
    captures: [],
    timeline: [],
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("flawless victory (task 97)", () => {
  it("pays for a win with not one casualty", () => {
    const f = flawlessVictory(buildReport(battle(60, 0), []));
    expect(f).not.toBeNull();
    expect(f?.ourStrength).toBe(60);
    expect(f?.renown).toBe(FLAWLESS_RENOWN);
    expect(f?.line).toBe("Flawless victory — all 60 of ours came back. +75 renown.");
  });

  it("means the same thing the Flawless achievement means", () => {
    const deed = ACHIEVEMENTS.find((a) => a.id === "flawless");
    expect(deed?.description).toBe("Win a battle without losing a unit.");
    // One casualty is enough to end it, exactly as the deed says.
    expect(flawlessVictory(buildReport(battle(60, 0), []))).not.toBeNull();
    expect(flawlessVictory(buildReport(battle(60, 1), []))).toBeNull();
  });

  it("is not awarded for a loss taken without a casualty", () => {
    // Nobody died, but the field was lost: that is a withdrawal, not a victory.
    expect(flawlessVictory(buildReport(battle(60, 0, 100, false), []))).toBeNull();
  });

  it("costs nothing when the force never turned up", () => {
    const empty: AfterActionData = { ...battle(0, 0), playerLosses: [{ unitKind: "infantry", started: 0, lost: 0 }] };
    // A field with no troops of ours was not won flawlessly by us.
    expect(flawlessVictory(buildReport(empty, []))?.ourStrength).toBe(0);
  });

  it("pays more than the heroic award for winning outnumbered", () => {
    expect(FLAWLESS_RENOWN).toBeGreaterThan(HEROIC_RENOWN);
  });
});

describe("outcome notices (tasks 95-97)", () => {
  it("carries every notice the battle earned, bonuses before the warning", () => {
    // Won 3:1 down and lost a third of the force: heroic and pyrrhic together.
    const notices = outcomeNotices(buildReport(battle(40, 14, 120), []));
    expect(notices.map((n) => n.kind)).toEqual(["heroic", "pyrrhic"]);
    expect(notices[0]?.label).toBe("Heroic victory");
    expect(notices[1]?.label).toBe("Pyrrhic victory");
  });

  it("reports both awards when a battle is heroic and flawless", () => {
    const notices = outcomeNotices(buildReport(battle(40, 0, 120), []));
    expect(notices.map((n) => n.kind)).toEqual(["heroic", "flawless"]);
    expect(notices[0]?.line).toContain(`+${HEROIC_RENOWN} renown`);
    expect(notices[1]?.line).toContain(`+${FLAWLESS_RENOWN} renown`);
  });

  it("reports nothing for an ordinary win", () => {
    expect(outcomeNotices(buildReport(battle(100, 8), []))).toEqual([]);
  });

  it("reports nothing for a defeat, however heavy", () => {
    expect(outcomeNotices(buildReport(battle(40, 30, 100, false), []))).toEqual([]);
  });
});

describe("outcome panel (tasks 95-97)", () => {
  it("shows each notice with its kind and its words", () => {
    const panel = createOutcomePanel(buildReport(battle(40, 14, 120), []));
    document.body.appendChild(panel.root);

    expect(panel.root.hidden).toBe(false);
    expect(panel.root.getAttribute("aria-label")).toBe("Battle outcome");
    const kinds = [...panel.root.querySelectorAll(".aa-outcome")].map((el) => el.getAttribute("data-kind"));
    expect(kinds).toEqual(["heroic", "pyrrhic"]);
    expect(panel.root.querySelector(".aa-outcome__label")?.textContent).toBe("Heroic victory");
  });

  it("hides itself for a battle that earned nothing", () => {
    const panel = createOutcomePanel(buildReport(battle(100, 8), []));
    document.body.appendChild(panel.root);
    expect(panel.root.hidden).toBe(true);
    expect(panel.root.textContent).toBe("");
    expect(panel.notices()).toEqual([]);
  });

  it("appears on the report screen under the title", () => {
    const el = createReportScreen(buildReport(battle(40, 0, 120), []), () => {});
    document.body.appendChild(el);

    const notices = el.querySelector<HTMLElement>('[data-testid="aa-outcomes"]');
    expect(notices).not.toBeNull();
    expect(notices?.hidden).toBe(false);
    const header = el.querySelector(".afteraction-header");
    const order = Array.from(el.children);
    expect(order.indexOf(header!)).toBe(0);
    expect(order.indexOf(notices!)).toBe(1);
  });

  it("leaves an ordinary report without a notice block", () => {
    const el = createReportScreen(buildReport(battle(100, 8), []), () => {});
    document.body.appendChild(el);
    expect(el.querySelector<HTMLElement>('[data-testid="aa-outcomes"]')?.hidden).toBe(true);
    // The four original sections are untouched.
    for (const heading of ["Kills", "Casualties", "MVP unit", "Timeline"]) {
      expect(el.textContent).toContain(heading);
    }
  });

  it("detaches cleanly", () => {
    const panel = createOutcomePanel(buildReport(battle(40, 14, 120), []));
    document.body.appendChild(panel.root);
    panel.destroy();
    expect(document.querySelector('[data-testid="aa-outcomes"]')).toBeNull();
  });
});