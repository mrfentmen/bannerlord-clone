/**
 * Quest tests: acceptance, progress, completion, abandonment, deadlines.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("quests", () => {
  it("accepts a quest from a template", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    expect(before.quests.length).toBe(0);

    const { questId } = await provider.acceptQuest("notable-1", "Merchant Vex", "bandit-hunt");
    expect(questId).toBeDefined();

    const after = await provider.getSnapshot();
    expect(after.quests.length).toBe(1);
    const quest = after.quests[0]!;
    expect(quest.title).toBe("Bandit Hunt");
    expect(quest.status).toBe("active");
    expect(quest.objectives[0]!.kind).toBe("kill_bandits");
  });

  it("rejects unknown quest templates", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await expect(provider.acceptQuest("n1", "Vex", "nonexistent")).rejects.toThrow();
  });

  it("rejects duplicate active quests", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await provider.acceptQuest("notable-1", "Merchant Vex", "bandit-hunt");
    await expect(provider.acceptQuest("notable-1", "Merchant Vex", "bandit-hunt")).rejects.toThrow();
  });

  it("abandons an active quest", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const { questId } = await provider.acceptQuest("notable-1", "Merchant Vex", "bandit-hunt");
    await provider.abandonQuest(questId);

    const after = await provider.getSnapshot();
    expect(after.quests[0]!.status).toBe("failed");
  });

  it("completes a quest when objectives are met", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const moneyBefore = before.party.money;

    // Accept a recruit quest (20 troops)
    const { questId } = await provider.acceptQuest("notable-1", "Vex", "raise-militia");

    // Recruit troops to make progress — need capacity, so use debug tier bump
    // Actually: recruit 20 via militia? Simpler: verify quest tracks via direct API.
    // We'll test completion through the trackQuestProgress path via recruit.
    const town = before.towns[0]!;
    const offered = town.recruitable[0]!;
    // Recruit in batches within capacity (50)
    await provider.recruit({
      partyId: before.party.id,
      townId: town.id,
      unitId: offered.unitId,
      quantity: 20,
      expectedDay: before.day,
    });

    const after = await provider.getSnapshot();
    const quest = after.quests.find((q) => q.id === questId)!;
    expect(quest.status).toBe("completed");
    expect(after.party.money).toBeGreaterThan(moneyBefore); // reward paid
  });

  it("persists quests through snapshot restore", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    await provider.acceptQuest("notable-1", "Vex", "bandit-hunt");

    const withQuest = await provider.getSnapshot();
    expect(withQuest.quests.length).toBe(1);

    await provider.restoreSnapshot(before);
    const restored = await provider.getSnapshot();
    expect(restored.quests.length).toBe(0);
  });
});
