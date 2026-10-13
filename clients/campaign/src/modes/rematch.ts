/**
 * Quick battle rematch (Rowan solo task 39).
 *
 * Remembers the last launched battle setup in localStorage. One call —
 * rematch() — returns the same setup (forces, biome, modifiers) with a
 * fresh seed, ready to launch again. Pass false to replay the exact seed.
 */

import type { BattleConfig } from "./types.js";

const STORE_KEY = "campaign.last-battle.v1";

/** Remember a battle setup for rematch. Call when launching any battle. */
export function rememberBattle(config: BattleConfig): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(config));
  } catch {
    // Rematch unavailable this session. Not worth interrupting the player.
  }
}

/** The last remembered setup, or null. */
export function lastBattle(): BattleConfig | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as BattleConfig;
    if (!v.player || !v.enemy || typeof v.seed !== "number") return null;
    return v;
  } catch {
    return null;
  }
}

/** True when a rematch is available. */
export function canRematch(): boolean {
  return lastBattle() !== null;
}

/**
 * One-click rematch: the same setup with a fresh seed (same seed when
 * freshSeed is false). Returns null when nothing was remembered.
 */
export function rematch(freshSeed = true): BattleConfig | null {
  const last = lastBattle();
  if (!last) return null;
  return {
    ...last,
    seed: freshSeed ? Math.floor(Math.random() * 2 ** 31) : last.seed,
  };
}
