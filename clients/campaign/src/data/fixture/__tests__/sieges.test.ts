/**
 * Siege tests: starting, assaulting, lifting, starvation, capture.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("sieges", () => {
  it("starts a siege on a town", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    const playerPartyId = before.party.id;

    expect(before.sieges.length).toBe(0);

    const { siegeId } = await provider.startSiege(town.id, [playerPartyId]);
    expect(siegeId).toBeDefined();

    const after = await provider.getSnapshot();
    expect(after.sieges.length).toBe(1);
    const siege = after.sieges[0]!;
    expect(siege.townId).toBe(town.id);
    expect(siege.attackerPartyIds).toContain(playerPartyId);
    expect(siege.preparation).toBe(0);
    expect(siege.wallIntegrity).toBe(1);
    expect(siege.breached).toBe(false);

    const townAfter = after.towns.find((t) => t.id === town.id)!;
    expect(townAfter.underSiege).toBe(true);
  });

  it("rejects besieging an already-besieged town", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;

    await provider.startSiege(town.id, [before.party.id]);
    await expect(provider.startSiege(town.id, [before.party.id])).rejects.toThrow();
  });

  it("rejects siege with no attackers", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    await expect(provider.startSiege(town.id, [])).rejects.toThrow();
  });

  it("lifts a siege", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;

    const { siegeId } = await provider.startSiege(town.id, [before.party.id]);
    await provider.liftSiege(siegeId);

    const after = await provider.getSnapshot();
    expect(after.sieges.length).toBe(0);
    const townAfter = after.towns.find((t) => t.id === town.id)!;
    expect(townAfter.underSiege).toBe(false);
  });

  it("rejects assault before preparation", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;

    const { siegeId } = await provider.startSiege(town.id, [before.party.id]);
    // Walls intact, preparation 0 — should fail
    await expect(provider.assaultSiege(siegeId)).rejects.toThrow();
  });

  it("persists sieges through snapshot restore", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;

    await provider.startSiege(town.id, [before.party.id]);
    const withSiege = await provider.getSnapshot();
    expect(withSiege.sieges.length).toBe(1);

    await provider.restoreSnapshot(before);
    const restored = await provider.getSnapshot();
    expect(restored.sieges.length).toBe(0);
    const townAfter = restored.towns.find((t) => t.id === town.id)!;
    expect(townAfter.underSiege).toBeFalsy();
  });
});
