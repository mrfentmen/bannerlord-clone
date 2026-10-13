/**
 * Browser-local storage for server save files.
 *
 * This replaces the snapshot store the save screen used to sit on. The old
 * store kept a `SimSnapshot` per slot, which is the periodic record the server
 * publishes for the client to draw — it has no RNG state, no cause log, no
 * roster and no bandit runtime, so a "load" out of it could not have restored a
 * campaign. Now a slot holds the save file the server actually wrote, verbatim,
 * and loading a slot posts those bytes back to `POST /v1/load`.
 *
 * The payload is opaque on purpose. This module never parses it, never
 * re-serialises it, and never edits a field: a save file that has been through
 * a round trip through `JSON.parse`/`JSON.stringify` is a save file the server
 * has never seen, and the whole value of the format is that it restores
 * byte-for-byte. Validation lives in `server.ts`, at the point where a file is
 * about to be used.
 *
 * Why IndexedDB and not localStorage: a campaign save is larger than the ~5 MB
 * string quota, and it is binary-ish structured data that structured-clones
 * without a serialise step. That is the same reason the previous store used it,
 * and the database name and version are left where they were so a player who
 * already has campaigns keeps them — the old rows are simply never read again,
 * because they hold snapshots and this store needs save files.
 */

/** Reserved slot id for the autosave. Never listed among the player's own slots. */
export const AUTOSAVE_ID = "__autosave";

const DB_NAME = "bannerlord-clone-saves";
const DB_VERSION = 1;
const STORE_SLOTS = "slots";

/** What one stored slot looks like. */
export interface StoredSlot {
  id: string;
  name: string;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  /** In-game day at save time, for the slot list subtitle. */
  day: number;
  /** The save file, exactly as the server wrote it. */
  payload: string;
}

/** A slot list row. Deliberately carries no payload, so listing stays cheap. */
export interface SlotSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  day: number;
  bytes: number;
}

/**
 * The whole surface the screens layer needs from storage.
 *
 * An interface rather than a concrete class so a test can hold real save-file
 * strings without standing up IndexedDB, and so the autosave path is the same
 * code as the manual path.
 */
export interface SlotStore {
  /** Named slots, newest first. Never includes the autosave. */
  list(): Promise<SlotSummary[]>;
  /** One slot including its payload, or null. Accepts the autosave id. */
  read(id: string): Promise<StoredSlot | null>;
  /** Write a slot. Overwrites by id, keeping the original `createdAt`. */
  write(slot: Omit<StoredSlot, "createdAt" | "updatedAt"> & { createdAt?: string }): Promise<StoredSlot>;
  remove(id: string): Promise<void>;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SLOTS)) {
        db.createObjectStore(STORE_SLOTS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function tx<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_SLOTS, mode);
    const store = transaction.objectStore(STORE_SLOTS);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

/**
 * A monotonic suffix for names that slugify to nothing.
 *
 * A counter, not `Date.now()`. Two names with no ASCII in them saved inside the
 * same millisecond would otherwise produce the same id, and the second save
 * would silently overwrite the first — the failure mode a player only discovers
 * when the campaign they thought they kept is gone.
 */
let anonymousSlotSeq = 0;

/**
 * Turn a name into a stable slot id.
 *
 * The same rule the old store used, kept so a player's existing slot ids, and
 * the exports they already have on disk, still name the same thing. A name that
 * slugifies to nothing (all punctuation, or non-Latin script) gets a counted id
 * instead of an empty one, because an empty id is not a slot.
 */
export function slugifySlotId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug) return slug;
  anonymousSlotSeq += 1;
  return `slot-${anonymousSlotSeq}`;
}

export class IndexedDbSlotStore implements SlotStore {
  #dbPromise: Promise<IDBDatabase> | null = null;

  #db(): Promise<IDBDatabase> {
    if (!this.#dbPromise) this.#dbPromise = openDb();
    return this.#dbPromise;
  }

  async list(): Promise<SlotSummary[]> {
    const db = await this.#db();
    const all = await tx<StoredSlot[]>(db, "readonly", (store) => store.getAll());
    return all
      .filter((s) => s.id !== AUTOSAVE_ID)
      .map(({ id, name, createdAt, updatedAt, day, payload }) => ({
        id,
        name,
        createdAt,
        updatedAt,
        day,
        bytes: payload.length,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async read(id: string): Promise<StoredSlot | null> {
    const db = await this.#db();
    const slot = await tx<StoredSlot | undefined>(db, "readonly", (store) => store.get(id));
    if (!slot || typeof slot.payload !== "string") return null;
    return slot;
  }

  async write(
    slot: Omit<StoredSlot, "createdAt" | "updatedAt"> & { createdAt?: string },
  ): Promise<StoredSlot> {
    const db = await this.#db();
    const now = new Date().toISOString();
    const existing = await tx<StoredSlot | undefined>(db, "readonly", (store) => store.get(slot.id));
    const record: StoredSlot = {
      id: slot.id,
      name: slot.name,
      day: slot.day,
      payload: slot.payload,
      createdAt: slot.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now,
    };
    await tx(db, "readwrite", (store) => store.put(record));
    return record;
  }

  async remove(id: string): Promise<void> {
    if (id === AUTOSAVE_ID) {
      throw new Error("The autosave slot cannot be deleted");
    }
    const db = await this.#db();
    await tx(db, "readwrite", (store) => store.delete(id));
  }
}