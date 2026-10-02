/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createCharacterPanel } from "../CharacterPanel.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

function build(overrides: Partial<Parameters<typeof createCharacterPanel>[0]> = {}) {
  // One panel at a time: querySelector finds the first match in the document, so a
  // second build in the same test would read the first panel's gauges.
  document.body.innerHTML = "";
  const handle = createCharacterPanel({
    name: "Ada Okonjo",
    skills: { combat: 12, leadership: 44 },
    ...overrides,
  });
  document.body.appendChild(handle.root);
  return handle;
}

function gaugeFor(id: string): HTMLElement {
  return document.body.querySelector<HTMLElement>(`[data-testid="skill-${id}"]`)!;
}

describe("character panel skills (task 237)", () => {
  it("names the character in the panel title", () => {
    build();
    expect(document.body.querySelector(".panel__title")!.textContent).toBe("Ada Okonjo");
  });

  it("prints an age only when the campaign knows one", () => {
    build({ age: 34 });
    expect(document.body.querySelector('[data-testid="character-name"]')!.textContent).toBe(
      "Ada Okonjo, aged 34",
    );

    build();
    expect(document.body.querySelector('[data-testid="character-name"]')!.textContent).toBe("Ada Okonjo");
  });

  it("prints every skill the simulation sent, with its value", () => {
    build({ skills: { combat: 12, leadership: 44, trade: 7 } });
    expect(gaugeFor("combat").textContent).toContain("12 / 100");
    expect(gaugeFor("leadership").textContent).toContain("44 / 100");
    expect(gaugeFor("trade").textContent).toContain("7 / 100");
  });

  it("gives each skill a readable name rather than its id", () => {
    build({ skills: { streetwise: 30, engineering: 5 } });
    expect(gaugeFor("streetwise").querySelector(".gauge__label")!.textContent).toBe("Streetwise");
    expect(gaugeFor("engineering").querySelector(".gauge__label")!.textContent).toBe("Engineering");
  });

  it("lists skills in the canonical order, not in whatever order they arrived", () => {
    build({ skills: { trade: 1, combat: 1, medicine: 1 } });
    const labels = [...document.body.querySelectorAll(".gauge__label")].map((l) => l.textContent);
    // The order the character maker uses, so a skill does not move about as it is
    // added to the record.
    expect(labels).toEqual(["Combat", "Trade", "Medicine"]);
  });

  it("puts skills it has no canonical place for after the ones it does", () => {
    build({ skills: { "safe-house": 4, combat: 4 } });
    const labels = [...document.body.querySelectorAll(".gauge__label")].map((l) => l.textContent);
    expect(labels).toEqual(["Combat", "Safe house"]);
  });

  it("prints a skill nobody has heard of, with the id made readable", () => {
    // A skill the client has no label for is still a skill the simulation reported;
    // dropping it would be a different claim from printing it.
    build({ skills: { "safe-house": 8 } });
    expect(gaugeFor("safe-house").querySelector(".gauge__label")!.textContent).toBe("Safe house");
    expect(gaugeFor("safe-house").textContent).toContain("8 / 100");
  });

  it("shows influence and renown only when the caller supplies them", () => {
    build({ influence: 88, renown: 12 });
    expect(document.body.querySelector('[data-testid="character-influence"]')!.textContent).toBe("Influence 88");
    expect(document.body.querySelector('[data-testid="character-renown"]')!.textContent).toBe("Renown 12");

    build();
    expect(document.body.querySelector('[data-testid="character-influence"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="character-renown"]')).toBeNull();
  });

  it("prints the biography the maker assembled, when there is one", () => {
    build({ biography: "Grew up running freight." });
    expect(document.body.querySelector('[data-testid="character-biography"]')!.textContent).toBe(
      "Grew up running freight.",
    );
    build();
    expect(document.body.querySelector('[data-testid="character-biography"]')).toBeNull();
  });

  it("says so when the simulation has recorded no skills", () => {
    build({ skills: {} });
    expect(document.body.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(document.body.textContent).toContain("No skills recorded");
  });
});

describe("character panel skill bars (task 238)", () => {
  it("fills in proportion to the value on the 0-100 scale", () => {
    build({ skills: { combat: 25 } });
    expect(gaugeFor("combat").querySelector(".gauge__fill")!.getAttribute("style")).toContain("width:25%");
    build({ skills: { combat: 80 } });
    expect(gaugeFor("combat").querySelector(".gauge__fill")!.getAttribute("style")).toContain("width:80%");
  });

  it("clamps a value past the scale rather than overflowing the bar", () => {
    build({ skills: { combat: 140 } });
    const fill = gaugeFor("combat").querySelector(".gauge__fill")!.getAttribute("style")!;
    expect(fill).toContain("width:100%");
    // The printed number stays honest even though the bar is clamped.
    expect(gaugeFor("combat").textContent).toContain("140 / 100");
  });

  it("treats a zero skill as an empty bar, not a missing one", () => {
    build({ skills: { combat: 0 } });
    expect(gaugeFor("combat")).not.toBeNull();
    expect(gaugeFor("combat").querySelector(".gauge__fill")!.getAttribute("style")).toContain("width:0%");
  });

  it("is a meter with a value, so the number is available without seeing the bar", () => {
    build({ skills: { trade: 63 } });
    const meter = gaugeFor("trade").querySelector('[role="meter"]')!;
    expect(meter.getAttribute("aria-valuenow")).toBe("0.63");
    expect(meter.getAttribute("aria-valuetext")).toBe("63 / 100");
  });

  it("removes itself on destroy", () => {
    const handle = build();
    expect(document.body.contains(handle.root)).toBe(true);
    handle.destroy();
    expect(document.body.contains(handle.root)).toBe(false);
  });
});