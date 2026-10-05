/**
 * Town panel "leave town" (task 133). The button closes the town view and
 * hands the party back to the map; the client owns nothing about the party's
 * real position, so the handler is the whole contract.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { TownState } from "../../../data/types.js";

function town(): TownState {
  return {
    id: "t1",
    settlementId: "s1",
    name: "Brooklyn",
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
    crimeRating: 0.15,
    money: 1000,
    gold: 0,
    metal: 0,
    updatedTick: 1,
    recruitable: [],
    notables: [],
  } as TownState;
}

function options(overrides: Record<string, unknown> = {}) {
  return {
    town: town(),
    onWhy: vi.fn(),
    onOpenMarket: vi.fn(),
    onMarchHere: vi.fn(),
    onRoster: vi.fn(),
    ...overrides,
  } as Parameters<typeof townPanel>[0];
}

describe("town panel leave town (task 133)", () => {
  it("is absent when the caller cannot serve a leave", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="leave-town"]')).toBeNull();
  });

  it("renders the button in the actions row and hands the exit to the caller", () => {
    const onLeaveTown = vi.fn();
    const root = townPanel(options({ onLeaveTown }));
    const btn = root.querySelector<HTMLButtonElement>('[data-testid="leave-town"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe("Leave town");
    btn!.click();
    expect(onLeaveTown).toHaveBeenCalledTimes(1);
  });
});
