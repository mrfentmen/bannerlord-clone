/**
 * MarketPanel trade-rumor hints. MASTER_PLAN.md section 4D (task 147).
 *
 * @vitest-environment jsdom
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../../data/fixture/index.js";
import { marketPanel, type TradeRumor } from "../panels/MarketPanel.js";
import type { MarketState, PartyState, SimSnapshot, SimulationProvider } from "../../data/types.js";

let provider: SimulationProvider;
let snapshot: SimSnapshot;

function rumor(over: Partial<TradeRumor> = {}): TradeRumor {
  return {
    id: "tr1",
    goodName: "Wool",
    buyTownName: "Aldersgate",
    buyPrice: 12.4,
    sellTownName: "Millhaven",
    sellPrice: 18.9,
    profitPerUnit: 6.5,
    ...over,
  };
}

function openMarket(tradeRumors?: TradeRumor[]): HTMLElement {
  // The fixture keys markets by town id, not settlementId.
  const town = snapshot.towns.find((t) => snapshot.markets[t.id] !== undefined) ?? snapshot.towns[0]!;
  const market: MarketState = snapshot.markets[town.id]!;
  const party: PartyState = snapshot.party;
  return marketPanel({
    townId: town.id,
    townName: town.name,
    market,
    party,
    money: 1200,
    day: snapshot.day,
    provider,
    ...(tradeRumors !== undefined ? { tradeRumors } : {}),
  }).root;
}

beforeAll(async () => {
  provider = createFixtureSimulationProvider();
  snapshot = await provider.getSnapshot();
});

describe("MarketPanel trade rumors (task 147)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does not render the rumor section when the sim sent none", () => {
    const root = openMarket();
    expect(root.querySelector('[data-testid="market-trade-rumors"]')).toBeNull();
    expect(root.textContent).not.toContain("Trade rumors");
  });

  it("renders each rumor with its profitable route and prices", () => {
    const root = openMarket([rumor()]);
    const section = root.querySelector('[data-testid="market-trade-rumors"]');
    expect(section).not.toBeNull();
    const card = root.querySelector('[data-testid="market-trade-rumor-tr1"]');
    expect(card?.textContent).toContain("Wool");
    expect(card?.textContent).toContain("Aldersgate");
    expect(card?.textContent).toContain("Millhaven");
    expect(card?.textContent).toContain("12.40");
    expect(card?.textContent).toContain("18.90");
  });

  it("shows the expected profit per unit from the sim", () => {
    const root = openMarket([rumor({ profitPerUnit: 6.5 })]);
    expect(root.querySelector('[data-testid="market-trade-rumor-tr1-profit"]')?.textContent).toContain("6.50");
  });

  it("renders every rumor the sim sent", () => {
    const root = openMarket([rumor({ id: "tr1" }), rumor({ id: "tr2", goodName: "Iron" })]);
    expect(root.querySelector('[data-testid="market-trade-rumor-tr1"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="market-trade-rumor-tr2"]')).not.toBeNull();
  });

  it("shows an honest empty state when the sim sent an empty rumor list", () => {
    const root = openMarket([]);
    expect(root.textContent).toContain("Trade rumors");
    expect(root.textContent).toContain("No profitable routes");
    expect(root.querySelector('[data-testid="market-trade-rumors"]')).toBeNull();
  });
});
