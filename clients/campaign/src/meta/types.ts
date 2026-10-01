/**
 * Meta (MASTER_PLAN 3H, tasks 132-150): achievements, statistics,
 * leaderboards, challenge/ironman/sandbox modes, scenario editor, mod
 * support, credits, patch notes, feedback, profiler, debug console, save
 * manager, cloud sync status, accessibility audit, colorblind simulator,
 * UI scale preview, and master settings search.
 *
 * Saves live in PAX's lane and audio in Hana's — this module reaches them
 * through narrow interfaces (SaveTarget, SyncTarget) it does not implement.
 */

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Deed key the campaign layer reports, e.g. "win-10-battles". */
  deed: string;
}

export interface LifetimeStats {
  battlesWon: number;
  battlesLost: number;
  seasonsPlayed: number;
  coinEarned: number;
  treatiesSigned: number;
  schemesCompleted: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  season: number;
}

export interface Scenario {
  id: string;
  name: string;
  settlements: { id: string; name: string; x: number; y: number }[];
  factions: { id: string; name: string; home: string }[];
}

export interface ModInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
}

export interface SaveEntry {
  id: string;
  name: string;
  season: number;
  updatedAt: string;
}

export interface PatchNote {
  version: string;
  date: string;
  notes: string[];
}
