/**
 * Preset forces for quick battle and custom setup (tasks 58, 67).
 * Named rosters with a distinct character; the skirmish generator builds its
 * own from the RNG instead.
 */

import type { ForceDef } from "./types.js";

export const PRESET_FORCES: ForceDef[] = [
  {
    id: "militia",
    name: "County Militia",
    units: [
      { kind: "infantry", count: 60, tier: 1 },
      { kind: "archers", count: 24, tier: 1 },
      { kind: "skirmishers", count: 16, tier: 1 },
    ],
  },
  {
    id: "guard",
    name: "Harbor Guard",
    units: [
      { kind: "infantry", count: 48, tier: 2 },
      { kind: "archers", count: 32, tier: 2 },
      { kind: "cavalry", count: 12, tier: 2 },
    ],
  },
  {
    id: "raiders",
    name: "Highway Raiders",
    units: [
      { kind: "skirmishers", count: 40, tier: 2 },
      { kind: "cavalry", count: 24, tier: 2 },
      { kind: "infantry", count: 24, tier: 1 },
    ],
  },
  {
    id: "legion",
    name: "Iron Legion",
    units: [
      { kind: "infantry", count: 72, tier: 3 },
      { kind: "archers", count: 24, tier: 3 },
      { kind: "cavalry", count: 18, tier: 3 },
    ],
  },
  {
    id: "horde",
    name: "Rust Horde",
    units: [
      { kind: "infantry", count: 120, tier: 1 },
      { kind: "skirmishers", count: 40, tier: 1 },
    ],
  },
  {
    id: "wardens",
    name: "Freeway Wardens",
    units: [
      { kind: "cavalry", count: 36, tier: 3 },
      { kind: "archers", count: 36, tier: 2 },
      { kind: "infantry", count: 36, tier: 2 },
    ],
  },
];

export function presetForce(id: string): ForceDef {
  const f = PRESET_FORCES.find((p) => p.id === id);
  if (!f) throw new Error(`unknown preset force: ${id}`);
  return structuredClone(f);
}
