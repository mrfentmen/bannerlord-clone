/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { Notable, TownState } from "../../../data/types.js";

function notable(overrides: Partial<Notable> = {}): Notable {
  return {
    id: "n1",
    settlementId: "s1",
    name: "Vic the Fence",
    type: "gang-leader",
    power: 72,
    relation: 34,
    blurb: "Moves what the docks will not move. Everything else follows his price.",
    ...overrides,
  };
}

function townWith(notables: Notable[]): TownState {
  return {
    id: "t1",
    settlementId: "s1",
    name: "Red Hook",
    klass: "town",
    holderId: "h1",
    holderName: "Del",
    population: 1000,
    workers: 400,
    foodStock: 100,
    foodProduction: 50,
    foodDemand: 40,
    medicineStock: 10,
    sanitation: 0.6,
    infected: 0.01,
    crowding: 0.2,
    unrest: 0.1,
    loyalty: 0.7,
    security: 0.5,
    culture: "american",
    holderCulture: "american",
    rebellious: false,
    prosperity: 0.6,
    taxRate: 0.2,
    stateTaxRate: 0.05,
    state: "NY",
    buildings: [],
    constructionBuilding: null,
    constructionDaysLeft: 0,
    garrison: 50,
    garrisonConduct: 0.6,
    roadSafety: 0.7,
    informationTrust: 0.6,
    money: 1000,
    gold: 0,
    metal: 0,
    updatedTick: 1,
    recruitable: [],
    notables,
  } as TownState;
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    town: townWith([notable()]),
    onWhy: vi.fn(),
    onOpenMarket: vi.fn(),
    onMarchHere: vi.fn(),
    onRoster: vi.fn(),
    ...overrides,
  } as Parameters<typeof townPanel>[0];
}

describe("town panel notable residents (task 129)", () => {
  it("lists every notable the simulation sent, by name", () => {
    const root = townPanel(
      options({
        town: townWith([
          notable(),
          notable({ id: "n2", name: "Odessa Kane", type: "community-leader" }),
        ]),
      }),
    );
    const section = root.querySelector('[data-testid="town-notables"]')!;
    expect(section.textContent).toContain("Vic the Fence");
    expect(section.textContent).toContain("Odessa Kane");
    expect(section.querySelector('[data-testid="town-notable-n1"]')).not.toBeNull();
    expect(section.querySelector('[data-testid="town-notable-n2"]')).not.toBeNull();
  });

  it("prints the power and the relation the simulation sent, not a guess", () => {
    const root = townPanel(options());
    expect(
      root.querySelector('[data-testid="town-notable-power-n1"]')!.textContent,
    ).toContain("72");
    expect(
      root.querySelector('[data-testid="town-notable-relation-n1"]')!.textContent,
    ).toContain("+34");
  });

  it("reads the relation band from the shared relationBand helper", () => {
    // hostile <= -50, cold < 0, neutral < 30, warm < 70, allied >= 70.
    const cases: [number, string][] = [
      [-60, "Hostile"],
      [-10, "Cold"],
      [10, "Neutral"],
      [34, "Warm"],
      [80, "Allied"],
    ];
    for (const [relation, word] of cases) {
      const root = townPanel(options({ town: townWith([notable({ relation })]) }));
      const row = root.querySelector('[data-testid="town-notable-n1"]')!;
      expect(row.getAttribute("data-band")).toBe(word.toLowerCase());
      expect(row.textContent).toContain(word);
    }
  });

  it("names each notable's role in the product's words, not the type id", () => {
    const types: [Notable["type"], string][] = [
      ["merchant", "Merchant"],
      ["gang-leader", "Organised crime"],
      ["veteran", "Veteran"],
      ["community-leader", "Community organiser"],
    ];
    for (const [type, label] of types) {
      const root = townPanel(options({ town: townWith([notable({ type })]) }));
      const row = root.querySelector(".notable__type")!;
      expect(row.textContent).toBe(label);
      expect(row.textContent).not.toContain("-");
    }
  });

  it("shows the notable's own description from the simulation", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="town-notable-n1"]')!.textContent).toContain(
      "Moves what the docks will not move",
    );
  });

  it("shows an honest empty state when the town has no notable residents", () => {
    const root = townPanel(options({ town: townWith([]) }));
    const section = root.querySelector('[data-testid="town-notables"]')!;
    expect(section.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(section.textContent).toContain("No notable residents");
    expect(section.querySelectorAll(".notable")).toHaveLength(0);
  });

  it("keeps the notables section on a town with no recruits and no builds", () => {
    const root = townPanel(options({ town: townWith([notable()]) }));
    // The panel draws no recruit section without an onRecruit handler; the roster
    // must not depend on that.
    expect(root.querySelector('[data-testid="recruit-section"]')).toBeNull();
    expect(root.querySelector('[data-testid="town-notables"]')).not.toBeNull();
  });
});
describe("town panel notables against a payload that predates the field (task 129)", () => {
  it("shows the empty state rather than throwing when the roster key is absent", () => {
    // `notables` is non-optional on TownState, but a town record from a simulation
    // that predates the field arrives without it, and the panel used to throw.
    const town: Partial<TownState> = townWith([notable()]);
    delete town.notables;
    const root = townPanel(options({ town: town as TownState }));
    const section = root.querySelector('[data-testid="town-notables"]')!;
    expect(section.querySelector('[data-testid="empty-state"]')).not.toBeNull();
    expect(section.textContent).toContain("No notable residents");
  });
});
