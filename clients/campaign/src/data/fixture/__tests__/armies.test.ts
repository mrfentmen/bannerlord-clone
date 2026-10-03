/**
 * Army tests: creation, membership, objectives, disbanding.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("armies", () => {
  it("creates an army led by a living character", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    expect(before.armies.length).toBe(0);

    const { armyId } = await provider.createArmy("Northern Host", "char-player");
    expect(armyId).toBeDefined();

    const after = await provider.getSnapshot();
    expect(after.armies.length).toBe(1);
    const army = after.armies[0]!;
    expect(army.name).toBe("Northern Host");
    expect(army.leaderId).toBe("char-player");
    expect(army.partyIds.length).toBe(0);
    expect(army.totalTroops).toBe(0);
  });

  it("rejects army creation with dead leader", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await provider.killCharacter("char-player", "test");
    await expect(provider.createArmy("Dead Host", "char-player")).rejects.toThrow();
  });

  it("rejects army creation with empty name", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await expect(provider.createArmy("  ", "char-player")).rejects.toThrow();
  });

  it("player party can join and leave an army", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const playerPartyId = before.party.id;
    const playerTroops = before.party.troops.reduce((s, t) => s + t.count, 0);

    const { armyId } = await provider.createArmy("Test Army", "char-player");
    await provider.joinArmy(armyId, playerPartyId);

    const afterJoin = await provider.getSnapshot();
    const army = afterJoin.armies.find((a) => a.id === armyId)!;
    expect(army.partyIds).toContain(playerPartyId);
    expect(army.totalTroops).toBe(playerTroops);

    await provider.leaveArmy(armyId, playerPartyId);
    // Army disbands when empty
    const afterLeave = await provider.getSnapshot();
    expect(afterLeave.armies.find((a) => a.id === armyId)).toBeUndefined();
  });

  it("rejects joining the same army twice", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const { armyId } = await provider.createArmy("Test Army", "char-player");
    await provider.joinArmy(armyId, before.party.id);
    await expect(provider.joinArmy(armyId, before.party.id)).rejects.toThrow();
  });

  it("sets and clears army objectives", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const { armyId } = await provider.createArmy("Test Army", "char-player");
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;

    await provider.setArmyObjective(armyId, { kind: "town", townId: town.id });
    const afterSet = await provider.getSnapshot();
    const army = afterSet.armies.find((a) => a.id === armyId)!;
    expect(army.objective).toEqual({ kind: "town", townId: town.id });

    await provider.setArmyObjective(armyId, null);
    const afterClear = await provider.getSnapshot();
    expect(afterClear.armies.find((a) => a.id === armyId)!.objective).toBeNull();
  });

  it("disbands an army explicitly", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const { armyId } = await provider.createArmy("Test Army", "char-player");
    await provider.disbandArmy(armyId);
    const after = await provider.getSnapshot();
    expect(after.armies.length).toBe(0);
  });

  it("persists armies through snapshot restore", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const { armyId } = await provider.createArmy("Test Army", "char-player");
    await provider.joinArmy(armyId, before.party.id);

    const withArmy = await provider.getSnapshot();
    expect(withArmy.armies.length).toBe(1);

    await provider.restoreSnapshot(before);
    const restored = await provider.getSnapshot();
    expect(restored.armies.length).toBe(0);
  });
});
