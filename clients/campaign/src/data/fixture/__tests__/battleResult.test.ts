import { describe, it, expect } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("battle result writeback", () => {
  it("applies casualties, loot, and XP to the party", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const troopsBefore = before.party.troops.reduce((a, t) => a + t.count, 0);
    const moneyBefore = before.party.money;

    expect(troopsBefore).toBeGreaterThan(0);

    const result = await provider.applyBattleResult({
      won: true,
      playerLosses: 5,
      loot: 100,
      enemyStrength: 500,
    });

    // Troops reduced by casualties
    expect(result.troopsRemaining).toBe(troopsBefore - 5);
    // Money increased by loot
    expect(result.money).toBe(moneyBefore + 100);
    // XP awarded to stacks
    expect(result.xpAwards.length).toBeGreaterThan(0);

    // Snapshot reflects the changes
    const after = await provider.getSnapshot();
    const troopsAfter = after.party.troops.reduce((a, t) => a + t.count, 0);
    expect(troopsAfter).toBe(troopsBefore - 5);
    expect(after.party.money).toBe(moneyBefore + 100);
  });

  it("handles zero losses and zero loot", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const troopsBefore = before.party.troops.reduce((a, t) => a + t.count, 0);

    const result = await provider.applyBattleResult({
      won: false,
      playerLosses: 0,
      loot: 0,
      enemyStrength: 100,
    });

    expect(result.troopsRemaining).toBe(troopsBefore);
  });

  it("captures prisoners from battle", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });

    const result = await provider.applyBattleResult({
      won: true,
      playerLosses: 2,
      loot: 50,
      enemyStrength: 300,
      prisonersCaptured: [
        { troopId: "t-bandit", name: "Bandit", count: 3, tier: 1 },
        { troopId: "t-raider", name: "Raider", count: 2, tier: 2 },
      ],
    });

    expect(result.prisoners).toHaveLength(2);
    expect(result.prisoners[0]?.count).toBe(3);
    expect(result.prisoners[1]?.count).toBe(2);

    // Prisoners persist in snapshot
    const after = await provider.getSnapshot();
    expect(after.party.prisoners).toHaveLength(2);
  });

  it("does not reduce troops below zero", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const troopsBefore = before.party.troops.reduce((a, t) => a + t.count, 0);

    const result = await provider.applyBattleResult({
      won: false,
      playerLosses: troopsBefore + 1000, // more than available
      loot: 0,
      enemyStrength: 100,
    });

    expect(result.troopsRemaining).toBe(0);
    expect(result.troopsRemaining).toBeGreaterThanOrEqual(0);
  });
});
