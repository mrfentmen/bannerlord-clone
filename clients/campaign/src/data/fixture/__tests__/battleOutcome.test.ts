import { describe, it, expect } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";
import type { BattleResult } from "../../types.js";

function makeResult(overrides: Partial<BattleResult> = {}): BattleResult {
  return {
    battleId: "b-test-1",
    winner: "attacker",
    attacker: {
      partyId: "party-player",
      name: "Player Party",
      isPlayer: true,
      initialTroops: 25,
      survivingTroops: 20,
      killed: 2,
      wounded: 3,
      prisonersTaken: 2,
      prisonersLost: 0,
      retreated: false,
    },
    defender: {
      partyId: "npc-bandit-0",
      name: "Rust Vultures",
      isPlayer: false,
      initialTroops: 15,
      survivingTroops: 5,
      killed: 6,
      wounded: 4,
      prisonersTaken: 0,
      prisonersLost: 2,
      retreated: false,
    },
    loot: 150,
    ticks: 100,
    ...overrides,
  };
}

describe("authoritative battle outcome", () => {
  it("applies killed as permanent losses and wounded to the wounded pool", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();
    const troopsBefore = before.party.troops.reduce((a, t) => a + t.count, 0);

    const outcome = await provider.applyBattleOutcome(makeResult());

    const after = await provider.getSnapshot();
    const troopsAfter = after.party.troops.reduce((a, t) => a + t.count, 0);
    const woundedAfter = after.party.troops.reduce((a, t) => a + t.wounded, 0);

    // 2 killed (permanent), 3 wounded (in wounded pool)
    expect(troopsBefore - troopsAfter).toBe(5);
    expect(woundedAfter).toBe(3);
    expect(outcome.troopsRemaining).toBe(troopsAfter);
  });

  it("wounded troops recover over campaign time", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });

    await provider.applyBattleOutcome(makeResult());
    const afterBattle = await provider.getSnapshot();
    const woundedAfterBattle = afterBattle.party.troops.reduce((a, t) => a + t.wounded, 0);
    expect(woundedAfterBattle).toBe(3);

    // Advance several days (longer timeout - ticks are real-time)
    await new Promise<void>((resolve) => {
      let ticks = 0;
      const unsub = provider.subscribeTicks(
        () => {
          ticks++;
          if (ticks >= 5) {
            unsub();
            resolve();
          }
        },
        () => {}
      );
    });

    const afterRecovery = await provider.getSnapshot();
    const woundedAfterRecovery = afterRecovery.party.troops.reduce((a, t) => a + t.wounded, 0);
    // Some wounded should have recovered
    expect(woundedAfterRecovery).toBeLessThan(woundedAfterBattle);
  }, 30000);

  it("awards XP based on actual enemy troops, not a guess", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });

    const outcome = await provider.applyBattleOutcome(makeResult());
    // 15 enemy troops * 2 = 30 XP pool distributed (allow rounding)
    const totalXp = outcome.xpAwards.reduce((a, x) => a + x.xp, 0);
    expect(totalXp).toBeGreaterThanOrEqual(29);
    expect(totalXp).toBeLessThanOrEqual(31);
  });

  it("adds loot to money", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const before = await provider.getSnapshot();

    const outcome = await provider.applyBattleOutcome(makeResult());

    expect(outcome.money).toBe(before.party.money + 150);
  });
});
