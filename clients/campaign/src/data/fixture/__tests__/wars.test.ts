/**
 * War tests: declaration, peace, exhaustion, validation.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("wars", () => {
  it("declares war on another faction", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    expect(before.wars.length).toBe(0);

    const { warId } = await provider.declareWar("great-lakes-union");
    expect(warId).toBeDefined();

    const after = await provider.getSnapshot();
    expect(after.wars.length).toBe(1);
    const war = after.wars[0]!;
    expect(war.attackerFactionId).toBe(before.player.factionId);
    expect(war.defenderFactionId).toBe("great-lakes-union");
    expect(war.exhaustion).toBe(0);
  });

  it("rejects declaring war on your own faction", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    await expect(provider.declareWar(before.player.factionId)).rejects.toThrow();
  });

  it("rejects declaring the same war twice", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await provider.declareWar("great-lakes-union");
    await expect(provider.declareWar("great-lakes-union")).rejects.toThrow();
  });

  it("makes peace to end a war", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const { warId } = await provider.declareWar("great-lakes-union");
    await provider.makePeace(warId);

    const after = await provider.getSnapshot();
    expect(after.wars.length).toBe(0);
  });

  it("rejects peace for a nonexistent war", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await expect(provider.makePeace("war-nonexistent")).rejects.toThrow();
  });

  it("persists wars through snapshot restore", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    await provider.declareWar("great-lakes-union");

    const withWar = await provider.getSnapshot();
    expect(withWar.wars.length).toBe(1);

    await provider.restoreSnapshot(before);
    const restored = await provider.getSnapshot();
    expect(restored.wars.length).toBe(0);
  });
});
