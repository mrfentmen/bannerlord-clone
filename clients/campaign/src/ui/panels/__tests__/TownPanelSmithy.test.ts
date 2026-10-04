/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel, type SmithyView } from "../TownPanel.js";
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

function smithyView(overrides: Partial<SmithyView> = {}): SmithyView {
  return {
    recipes: [{ id: "knife", name: "Combat knife", metal: 2, fuel: 1, result: "weapon-knife" }],
    orders: [
      {
        id: "order-1",
        patron: "Vera Castellanos",
        patronTitle: "Borough magistrate",
        recipeId: "knife",
        recipeName: "Combat knife",
        daysLeft: 4,
        reward: 320,
      },
    ],
    stamina: { stamina: 84, max: 100 },
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

/** Drain the microtask queue so the section's promise handlers have run. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("town panel smithy", () => {
  it("hides the smithy when the caller cannot read or act on it", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="smithy-section"]')).toBeNull();
  });

  it("shows a door and loads the bench on demand, not on render", async () => {
    const onLoadSmithy = vi.fn().mockResolvedValue(smithyView());
    const root = townPanel(options({ onLoadSmithy, onForgeItem: vi.fn(), onSmeltArms: vi.fn(), onFulfillOrder: vi.fn() }));
    expect(onLoadSmithy).not.toHaveBeenCalled();
    expect(root.querySelector('[data-testid="smithy-recipe-knife"]')).toBeNull();
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(onLoadSmithy).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[data-testid="smithy-recipe-knife"]')).not.toBeNull();
    expect(root.textContent).toContain("Combat knife");
  });

  it("shows the smith's stamina and each recipe's cost", async () => {
    const onLoadSmithy = vi.fn().mockResolvedValue(smithyView());
    const root = townPanel(options({ onLoadSmithy, onForgeItem: vi.fn(), onSmeltArms: vi.fn(), onFulfillOrder: vi.fn() }));
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('[data-testid="smithy-stamina"]')?.textContent).toContain("84/100");
    expect(root.textContent).toContain("2 metal \u00b7 1 fuel");
  });

  it("shows open orders with patron, deadline, and pay", async () => {
    const onLoadSmithy = vi.fn().mockResolvedValue(smithyView());
    const root = townPanel(options({ onLoadSmithy, onForgeItem: vi.fn(), onSmeltArms: vi.fn(), onFulfillOrder: vi.fn() }));
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('[data-testid="smithy-order-order-1"]')).not.toBeNull();
    expect(root.textContent).toContain("Vera Castellanos");
    expect(root.textContent).toContain("Borough magistrate");
    expect(root.textContent).toContain("4 days left");
    expect(root.textContent).toContain("$320");
  });

  it("shows the orders empty state when no orders are open", async () => {
    const onLoadSmithy = vi.fn().mockResolvedValue(smithyView({ orders: [] }));
    const root = townPanel(options({ onLoadSmithy, onForgeItem: vi.fn(), onSmeltArms: vi.fn(), onFulfillOrder: vi.fn() }));
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('[data-testid="smithy-orders-empty"]')).not.toBeNull();
  });

  it("sends the forge order with the recipe id and reloads the bench", async () => {
    const onForgeItem = vi.fn().mockResolvedValue({ name: "Fine Combat knife" });
    const onLoadSmithy = vi.fn().mockResolvedValue(smithyView());
    const root = townPanel(options({ onLoadSmithy, onForgeItem, onSmeltArms: vi.fn(), onFulfillOrder: vi.fn() }));
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    (root.querySelector('[data-testid="smithy-forge-knife"]') as HTMLButtonElement).click();
    await flush();
    expect(onForgeItem).toHaveBeenCalledWith("knife");
    expect(root.querySelector('[data-testid="smithy-message"]')?.textContent).toContain("Forged: Fine Combat knife.");
    expect(onLoadSmithy).toHaveBeenCalledTimes(2);
  });

  it("shows the simulation's forge refusal verbatim and re-enables the button", async () => {
    const onForgeItem = vi.fn().mockRejectedValue(new Error("Not enough metal: 2 required, you have 0."));
    const onLoadSmithy = vi.fn().mockResolvedValue(smithyView());
    const root = townPanel(options({ onLoadSmithy, onForgeItem, onSmeltArms: vi.fn(), onFulfillOrder: vi.fn() }));
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    const forge = root.querySelector('[data-testid="smithy-forge-knife"]') as HTMLButtonElement;
    forge.click();
    await flush();
    expect(root.querySelector('[data-testid="smithy-message"]')?.textContent).toBe("Not enough metal: 2 required, you have 0.");
    expect(forge.disabled).toBe(false);
  });

  it("sends the smelt order with quantity 1", async () => {
    const onSmeltArms = vi.fn().mockResolvedValue({ metal: 2 });
    const onLoadSmithy = vi.fn().mockResolvedValue(smithyView());
    const root = townPanel(options({ onLoadSmithy, onForgeItem: vi.fn(), onSmeltArms, onFulfillOrder: vi.fn() }));
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    (root.querySelector('[data-testid="smithy-smelt"]') as HTMLButtonElement).click();
    await flush();
    expect(onSmeltArms).toHaveBeenCalledWith(1);
    expect(root.querySelector('[data-testid="smithy-message"]')?.textContent).toContain("Smelted 1 arms into 2 metal.");
  });

  it("shows the smelt refusal verbatim and re-enables the button", async () => {
    const onSmeltArms = vi.fn().mockRejectedValue(new Error("No arms to smelt."));
    const onLoadSmithy = vi.fn().mockResolvedValue(smithyView());
    const root = townPanel(options({ onLoadSmithy, onForgeItem: vi.fn(), onSmeltArms, onFulfillOrder: vi.fn() }));
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    const smelt = root.querySelector('[data-testid="smithy-smelt"]') as HTMLButtonElement;
    smelt.click();
    await flush();
    expect(root.querySelector('[data-testid="smithy-message"]')?.textContent).toBe("No arms to smelt.");
    expect(smelt.disabled).toBe(false);
  });

  it("sends the fulfill order and shows the simulation's delivery line", async () => {
    const onFulfillOrder = vi.fn().mockResolvedValue({ reward: 320, line: "Vera pockets the blade and counts out the coin." });
    const onLoadSmithy = vi.fn().mockResolvedValue(smithyView());
    const root = townPanel(options({ onLoadSmithy, onForgeItem: vi.fn(), onSmeltArms: vi.fn(), onFulfillOrder }));
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    (root.querySelector('[data-testid="smithy-fulfill-order-1"]') as HTMLButtonElement).click();
    await flush();
    expect(onFulfillOrder).toHaveBeenCalledWith("order-1");
    expect(root.querySelector('[data-testid="smithy-message"]')?.textContent).toContain("Vera pockets the blade and counts out the coin.");
    expect(onLoadSmithy).toHaveBeenCalledTimes(2);
  });

  it("shows the fulfill refusal verbatim and re-enables the button", async () => {
    const onFulfillOrder = vi.fn().mockRejectedValue(new Error("Nothing forged to deliver yet."));
    const onLoadSmithy = vi.fn().mockResolvedValue(smithyView());
    const root = townPanel(options({ onLoadSmithy, onForgeItem: vi.fn(), onSmeltArms: vi.fn(), onFulfillOrder }));
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    const fulfill = root.querySelector('[data-testid="smithy-fulfill-order-1"]') as HTMLButtonElement;
    fulfill.click();
    await flush();
    expect(root.querySelector('[data-testid="smithy-message"]')?.textContent).toBe("Nothing forged to deliver yet.");
    expect(fulfill.disabled).toBe(false);
  });

  it("keeps the door for a retry when the bench cannot be read", async () => {
    const onLoadSmithy = vi.fn().mockRejectedValue(new Error("Smithing is not available on the live simulation yet."));
    const root = townPanel(options({ onLoadSmithy, onForgeItem: vi.fn(), onSmeltArms: vi.fn(), onFulfillOrder: vi.fn() }));
    (root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('[data-testid="smithy-message"]')?.textContent).toBe("Smithing is not available on the live simulation yet.");
    const enter = root.querySelector('[data-testid="smithy-enter"]') as HTMLButtonElement | null;
    expect(enter).not.toBeNull();
    expect(enter!.disabled).toBe(false);
  });
});
