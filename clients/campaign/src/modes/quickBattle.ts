/**
 * Task 58: quick battle. Pick two preset forces and fight immediately — no
 * campaign, no setup screens beyond the two picks. The returned config goes
 * straight to the launcher.
 */

import type { BattleConfig, BiomeId } from "./types.js";
import { presetForce } from "./forces.js";

export interface QuickBattlePick {
  playerForceId: string;
  enemyForceId: string;
  biome?: BiomeId;
  seed?: number;
}

export function quickBattle(pick: QuickBattlePick): BattleConfig {
  if (pick.playerForceId === pick.enemyForceId) {
    throw new Error("quick battle needs two different forces");
  }
  return {
    mode: "quick",
    label: "Quick battle",
    player: presetForce(pick.playerForceId),
    enemy: presetForce(pick.enemyForceId),
    biome: pick.biome ?? "plains",
    modifiers: [],
    seed: pick.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
}
