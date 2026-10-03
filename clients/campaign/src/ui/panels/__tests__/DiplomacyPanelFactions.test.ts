/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { diplomacyPanel } from "../DiplomacyPanel.js";
import { adjustRelation, relationWith } from "../../../diplomacy/relationNotifications.js";
import { relationBand } from "../../../diplomacy/notables.js";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
});

const GLU = { id: "great-lakes-union", name: "Great Lakes Union" };
const PC = { id: "pacific-compact", name: "Pacific Compact" };

function panel(factions?: { id: string; name: string }[]): void {
  document.body.appendChild(diplomacyPanel({ currentSeason: 12, ...(factions ? { factions } : {}) }));
}

function row(id: string): HTMLElement {
  return document.body.querySelector<HTMLElement>(`[data-testid="faction-${id}"]`)!;
}

function fill(id: string): string {
  return document.body.querySelector(`[data-testid="faction-fill-${id}"]`)!.getAttribute("style")!;
}

describe("diplomacy faction list (task 202)", () => {
  it("draws no faction list when the caller supplies no roster", () => {
    panel();
    // The diplomacy layer holds no roster of its own; inventing neighbours would be a
    // map made of guesses.
    expect(document.body.querySelector('[data-testid="diplomacy-factions"]')).toBeNull();
  });

  it("says so plainly when the roster it was handed is empty", () => {
    panel([]);
    const section = document.body.querySelector('[data-testid="diplomacy-factions"]')!;
    expect(section.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(section.textContent).toContain("No factions to report");
  });

  it("lists every faction the caller supplied, by name", () => {
    panel([GLU, PC]);
    expect(row(GLU.id).textContent).toContain("Great Lakes Union");
    expect(row(PC.id).textContent).toContain("Pacific Compact");
  });

  it("keeps the caller's order rather than re-sorting the list", () => {
    panel([PC, GLU]);
    const ids = [...document.body.querySelectorAll(".faction")].map((el) =>
      el.getAttribute("data-testid"),
    );
    expect(ids).toEqual(["faction-pacific-compact", "faction-great-lakes-union"]);
  });

  it("reads each standing from the relation store the change feed writes", () => {
    adjustRelation(GLU.id, GLU.name, -40, "raided their farms", 12);
    panel([GLU, PC]);
    // The same function the change feed below the list uses, so the two cannot drift.
    expect(row(GLU.id).textContent).toContain(String(relationWith(GLU.id)));
  });

  it("shows 0 for a faction it has never heard of", () => {
    panel([GLU]);
    expect(relationWith(GLU.id)).toBe(0);
    expect(row(GLU.id).getAttribute("data-band")).toBe("neutral");
  });

  it("marks the band with the shared relationBand definition", () => {
    adjustRelation(GLU.id, GLU.name, -60, "raided their farms", 12);
    adjustRelation(PC.id, PC.name, 85, "returned hostages", 12);
    panel([GLU, PC]);
    expect(row(GLU.id).getAttribute("data-band")).toBe(relationBand(-60));
    expect(row(PC.id).getAttribute("data-band")).toBe(relationBand(85));
  });

  it("gives every row a labelled list item and a named group", () => {
    panel([GLU]);
    expect(document.body.querySelector('[data-testid="diplomacy-factions"]')!.querySelector("ul")).not.toBeNull();
    expect(row(GLU.id).querySelector('[role="meter"]')!.getAttribute("aria-label")).toBe(
      "Standing with Great Lakes Union",
    );
  });

  it("does not disturb the power board, the wars or the relation feed", () => {
    panel([GLU]);
    expect(document.body.textContent).toContain("No declared wars");
    expect(document.body.textContent).toContain("No changes recorded");
    expect(document.body.querySelector('[data-testid="diplomacy-reputation"]')).not.toBeNull();
  });
});

describe("diplomacy relation value (task 203)", () => {
  it("prints the value with its sign, so +5 never reads as 5", () => {
    adjustRelation(PC.id, PC.name, 35, "returned hostages", 12);
    adjustRelation(GLU.id, GLU.name, -20, "closed the border", 12);
    panel([PC, GLU]);
    expect(row(PC.id).querySelector(".mono")!.textContent).toContain("+35");
    expect(row(GLU.id).querySelector(".mono")!.textContent).toContain("-20");
  });

  it("exposes the whole -100..100 scale as a meter", () => {
    adjustRelation(PC.id, PC.name, 35, "returned hostages", 12);
    panel([PC]);
    const meter = row(PC.id).querySelector('[role="meter"]')!;
    expect(meter.getAttribute("aria-valuemin")).toBe("-100");
    expect(meter.getAttribute("aria-valuemax")).toBe("100");
    expect(meter.getAttribute("aria-valuenow")).toBe("35");
    expect(meter.getAttribute("aria-valuetext")).toContain("+35");
  });

  it("spells the number out in the accessible text as well as the bar", () => {
    adjustRelation(GLU.id, GLU.name, -60, "raided their farms", 12);
    panel([GLU]);
    expect(row(GLU.id).querySelector('[role="meter"]')!.getAttribute("aria-valuetext")).toBe(
      "-60, Hostile",
    );
  });

  it("grows the fill from the centre toward a positive relation", () => {
    adjustRelation(PC.id, PC.name, 40, "returned hostages", 12);
    panel([PC]);
    const style = fill(PC.id);
    expect(style).toContain("left:50%");
    expect(style).toContain("width:20%");
  });

  it("grows the fill back from the centre toward a negative one", () => {
    adjustRelation(GLU.id, GLU.name, -40, "closed the border", 12);
    panel([GLU]);
    const style = fill(GLU.id);
    // -40 of a 200-wide scale is 20%, ending at the centre line.
    expect(style).toContain("left:30%");
    expect(style).toContain("width:20%");
  });

  it("draws no fill at all at exactly zero", () => {
    panel([GLU]);
    expect(fill(GLU.id)).toContain("width:0%");
  });

  it("marks the direction, so colour is never the only signal", () => {
    adjustRelation(GLU.id, GLU.name, -40, "closed the border", 12);
    adjustRelation(PC.id, PC.name, 40, "returned hostages", 12);
    panel([GLU, PC]);
    expect(row(GLU.id).getAttribute("data-direction")).toBe("down");
    expect(row(PC.id).getAttribute("data-direction")).toBe("up");
  });

  it("says what the scale is, so the number means something", () => {
    panel([GLU]);
    const section = document.body.querySelector('[data-testid="diplomacy-factions"]')!;
    expect(section.textContent).toContain("-100 against you to +100 for you");
  });

  it("clamps a stored relation to the scale it claims", () => {
    // relationWith clamps on write, so the bar can never be asked to draw past the end.
    adjustRelation(PC.id, PC.name, 500, "a very large favour", 12);
    panel([PC]);
    expect(relationWith(PC.id)).toBe(100);
    expect(fill(PC.id)).toContain("width:50%");
  });
});