/**
 * Achievement store (MASTER_PLAN task 137).
 *
 * Counts recorded events per (type, matched fields) key, persists counts and
 * unlocks to localStorage, and notifies subscribers when definitions unlock.
 * The meta event `achievements.unlocked` is evaluated against the live
 * unlocked set after every record, in the same pass, without recursion.
 */

import { ACHIEVEMENT_DEFS } from "./catalog.js";
import type { AchievementDef, AchievementEvent, AchievementProgress } from "./types.js";

export const ACHIEVEMENTS_STORAGE_KEY = "fentmen.achievements.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Persisted {
  counts: Record<string, number>;
  unlocked: Record<string, number>;
}

function counterKey(type: string, fields?: Record<string, string>): string {
  if (!fields || Object.keys(fields).length === 0) return type;
  const pairs = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`);
  return `${type}|${pairs.join("|")}`;
}

function matches(def: AchievementDef, fields?: Record<string, string>): boolean {
  if (!def.match) return true;
  if (!fields) return false;
  return Object.entries(def.match).every(([k, v]) => fields[k] === v);
}

function load(storage: StorageLike): Persisted {
  try {
    const raw = storage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (!raw) return { counts: {}, unlocked: {} };
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    if (typeof parsed !== "object" || parsed === null) return { counts: {}, unlocked: {} };
    const counts: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed.counts ?? {})) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) counts[k] = Math.floor(v);
    }
    const unlocked: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed.unlocked ?? {})) {
      if (typeof v === "number" && Number.isFinite(v)) unlocked[k] = v;
    }
    return { counts, unlocked };
  } catch {
    return { counts: {}, unlocked: {} };
  }
}

export interface AchievementStore {
  /** Record an event; returns the defs newly unlocked by it. */
  record(type: string, fields?: Record<string, string>, n?: number): AchievementDef[];
  recordEvent(event: AchievementEvent): AchievementDef[];
  progress(id: string): AchievementProgress | undefined;
  allProgress(): AchievementProgress[];
  unlockedCount(): number;
  totalPoints(): number;
  onUnlock(fn: (defs: AchievementDef[]) => void): () => void;
  reset(): void;
}

export function createAchievementStore(storage: StorageLike, nowDay: () => number = () => 0): AchievementStore {
  let { counts, unlocked } = load(storage);
  const listeners = new Set<(defs: AchievementDef[]) => void>();

  function persist(): void {
    try {
      storage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify({ counts, unlocked }));
    } catch {
      // Storage full or unavailable: achievements keep working in memory.
    }
  }

  function evaluateMeta(newly: AchievementDef[]): void {
    const day = nowDay();
    const size = Object.keys(unlocked).length;
    for (const def of ACHIEVEMENT_DEFS) {
      if (def.event !== "achievements.unlocked" || unlocked[def.id] !== undefined) continue;
      if (size >= def.count) {
        unlocked[def.id] = day;
        newly.push(def);
      }
    }
  }

  function record(type: string, fields?: Record<string, string>, n = 1): AchievementDef[] {
    if (!Number.isFinite(n) || n <= 0) return [];
    const delta = Math.floor(n);
    // Count the event under its bare type and under its qualified key so both
    // overall defs and field-matched defs advance from one record call.
    const keys = new Set([counterKey(type), counterKey(type, fields)]);
    for (const key of keys) {
      counts[key] = (counts[key] ?? 0) + delta;
    }
    const newly: AchievementDef[] = [];
    const day = nowDay();
    for (const def of ACHIEVEMENT_DEFS) {
      if (def.event !== type || unlocked[def.id] !== undefined) continue;
      if (!matches(def, fields)) continue;
      const key = def.match ? counterKey(type, def.match) : counterKey(type);
      if ((counts[key] ?? 0) >= def.count) {
        unlocked[def.id] = day;
        newly.push(def);
      }
    }
    if (newly.length > 0) {
      evaluateMeta(newly);
      persist();
      for (const fn of listeners) fn(newly);
    } else {
      persist();
    }
    return newly;
  }

  return {
    record,
    recordEvent: (event) => record(event.type, event.fields, event.n ?? 1),

    progress(id: string): AchievementProgress | undefined {
      const def = ACHIEVEMENT_DEFS.find((d) => d.id === id);
      if (!def) return undefined;
      const key = def.match ? counterKey(def.event, def.match) : counterKey(def.event);
      const day = unlocked[def.id];
      return {
        def,
        current: Math.min(counts[key] ?? 0, def.count),
        unlocked: day !== undefined,
        ...(day !== undefined ? { unlockedDay: day } : {}),
      };
    },

    allProgress(): AchievementProgress[] {
      return ACHIEVEMENT_DEFS.map((def) => {
        const key = def.match ? counterKey(def.event, def.match) : counterKey(def.event);
        const day = unlocked[def.id];
        return {
          def,
          current: Math.min(counts[key] ?? 0, def.count),
          unlocked: day !== undefined,
          ...(day !== undefined ? { unlockedDay: day } : {}),
        };
      });
    },

    unlockedCount(): number {
      return Object.keys(unlocked).length;
    },

    totalPoints(): number {
      return Object.keys(unlocked).reduce((sum, id) => {
        const def = ACHIEVEMENT_DEFS.find((d) => d.id === id);
        return sum + (def?.points ?? 0);
      }, 0);
    },

    onUnlock(fn: (defs: AchievementDef[]) => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    reset(): void {
      counts = {};
      unlocked = {};
      persist();
    },
  };
}
