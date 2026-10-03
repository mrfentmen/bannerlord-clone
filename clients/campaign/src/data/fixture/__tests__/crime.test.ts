/**
 * Crime tests: committing crimes raises crime rating, damages relations, creates fines.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";

describe("crime", () => {
  it("committing a crime raises crime rating and creates a fine", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    const crimeBefore = town.crimeRating;

    const { fine } = await provider.commitCrime(town.id, "theft");
    expect(fine).toBe(200);

    const after = await provider.getSnapshot();
    const townAfter = after.towns.find((t) => t.id === town.id)!;
    expect(townAfter.crimeRating).toBeGreaterThan(crimeBefore);
    expect(after.fines[town.id]).toBe(200);
  });

  it("paying a fine clears the record", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    const moneyBefore = before.party.money;

    await provider.commitCrime(town.id, "assault"); // 500 fine
    const { paid } = await provider.payFine(town.id);
    expect(paid).toBe(500);

    const after = await provider.getSnapshot();
    expect(after.fines[town.id]).toBeUndefined();
    expect(after.party.money).toBe(moneyBefore - 500);
  });

  it("rejects paying when there is no fine", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;
    await expect(provider.payFine(town.id)).rejects.toThrow();
  });

  it("crime persists through snapshot restore", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const town = before.towns[0]!;

    await provider.commitCrime(town.id, "smuggling");
    const withCrime = await provider.getSnapshot();
    expect(withCrime.fines[town.id]).toBe(350);

    await provider.restoreSnapshot(before);
    const restored = await provider.getSnapshot();
    expect(restored.fines[town.id]).toBeUndefined();
  });
});
