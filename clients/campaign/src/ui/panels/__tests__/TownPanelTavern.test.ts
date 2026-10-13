/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { TavernCompanion, TownState } from "../../../data/types.js";

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

function companion(overrides: Partial<TavernCompanion> = {}): TavernCompanion {
  return {
    id: "comp-0",
    name: "Sable",
    backstory: "Field medic for a caravan crew that stopped coming home.",
    traits: ["loyal", "cautious"],
    skills: { medicine: 4, leadership: 2 },
    wageDaily: 12,
    recruitKind: "gold",
    recruitValue: 500,
    hired: false,
    available: true,
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

describe("town panel tavern", () => {
  it("hides the tavern when the caller cannot read or act on it", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="tavern-section"]')).toBeNull();
  });

  it("shows a step-inside door and loads the roster on demand, not on render", async () => {
    const onLoadTavern = vi.fn().mockResolvedValue([companion()]);
    const root = townPanel(options({ onLoadTavern, onHireCompanion: vi.fn() }));
    expect(onLoadTavern).not.toHaveBeenCalled();
    expect(root.querySelector('[data-testid="tavern-companion-comp-0"]')).toBeNull();
    (root.querySelector('[data-testid="tavern-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(onLoadTavern).toHaveBeenCalledTimes(1);
    expect(root.querySelector('[data-testid="tavern-companion-comp-0"]')).not.toBeNull();
    expect(root.textContent).toContain("Sable");
  });

  it("shows each companion's wage, terms, skills, and story", async () => {
    const onLoadTavern = vi.fn().mockResolvedValue([companion()]);
    const root = townPanel(options({ onLoadTavern, onHireCompanion: vi.fn() }));
    (root.querySelector('[data-testid="tavern-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(root.textContent).toContain("$12/day");
    expect(root.textContent).toContain("$500 up front");
    expect(root.textContent).toContain("Medicine 4");
    expect(root.textContent).toContain("loyal, cautious");
    expect(root.textContent).toContain("Field medic for a caravan crew that stopped coming home.");
  });

  it("sends the hire order when the hire button is clicked", async () => {
    const onHireCompanion = vi.fn().mockResolvedValue(undefined);
    const onLoadTavern = vi.fn().mockResolvedValue([companion()]);
    const root = townPanel(options({ onLoadTavern, onHireCompanion }));
    (root.querySelector('[data-testid="tavern-enter"]') as HTMLButtonElement).click();
    await flush();
    (root.querySelector('[data-testid="tavern-hire-comp-0"]') as HTMLButtonElement).click();
    await flush();
    expect(onHireCompanion).toHaveBeenCalledWith("comp-0");
  });

  it("reloads the roster after a hire lands and says what it cost", async () => {
    const onHireCompanion = vi.fn().mockResolvedValue(undefined);
    // First read: Sable is drinking there. After the hire, the roster is empty
    // because the simulation moved her into the player's clan.
    const onLoadTavern = vi.fn().mockResolvedValueOnce([companion()]).mockResolvedValueOnce([]);
    const root = townPanel(options({ onLoadTavern, onHireCompanion }));
    (root.querySelector('[data-testid="tavern-enter"]') as HTMLButtonElement).click();
    await flush();
    (root.querySelector('[data-testid="tavern-hire-comp-0"]') as HTMLButtonElement).click();
    await flush();
    expect(onLoadTavern).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[data-testid="tavern-message"]')?.textContent).toContain("Sable signed on");
    expect(root.querySelector('[data-testid="tavern-empty"]')).not.toBeNull();
  });

  it("shows the simulation's own refusal verbatim and re-enables the button", async () => {
    const onHireCompanion = vi.fn().mockRejectedValue(new Error("They want 500 gold up front. You're short."));
    const onLoadTavern = vi.fn().mockResolvedValue([companion()]);
    const root = townPanel(options({ onLoadTavern, onHireCompanion }));
    (root.querySelector('[data-testid="tavern-enter"]') as HTMLButtonElement).click();
    await flush();
    const hire = root.querySelector('[data-testid="tavern-hire-comp-0"]') as HTMLButtonElement;
    hire.click();
    await flush();
    expect(root.querySelector('[data-testid="tavern-message"]')?.textContent).toContain("You're short.");
    expect(hire.disabled).toBe(false);
  });

  it("shows the empty state when nobody is in the tavern", async () => {
    const onLoadTavern = vi.fn().mockResolvedValue([]);
    const root = townPanel(options({ onLoadTavern, onHireCompanion: vi.fn() }));
    (root.querySelector('[data-testid="tavern-enter"]') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('[data-testid="tavern-empty"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="tavern-hire-comp-0"]')).toBeNull();
  });

  it("disables the hire button for a companion the simulation would refuse", async () => {
    const onLoadTavern = vi.fn().mockResolvedValue([companion({ available: false })]);
    const root = townPanel(options({ onLoadTavern, onHireCompanion: vi.fn() }));
    (root.querySelector('[data-testid="tavern-enter"]') as HTMLButtonElement).click();
    await flush();
    expect((root.querySelector('[data-testid="tavern-hire-comp-0"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("surfaces a roster read failure and lets the player retry through the door", async () => {
    const onLoadTavern = vi.fn().mockRejectedValueOnce(new Error("The tavern roster could not be read.")).mockResolvedValueOnce([companion()]);
    const root = townPanel(options({ onLoadTavern, onHireCompanion: vi.fn() }));
    const enter = root.querySelector('[data-testid="tavern-enter"]') as HTMLButtonElement;
    enter.click();
    await flush();
    expect(root.querySelector('[data-testid="tavern-message"]')?.textContent).toContain("could not be read");
    expect(enter.disabled).toBe(false);
    enter.click();
    await flush();
    expect(onLoadTavern).toHaveBeenCalledTimes(2);
    expect(root.querySelector('[data-testid="tavern-companion-comp-0"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="tavern-enter"]')).toBeNull();
  });
});
