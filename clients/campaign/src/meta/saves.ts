/**
 * Tasks 145-146: save manager and cloud sync status.
 *
 * Saves are PAX's lane (IndexedDB) — the manager is UI state plus the
 * narrow SaveTarget interface PAX implements. Copy/delete/list flow
 * through it; this module never touches storage.
 *
 * Cloud sync: status display only. The sync engine reports its state
 * through SyncTarget; this module renders it.
 */

import type { SaveEntry } from "./types.js";

/** Narrow interface PAX's save layer implements. */
export interface SaveTarget {
  list(): Promise<SaveEntry[]>;
  copy(id: string, name: string): Promise<SaveEntry>;
  remove(id: string): Promise<void>;
}

export interface SaveManager {
  saves(): SaveEntry[];
  refresh(target: SaveTarget): Promise<void>;
  copySelected(target: SaveTarget, id: string, name: string): Promise<SaveEntry>;
  deleteSelected(target: SaveTarget, id: string): Promise<void>;
  select(id: string | null): void;
  selected(): SaveEntry | null;
}

export function createSaveManager(): SaveManager {
  let saves: SaveEntry[] = [];
  let selectedId: string | null = null;
  return {
    saves: () => [...saves],
    async refresh(target) {
      saves = await target.list();
      if (selectedId && !saves.some((s) => s.id === selectedId)) selectedId = null;
    },
    async copySelected(target, id, name) {
      const copy = await target.copy(id, name);
      saves = [...saves, copy];
      return copy;
    },
    async deleteSelected(target, id) {
      await target.remove(id);
      saves = saves.filter((s) => s.id !== id);
      if (selectedId === id) selectedId = null;
    },
    select: (id) => {
      selectedId = id;
    },
    selected: () => saves.find((s) => s.id === selectedId) ?? null,
  };
}

export type SyncState = "idle" | "syncing" | "error" | "offline";

/** Narrow interface the sync engine implements. */
export interface SyncTarget {
  state(): SyncState;
  lastSyncedAt(): string | null;
  pendingCount(): number;
}

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: string | null;
  pending: number;
  summary: string;
}

export function syncStatus(target: SyncTarget): SyncStatus {
  const state = target.state();
  const lastSyncedAt = target.lastSyncedAt();
  const pending = target.pendingCount();
  const summary =
    state === "syncing"
      ? `Syncing ${pending} change${pending === 1 ? "" : "s"}…`
      : state === "error"
        ? "Sync failed — will retry."
        : state === "offline"
          ? "Offline — changes are stored locally."
          : lastSyncedAt
            ? `Synced ${lastSyncedAt}.`
            : "Nothing to sync yet.";
  return { state, lastSyncedAt, pending, summary };
}
