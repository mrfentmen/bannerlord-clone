/**
 * Wanted / police data tables — game design numbers, no logic.
 *
 * `CRIME_TABLE` is the modern-setting equivalent of leonida's 12-crime
 * table (MIT); `DISPATCH_TABLE` ports its 7-tier response ladder
 * (cruisers → SWAT → helicopters → roadblocks → spikes → ramming →
 * shoot-vs-arrest), with the weapon ids mapped to this game's arsenal.
 */
import type { CrimeType } from "./types.js";

export type WitnessRule = "none" | "civilian";

export interface CrimeDef {
  /** Stars added when the crime raises the level from 0. */
  stars: number;
  /** Stars added when the player is already wanted (0 = only resets the evasion timer). */
  starsWhenWanted: number;
  /** 'civilian': counts only if a ped/cop saw it or the player is already wanted; 'none': always counts. */
  witness: WitnessRule;
  /** Seconds during which repeats of this crime are ignored. */
  cooldown: number;
  /** Whether the crime position becomes a hot scene. */
  hotScene: boolean;
  /** Whether the crime is loud (larger witness radius). */
  loud: boolean;
}

export const CRIME_TABLE: Record<CrimeType, CrimeDef> = {
  assault: { stars: 1, starsWhenWanted: 0, witness: "civilian", cooldown: 0, hotScene: true, loud: false },
  murder: { stars: 1, starsWhenWanted: 2, witness: "civilian", cooldown: 0, hotScene: true, loud: true },
  carjacking: { stars: 1, starsWhenWanted: 0, witness: "civilian", cooldown: 0, hotScene: true, loud: false },
  armed_robbery: { stars: 2, starsWhenWanted: 2, witness: "none", cooldown: 0, hotScene: true, loud: true },
  burglary: { stars: 1, starsWhenWanted: 1, witness: "civilian", cooldown: 0, hotScene: true, loud: false },
  grand_theft_auto: { stars: 1, starsWhenWanted: 1, witness: "civilian", cooldown: 0, hotScene: true, loud: false },
  drug_deal: { stars: 1, starsWhenWanted: 0, witness: "civilian", cooldown: 0, hotScene: true, loud: false },
  hit_and_run: { stars: 1, starsWhenWanted: 0, witness: "civilian", cooldown: 8, hotScene: false, loud: false },
  resisting_arrest: { stars: 1, starsWhenWanted: 0, witness: "none", cooldown: 8, hotScene: false, loud: false },
  cop_assaulted: { stars: 1, starsWhenWanted: 0, witness: "none", cooldown: 8, hotScene: false, loud: false },
  cop_killed: { stars: 2, starsWhenWanted: 2, witness: "none", cooldown: 0, hotScene: true, loud: true },
  store_robbery: { stars: 2, starsWhenWanted: 2, witness: "none", cooldown: 0, hotScene: true, loud: true },
};

export const MAX_WANTED_LEVEL = 6;

export type CopWeapon = "pistol" | "smg" | "shotgun" | "rifle";

export interface DispatchTier {
  /** Police cruisers (2 cops each) kept in pursuit. */
  cruisers: number;
  /** SWAT vans (4 SWAT each). */
  swatVans: number;
  helicopters: number;
  roadblock: boolean;
  /** Roadblocks get a spike strip. */
  spikes: boolean;
  /** Foot cops per roadblock. */
  roadblockCops: number;
  copWeapon: CopWeapon;
  swatWeapon: CopWeapon;
  /** Cruisers ram the player's car. */
  ramming: boolean;
  /** Cops shoot instead of trying to arrest (unless provoked). */
  lethal: boolean;
  /** Added to every cop's accuracy at this tier. */
  accuracyBonus: number;
}

/** Response ladder indexed by wanted level (index 0 = not wanted). */
export const DISPATCH_TABLE: readonly DispatchTier[] = [
  { cruisers: 0, swatVans: 0, helicopters: 0, roadblock: false, spikes: false, roadblockCops: 0, copWeapon: "pistol", swatWeapon: "rifle", ramming: false, lethal: false, accuracyBonus: 0 },
  { cruisers: 1, swatVans: 0, helicopters: 0, roadblock: false, spikes: false, roadblockCops: 0, copWeapon: "pistol", swatWeapon: "rifle", ramming: false, lethal: false, accuracyBonus: 0 },
  { cruisers: 2, swatVans: 0, helicopters: 0, roadblock: false, spikes: false, roadblockCops: 0, copWeapon: "pistol", swatWeapon: "rifle", ramming: true, lethal: false, accuracyBonus: 0 },
  { cruisers: 3, swatVans: 0, helicopters: 0, roadblock: true, spikes: false, roadblockCops: 2, copWeapon: "smg", swatWeapon: "rifle", ramming: true, lethal: true, accuracyBonus: 0.05 },
  { cruisers: 3, swatVans: 1, helicopters: 1, roadblock: true, spikes: false, roadblockCops: 2, copWeapon: "shotgun", swatWeapon: "rifle", ramming: true, lethal: true, accuracyBonus: 0.08 },
  { cruisers: 4, swatVans: 2, helicopters: 2, roadblock: true, spikes: true, roadblockCops: 3, copWeapon: "shotgun", swatWeapon: "rifle", ramming: true, lethal: true, accuracyBonus: 0.12 },
  { cruisers: 4, swatVans: 3, helicopters: 2, roadblock: true, spikes: true, roadblockCops: 3, copWeapon: "rifle", swatWeapon: "rifle", ramming: true, lethal: true, accuracyBonus: 0.2 },
];

export function dispatchTier(level: number): DispatchTier {
  const idx = Math.max(0, Math.min(DISPATCH_TABLE.length - 1, Math.round(level)));
  return DISPATCH_TABLE[idx] ?? DISPATCH_TABLE[0]!;
}

/** Seconds between shots per weapon for NPC cops (cadence, not the weapon's true rpm). */
export const COP_FIRE_INTERVAL: Record<CopWeapon, number> = {
  pistol: 0.8,
  smg: 0.3,
  shotgun: 1.4,
  rifle: 0.45,
};

/** Seconds of the evasion timer each star level buys (base + per-level). */
export function evasionSecondsFor(level: number): number {
  return 20 + 20 * Math.max(0, level);
}
