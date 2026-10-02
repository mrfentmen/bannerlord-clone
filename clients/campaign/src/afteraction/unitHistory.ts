/**
 * Task 74: unit history log. Every battle appends an entry per participating
 * unit; the log grows across the campaign so a veteran's whole career is
 * readable. Pure append/query ops — persistence goes through UnitHistoryStore
 * (in-memory by default; the campaign layer supplies the saved-games-backed
 * one, since saves are Pax's lane).
 */

export interface UnitHistoryEntry {
  /** Campaign day of the battle. */
  day: number;
  battleLabel: string;
  kills: number;
  survived: boolean;
  /** Display name of the unit at the time, for the log line. */
  unitName: string;
}

export type UnitHistoryLog = Record<string, UnitHistoryEntry[]>;

export function createUnitHistoryLog(): UnitHistoryLog {
  return {};
}

/** Append one battle's entry for a unit. Entries stay in append order. */
export function appendHistory(log: UnitHistoryLog, unitId: string, entry: UnitHistoryEntry): void {
  const list = log[unitId] ?? [];
  list.push({ ...entry });
  log[unitId] = list;
}

/** All entries for a unit, oldest first. Empty when the unit has no history. */
export function historyFor(log: UnitHistoryLog, unitId: string): UnitHistoryEntry[] {
  return [...(log[unitId] ?? [])];
}

/** One-line career summary, e.g. for a tooltip. */
export function summarizeHistory(log: UnitHistoryLog, unitId: string): string {
  const entries = historyFor(log, unitId);
  if (entries.length === 0) return "No battles fought yet.";
  const kills = entries.reduce((sum, e) => sum + e.kills, 0);
  const survived = entries.filter((e) => e.survived).length;
  return `${entries.length} battle${entries.length === 1 ? "" : "s"}, ${kills} kills, survived ${survived}.`;
}

export interface UnitHistoryStore {
  load(): UnitHistoryLog;
  save(log: UnitHistoryLog): void;
}

/** In-memory store (tests, and the default until the campaign layer wires saves). */
export function createMemoryHistoryStore(initial: UnitHistoryLog = {}): UnitHistoryStore {
  let log: UnitHistoryLog = structuredClone(initial);
  return {
    load: () => structuredClone(log),
    save: (next) => {
      log = structuredClone(next);
    },
  };
}
