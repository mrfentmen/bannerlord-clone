/**
 * Prisoner tests: recruitment from prisoners, ransoming.
 */
import { describe, expect, it } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";
import { conformityNeed } from "../../../afteraction/conformity.js";

/** Prisoners added via debug start broken-in, the way a long-held captive would be. */
const BROKEN_IN = (tier: number) => conformityNeed(tier);

describe("prisoners", () => {
  it("recruits prisoners into the party", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await provider.debugAddPrisoners?.("bandit-1", "Bandit", 10, 2, BROKEN_IN(2));
    
    const before = await provider.getSnapshot();
    const moneyBefore = before.party.money;
    const prisoner = before.party.prisoners.find((p) => p.troopId === "bandit-1")!;
    expect(prisoner.count).toBe(10);

    await provider.recruitPrisoners("bandit-1", 5);

    const after = await provider.getSnapshot();
    const prisonerAfter = after.party.prisoners.find((p) => p.troopId === "bandit-1")!;
    expect(prisonerAfter.count).toBe(5);
    expect(after.party.money).toBe(moneyBefore - 100); // 5 * 20
    
    const troop = after.party.troops.find((t) => t.id === "bandit-1")!;
    expect(troop).toBeDefined();
    expect(troop.count).toBe(5);
    expect(troop.tier).toBe(2);
  });

  it("removes prisoner entry when all are recruited", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await provider.debugAddPrisoners?.("bandit-1", "Bandit", 5, 2, BROKEN_IN(2));

    await provider.recruitPrisoners("bandit-1", 5);

    const after = await provider.getSnapshot();
    expect(after.party.prisoners.find((p) => p.troopId === "bandit-1")).toBeUndefined();
  });

  it("refuses to recruit prisoners who aren't broken in yet", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await provider.debugAddPrisoners?.("bandit-1", "Bandit", 5, 2); // conformity 0

    await expect(provider.recruitPrisoners("bandit-1", 5)).rejects.toThrow(/conformity/);
  });

  it("rejects recruiting more than held", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await provider.debugAddPrisoners?.("bandit-1", "Bandit", 5, 2);
    
    await expect(provider.recruitPrisoners("bandit-1", 10)).rejects.toThrow();
  });

  it("ransoms prisoners for gold", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await provider.debugAddPrisoners?.("knight-1", "Knight", 4, 3);
    
    const before = await provider.getSnapshot();
    const moneyBefore = before.party.money;

    const { gold } = await provider.ransomPrisoners("knight-1", 2);
    expect(gold).toBe(2 * 3 * 30); // count * tier * 30 = 180

    const after = await provider.getSnapshot();
    expect(after.party.money).toBe(moneyBefore + 180);
    const prisoner = after.party.prisoners.find((p) => p.troopId === "knight-1")!;
    expect(prisoner.count).toBe(2);
  });

  it("rejects ransoming more than held", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    await provider.debugAddPrisoners?.("bandit-1", "Bandit", 3, 1);
    
    await expect(provider.ransomPrisoners("bandit-1", 5)).rejects.toThrow();
  });
});
