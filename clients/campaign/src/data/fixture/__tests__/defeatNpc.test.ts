import { describe, it, expect } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("defeat NPC party", () => {
  it("removes the defeated party from the campaign", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const initialCount = before.npcParties.length;
    expect(initialCount).toBeGreaterThan(0);

    const targetId = before.npcParties[0]!.id;
    await provider.defeatNpcParty(targetId);

    const after = await provider.getSnapshot();
    expect(after.npcParties.length).toBe(initialCount - 1);
    expect(after.npcParties.find((p) => p.id === targetId)).toBeUndefined();
  });

  it("is a no-op for unknown party IDs", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const initialCount = before.npcParties.length;

    await provider.defeatNpcParty("nonexistent-party");

    const after = await provider.getSnapshot();
    expect(after.npcParties.length).toBe(initialCount);
  });
});
