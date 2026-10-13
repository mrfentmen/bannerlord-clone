/**
 * @vitest-environment jsdom
 *
 * Wounded units list (Buffy task 84).
 *
 * The surgeon's arithmetic is battleflow's own (medicine.test.ts); this covers
 * the list, the roll-up, and the line the report prints.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createWoundedPanel, woundedSummary, type WoundedUnit } from "../index.js";
import { treatWounded } from "../../battleflow/medicine.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

const UNITS: WoundedUnit[] = [
  { unitId: "u1", name: "Rell's archers", kind: "archers", wounded: 6 },
  { unitId: "u2", name: "Aldis's foot", kind: "infantry", wounded: 14 },
  { unitId: "u3", name: "Sane's horse", kind: "cavalry", wounded: 0 },
];

describe("wounded summary (task 84)", () => {
  it("lists the hurt units, worst first, and totals them", () => {
    const s = woundedSummary(UNITS);
    expect(s.units.map((u) => u.unitId)).toEqual(["u2", "u1"]);
    expect(s.totalWounded).toBe(20);
    expect(s.line).toBe("20 wounded across 2 units.");
  });

  it("drops units with nobody hurt", () => {
    expect(woundedSummary(UNITS).units.map((u) => u.unitId)).not.toContain("u3");
    expect(woundedSummary([]).units).toEqual([]);
    expect(woundedSummary([]).totalWounded).toBe(0);
  });

  it("breaks ties by kind then name, so the order is stable", () => {
    const tie: WoundedUnit[] = [
      { unitId: "b", name: "Bravo", kind: "archers", wounded: 4 },
      { unitId: "a", name: "Alpha", kind: "archers", wounded: 4 },
      { unitId: "c", name: "Alpha", kind: "infantry", wounded: 4 },
    ];
    // Both archers tie, so they sort by name (Alpha before Bravo) and the
    // infantry unit, being the later kind alphabetically, comes last.
    expect(woundedSummary(tie).units.map((u) => u.unitId)).toEqual(["a", "b", "c"]);
  });

  it("does not sort the caller's array in place", () => {
    const input: WoundedUnit[] = [
      { unitId: "a", name: "A", kind: "k", wounded: 1 },
      { unitId: "b", name: "B", kind: "k", wounded: 9 },
    ];
    woundedSummary(input);
    expect(input.map((u) => u.unitId)).toEqual(["a", "b"]);
  });

  it("prints the surgeon's own verdict when there is one", () => {
    const surgeon = treatWounded(20, 6, 12345);
    const s = woundedSummary(UNITS, surgeon);
    expect(s.surgeon).toBe(surgeon);
    expect(s.line).toBe(surgeon.line);
    // The surgeon's count is its own: it treated what it was told, not our total.
    expect(s.totalWounded).toBe(20);
    expect(surgeon.wounded).toBe(20);
    expect(surgeon.saved + surgeon.died).toBe(20);
  });
});

describe("wounded panel (task 84)", () => {
  it("names every hurt unit with its count", () => {
    const panel = createWoundedPanel(UNITS, treatWounded(20, 6, 12345));
    document.body.appendChild(panel.root);

    expect(panel.root.hidden).toBe(false);
    expect(panel.root.getAttribute("aria-label")).toBe("Wounded");
    expect(panel.root.textContent).toContain("Wounded (20)");
    const rows = panel.root.querySelectorAll(".aa-wounded__row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toBe("Aldis's footinfantry14");
    expect(panel.root.querySelector(".aa-wounded__line")?.textContent).toBe(
      panel.summary().line,
    );
  });

  it("hides itself when nobody was hurt", () => {
    const panel = createWoundedPanel([{ unitId: "u", name: "U", kind: "k", wounded: 0 }]);
    document.body.appendChild(panel.root);

    expect(panel.root.hidden).toBe(true);
    expect(panel.root.textContent).toBe("");
    expect(panel.summary().units).toEqual([]);
  });

  it("detaches cleanly", () => {
    const panel = createWoundedPanel(UNITS);
    document.body.appendChild(panel.root);
    panel.destroy();
    expect(document.querySelector('[data-testid="aa-wounded"]')).toBeNull();
  });
});