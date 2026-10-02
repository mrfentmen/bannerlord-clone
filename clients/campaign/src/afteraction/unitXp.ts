/**
 * Unit XP display in after-action (Rowan solo task 26).
 *
 * After a battle, each surviving unit earns XP: a base award for fighting,
 * a bonus per kill, and a victory bonus. XP feeds the unit's level (100 XP
 * per level). The after-action report lists per-unit gains. Pure math; the
 * report screen renders the list.
 */

export interface XpUnit {
  id: string;
  name: string;
  /** Kills credited to the unit this battle. */
  kills: number;
  /** Whether the unit survived. The fallen earn nothing. */
  survived: boolean;
  /** XP carried into the battle. */
  xpBefore: number;
}

export interface XpGain {
  unitId: string;
  name: string;
  xpBefore: number;
  xpGained: number;
  xpAfter: number;
  levelBefore: number;
  levelAfter: number;
  /** True when the unit leveled up this battle. */
  leveledUp: boolean;
}

/** Base XP for surviving a battle. */
export const XP_BASE = 20;
/** XP per kill. */
export const XP_PER_KILL = 8;
/** Bonus XP for the winning side. */
export const XP_VICTORY_BONUS = 15;
/** XP needed per level. */
export const XP_PER_LEVEL = 100;

export function xpForLevel(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

/**
 * Compute per-unit XP gains. Deterministic. The fallen earn nothing;
 * survivors get base + kills + victory bonus.
 */
export function awardUnitXp(units: XpUnit[], playerWon: boolean): XpGain[] {
  return units.map((u) => {
    const xpGained = u.survived
      ? XP_BASE + u.kills * XP_PER_KILL + (playerWon ? XP_VICTORY_BONUS : 0)
      : 0;
    const xpAfter = u.xpBefore + xpGained;
    const levelBefore = xpForLevel(u.xpBefore);
    const levelAfter = xpForLevel(xpAfter);
    return {
      unitId: u.id,
      name: u.name,
      xpBefore: u.xpBefore,
      xpGained,
      xpAfter,
      levelBefore,
      levelAfter,
      leveledUp: levelAfter > levelBefore,
    };
  });
}

/** One-line summary per unit for the after-action report. */
export function xpGainLine(gain: XpGain): string {
  const base = `${gain.name}: +${gain.xpGained} XP`;
  return gain.leveledUp ? `${base} — LEVEL UP (${gain.levelBefore} → ${gain.levelAfter})` : base;
}
