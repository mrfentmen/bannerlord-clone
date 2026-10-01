/**
 * Ironman mode (MASTER_PLAN task 143): one autosave, no manual saves, death is final.
 *
 * This module owns the run record and the rules. It does not own the save
 * format — that is PAX's lane (IndexedDB slots) — and it does not own the
 * battle sim, which is milo's lane. What it does:
 *
 * - persist which campaign is the ironman run, so a crash or reload cannot
 *   quietly convert it into a reloadable one;
 * - answer the two questions the app shell asks: may the player save by hand
 *   (`manualSaveBlocked`), and may a dead run be continued (`canContinue`);
 * - derive the season count from the day, so nothing has to remember to tick.
 *
 * Honest boundary: "death is final" needs a ruler-death signal from the sim.
 * The wire (`data/types.ts`) exposes no dead/alive flag on any ruler the
 * client can watch, so nothing in the client can mark a run dead on its own
 * yet. The record carries `dead` and `markRunDead` so the rule engine is
 * ready the moment PAX adds that signal — until then the badge, the
 * single-autosave save UI, and the no-manual-saves rule are the shipped
 * behavior, and the header on the dead path says so rather than faking it.
 */

export interface IronmanRunRecord {
  /** A run was started and has not been retired. */
  active: boolean;
  /** The ruler died without an heir; the run is over. Set by `markRunDead`. */
  dead: boolean;
  /** In-game day the run started, for season math. */
  startedDay: number;
}

const STORAGE_KEY = "fentmen.ironman.v1";

/** A 90-day year, matching the chronicle's seasons (`seasonForDay` in main.ts). */
export const IRONMAN_SEASON_DAYS = 90;

function resolveStorage(provided?: Storage): Storage | null {
  if (provided) return provided;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is IronmanRunRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.active === "boolean" &&
    typeof r.dead === "boolean" &&
    typeof r.startedDay === "number" &&
    Number.isFinite(r.startedDay)
  );
}

/**
 * Read the persisted run. Returns null when there is none, when storage is
 * blocked, or when the stored bytes are corrupt — a corrupt record must never
 * lock the player out of a fresh campaign.
 */
export function loadIronmanRun(provided?: Storage): IronmanRunRecord | null {
  const storage = resolveStorage(provided);
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persist(storage: Storage | null, record: IronmanRunRecord | null): void {
  if (!storage) return;
  try {
    if (record) storage.setItem(STORAGE_KEY, JSON.stringify(record));
    else storage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage (private mode, quota): the run lives for the session.
  }
}

/** Start a run on the given in-game day. Persists immediately. */
export function startIronmanRun(day: number, provided?: Storage): IronmanRunRecord {
  const storage = resolveStorage(provided);
  const record: IronmanRunRecord = { active: true, dead: false, startedDay: day };
  persist(storage, record);
  return record;
}

/** Mark the run dead (ruler died without an heir). Persists immediately. */
export function markRunDead(record: IronmanRunRecord, provided?: Storage): IronmanRunRecord {
  const next: IronmanRunRecord = { ...record, dead: true };
  persist(resolveStorage(provided), next);
  return next;
}

/** Retire the run record entirely (a new non-ironman campaign starts). */
export function clearIronmanRun(provided?: Storage): void {
  persist(resolveStorage(provided), null);
}

/**
 * No manual saves for the whole run — live or dead. A dead run cannot
 * continue at all (see `canContinue`); ironman means death is final, so a
 * dead run must not be savable either.
 */
export function manualSaveBlocked(record: IronmanRunRecord | null): boolean {
  return record !== null && record.active;
}

/**
 * Whether the campaign may continue. A dead run may not — this is the hook
 * the future ruler-death signal feeds; today it is only reachable in tests
 * and through `markRunDead`.
 */
export function canContinue(record: IronmanRunRecord | null): boolean {
  return record === null || !record.dead;
}

/** Whole seasons since the run started, derived from the day. Never negative. */
export function seasonsElapsed(record: IronmanRunRecord, day: number): number {
  return Math.max(0, Math.floor((day - record.startedDay) / IRONMAN_SEASON_DAYS));
}
