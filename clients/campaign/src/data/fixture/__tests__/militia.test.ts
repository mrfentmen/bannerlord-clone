/**
 * Militia recruitment tests: hiring militia increases garrison, costs money.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("militia recruitment", () => {
  it("recruits militia and increases garrison", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    const garrisonBefore = town.garrison;
    const moneyBefore = before.party.money;

    await provider.recruitMilitia(town.id, 10);

    const after = await provider.getSnapshot();
    const townAfter = after.towns.find((t) => t.id === town.id)!;
    expect(townAfter.garrison).toBe(garrisonBefore + 10);
    expect(after.party.money).toBe(moneyBefore - 500); // 10 * 50
  });

  it("rejects recruitment when funds are insufficient", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    // Try to recruit more than we can afford
    const unaffordable = Math.ceil(before.party.money / 50) + 100;
    await expect(provider.recruitMilitia(town.id, unaffordable)).rejects.toThrow();
  });

  it("rejects invalid town or count", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await expect(provider.recruitMilitia("nonexistent", 10)).rejects.toThrow();
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    await expect(provider.recruitMilitia(town.id, 0)).rejects.toThrow();
    await expect(provider.recruitMilitia(town.id, -5)).rejects.toThrow();
  });
});
