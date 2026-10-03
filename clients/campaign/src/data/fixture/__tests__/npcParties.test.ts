import { describe, it, expect } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("NPC parties", () => {
  it("spawns hostile bandit parties", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const snapshot = await provider.getSnapshot();

    expect(snapshot.npcParties.length).toBeGreaterThan(0);
    const bandits = snapshot.npcParties.filter((p) => p.kind === "bandit");
    expect(bandits.length).toBeGreaterThan(0);
    expect(bandits[0]?.hostile).toBe(true);
    expect(bandits[0]?.troopCount).toBeGreaterThan(0);
  });

  it("NPC parties persist through save/load", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const saved = await provider.getSnapshot();
    const npcCount = saved.npcParties.length;

    await provider.restoreSnapshot(saved);
    const restored = await provider.getSnapshot();

    expect(restored.npcParties.length).toBe(npcCount);
    expect(restored.npcParties[0]?.id).toBe(saved.npcParties[0]?.id);
  });

  it("NPC parties move over time", async () => {    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const posBefore = { ...before.npcParties[0]!.position };

    // Advance several days via tick subscription
    await new Promise<void>((resolve) => {
      let ticks = 0;
      const unsub = provider.subscribeTicks(
        () => {
          ticks++;
          if (ticks >= 3) {
            unsub();
            resolve();
          }
        },
        () => {}
      );
    });

    const after = await provider.getSnapshot();
    const posAfter = after.npcParties[0]!.position;
    // Position should have changed (they wander)
    expect(
      Math.hypot(posAfter.x - posBefore.x, posAfter.z - posBefore.z)
    ).toBeGreaterThan(0);
  });

  it("getNearbyHostiles finds bandits within range", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    // Large range should find all 4 bandits
    const near = await provider.getNearbyHostiles(1000);
    expect(near.length).toBe(4);
    expect(near.every((p) => p.hostile)).toBe(true);

    // Tiny range should find none (bandits spawn 80-200km away)
    const far = await provider.getNearbyHostiles(1);
    expect(far.length).toBe(0);
  });
});
