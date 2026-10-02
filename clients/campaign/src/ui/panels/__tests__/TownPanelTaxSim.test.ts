/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { townPanel } from "../TownPanel.js";
import type { TownState } from "../../../data/types.js";

const town = {
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
  sanitation: 60,
  infected: 0,
  crowding: 20,
  unrest: 10,
  loyalty: 70,
  security: 50,
  culture: "american",
  holderCulture: "american",
  rebellious: false,
  prosperity: 50,
  taxRate: 0.2,
  stateTaxRate: 0.05,
  state: "NY",
  buildings: [],
  constructionBuilding: null,
  constructionDaysLeft: 0,
  garrison: 50,
  garrisonConduct: 60,
  roadSafety: 70,
  informationTrust: 60,
  money: 1000,
  gold: 0,
  metal: 0,
  updatedTick: 1,
} as unknown as TownState;

function options() {
  return {
    town,
    onWhy: vi.fn(),
    onOpenMarket: vi.fn(),
    onMarchHere: vi.fn(),
    onRoster: vi.fn(),
  };
}

describe("town panel tax simulator (integration)", () => {
  it("shows the simulator's what-if estimates", () => {
    const root = townPanel(options());
    document.body.innerHTML = "";
    document.body.appendChild(root);
    const current = root.querySelector('[data-testid="tax-sim-current"]');
    expect(current).not.toBeNull();
    expect(current!.textContent).toContain("20%");
    expect(current!.textContent).toContain("/season");
    const up = root.querySelector('[data-testid="tax-sim-up"]');
    expect(up).not.toBeNull();
    expect(up!.textContent).toContain("25%");
  });
});

describe("town panel trade agreement (integration)", () => {
  it("proposes a deal and shows the town's answer", () => {
    const root = townPanel(options());
    document.body.innerHTML = "";
    document.body.appendChild(root);

    (root.querySelector("#deal-offer") as HTMLInputElement).value = "500";
    (root.querySelector("#deal-discount") as HTMLInputElement).value = "10";
    (root.querySelector("#deal-tariff") as HTMLInputElement).value = "10";
    (root.querySelector('[data-testid="deal-propose"]') as HTMLButtonElement).click();

    const result = root.querySelector('[data-testid="deal-result"]')!;
    expect(result.textContent).toMatch(/accepts|counter|refuses/i);
    expect(result.textContent).toContain("Brooklyn");
  });
});
