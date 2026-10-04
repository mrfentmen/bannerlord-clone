/**
 * Tests for the modernized Bannerlord trader system (Rowan).
 */

import { describe, expect, it } from "vitest";
import {
  CARAVAN_FOUNDING_COST,
  CARAVAN_GUARD_COUNT,
  canAffordCaravan,
  foundCaravanSpec,
  getTradeRumors,
  randomCompanyName,
} from "../traders.js";
import { createNameRng } from "../names.js";

describe("trader system", () => {
  it("founding cost matches Bannerlord's 15,000", () => {
    expect(CARAVAN_FOUNDING_COST).toBe(15000);
  });

  it("gates founding behind player money", () => {
    expect(canAffordCaravan(14999)).toBe(false);
    expect(canAffordCaravan(15000)).toBe(true);
    expect(canAffordCaravan(50000)).toBe(true);
  });

  it("foundCaravanSpec builds a complete convoy", () => {
    const spec = foundCaravanSpec({
      townId: "town-denver",
      seed: 42,
      circuit: ["town-denver", "town-boulder", "town-golden"],
    });
    expect(spec.foundingCost).toBe(CARAVAN_FOUNDING_COST);
    expect(spec.guardCount).toBe(CARAVAN_GUARD_COUNT);
    expect(spec.companyName.length).toBeGreaterThan(0);
    expect(spec.driverName.split(" ").length).toBeGreaterThanOrEqual(2);
    expect(spec.displayName).toContain(spec.companyName);
    expect(spec.displayName).toContain(spec.driverName);
    expect(spec.circuit).toEqual(["town-denver", "town-boulder", "town-golden"]);
  });

  it("foundCaravanSpec is deterministic per seed", () => {
    const a = foundCaravanSpec({ townId: "t", seed: 7, circuit: [] });
    const b = foundCaravanSpec({ townId: "t", seed: 7, circuit: [] });
    expect(a).toEqual(b);
  });

  it("company names vary", () => {
    const names = new Set(
      Array.from({ length: 30 }, (_, i) => randomCompanyName(createNameRng(i))),
    );
    expect(names.size).toBeGreaterThan(5);
  });

  it("getTradeRumors finds the best spread per good", () => {
    const rumors = getTradeRumors([
      { townId: "a", townName: "Denver", goodId: "grain", goodName: "Grain", price: 10 },
      { townId: "b", townName: "Boulder", goodId: "grain", goodName: "Grain", price: 30 },
      { townId: "a", townName: "Denver", goodId: "fuel", goodName: "Fuel", price: 50 },
      { townId: "b", townName: "Boulder", goodId: "fuel", goodName: "Fuel", price: 55 },
    ]);
    expect(rumors).toHaveLength(2);
    // Grain has the bigger spread, so it comes first.
    expect(rumors[0]!.goodId).toBe("grain");
    expect(rumors[0]!.buyTownName).toBe("Denver");
    expect(rumors[0]!.sellTownName).toBe("Boulder");
    expect(rumors[0]!.profitPerUnit).toBe(20);
    expect(rumors[0]!.text).toContain("Denver");
    expect(rumors[0]!.text).toContain("Boulder");
  });

  it("getTradeRumors skips goods with no profitable spread", () => {
    const rumors = getTradeRumors([
      { townId: "a", townName: "Denver", goodId: "grain", goodName: "Grain", price: 20 },
      { townId: "b", townName: "Boulder", goodId: "grain", goodName: "Grain", price: 20 },
    ]);
    expect(rumors).toHaveLength(0);
  });

  it("getTradeRumors respects maxRumors", () => {
    const prices = ["grain", "fuel", "tools", "arms", "lumber"].flatMap((g, i) => [
      { townId: "a", townName: "Denver", goodId: g as "grain", goodName: g, price: 10 + i },
      { townId: "b", townName: "Boulder", goodId: g as "grain", goodName: g, price: 40 + i },
    ]);
    expect(getTradeRumors(prices, 2)).toHaveLength(2);
  });
});
