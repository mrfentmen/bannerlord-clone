/**
 * NPC vs NPC battle simulation (Bannerlord's autocombat).
 *
 * When two NPC parties meet on the campaign map, nobody plays the battle --
 * the game simulates it. This is the wiki's formula: each side's strength is
 * the sum over its battle-ready units of ((level + 4)^2) / 50 (min 1), then
 * rounds of mutual damage until one side breaks. The winner takes light
 * losses, the loser heavy; the dead split into killed and wounded.
 *
 * Casualties feed back into the campaign: the fixture applies them to the
 * NPC parties after the sim.
 */

import { attemptCouch } from "./couchLance.js";

export interface NpcSide {
  /** Battle-ready troop count. */
  troops: number;
  /** Average troop level (tier maps to level roughly as tier * 6). */
  avgLevel: number;
  /** 0-1 morale fraction. Shaken troops break sooner. */
  morale: number;
  /** 0-1 fraction of the side that is mounted cavalry. */
  cavalryFraction?: number;
  /** Average riding skill 0-10 of the cavalry. */
  ridingSkill?: number;
}

export interface NpcBattleResult {
  winner: 0 | 1;
  /** Rounds fought. */
  rounds: number;
  /** [side0, side1] killed. */
  killed: [number, number];
  /** [side0, side1] wounded (recoverable). */
  wounded: [number, number];
}

/** One unit's strength. The wiki's formula, with the floor. */
export function unitStrength(level: number): number {
  return Math.max(1, ((level + 4) * (level + 4)) / 50);
}

function sideStrength(side: NpcSide): number {
  return side.troops * unitStrength(side.avgLevel) * (0.7 + 0.3 * side.morale);
}

/**
 * Simulate a battle. Each round, both sides deal damage proportional to
 * their remaining strength; the side that runs out of battle-ready troops
 * first loses. Deterministic given the random source.
 */
export function simulateNpcBattle(
  a: NpcSide,
  b: NpcSide,
  random: () => number = Math.random,
): NpcBattleResult {
  const sides = [a, b];
  let remaining = [a.troops, b.troops];
  const killed: [number, number] = [0, 0];
  const wounded: [number, number] = [0, 0];
  let rounds = 0;

  while (remaining[0]! > 0 && remaining[1]! > 0 && rounds < 100) {
    rounds++;
    const r0 = remaining[0]!;
    const r1 = remaining[1]!;
    const str = [
      (r0 / sides[0]!.troops) * sideStrength({ ...sides[0]!, troops: r0 }),
      (r1 / sides[1]!.troops) * sideStrength({ ...sides[1]!, troops: r1 }),
    ];
    // Opening cavalry charge: couched lances hit in the first two rounds.
    // Bannerlord's shock cavalry breaks lines before the grind begins.
    const chargeMult = [1, 1];
    if (rounds <= 2) {
      for (let i = 0; i < 2; i++) {
        const cav = sides[i]!.cavalryFraction ?? 0;
        if (cav > 0) {
          const couch = attemptCouch({
            speed: 11,
            isLance: true,
            ridingSkill: sides[i]!.ridingSkill ?? 3,
          });
          if (couch.couched) {
            chargeMult[i] = 1 + cav * (couch.damageMult - 1) * 0.5;
          }
        }
      }
    }
    // Each side loses a fraction of the enemy's relative strength, with noise.
    for (let i = 0; i < 2; i++) {
      const foe = 1 - i;
      const total = str[0]! + str[1]!;
      if (total <= 0) break;
      const lossFrac = (str[foe]! / total) * 0.25 * chargeMult[foe]! * (0.8 + random() * 0.4);
      const left = remaining[i]!;
      const losses = Math.min(left, Math.max(1, Math.round(left * lossFrac)));
      // A third of losses are kills, the rest wounds (Bannerlord's split).
      const dead = Math.round(losses * 0.35);
      killed[i]! += dead;
      wounded[i]! += losses - dead;
      remaining[i] = left - losses;
    }
  }

  const winner = remaining[0]! > 0 ? 0 : 1;
  return { winner: winner as 0 | 1, rounds, killed, wounded };
}
