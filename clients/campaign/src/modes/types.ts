/**
 * Battle modes (MASTER_PLAN 2D, tasks 58-67): quick battle, skirmish
 * generator, arena, tournaments (+ betting + prizes), historical battles,
 * challenge modifiers, daily challenge, and custom battle setup.
 *
 * This module is setup-and-launch UI plus mode logic. It never simulates a
 * fight: a finished {@link BattleConfig} is handed to a {@link BattleLauncher}
 * that the app (battle scene owner) provides. Results come back through
 * {@link BattleResult} so modes like tournaments and arena can progress.
 */

export type BattleMode =
  | "quick"
  | "skirmish"
  | "arena"
  | "tournament"
  | "historical"
  | "challenge"
  | "daily"
  | "custom";

export type BiomeId = "plains" | "hills" | "forest" | "desert" | "urban" | "coast";

export interface UnitDef {
  kind: "infantry" | "archers" | "cavalry" | "skirmishers";
  count: number;
  tier: 1 | 2 | 3;
}

export interface ForceDef {
  id: string;
  name: string;
  units: UnitDef[];
}

export interface BattleConfig {
  mode: BattleMode;
  label: string;
  player: ForceDef;
  enemy: ForceDef;
  biome: BiomeId;
  /** Modifier ids from the challenge catalog (task 65). */
  modifiers: string[];
  seed: number;
  /** Fraction of the player's force starting wounded (0..1); set by the "wounded-start" handicap. */
  playerWounded?: number;
}

export interface BattleResult {
  config: BattleConfig;
  playerWon: boolean;
  playerKills: number;
  playerLosses: number;
  /** Seconds the battle lasted, when reported. */
  durationS?: number;
}

/** Implemented by the app shell / battle scene. Receives a finished config. */
export interface BattleLauncher {
  launch(config: BattleConfig): void;
}

export const BIOME_LABEL: Record<BiomeId, string> = {
  plains: "Plains",
  hills: "Hills",
  forest: "Forest",
  desert: "Desert",
  urban: "Urban",
  coast: "Coast",
};

export const MODE_LABEL: Record<BattleMode, string> = {
  quick: "Quick battle",
  skirmish: "Skirmish",
  arena: "Arena",
  tournament: "Tournament",
  historical: "Historical battle",
  challenge: "Challenge",
  daily: "Daily challenge",
  custom: "Custom battle",
};

export function forceSize(f: ForceDef): number {
  return f.units.reduce((s, u) => s + u.count, 0);
}
