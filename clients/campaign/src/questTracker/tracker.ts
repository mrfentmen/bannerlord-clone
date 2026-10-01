/**
 * Quest tracker HUD model (MASTER_PLAN task 115).
 *
 * The quest journal (task 114) is the library; this module is the desk: up to
 * three pinned active quests, rendered as HUD rows with live objective counts
 * and the distance from the player's party to the quest's settlement. The
 * tracker owns no simulation and no map — it takes a `TrackerPositionSource`
 * that main.ts wires to the live snapshot and the world settlement index, so
 * this file stays pure and fully testable.
 */

import { objectivesDone, type Quest, type QuestStatus } from "../journal/index.js";

/** Acceptance: "3 pinned max". */
export const MAX_PINNED = 3;

export const PIN_STORAGE_KEY = "campaign.questTracker.pins.v1";

export interface PinStorage {
  load(): string[];
  save(pins: readonly string[]): void;
}

/**
 * localStorage-backed pin storage. Corrupt or blocked storage degrades to an
 * empty in-memory list instead of throwing, matching the other client stores.
 */
export function localStoragePinStorage(storage: Storage, key: string = PIN_STORAGE_KEY): PinStorage {
  return {
    load() {
      try {
        const raw = storage.getItem(key);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((p): p is string => typeof p === "string").slice(0, MAX_PINNED);
      } catch {
        return [];
      }
    },
    save(pins) {
      try {
        storage.setItem(key, JSON.stringify([...pins].slice(0, MAX_PINNED)));
      } catch {
        // Storage unavailable (private mode, quota): pins live for the session.
      }
    },
  };
}

export type PinResult = "pinned" | "full" | "inactive" | "missing" | "already";

/** Pin order is meaningful: the HUD lists pins in the order they were pinned. */
export class QuestTracker {
  private pins: string[];

  constructor(private readonly storage: PinStorage) {
    this.pins = storage.load();
  }

  /** Pinned quest ids, oldest pin first. */
  pinnedIds(): string[] {
    return [...this.pins];
  }

  isPinned(id: string): boolean {
    return this.pins.includes(id);
  }

  /**
   * Pin an active quest. `status` comes from the journal; the tracker never
   * reaches into the journal itself so tests can drive it without a store.
   */
  pin(id: string, status: QuestStatus | undefined): PinResult {
    if (this.pins.includes(id)) return "already";
    if (status === undefined) return "missing";
    if (status !== "active") return "inactive";
    if (this.pins.length >= MAX_PINNED) return "full";
    this.pins.push(id);
    this.persist();
    return "pinned";
  }

  unpin(id: string): boolean {
    const at = this.pins.indexOf(id);
    if (at < 0) return false;
    this.pins.splice(at, 1);
    this.persist();
    return true;
  }

  /**
   * Drop pins whose quests are gone or no longer active (completed/failed).
   * A finished quest leaves the tracker on its own — the player does not have
   * to remember to unpin it. Returns the ids that were dropped.
   */
  prune(quests: readonly Quest[]): string[] {
    const byId = new Map(quests.map((q) => [q.id, q]));
    const kept: string[] = [];
    const dropped: string[] = [];
    for (const id of this.pins) {
      const q = byId.get(id);
      if (q && q.status === "active") kept.push(id);
      else dropped.push(id);
    }
    if (dropped.length > 0) {
      this.pins = kept;
      this.persist();
    }
    return dropped;
  }

  private persist(): void {
    this.storage.save(this.pins);
  }
}

/** Map position in metres, matching the world's projection output. */
export interface MapPoint {
  x: number;
  z: number;
}

/**
 * Everything the tracker needs from the live client. Injected so the model
 * never touches the snapshot, the world index, or the scene directly.
 */
export interface TrackerPositionSource {
  /** The player's party position in metres, or null when it is unknown. */
  player(): MapPoint | null;
  /**
   * The map position of the named settlement in metres, or null when the
   * name cannot be resolved (fuzzy quest text, stale seed data).
   */
  settlement(name: string): MapPoint | null;
}

export interface PinnedQuestView {
  id: string;
  title: string;
  settlement: string;
  objectivesDone: number;
  objectivesTotal: number;
  daysLeft: number | null;
  /** Kilometres from the player to the quest settlement, or null when unknowable. */
  distanceKm: number | null;
}

/**
 * Build the HUD view models for the current pins, in pin order. Pins for
 * missing or non-active quests are skipped (call `prune` to persist that).
 * Distances are computed fresh on every call, so they are live by
 * construction — main.ts refreshes the HUD whenever the snapshot ticks.
 */
export function buildTrackerViews(
  quests: readonly Quest[],
  pins: readonly string[],
  source: TrackerPositionSource,
): PinnedQuestView[] {
  const byId = new Map(quests.map((q) => [q.id, q]));
  const player = source.player();
  const views: PinnedQuestView[] = [];
  for (const id of pins) {
    const q = byId.get(id);
    if (!q || q.status !== "active") continue;
    const target = q.settlement ? source.settlement(q.settlement) : null;
    const distanceKm =
      player && target ? Math.hypot(target.x - player.x, target.z - player.z) / 1000 : null;
    views.push({
      id: q.id,
      title: q.title,
      settlement: q.settlement,
      objectivesDone: objectivesDone(q),
      objectivesTotal: q.objectives.length,
      daysLeft: q.daysLeft,
      distanceKm,
    });
  }
  return views;
}

/** Human distance for the HUD: "—" when unknown, metres under 1 km, km above. */
export function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null || distanceKm < 0) return "—";
  const metres = distanceKm * 1000;
  if (metres < 1000) return `${Math.round(metres)} m`;
  if (distanceKm < 10) return `${distanceKm.toFixed(1)} km`;
  return `${Math.round(distanceKm)} km`;
}
