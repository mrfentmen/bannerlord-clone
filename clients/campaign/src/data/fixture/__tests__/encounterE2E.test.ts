import { describe, it, expect } from "vitest";
import { createFixtureSimulationProvider } from "../fixtureProvider.js";
import type { BattleResult } from "../../types.js";

/**
 * End-to-end: new campaign → encounter → fight → battle → writeback → save → load → continue.
 * Uses actual fixture state at every step, not mocks.
 */
describe("encounter → battle → writeback → save/load (victory)", () => {
  it("full loop with actual NPC roster", async () => {
    // NEW CAMPAIGN
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const start = await provider.getSnapshot();

    // PLAYER PARTY exists with troops
    const playerTroopsStart = start.party.troops.reduce((a, t) => a + t.count, 0);
    expect(playerTroopsStart).toBeGreaterThan(0);

    // NPC PARTY exists
    expect(start.npcParties.length).toBeGreaterThan(0);
    const npc = start.npcParties[0]!;
    const npcTroopsStart = npc.troopCount;
    expect(npcTroopsStart).toBeGreaterThan(0);

    // NPC MOVEMENT: advance ticks, NPC should move
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
    const afterMove = await provider.getSnapshot();
    const npcAfterMove = afterMove.npcParties.find((p) => p.id === npc.id)!;
    // NPC may or may not have moved (deterministic wander), but it exists
    expect(npcAfterMove).toBeDefined();

    // PROXIMITY: find hostiles within range
    const hostiles = await provider.getNearbyHostiles(5000); // large range to guarantee a hit
    expect(hostiles.length).toBeGreaterThan(0);
    const target = hostiles[0]!;

    // ENCOUNTER: the NPC data is the actual roster, not a generic bandit
    const targetNpc = afterMove.npcParties.find((p) => p.id === target.id)!;
    expect(targetNpc.name).not.toBe("Raider band"); // must be the actual named party
    expect(targetNpc.troopCount).toBe(target.troopCount);

    // FIGHT → BATTLE with the actual NPC roster
    const battleResult: BattleResult = {
      battleId: "b-e2e-1",
      winner: "attacker",
      attacker: {
        partyId: "party-player",
        name: "Player Party",
        isPlayer: true,
        initialTroops: playerTroopsStart,
        survivingTroops: playerTroopsStart - 5,
        killed: 2,
        wounded: 3,
        prisonersTaken: 2,
        prisonersLost: 0,
        retreated: false,
      },
      defender: {
        partyId: targetNpc.id, // actual NPC party ID, not generic
        name: targetNpc.name, // actual NPC name
        isPlayer: false,
        initialTroops: targetNpc.troopCount,
        survivingTroops: 0,
        killed: Math.round(targetNpc.troopCount * 0.6),
        wounded: Math.round(targetNpc.troopCount * 0.4),
        prisonersTaken: 0,
        prisonersLost: 2,
        retreated: false,
      },
      loot: 200,
      ticks: 120,
    };

    // BATTLE → WIN → CASUALTIES → WOUNDED → LOOT → PRISONERS → XP
    const outcome = await provider.applyBattleOutcome(battleResult);
    const afterBattle = await provider.getSnapshot();

    // CASUALTIES: 2 killed (permanent)
    const troopsAfterBattle = afterBattle.party.troops.reduce((a, t) => a + t.count, 0);
    expect(playerTroopsStart - troopsAfterBattle).toBe(5); // 2 killed + 3 wounded

    // WOUNDED: 3 in wounded pool
    const woundedAfter = afterBattle.party.troops.reduce((a, t) => a + t.wounded, 0);
    expect(woundedAfter).toBe(3);

    // LOOT: money increased by loot (accounting for upkeep during ticks, rounded)
    const moneyBeforeBattle = afterMove.party.money;
    expect(outcome.money).toBe(Math.round(moneyBeforeBattle + 200));

    // PRISONERS: captured
    expect(afterBattle.party.prisoners.length).toBeGreaterThan(0);

    // XP: awarded based on actual enemy troops
    expect(outcome.xpAwards.length).toBeGreaterThan(0);

    // NPC DEFEAT: remove the destroyed party
    await provider.defeatNpcParty(targetNpc.id);
    const afterDefeat = await provider.getSnapshot();
    expect(afterDefeat.npcParties.find((p) => p.id === targetNpc.id)).toBeUndefined();

    // SAVE: capture the snapshot
    const savedSnapshot = await provider.getSnapshot();
    expect(savedSnapshot.party.troops.reduce((a, t) => a + t.count, 0)).toBe(troopsAfterBattle);

    // LOAD: restore into a fresh provider
    const provider2 = createFixtureSimulationProvider({ seed: 999 });
    await provider2.restoreSnapshot(savedSnapshot);
    const loaded = await provider2.getSnapshot();

    // CONTINUE: state matches
    expect(loaded.party.troops.reduce((a, t) => a + t.count, 0)).toBe(troopsAfterBattle);
    expect(loaded.party.money).toBe(outcome.money);
    expect(loaded.npcParties.find((p) => p.id === targetNpc.id)).toBeUndefined();
    expect(loaded.day).toBe(savedSnapshot.day);
  }, 30000);
});

describe("encounter → flee → continue", () => {
  it("flee moves player away and preserves NPC", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const start = await provider.getSnapshot();
    const npc = start.npcParties[0]!;
    const playerPosBefore = { ...start.party.position };

    // FLEE
    const dx = playerPosBefore.x - npc.position.x;
    const dz = playerPosBefore.z - npc.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    await provider.fleeFromEncounter(npc.id, {
      x: playerPosBefore.x + (dx / dist) * 60,
      z: playerPosBefore.z + (dz / dist) * 60,
    });

    const after = await provider.getSnapshot();
    // Player moved
    expect(after.party.position.x).not.toBe(playerPosBefore.x);
    // NPC preserved
    expect(after.npcParties.find((p) => p.id === npc.id)).toBeDefined();
    // Morale hit
    expect(after.party.morale).toBeLessThan(start.party.morale);

    // SAVE/LOAD preserves flee state
    const saved = await provider.getSnapshot();
    const provider2 = createFixtureSimulationProvider({ seed: 999 });
    await provider2.restoreSnapshot(saved);
    const loaded = await provider2.getSnapshot();
    expect(loaded.party.position.x).toBeCloseTo(after.party.position.x, 1);
  }, 30000);
});

describe("encounter → defeat → consequences", () => {
  it("player defeat applies loot loss, prisoners, and retreat", async () => {
    const provider = createFixtureSimulationProvider({ seed: 42 });
    const start = await provider.getSnapshot();
    const npc = start.npcParties[0]!;
    const moneyBefore = start.party.money;
    const troopsBefore = start.party.troops.reduce((a, t) => a + t.count + t.wounded, 0);

    // Simulate a lost battle
    const battleResult: BattleResult = {
      battleId: "b-e2e-defeat",
      winner: "defender",
      attacker: {
        partyId: "party-player",
        name: "Player Party",
        isPlayer: true,
        initialTroops: troopsBefore,
        survivingTroops: troopsBefore - 8,
        killed: 3,
        wounded: 5,
        prisonersTaken: 0,
        prisonersLost: 2,
        retreated: true,
      },
      defender: {
        partyId: npc.id,
        name: npc.name,
        isPlayer: false,
        initialTroops: npc.troopCount,
        survivingTroops: Math.round(npc.troopCount * 0.7),
        killed: Math.round(npc.troopCount * 0.2),
        wounded: Math.round(npc.troopCount * 0.1),
        prisonersTaken: 2,
        prisonersLost: 0,
        retreated: false,
      },
      loot: 0,
      ticks: 100,
    };

    await provider.applyBattleOutcome(battleResult);
    await provider.applyPlayerDefeat({
      npcPartyId: npc.id,
      lootTaken: 150,
      prisonersTaken: 2,
    });

    const after = await provider.getSnapshot();
    // Loot taken
    expect(after.party.money).toBeLessThan(moneyBefore);
    // Troops reduced (battle casualties + prisoners)
    const troopsAfter = after.party.troops.reduce((a, t) => a + t.count + t.wounded, 0);
    expect(troopsAfter).toBeLessThan(troopsBefore);
    // NPC still exists (it won)
    expect(after.npcParties.find((p) => p.id === npc.id)).toBeDefined();
    // Player retreated (position changed)
    expect(
      after.party.position.x !== start.party.position.x ||
      after.party.position.z !== start.party.position.z
    ).toBe(true);
  }, 30000);
});
