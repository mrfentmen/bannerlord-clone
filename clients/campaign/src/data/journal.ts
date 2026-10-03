/**
 * The campaign journal (mandate §8).
 *
 * A persistent, readable history of the campaign: battles and sieges from the
 * simulation's own notifications (in the sim's own words), plus the player's own
 * milestones (completed objectives). Entries are journaled once — by notification id
 * or objective id — and persisted across sessions, so a 20-hour campaign reads back
 * as a story.
 *
 * The journal never rewrites the sim's sentences and never invents entries. A day
 * number is the simulation's own day-of-year; ordering is by journaling sequence,
 * which is chronological because notifications arrive chronologically.
 */

import type { SimSnapshot } from "./types.js";

export type JournalKind = "battle" | "siege" | "objective";

export interface JournalEntry {
  /** Stable dedupe key: the notification id, or `objective:<id>`. */
  id: string;
  /** The simulation's day-of-year when it happened. */
  day: number;
  text: string;
  kind: JournalKind;
  /** Journaling order; larger is later. */
  seq: number;
}

export interface JournalStore {
  entries: JournalEntry[];
  nextSeq: number;
}

/**
 * Journal new battle/siege notifications and newly-completed objectives.
 *
 * Returns the updated store. Entries already journaled (by id) are skipped, so this
 * is safe to run on every tick.
 */
export function syncJournal(
  store: JournalStore,
  notifications: SimSnapshot["notifications"],
  completedObjectiveTitles: { id: string; title: string }[],
): JournalStore {
  const seen = new Set(store.entries.map((e) => e.id));
  const entries = [...store.entries];
  let seq = store.nextSeq;
  let added = false;
  for (const n of notifications) {
    if (n.kind !== "battle" && n.kind !== "siege") continue;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    added = true;
    entries.push({ id: n.id, day: n.day, text: n.text, kind: n.kind, seq: seq++ });
  }
  for (const objective of completedObjectiveTitles) {
    const id = `objective:${objective.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    added = true;
    entries.push({
      id,
      day: -1, // the completion day is not tracked; the entry carries no day rather than a wrong one
      text: `Completed objective: ${objective.title}.`,
      kind: "objective",
      seq: seq++,
    });
  }
  // A journal that grows forever is a memory leak with a nice cover. 200 entries is
  // more story than any session needs; oldest goes first.
  if (!added) return store;
  const trimmed = entries.length > 200 ? entries.slice(entries.length - 200) : entries;
  return { entries: trimmed, nextSeq: seq };
}

/** Newest first, for reading. */
export function journalByRecency(store: JournalStore): JournalEntry[] {
  return [...store.entries].sort((a, b) => b.seq - a.seq);
}

const STORAGE_KEY = "blc-journal-v1";

/** Load the persisted journal. Corrupt or missing storage starts empty. */
export function loadJournalStore(): JournalStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [], nextSeq: 0 };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { entries: [], nextSeq: 0 };
    const { entries, nextSeq } = parsed as { entries?: unknown; nextSeq?: unknown };
    const clean = Array.isArray(entries)
      ? entries.filter(
          (e): e is JournalEntry =>
            typeof e === "object" &&
            e !== null &&
            typeof (e as JournalEntry).id === "string" &&
            typeof (e as JournalEntry).text === "string" &&
            typeof (e as JournalEntry).seq === "number",
        )
      : [];
    return {
      entries: clean,
      nextSeq: typeof nextSeq === "number" ? nextSeq : clean.length,
    };
  } catch {
    return { entries: [], nextSeq: 0 };
  }
}

/** Persist the journal. Storage failures degrade to per-session history. */
export function saveJournalStore(store: JournalStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // The journal keeps working for this session; nothing the player needs to know.
  }
}
