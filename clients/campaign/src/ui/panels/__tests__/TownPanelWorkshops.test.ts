/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { TownState, Workshop } from "../../../data/types.js";

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
    money: 1000,
    gold: 0,
    metal: 0,
    updatedTick: 1,
    recruitable: [],
    notables: [],
  } as TownState;
}

function workshop(overrides: Partial<Workshop> = {}): Workshop {
  return {
    id: "w1",
    townId: "t1",
    type: "smithy",
    name: "Brooklyn Smithy",
    dailyIncome: 25,
    ageDays: 10,
    ...overrides,
  };
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

describe("town panel workshops", () => {
  it("shows owned workshops in the town with daily income", () => {
    const root = townPanel(options({ workshops: [workshop()] }));
    expect(root.querySelector('[data-testid="workshop-w1"]')).not.toBeNull();
    expect(root.textContent).toContain("Brooklyn Smithy");
    expect(root.textContent).toContain("$25/day");
  });

  it("shows only workshops in this town", () => {
    const root = townPanel(
      options({ workshops: [workshop({ id: "w1", townId: "t1" }), workshop({ id: "w2", townId: "t2", name: "Queens Brewery" })] }),
    );
    expect(root.querySelector('[data-testid="workshop-w1"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="workshop-w2"]')).toBeNull();
  });

  it("says so plainly when the player owns no workshops here", () => {
    const root = townPanel(options({ workshops: [] }));
    expect(root.textContent).toContain("No workshops here.");
  });

  it("shows a sell button when the caller provides a sell handler", () => {
    const root = townPanel(options({ workshops: [workshop()], onSellWorkshop: vi.fn() }));
    expect(root.querySelector('[data-testid="sell-workshop-w1"]')).not.toBeNull();
  });

  it("hides the section when no workshop data or handlers are provided", () => {
    const root = townPanel(options());
    expect(root.textContent).not.toContain("Workshops");
  });

  it("calls the buy handler when the buy button is clicked", async () => {
    const onBuy = vi.fn().mockResolvedValue({ workshopId: "w-new" });
    const root = townPanel(options({ onBuyWorkshop: onBuy }));
    (root.querySelector('[data-testid="buy-workshop"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(onBuy).toHaveBeenCalledWith("smithy");
  });

  it("sends the selected workshop type to the buy handler", async () => {
    const onBuy = vi.fn().mockResolvedValue({ workshopId: "w-new" });
    const root = townPanel(options({ onBuyWorkshop: onBuy }));
    const select = root.querySelector('[data-testid="buy-workshop-type"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    select.value = "brewery";
    (root.querySelector('[data-testid="buy-workshop"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(onBuy).toHaveBeenCalledWith("brewery");
  });
});

describe("town panel militia", () => {
  it("shows the hire militia controls when the caller provides a handler", () => {
    const root = townPanel(options({ onRecruitMilitia: vi.fn() }));
    expect(root.querySelector('[data-testid="hire-militia"]')).not.toBeNull();
    expect(root.querySelector('#militia-qty')).not.toBeNull();
  });

  it("hides the hire controls when no handler is provided", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="hire-militia"]')).toBeNull();
  });

  it("calls the recruit handler with the chosen count", async () => {
    const onRecruit = vi.fn().mockResolvedValue(undefined);
    const root = townPanel(options({ onRecruitMilitia: onRecruit }));
    const input = root.querySelector('#militia-qty') as HTMLInputElement;
    input.value = "25";
    (root.querySelector('[data-testid="hire-militia"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(onRecruit).toHaveBeenCalledWith(25);
  });
});
