/**
 * @vitest-environment jsdom
 *
 * Level-up notifications (Buffy task 83).
 *
 * The XP maths is already covered in unitXp.test.ts; this covers the thing that
 * was missing — that the player is told, in a live region, and told only when
 * there is something to say.
 */

import { describe, expect, it } from "vitest";
import { awardUnitXp, createLevelUpPanel, levelUpNotes, type XpUnit } from "../index.js";

const UNITS: XpUnit[] = [
  { id: "u1", name: "Kova", kills: 3, survived: true, xpBefore: 250 },
  { id: "u2", name: "Aldis", kills: 1, survived: true, xpBefore: 30 },
  { id: "u3", name: "Rell", kills: 9, survived: true, xpBefore: 190 },
  { id: "u4", name: "Sane", kills: 4, survived: false, xpBefore: 300 },
];

/** Nothing levels here: a defeat with small awards and low totals. */
const QUIET_UNITS: XpUnit[] = [
  { id: "u1", name: "Kova", kills: 0, survived: true, xpBefore: 10 },
  { id: "u2", name: "Aldis", kills: 1, survived: true, xpBefore: 5 },
  { id: "u3", name: "Sane", kills: 4, survived: false, xpBefore: 300 },
];

describe("level-up notes (task 83)", () => {
  it("notifies only the units that levelled", () => {
    const gains = awardUnitXp(UNITS, true);
    const notes = levelUpNotes(gains);
    // Kova: 250 + (20 + 3*8 + 15) = 309, so level 3 to 4. Rell: 190 + (20 + 9*8 + 15)
    // = 297, so level 2 to 3. Aldis reaches 73 and stays level 1; the fallen earn
    // nothing, which is why Sane is absent however much XP he was carrying.
    expect(notes.map((n) => n.name)).toEqual(["Rell", "Kova"]);
    const kova = notes.find((n) => n.unitId === "u1")!;
    expect(kova.levelBefore).toBe(3);
    expect(kova.levelAfter).toBe(4);
    expect(kova.xpGained).toBe(59);
    expect(kova.line).toBe("Kova — level 3 to 4 (+59 XP)");
    expect(notes.find((n) => n.unitId === "u3")!.line).toBe("Rell — level 2 to 3 (+107 XP)");
  });

  it("puts the biggest climb first", () => {
    const gains = [
      { unitId: "a", name: "A", xpBefore: 0, xpGained: 110, xpAfter: 110, levelBefore: 1, levelAfter: 2, leveledUp: true },
      { unitId: "b", name: "B", xpBefore: 0, xpGained: 500, xpAfter: 500, levelBefore: 1, levelAfter: 6, leveledUp: true },
    ];
    const notes = levelUpNotes(gains);
    expect(notes.map((n) => n.name)).toEqual(["B", "A"]);
    expect(notes[0]?.levelsGained).toBe(5);
  });

  it("breaks an exact tie by name, so the order never wobbles", () => {
    const gain = (name: string) => ({
      unitId: name,
      name,
      xpBefore: 0,
      xpGained: 100,
      xpAfter: 100,
      levelBefore: 1,
      levelAfter: 2,
      leveledUp: true,
    });
    expect(levelUpNotes([gain("Zola"), gain("Anik")]).map((n) => n.name)).toEqual(["Anik", "Zola"]);
  });

  it("returns nothing when nobody levelled", () => {
    expect(levelUpNotes(awardUnitXp(QUIET_UNITS, false))).toEqual([]);
  });
});

describe("level-up panel (task 83)", () => {
  it("announces itself politely and names every unit that levelled", () => {
    const panel = createLevelUpPanel(awardUnitXp(UNITS, true));
    document.body.appendChild(panel.root);

    expect(panel.root.getAttribute("role")).toBe("status");
    expect(panel.root.getAttribute("aria-live")).toBe("polite");
    expect(panel.root.hidden).toBe(false);
    expect(panel.root.querySelectorAll(".aa-levelups__row")).toHaveLength(2);
    expect(panel.root.textContent).toContain("Kova");
    expect(panel.root.textContent).toContain("Level 3 → 4");
    expect(panel.root.textContent).toContain("+59 XP");
    expect(panel.root.textContent).toContain("Level ups (2)");
  });

  it("hides itself when there is nothing to announce", () => {
    const panel = createLevelUpPanel(awardUnitXp(QUIET_UNITS, false));
    document.body.appendChild(panel.root);

    expect(panel.root.hidden).toBe(true);
    expect(panel.notes()).toEqual([]);
    expect(panel.root.textContent).toBe("");
  });

  it("exposes the notes it rendered", () => {
    const panel = createLevelUpPanel(awardUnitXp(UNITS, true));
    expect(panel.notes().map((n) => n.unitId)).toEqual(["u3", "u1"]);
  });
});