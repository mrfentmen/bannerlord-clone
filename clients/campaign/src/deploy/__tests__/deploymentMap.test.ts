/**
 * DeploymentMap DOM tests (tasks 31-38): roster cards with health/morale,
 * enemy army list, formation presets, terrain notes, the Begin battle ready
 * check, and named save/load. Canvas 2D is a no-op under jsdom; pure logic
 * lives in terrain.test.ts.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { openDeployment } from "../DeploymentMap.js";
import { samplePatch } from "../terrain.js";
import type { Placement, RosterUnit } from "../types.js";

const ROSTER: RosterUnit[] = [
  { id: "a", label: "Alpha", kind: "infantry", count: 100, radius_m: 30, health: 90, morale: 70 },
  { id: "b", label: "Beta", kind: "cavalry", count: 40, radius_m: 35 }, // no condition reported
];

const ENEMY = [
  { kind: "infantry" as const, label: "Militia levy", count: 200 },
  { kind: "archers" as const, count: 50 },
];

beforeEach(() => {
  window.localStorage.clear();
});

function open(extra: Record<string, unknown> = {}) {
  const handle = openDeployment({ patch: samplePatch(), roster: ROSTER, ...extra });
  document.body.append(handle.root);
  return handle;
}

function formationButton(root: HTMLElement, name: string): HTMLButtonElement {
  const btns = [...root.querySelectorAll(".deploy__formrow .btn")];
  const btn = btns.find((b) => b.textContent === name) as HTMLButtonElement;
  expect(btn, `${name} formation button`).toBeTruthy();
  return btn;
}

describe("openDeployment (tasks 31-38)", () => {
  it("renders a roster card per unit and a preview banner for preview patches", () => {
    const onChange = vi.fn();
    const handle = open({ onChange });
    try {
      const cards = handle.root.querySelectorAll(".deploy__card");
      expect(cards).toHaveLength(2);
      expect(handle.root.querySelector(".deploy__preview")?.textContent).toMatch(/PREVIEW TERRAIN/);
      expect(handle.root.querySelector(".deploy__canvas")).not.toBeNull();
      expect(handle.getPlacements()).toEqual([]);
      expect(onChange).toHaveBeenCalledWith([]);
    } finally {
      handle.close();
    }
    expect(handle.root.isConnected).toBe(false);
  });

  it("task 33: cards show health and morale meters, or an honest dash when unreported", () => {
    const handle = open();
    try {
      const cards = handle.root.querySelectorAll(".deploy__card");
      const alphaMeters = cards[0]!.querySelectorAll(".deploy__meter");
      expect(alphaMeters).toHaveLength(2);
      expect(alphaMeters[0]!.querySelector(".deploy__meterfill")).not.toBeNull();
      const betaMeters = cards[1]!.querySelectorAll(".deploy__meter");
      expect(betaMeters[1]!.querySelector(".deploy__meterna")?.textContent).toBe("—");
    } finally {
      handle.close();
    }
  });

  it("task 34: lists the enemy army with types and counts", () => {
    const handle = open({ enemyRoster: ENEMY });
    try {
      const rows = handle.root.querySelectorAll(".deploy__enemyrow");
      expect(rows).toHaveLength(2);
      expect(rows[0]!.textContent).toContain("Militia levy");
      expect(rows[0]!.textContent).toContain("200");
      expect(rows[1]!.textContent).toContain("archers");
      expect(handle.root.textContent).toContain("250 fighters");
    } finally {
      handle.close();
    }
  });

  it("task 34: admits it when there is no scouting report", () => {
    const handle = open();
    try {
      expect(handle.root.textContent).toContain("order of battle is unknown");
    } finally {
      handle.close();
    }
  });

  it("task 36: terrain notes summarize biome and features", () => {
    const handle = open();
    try {
      const notes = [...handle.root.querySelectorAll(".deploy__note")].map((n) => n.textContent);
      expect(notes.some((t) => t?.includes("Biome"))).toBe(true);
      // The sample patch has a western river band and mapped tree stands.
      expect(notes.some((t) => t?.includes("River") || t?.includes("Water"))).toBe(true);
      expect(notes.some((t) => t?.includes("Forest"))).toBe(true);
    } finally {
      handle.close();
    }
  });

  it("task 35: formation presets place every unit in the chosen shape", () => {
    for (const preset of ["Line", "Column", "Wedge"]) {
      const handle = open();
      try {
        formationButton(handle.root, preset).click();
        const placements = handle.getPlacements();
        // All units that pass validation land in the zone; the deterministic
        // sample patch accepts every slot for this roster.
        expect(placements).toHaveLength(2);
        if (preset === "Line") {
          expect(placements[0]!.y).toBe(placements[1]!.y);
          expect(placements[0]!.x).not.toBe(placements[1]!.x);
        } else if (preset === "Column") {
          expect(placements[0]!.x).toBe(placements[1]!.x);
          expect(placements[0]!.y).not.toBe(placements[1]!.y);
        } else {
          // Wedge: point unit north of its partner.
          const [first, second] = placements as [Placement, Placement];
          expect(first.y).toBeGreaterThan(second.y);
          expect(Math.abs(first.x)).toBeLessThan(Math.abs(second.x) + 1);
        }
      } finally {
        handle.close();
      }
    }
  });

  it("task 37: Begin battle is gated until every unit is placed, with reasons listed", () => {
    const onConfirm = vi.fn();
    const handle = open({ onConfirm });
    try {
      const begin = handle.root.querySelector(".deploy__footer .btn--primary") as HTMLButtonElement;
      expect(begin.textContent).toBe("Begin battle");
      expect(begin.disabled).toBe(true);
      const reasons = [...handle.root.querySelectorAll(".deploy__reasons li")].map((li) => li.textContent);
      expect(reasons).toContain("Alpha is not placed");
      expect(reasons).toContain("Beta is not placed");

      formationButton(handle.root, "Line").click();
      expect(begin.disabled).toBe(false);
      expect(handle.root.querySelectorAll(".deploy__reasons li")).toHaveLength(0);

      begin.click();
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onConfirm.mock.calls[0]![0]).toHaveLength(2);
      expect(handle.root.isConnected).toBe(false);
    } finally {
      handle.close();
    }
  });

  it("task 38: saves, lists, loads, and deletes named deployments", () => {
    const handle = open();
    try {
      formationButton(handle.root, "Wedge").click();
      const nameInput = handle.root.querySelector(".deploy__savename") as HTMLInputElement;
      nameInput.value = "hill defense";
      const saveBtn = [...handle.root.querySelectorAll(".deploy__formrow .btn")].find(
        (b) => b.textContent === "Save",
      ) as HTMLButtonElement;
      saveBtn.click();

      const stored = JSON.parse(window.localStorage.getItem("campaign.deployments.v1") ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].name).toBe("hill defense");
      expect(stored[0].placements).toHaveLength(2);
      expect(handle.root.querySelector(".deploy__savedrow")).not.toBeNull();

      // Loading restores the wedge spots onto a fresh view.
      const handle2 = open();
      try {
        const loadBtn = handle2.root.querySelector(".deploy__savedrow .btn") as HTMLButtonElement;
        expect(loadBtn.textContent).toBe("hill defense");
        loadBtn.click();
        expect(handle2.getPlacements()).toHaveLength(2);

        const delBtn = [...handle2.root.querySelectorAll(".deploy__savedrow .btn")].find(
          (b) => b.textContent === "Delete",
        ) as HTMLButtonElement;
        delBtn.click();
        expect(JSON.parse(window.localStorage.getItem("campaign.deployments.v1") ?? "[]")).toHaveLength(0);
      } finally {
        handle2.close();
      }
    } finally {
      handle.close();
    }
  });
});
