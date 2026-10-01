/**
 * Task 67: custom battle setup. Full force/biome/rule picker: any combination
 * of preset forces, biome, challenge modifiers, and seed launches. Invalid
 * combinations are rejected with a reason, never silently fixed.
 */

import type { BattleConfig, BiomeId } from "./types.js";
import { presetForce } from "./forces.js";
import { applyModifiers } from "./challenge.js";

export interface CustomBattlePick {
  playerForceId: string;
  enemyForceId: string;
  biome: BiomeId;
  modifierIds: string[];
  seed?: number;
}

export function customBattle(pick: CustomBattlePick): BattleConfig {
  if (pick.playerForceId === pick.enemyForceId) {
    throw new Error("custom battle needs two different forces");
  }
  const config: BattleConfig = {
    mode: "custom",
    label: "Custom battle",
    player: presetForce(pick.playerForceId),
    enemy: presetForce(pick.enemyForceId),
    biome: pick.biome,
    modifiers: [],
    seed: pick.seed ?? Math.floor(Math.random() * 2 ** 31),
  };
  const unique = [...new Set(pick.modifierIds)];
  if (unique.length !== pick.modifierIds.length) {
    throw new Error("duplicate modifiers are not allowed");
  }
  return applyModifiers(config, unique);
}
