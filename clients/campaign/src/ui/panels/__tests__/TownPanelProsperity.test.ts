/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { TownState } from "../../../data/types.js";

/** A town with only the fields the panel actually reads overridden per test. */
function makeTown(prosperity: number): TownState {
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
    prosperity,
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
    notables: [],
  } as TownState;
}

function options(overrides: Partial<Parameters<typeof townPanel>[0]> = {}) {
  return {
    town: makeTown(0.6),
    onWhy: vi.fn(),
    onOpenMarket: vi.fn(),
    onMarchHere: vi.fn(),
    onRoster: vi.fn(),
    ...overrides,
  };
}

describe("town panel prosperity gauge (task 103)", () => {
  it("draws prosperity as a meter, not a bare number", () => {
    const root = townPanel(options());
    const gauge = root.querySelector('[data-testid="town-prosperity"]')!;
    expect(gauge).not.toBeNull();
    // A gauge is a role="meter" with a fill; a `row` has neither.
    const track = gauge.querySelector('[role="meter"]');
    expect(track).not.toBeNull();
    expect(track!.getAttribute("aria-valuenow")).toBe("0.6");
    expect(gauge.querySelector(".gauge__number")!.textContent).toBe("0.60");
  });

  it("fills the bar in proportion to prosperity on the 0-1 scale", () => {
    const low = townPanel(options({ town: makeTown(0.25) }));
    const high = townPanel(options({ town: makeTown(0.9) }));
    const widthOf = (root: HTMLElement): string =>
      root.querySelector('[data-testid="town-prosperity"] .gauge__fill')!.getAttribute("style")!;
    expect(widthOf(low)).toContain("width:25%");
    expect(widthOf(high)).toContain("width:90%");
  });

  it("carries the trend arrow from the previous tick", () => {
    const root = townPanel(
      options({ previous: { ...makeTown(0.6), prosperity: 0.75 } }),
    );
    const arrow = root.querySelector('[data-testid="town-prosperity"] .gauge__trend')!;
    expect(arrow.getAttribute("data-trend")).toBe("down");
  });

  it("says trade is thin below the threshold and names the tax consequence", () => {
    const thin = townPanel(options({ town: makeTown(0.2) }));
    expect(thin.querySelector('[data-testid="town-prosperity"]')!.textContent).toContain(
      "Tax income scales with prosperity",
    );
    expect(
      thin.querySelector('[data-testid="town-prosperity"]')!.getAttribute("data-status"),
    ).toBe("critical");

    const holding = townPanel(options({ town: makeTown(0.8) }));
    expect(holding.querySelector('[data-testid="town-prosperity"]')!.textContent).toContain(
      "Trade is holding",
    );
  });

  it("keeps the same testid the row used, so existing queries still resolve", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="town-prosperity"]')).not.toBeNull();
    expect(root.textContent).toContain("Prosperity");
  });
});