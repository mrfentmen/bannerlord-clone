/**
 * Remembering what this side has found, across sessions.
 *
 * The simulation is the authority on visibility and this file does not pretend
 * otherwise. It stores exactly one thing: the set of settlement ids this client has
 * *seen* the server say were visible or known. On the next session it offers that set
 * back as a floor, so a town that was found yesterday is grey rather than absent today.
 *
 * Why a floor rather than an override, and why it can only ever move a town *up*:
 *
 *   A remembered floor says "you found this once". It never says "you can see it now",
 *   because that would be a claim about the present the client has no standing to make.
 *   So a floor moves `unseen` to `remembered` and does nothing else. It cannot make a
 *   remembered town visible, cannot un-see a town the server says is in sight, and
 *   cannot hide a town the server has never heard of.
 *
 * That direction is the whole safety property, and it is why `applyRememberedFloor`
 * takes the server's answer as its argument rather than the other way round. A local
 * store is editable by whoever has the browser; a store that could raise a town to
 * `visible` would be a store that could hand the player a spyglass. A store that can
 * only add grey is a convenience and nothing more.
 *
 * Storage is `localStorage`, behind the same try/catch the UI scale uses in `main.ts`:
 * a browser with storage disabled gets a working session and no memory, which is a
 * smaller loss than a campaign that refuses to start.
 */

import type { TownVisibility } from "./types.js";

/** Bumped when the stored shape changes. A mismatch discards rather than misreads. */
export const FOG_MEMORY_VERSION = 1;

/**
 * The key is per-side.
 *
 * Two different sides have genuinely different knowledge, and sharing one store between
 * them would mean switching sides makes towns you had not found appear grey. The region
 * is in the key for the same reason: this client can be pointed at a different survey,
 * and settlement ids from one region mean nothing in another.
 */
export function fogMemoryKey(sideId: string, regionName: string): string {
  return `campaign.fog.v${FOG_MEMORY_VERSION}.${regionName}.${sideId}`;
}

/** What is stored. A set of ids, and the day they were last written. */
interface StoredMemory {
  version: number;
  /** Ids this client has seen the server place in `visible` or `known`. */
  found: string[];
  /** In-game day of the last write. Display only; never read for a decision. */
  day: number;
}

/**
 * Read a stored memory.
 *
 * Every failure returns an empty set rather than throwing, because there is no reading
 * of a corrupt store that is worth interrupting a campaign over. A wrong memory would
 * show a town grey that should be absent, which is a cosmetic regression; a thrown
 * error is a dead client.
 */
export function loadRemembered(storage: Storage | null, key: string): ReadonlySet<string> {
  if (!storage) return new Set<string>();
  try {
    const raw = storage.getItem(key);
    if (!raw) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return new Set<string>();
    const record = parsed as Partial<StoredMemory>;
    // A version mismatch means the shape moved under us. Throwing the old data away is
    // the only safe reading: guessing at a shape we no longer understand could mark a
    // town found that was never found.
    if (record.version !== FOG_MEMORY_VERSION) return new Set<string>();
    if (!Array.isArray(record.found)) return new Set<string>();
    return new Set(record.found.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set<string>();
  }
}

/**
 * Write a memory.
 *
 * Takes the ids to remember rather than the states, so the caller cannot accidentally
 * persist a state. The store holds "found", never "seen" — the distinction is the
 * safety property above, and making the type only able to say "found" means a caller
 * cannot widen it by accident.
 *
 * Returns whether the write happened, so a caller can tell a disabled store from an
 * empty one. Nothing branches on it today; the panel may.
 */
export function saveRemembered(
  storage: Storage | null,
  key: string,
  ids: ReadonlySet<string>,
  day: number,
): boolean {
  if (!storage) return false;
  try {
    const record: StoredMemory = { version: FOG_MEMORY_VERSION, found: [...ids], day };
    storage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    // Quota, or storage disabled mid-session. The session still works.
    return false;
  }
}

/**
 * The ids to write, from a reading of the map.
 *
 * Only the two states that mean "this side has been here": `visible` and `remembered`.
 * A town the server has already called `unseen` contributes nothing, because the only
 * way it could be in that state while being remembered here is if the server has said
 * something the client is not allowed to overrule.
 */
export function foundIds(states: ReadonlyMap<string, TownVisibility>): ReadonlySet<string> {
  const found = new Set<string>();
  for (const [id, state] of states) {
    if (state === "visible" || state === "remembered") found.add(id);
  }
  return found;
}

/**
 * Apply a remembered floor to a reading of the map.
 *
 * Only ever moves a town from `unseen` to `remembered`. `visible` is left alone because
 * the server's answer is better than anything stored locally, and `remembered` is left
 * alone because it is already the answer the floor would give.
 *
 * A settlement missing from `states` is *not* given a floor. The floor upgrades what the
 * server has said something about; a settlement it has said nothing about is not
 * "unseen", it is unmentioned, and the caller draws those in full for a separate reason
 * (`visibilityFor` in `main.ts`). Folding them together would hide most of the region
 * from a player who has done nothing, which is the exact failure `UNSEEN_POLICY`'s
 * neighbour comments keep warning about.
 *
 * Returns a new map. The input is never mutated, so a caller holding the pre-floor
 * reading — for the data-source panel's census, say — still has it.
 */
export function applyRememberedFloor(
  states: ReadonlyMap<string, TownVisibility>,
  remembered: ReadonlySet<string>,
): ReadonlyMap<string, TownVisibility> {
  if (remembered.size === 0) return states;
  let changed = false;
  const out = new Map(states);
  for (const id of remembered) {
    // Membership-only: a settlement absent from `states` is not "unseen", it is
    // unmentioned, and giving it a floor here would invent a state the server never sent.
    if (!out.has(id)) continue;
    if (out.get(id) !== "unseen") continue;
    out.set(id, "remembered");
    changed = true;
  }
  return changed ? out : states;
}