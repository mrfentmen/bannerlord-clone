import { describe, it, expect } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("save/load snapshot restore", () => {
  it("restores party, money, and day from a snapshot", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });

    // Modify state: battle, then capture snapshot
    await provider.applyBattleResult({
      won: true,
      playerLosses: 3,
      loot: 250,
      enemyStrength: 400,
    });
    const saved = await provider.getSnapshot();
    const troopsAtSave = saved.party.troops.reduce((a, t) => a + t.count, 0);
    const moneyAtSave = saved.party.money;
    const dayAtSave = saved.day;

    // Modify further (simulating continued play)
    await provider.applyBattleResult({
      won: false,
      playerLosses: 2,
      loot: 50,
      enemyStrength: 100,
    });
    const afterMore = await provider.getSnapshot();
    expect(afterMore.party.money).not.toBe(moneyAtSave);

    // Restore the saved snapshot
    await provider.restoreSnapshot(saved);
    const restored = await provider.getSnapshot();

    const troopsRestored = restored.party.troops.reduce((a, t) => a + t.count, 0);
    expect(troopsRestored).toBe(troopsAtSave);
    expect(restored.party.money).toBe(moneyAtSave);
    expect(restored.day).toBe(dayAtSave);
  });

  it("restores player character data", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const saved = await provider.getSnapshot();

    await provider.restoreSnapshot(saved);
    const restored = await provider.getSnapshot();

    expect(restored.player.characterName).toBe(saved.player.characterName);
    expect(restored.party.id).toBe(saved.party.id);
  });
});
