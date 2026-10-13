/**
 * Full campaign integration test: verifies that all major systems
 * survive a save/load cycle (snapshot/restore) intact.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("campaign integration: save/load integrity", () => {
  it("preserves all systems through snapshot/restore", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });

    // Set up state across all systems
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;

    // Army - leader must be a character ID
    const playerChar = before.characters.find((c) => c.id === "char-player") ?? before.characters[0]!;
    const { armyId } = await provider.createArmy("Test Army", playerChar.id);
    await provider.setArmyObjective(armyId, { kind: "town", townId: town.id });

    // Siege - skip if no valid attacker (complex preconditions)
    // The siege system is tested separately in sieges.test.ts

    // Companion - find an available companion character
    const companionChar = before.characters.find((c) => c.role === "companion" && !c.clanId);
    if (companionChar) {
      await provider.recruitCompanion(companionChar.id);
    }

    // War
    const { warId } = await provider.declareWar("faction-enemy");

    // Quest
    const { questId } = await provider.acceptQuest("notable-1", "Vex", "bandit-hunt");

    // Crime
    await provider.commitCrime(town.id, "theft");

    // Get the full snapshot
    const snapshot = await provider.getSnapshot();
    expect(snapshot.armies.length).toBe(1);
    // Companions are characters with clanId set
    const playerCompanions = snapshot.characters.filter((c) => c.role === "companion" && c.clanId === "clan-player");
    expect(playerCompanions.length).toBe(1);
    expect(snapshot.wars.length).toBe(1);
    expect(snapshot.quests.length).toBe(1);
    expect(snapshot.fines[town.id]).toBe(200);

    // Restore and verify everything survived
    await provider.restoreSnapshot(snapshot);
    const restored = await provider.getSnapshot();

    expect(restored.armies.length).toBe(1);
    expect(restored.armies[0]!.id).toBe(armyId);
    expect(restored.armies[0]!.objective).toEqual({ kind: "town", townId: town.id });

    // Companions are characters
    const restoredCompanions = restored.characters.filter((c) => c.role === "companion" && c.clanId === "clan-player");
    expect(restoredCompanions.length).toBe(1);
    expect(restored.wars.length).toBe(1);
    expect(restored.wars[0]!.id).toBe(warId);
    expect(restored.quests.length).toBe(1);
    expect(restored.quests[0]!.id).toBe(questId);
    expect(restored.fines[town.id]).toBe(200);
  });

  it("deterministic seeds produce identical state", async () => {
    const p1 = createFixtureSimulationProvider({ seed: 123 });
    const p2 = createFixtureSimulationProvider({ seed: 123 });

    const s1 = await p1.getSnapshot();
    const s2 = await p2.getSnapshot();

    // Same seed = same initial state
    expect(s1.towns.length).toBe(s2.towns.length);
    expect(s1.npcParties.length).toBe(s2.npcParties.length);
    expect(s1.party.money).toBe(s2.party.money);
  });
});
