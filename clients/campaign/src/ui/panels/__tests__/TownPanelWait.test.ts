/**
 * Town panel "wait here" (task 132). The section only exists when the caller
 * can serve a wait order, prints the sim's own refusal verbatim, and says the
 * days were served on success. What the days changed is the rest of the
 * panel's job, after the caller repaints.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import { SimulationUnavailableError } from "../../../data/provider.js";
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

async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe("town panel wait here (task 132)", () => {
  it("is absent when the caller cannot serve a wait order", () => {
    const root = townPanel(options());
    expect(root.querySelector('[data-testid="wait-section"]')).toBeNull();
  });

  it("sends the chosen day count and says the days passed", async () => {
    const onWaitDays = vi.fn().mockResolvedValue({ ok: true, day: 10 });
    const root = townPanel(options({ onWaitDays }));
    const input = root.querySelector<HTMLInputElement>('[data-testid="wait-days"] input, #wait-days');
    expect(input).not.toBeNull();
    input!.value = "3";
    (root.querySelector('[data-testid="town-wait"]') as HTMLButtonElement).click();
    await flush();
    expect(onWaitDays).toHaveBeenCalledWith(3);
    expect(root.querySelector('[data-testid="town-wait-message"]')!.textContent).toContain("3 days pass");
  });

  it("a refused wait prints the transport's own message verbatim", async () => {
    const refusal = new SimulationUnavailableError(
      "The town will not sit still while the column is at the gates.",
      "POST /v1/step-days -> 409 conflict",
    );
    const onWaitDays = vi.fn().mockRejectedValue(refusal);
    const root = townPanel(options({ onWaitDays }));
    (root.querySelector('[data-testid="town-wait"]') as HTMLButtonElement).click();
    await flush();
    expect(root.querySelector('[data-testid="town-wait-message"]')!.textContent).toContain(
      "The town will not sit still while the column is at the gates.",
    );
    // The button re-arms: a second ask can be made without a repaint.
    expect((root.querySelector('[data-testid="town-wait"]') as HTMLButtonElement).disabled).toBe(false);
  });
});
