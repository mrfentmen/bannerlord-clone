/**
 * Caravan tests: trade flow moves goods between towns.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("caravans", () => {
  it("spawns trade caravans at game start", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const snap = await provider.getSnapshot();
    const caravans = snap.npcParties.filter((p) => p.kind === "caravan");
    expect(caravans.length).toBe(3);
    for (const c of caravans) {
      expect(c.hostile).toBe(false);
      expect(c.cargo).toBeDefined();
    }
  });

  it("caravans persist through snapshot restore", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const caravanCount = before.npcParties.filter((p) => p.kind === "caravan").length;

    await provider.restoreSnapshot(before);
    const restored = await provider.getSnapshot();
    expect(restored.npcParties.filter((p) => p.kind === "caravan").length).toBe(caravanCount);
  });
});
