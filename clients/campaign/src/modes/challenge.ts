/**
 * Task 65: challenge modifiers. Each modifier transforms a BattleConfig;
 * any combination applies in catalog order, so all five (and any future
 * ones) compose. Modifier effects are data-level (force sizes, unit kinds,
 * flags the scene reads) — the sim stays untouched.
 */

import type { BattleConfig } from "./types.js";

export interface ChallengeModifier {
  id: string;
  name: string;
  blurb: string;
  apply(config: BattleConfig): void;
}

function scaleForce(config: BattleConfig, side: "player" | "enemy", factor: number): void {
  for (const u of config[side].units) u.count = Math.max(1, Math.round(u.count * factor));
}

export const CHALLENGE_MODIFIERS: ChallengeModifier[] = [
  {
    id: "outnumbered",
    name: "Outnumbered",
    blurb: "The enemy brings twice the numbers.",
    apply: (c) => scaleForce(c, "enemy", 2),
  },
  {
    id: "night",
    name: "Night raid",
    blurb: "Fight in the dark; the scene dims its lighting.",
    apply: (c) => {
      c.label += " (night)";
    },
  },
  {
    id: "no-archers",
    name: "No archers",
    blurb: "Both sides field no ranged units.",
    apply: (c) => {
      for (const side of ["player", "enemy"] as const) {
        c[side].units = c[side].units.filter((u) => u.kind !== "archers");
      }
    },
  },
  {
    id: "elite-foe",
    name: "Elite foe",
    blurb: "Enemy units fight a tier higher.",
    apply: (c) => {
      for (const u of c.enemy.units) u.tier = Math.min(3, u.tier + 1) as 1 | 2 | 3;
    },
  },
  {
    id: "last-stand",
    name: "Last stand",
    blurb: "Your force is halved. Hold the line.",
    apply: (c) => scaleForce(c, "player", 0.5),
  },
];

/** Apply a set of modifier ids to a config, in catalog order. Unknown ids throw. */
export function applyModifiers(config: BattleConfig, ids: string[]): BattleConfig {
  const byId = new Map(CHALLENGE_MODIFIERS.map((m) => [m.id, m]));
  for (const id of ids) {
    const m = byId.get(id);
    if (!m) throw new Error(`unknown challenge modifier: ${id}`);
    m.apply(config);
  }
  config.modifiers = [...ids];
  return config;
}
