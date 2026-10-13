import { describe, it, expect } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("flee from encounter", () => {
  it("moves the player away from the NPC", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const npc = before.npcParties[0]!;
    const playerBefore = { ...before.party.position };

    // Flee to a position 60km away from the NPC
    const dx = playerBefore.x - npc.position.x;
    const dz = playerBefore.z - npc.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const newPos = {
      x: playerBefore.x + (dx / dist) * 60,
      z: playerBefore.z + (dz / dist) * 60,
    };

    await provider.fleeFromEncounter(npc.id, newPos);

    const after = await provider.getSnapshot();
    expect(after.party.position.x).toBeCloseTo(newPos.x, 1);
    expect(after.party.position.z).toBeCloseTo(newPos.z, 1);

    // Player is now beyond encounter range (50km) from the NPC
    const ndx = after.party.position.x - npc.position.x;
    const ndz = after.party.position.z - npc.position.z;
    const newDist = Math.sqrt(ndx * ndx + ndz * ndz);
    expect(newDist).toBeGreaterThan(50);
  });

  it("reduces morale on flee", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const moraleBefore = before.party.morale;
    const npc = before.npcParties[0]!;

    await provider.fleeFromEncounter(npc.id, { x: 1000, z: 1000 });

    const after = await provider.getSnapshot();
    expect(after.party.morale).toBeLessThan(moraleBefore);
  });

  it("preserves the NPC party (it still exists)", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const npc = before.npcParties[0]!;
    const countBefore = before.npcParties.length;

    await provider.fleeFromEncounter(npc.id, { x: 1000, z: 1000 });

    const after = await provider.getSnapshot();
    expect(after.npcParties.length).toBe(countBefore);
    expect(after.npcParties.find((p) => p.id === npc.id)).toBeDefined();
  });
});

describe("player defeat consequences", () => {
  it("takes loot from the player", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const moneyBefore = before.party.money;
    const npc = before.npcParties[0]!;

    await provider.applyPlayerDefeat({
      npcPartyId: npc.id,
      lootTaken: 100,
      prisonersTaken: 0,
    });

    const after = await provider.getSnapshot();
    expect(after.party.money).toBe(moneyBefore - 100);
  });

  it("takes prisoners from the player's troops", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const troopsBefore = before.party.troops.reduce((a, t) => a + t.count + t.wounded, 0);
    const npc = before.npcParties[0]!;

    await provider.applyPlayerDefeat({
      npcPartyId: npc.id,
      lootTaken: 0,
      prisonersTaken: 2,
    });

    const after = await provider.getSnapshot();
    const troopsAfter = after.party.troops.reduce((a, t) => a + t.count + t.wounded, 0);
    expect(troopsBefore - troopsAfter).toBe(2);
  });

  it("moves the player away after defeat", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const npc = before.npcParties[0]!;
    const playerBefore = { ...before.party.position };

    await provider.applyPlayerDefeat({
      npcPartyId: npc.id,
      lootTaken: 0,
      prisonersTaken: 0,
    });

    const after = await provider.getSnapshot();
    const dx = after.party.position.x - playerBefore.x;
    const dz = after.party.position.z - playerBefore.z;
    const moved = Math.sqrt(dx * dx + dz * dz);
    expect(moved).toBeGreaterThan(0);
  });

  it("keeps the victorious NPC party in the campaign", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const npc = before.npcParties[0]!;
    const countBefore = before.npcParties.length;

    await provider.applyPlayerDefeat({
      npcPartyId: npc.id,
      lootTaken: 50,
      prisonersTaken: 1,
    });

    const after = await provider.getSnapshot();
    expect(after.npcParties.length).toBe(countBefore);
    expect(after.npcParties.find((p) => p.id === npc.id)).toBeDefined();
  });
});
