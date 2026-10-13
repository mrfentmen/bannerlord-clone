/**
 * Workshop tests: buying, selling, income generation.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("workshops", () => {
  it("buys a workshop and deducts cost", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    const moneyBefore = before.party.money;
    expect(moneyBefore).toBeGreaterThanOrEqual(2000);

    const { workshopId } = await provider.buyWorkshop(town.id, "smithy");
    expect(workshopId).toBeDefined();

    const after = await provider.getSnapshot();
    expect(after.party.money).toBe(moneyBefore - 2000);
    expect(after.workshops.length).toBe(1);
    expect(after.workshops[0]!.townId).toBe(town.id);
    expect(after.workshops[0]!.type).toBe("smithy");
  });

  it("rejects buying a second workshop in the same town", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    
    await provider.buyWorkshop(town.id, "smithy");
    await expect(provider.buyWorkshop(town.id, "brewery")).rejects.toThrow();
  });

  it("rejects invalid workshop type", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    await expect(provider.buyWorkshop(town.id, "invalid")).rejects.toThrow();
  });

  it("sells a workshop and returns partial value", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    const moneyBefore = before.party.money;

    const { workshopId } = await provider.buyWorkshop(town.id, "brewery");
    const afterBuy = await provider.getSnapshot();
    expect(afterBuy.party.money).toBe(moneyBefore - 2000);

    await provider.sellWorkshop(workshopId);
    const afterSell = await provider.getSnapshot();
    expect(afterSell.workshops.length).toBe(0);
    expect(afterSell.party.money).toBe(moneyBefore - 2000 + 1000); // 50% back
  });

  it("persists workshops through snapshot restore", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    
    await provider.buyWorkshop(town.id, "weavery");
    const withWorkshop = await provider.getSnapshot();
    expect(withWorkshop.workshops.length).toBe(1);

    await provider.restoreSnapshot(before);
    const restored = await provider.getSnapshot();
    expect(restored.workshops.length).toBe(0);
  });
});
