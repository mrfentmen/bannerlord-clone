/**
 * Battle map snapshots (Rowan solo task 49).
 *
 * After a battle, the final disposition of forces is captured as a data
 * snapshot — who stood where, who won — and saved as a journal entry in
 * localStorage. The journal is the player's battle history with the map
 * state attached.
 */

export interface MapSnapshotUnit {
  unitId: string;
  name: string;
  side: "player" | "enemy";
  x: number;
  z: number;
  survivors: number;
}

export interface BattleMapSnapshot {
  id: string;
  battleName: string;
  date: number;
  winner: "player" | "enemy";
  ticks: number;
  units: MapSnapshotUnit[];
  note: string;
}

const STORE_KEY = "campaign.battle-journal.v1";
const MAX_ENTRIES = 100;

/** Capture the final map state as a snapshot. */
export function captureSnapshot(
  battleName: string,
  winner: "player" | "enemy",
  ticks: number,
  units: MapSnapshotUnit[],
): BattleMapSnapshot {
  return {
    id: `snap-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    battleName,
    date: Date.now(),
    winner,
    ticks,
    units: units.map((u) => ({ ...u })),
    note: `${battleName}: ${winner === "player" ? "victory" : "defeat"} after ${ticks} ticks, ${units.length} units on the field.`,
  };
}

/** Save a snapshot to the battle journal. Returns all entries, newest first. */
export function saveSnapshot(snapshot: BattleMapSnapshot): BattleMapSnapshot[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const entries = raw ? (JSON.parse(raw) as BattleMapSnapshot[]) : [];
    entries.unshift(snapshot);
    const trimmed = entries.slice(0, MAX_ENTRIES);
    localStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch {
    return [snapshot];
  }
}

/** Journal entries, newest first. */
export function battleJournal(): BattleMapSnapshot[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
