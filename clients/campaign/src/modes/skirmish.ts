/**
 * Task 59: skirmish generator. One click, one seed, one complete battle:
 * random forces on both sides plus a random biome. The default seed comes
 * from crypto randomness, so every click gives a different setup; pass an
 * explicit seed for a reproducible one.
 */

import type { BattleConfig, BiomeId, ForceDef, UnitDef } from "./types.js";
import { int, mulberry32, pick, type Rng } from "./rng.js";

const BIOMES: BiomeId[] = ["plains", "hills", "forest", "desert", "urban", "coast"];
const KINDS: UnitDef["kind"][] = ["infantry", "archers", "cavalry", "skirmishers"];

const FORCE_NAMES = [
  "Dust Vultures",
  "Concrete Saints",
  "Neon Jackals",
  "Gravel Wolves",
  "Static Crowd",
  "Ash Runners",
  "Pale Riders",
  "Cinder Bloc",
];

function randomForce(rng: Rng, tag: string): ForceDef {
  const kinds = [...KINDS].sort(() => rng() - 0.5).slice(0, int(rng, 2, 4));
  const units: UnitDef[] = kinds.map((kind) => ({
    kind,
    count: int(rng, 12, 60),
    tier: int(rng, 1, 3) as 1 | 2 | 3,
  }));
  return { id: `skirmish-${tag}`, name: pick(rng, FORCE_NAMES), units };
}

export function generateSkirmish(seed?: number): BattleConfig {
  const s = seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = mulberry32(s);
  return {
    mode: "skirmish",
    label: `Skirmish #${s.toString(36)}`,
    player: randomForce(rng, "player"),
    enemy: randomForce(rng, "enemy"),
    biome: pick(rng, BIOMES),
    modifiers: [],
    seed: s,
  };
}
