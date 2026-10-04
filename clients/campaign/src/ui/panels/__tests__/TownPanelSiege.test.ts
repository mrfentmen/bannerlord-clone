/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { TownState, Siege } from "../../../data/types.js";

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

function siege(overrides: Partial<Siege> = {}): Siege {
  return {
    id: "siege-1",
    townId: "t1",
    townName: "Brooklyn",
    attackerFactionId: "f-enemy",
    attackerPartyIds: ["party-player"],
    startDay: 10,
    preparation: 0.4,
    wallIntegrity: 0.8,
    breached: false,
    defenderFoodDays: 12,
    attackerCasualties: 3,
    defenderCasualties: 9,
    siegeEngines: 1,
    engines: { queue: [], reserve: ["ladder"], deployed: [], fireVariants: [] },
    ...overrides,
  } as Siege;
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

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("town panel siege (tasks 134/426)", () => {
  it("hides the siege section when the caller cannot serve sieges", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="siege-section"]')).toBeNull();
  });

  it("shows the besiege button and no siege card when the town is not besieged", async () => {
    const onGetSiege = vi.fn().mockResolvedValue(null);
    const root = townPanel(options({ town: town(), onGetSiege, onStartSiege: vi.fn(), onAssaultSiege: vi.fn(), onLiftSiege: vi.fn() }));
    expect(root.querySelector('[data-testid="siege-section"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="siege-begin"]')).not.toBeNull();
    await flush();
    expect(root.querySelector('[data-testid="siege-card"]')).toBeNull();
  });

  it("renders the live siege: preparation, walls, food, casualties, assault and lift", async () => {
    const onGetSiege = vi.fn().mockResolvedValue(siege());
    const root = townPanel(options({ onGetSiege, onStartSiege: vi.fn(), onAssaultSiege: vi.fn(), onLiftSiege: vi.fn() }));
    await flush();
    expect(root.querySelector('[data-testid="siege-card"]')).not.toBeNull();
    expect(root.textContent).toContain("Preparation 40%");
    expect(root.textContent).toContain("walls 80%");
    expect(root.textContent).toContain("defender food 12 days");
    expect(root.textContent).toContain("attackers 3, defenders 9");
    expect(root.querySelector('[data-testid="siege-assault"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="siege-lift"]')).not.toBeNull();
  });

  it("a breached wall reads BREACHED, not a percentage", async () => {
    const onGetSiege = vi.fn().mockResolvedValue(siege({ breached: true, wallIntegrity: 0 }));
    const root = townPanel(options({ onGetSiege, onStartSiege: vi.fn(), onAssaultSiege: vi.fn(), onLiftSiege: vi.fn() }));
    await flush();
    expect(root.textContent).toContain("walls BREACHED");
  });

  it("besiege posts the player's party and reports the sim's refusal verbatim, button re-armed", async () => {
    const onStartSiege = vi.fn().mockRejectedValue(new Error("Brooklyn is already under siege."));
    const root = townPanel(options({ onGetSiege: vi.fn().mockResolvedValue(null), onStartSiege, onAssaultSiege: vi.fn(), onLiftSiege: vi.fn() }));
    const btn = root.querySelector<HTMLButtonElement>('[data-testid="siege-begin"]');
    btn!.click();
    await flush();
    expect(onStartSiege).toHaveBeenCalledWith("t1");
    expect(root.querySelector('[data-testid="siege-message"]')?.textContent).toContain("Brooklyn is already under siege.");
    expect(btn!.disabled).toBe(false);
  });

  it("assault reports the sim's verdict and fires the changed callback", async () => {
    const onAssaultSiege = vi.fn().mockResolvedValue({ victory: true, casualties: 12 });
    const onSiegeChanged = vi.fn();
    const root = townPanel(options({ onGetSiege: vi.fn().mockResolvedValue(siege()), onStartSiege: vi.fn(), onAssaultSiege, onLiftSiege: vi.fn(), onSiegeChanged }));
    await flush();
    (root.querySelector('[data-testid="siege-assault"]') as HTMLButtonElement).click();
    await flush();
    expect(onAssaultSiege).toHaveBeenCalledWith("siege-1");
    expect(root.querySelector('[data-testid="siege-message"]')?.textContent).toContain("The walls are taken.");
    expect(onSiegeChanged).toHaveBeenCalled();
  });

  it("a thrown-back assault says so and re-arms the button", async () => {
    const onAssaultSiege = vi.fn().mockResolvedValue({ victory: false, casualties: 40 });
    const root = townPanel(options({ onGetSiege: vi.fn().mockResolvedValue(siege()), onStartSiege: vi.fn(), onAssaultSiege, onLiftSiege: vi.fn() }));
    await flush();
    const assault = root.querySelector<HTMLButtonElement>('[data-testid="siege-assault"]');
    assault!.click();
    await flush();
    expect(root.querySelector('[data-testid="siege-message"]')?.textContent).toContain("The assault was thrown back.");
    expect(assault!.disabled).toBe(false);
  });

  it("lift works through the sim and fires the changed callback", async () => {
    const onLiftSiege = vi.fn().mockResolvedValue(undefined);
    const onSiegeChanged = vi.fn();
    const root = townPanel(options({ onGetSiege: vi.fn().mockResolvedValue(siege()), onStartSiege: vi.fn(), onAssaultSiege: vi.fn(), onLiftSiege, onSiegeChanged }));
    await flush();
    (root.querySelector('[data-testid="siege-lift"]') as HTMLButtonElement).click();
    await flush();
    expect(onLiftSiege).toHaveBeenCalledWith("siege-1");
    expect(onSiegeChanged).toHaveBeenCalled();
  });
});
