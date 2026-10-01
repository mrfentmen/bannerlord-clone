/**
 * Task 60: arena mode. A gladiator's record (wins, losses, streak, best)
 * persists in localStorage, and the crowd's excitement — a 0..1 level the
 * audio/visual pipelines read — scales with performance: win streaks and
 * kills per minute move it, losses cool it.
 *
 * Crowd noise itself is the audio pipeline's job (Hana's lane); this module
 * only publishes the level through `onCrowd`. Crowd visuals read the same
 * level from `crowdLevel()`.
 */

import type { BattleResult } from "./types.js";

const STORE_KEY = "campaign.arena.v1";

export interface ArenaRecord {
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  totalKills: number;
  bouts: number;
}

export interface Arena {
  record(): ArenaRecord;
  /** 0..1 crowd excitement right now. */
  crowdLevel(): number;
  onCrowd(fn: (level: number) => void): () => void;
  recordResult(result: BattleResult): void;
  reset(): void;
}

const EMPTY: ArenaRecord = { wins: 0, losses: 0, streak: 0, bestStreak: 0, totalKills: 0, bouts: 0 };

function load(): ArenaRecord {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...EMPTY };
    const v = JSON.parse(raw) as Partial<ArenaRecord>;
    return { ...EMPTY, ...v };
  } catch {
    return { ...EMPTY };
  }
}

export function createArena(): Arena {
  let rec = load();
  let excitement = 0.3;
  const listeners = new Set<(level: number) => void>();

  function save(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(rec));
    } catch {
      // Session-only record. Not worth interrupting the player.
    }
  }

  function setExcitement(next: number): void {
    excitement = Math.min(1, Math.max(0, next));
    for (const fn of listeners) fn(excitement);
  }

  return {
    record: () => ({ ...rec }),
    crowdLevel: () => excitement,
    onCrowd(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    recordResult(result) {
      rec.bouts += 1;
      rec.totalKills += result.playerKills;
      if (result.playerWon) {
        rec.wins += 1;
        rec.streak += 1;
        rec.bestStreak = Math.max(rec.bestStreak, rec.streak);
        // Streaks electrify; a fast bout (kills per minute) adds more.
        const kpm = result.durationS ? result.playerKills / (result.durationS / 60) : 0;
        setExcitement(excitement + 0.12 + Math.min(0.2, kpm / 50) + Math.min(0.25, rec.streak * 0.05));
      } else {
        rec.losses += 1;
        rec.streak = 0;
        setExcitement(excitement - 0.25);
      }
      save();
    },
    reset() {
      rec = { ...EMPTY };
      setExcitement(0.3);
      save();
    },
  };
}
