/**
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

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("town panel tavern dice", () => {
  it("hides the dice when the caller cannot play", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="dice-section"]')).toBeNull();
  });

  it("puts the stakes on the table immediately, with no door to click first", () => {
    const root = townPanel(options({ onPlayDice: vi.fn() }));
    expect(root.querySelector('[data-testid="dice-section"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="dice-enter"]')).toBeNull();
    expect(root.querySelector('[data-testid="dice-stake-10"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="dice-stake-25"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="dice-stake-50"]')).not.toBeNull();
  });

  it("sends the chosen stake and prints the simulation's telling verbatim", async () => {
    const onPlayDice = vi.fn().mockResolvedValue({ won: true, payout: 50, line: "You throw boxcars twice; the regulars groan and pay up." });
    const root = townPanel(options({ onPlayDice }));
    (root.querySelector('[data-testid="dice-stake-25"]') as HTMLButtonElement).click();
    await flush();
    expect(onPlayDice).toHaveBeenCalledWith(25);
    expect(root.querySelector('[data-testid="dice-message"]')?.textContent).toBe("You throw boxcars twice; the regulars groan and pay up.");
  });

  it("shows a refusal verbatim and re-arms the stake button", async () => {
    const onPlayDice = vi.fn().mockRejectedValue(new Error("Your purse cannot cover that stake."));
    const root = townPanel(options({ onPlayDice }));
    const stake = root.querySelector('[data-testid="dice-stake-50"]') as HTMLButtonElement;
    stake.click();
    await flush();
    expect(root.querySelector('[data-testid="dice-message"]')?.textContent).toBe("Your purse cannot cover that stake.");
    expect(stake.disabled).toBe(false);
  });

  it("stands on its own: dice render even when no other section is wired", () => {
    const root = townPanel(options({ onPlayDice: vi.fn() }));
    expect(root.querySelector('[data-testid="dice-section"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="tavern-section"]')).toBeNull();
    expect(root.querySelector('[data-testid="smithy-section"]')).toBeNull();
  });
});
