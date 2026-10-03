import { describe, it, expect } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("party split", () => {
  it("creates a detached party with the specified troops", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const stack = before.party.troops[0]!;
    const splitCount = 5;

    const { partyId } = await provider.splitParty({
      troopIds: [{ stackId: stack.id, count: splitCount }],
      name: "Scout Detachment",
    });

    const after = await provider.getSnapshot();
    // Player party lost the troops
    const playerStack = after.party.troops.find((t) => t.id === stack.id)!;
    expect(playerStack.count).toBe(stack.count - splitCount);
    // Detached party exists with the troops
    const detached = after.npcParties.find((p) => p.id === partyId)!;
    expect(detached).toBeDefined();
    expect(detached.name).toBe("Scout Detachment");
    expect(detached.troopCount).toBe(splitCount);
    expect(detached.hostile).toBe(false);
  });

  it("refuses to split all troops from a stack", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const stack = before.party.troops[0]!;

    await expect(
      provider.splitParty({
        troopIds: [{ stackId: stack.id, count: stack.count }],
        name: "Bad Split",
      })
    ).rejects.toThrow();
  });

  it("refuses to split more than available", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const stack = before.party.troops[0]!;

    await expect(
      provider.splitParty({
        troopIds: [{ stackId: stack.id, count: stack.count + 10 }],
        name: "Bad Split",
      })
    ).rejects.toThrow();
  });
});

describe("party merge", () => {
  it("merges a detached party back into the player party", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const stack = before.party.troops[0]!;
    const splitCount = 5;

    const { partyId } = await provider.splitParty({
      troopIds: [{ stackId: stack.id, count: splitCount }],
      name: "Scout Detachment",
    });

    await provider.mergeParty(partyId);

    const after = await provider.getSnapshot();
    // Troops returned
    const playerStack = after.party.troops.find((t) => t.id === stack.id)!;
    expect(playerStack.count).toBe(stack.count);
    // Detached party gone
    expect(after.npcParties.find((p) => p.id === partyId)).toBeUndefined();
  });

  it("refuses to merge a hostile party", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const hostile = before.npcParties.find((p) => p.hostile)!;

    await expect(provider.mergeParty(hostile.id)).rejects.toThrow();
  });

  it("refuses to merge a nonexistent party", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });

    await expect(provider.mergeParty("nonexistent")).rejects.toThrow();
  });
});
