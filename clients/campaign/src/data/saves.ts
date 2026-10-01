/**
 * Browser-local campaign saves via IndexedDB.
 *
 * Locked architecture: saves live in the player's browser, not on the
 * server. Named slots, autosave, and export/import. No server-side world
 * storage, no Cloudflare storage bill.
 *
 * The snapshot payload is the `SimSnapshot` from the provider (the same
 * object the live game renders). The save manager does not interpret it;
 * it stores, lists, and returns it.
 */

import type { SimSnapshot } from "./types";

const DB_NAME = "bannerlord-clone-saves";
const DB_VERSION = 1;
const STORE_SLOTS = "slots";

/** Reserved slot id for the autosave. Never shown in the named-slot list. */
export const AUTOSAVE_ID = "__autosave";

export interface SaveSlot {
  /** Slot id. User-chosen for named slots, AUTOSAVE_ID for the autosave. */
  id: string;
  /** Display name. */
  name: string;
  /** The campaign snapshot. */
  snapshot: SimSnapshot;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  /** In-game day at save time, for the slot list subtitle. */
  day: number;
}

export interface SaveMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  day: number;
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
  fn: (store: IDBObjectStore) => IDBRequest<T>
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
 * Save manager. All methods are async; the DB is opened lazily and
 * cached for the session.
 */
export class SaveManager {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDb();
    }
    return this.dbPromise;
  }

  /** List named slots (excludes the autosave), newest first. */
  async listSlots(): Promise<SaveMetadata[]> {
    const db = await this.db();
    const all = await tx<SaveSlot[]>(db, "readonly", (store) => store.getAll());
    return all
      .filter((s) => s.id !== AUTOSAVE_ID)
      .map(({ id, name, createdAt, updatedAt, day }) => ({
        id,
        name,
        createdAt,
        updatedAt,
        day,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Load a slot's snapshot by id (named slot or AUTOSAVE_ID). */
  async loadSlot(id: string): Promise<SimSnapshot | null> {
    const db = await this.db();
    const slot = await tx<SaveSlot | undefined>(db, "readonly", (store) =>
      store.get(id)
    );
    return slot ? slot.snapshot : null;
  }

  /**
   * Write a named slot. Creates it if missing, overwrites if present.
   * The id is derived from the name (slugified); callers that need a
   * stable id should pass one explicitly.
   */
  async saveSlot(
    name: string,
    snapshot: SimSnapshot,
    id?: string
  ): Promise<SaveSlot> {
    const db = await this.db();
    const now = new Date().toISOString();
    const slotId =
      id ??
      (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
        `slot-${Date.now()}`);

    const existing = await tx<SaveSlot | undefined>(db, "readonly", (store) =>
      store.get(slotId)
    );

    const slot: SaveSlot = {
      id: slotId,
      name,
      snapshot,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      day: snapshot.day,
    };
    await tx(db, "readwrite", (store) => store.put(slot));
    return slot;
  }

  /** Delete a named slot. The autosave cannot be deleted, only overwritten. */
  async deleteSlot(id: string): Promise<void> {
    if (id === AUTOSAVE_ID) {
      throw new Error("The autosave slot cannot be deleted");
    }
    const db = await this.db();
    await tx(db, "readwrite", (store) => store.delete(id));
  }

  /** Write the autosave slot. Called on a timer by the game loop. */
  async autosave(snapshot: SimSnapshot): Promise<void> {
    const db = await this.db();
    const now = new Date().toISOString();
    const existing = await tx<SaveSlot | undefined>(db, "readonly", (store) =>
      store.get(AUTOSAVE_ID)
    );
    const slot: SaveSlot = {
      id: AUTOSAVE_ID,
      name: "Autosave",
      snapshot,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      day: snapshot.day,
    };
    await tx(db, "readwrite", (store) => store.put(slot));
  }

  /** Load the autosave snapshot, or null if none exists yet. */
  async loadAutosave(): Promise<SimSnapshot | null> {
    return this.loadSlot(AUTOSAVE_ID);
  }

  /**
   * Export a slot as a JSON file download. The file contains the slot
   * metadata plus the snapshot, so an import can restore the name.
   */
  async exportSlot(id: string): Promise<void> {
    const db = await this.db();
    const slot = await tx<SaveSlot | undefined>(db, "readonly", (store) =>
      store.get(id)
    );
    if (!slot) {
      throw new Error(`No save slot with id ${JSON.stringify(id)}`);
    }
    const payload = JSON.stringify(
      {
        format: "bannerlord-clone-save",
        version: 1,
        exportedAt: new Date().toISOString(),
        slot,
      },
      null,
      2
    );
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slot.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}.bcsave.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Import a previously exported save file. Validates the format marker
   * and the snapshot schema version before writing. Returns the slot
   * the snapshot was stored into.
   */
  async importSlot(file: File): Promise<SaveSlot> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Import failed: file is not valid JSON");
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { format?: string }).format !== "bannerlord-clone-save"
    ) {
      throw new Error(
        "Import failed: not a bannerlord-clone save file (bad format marker)"
      );
    }
    const slot = (parsed as { slot?: SaveSlot }).slot;
    if (!slot || typeof slot.snapshot !== "object" || slot.snapshot === null) {
      throw new Error("Import failed: save file has no snapshot");
    }
    const snapshot = slot.snapshot as SimSnapshot;
    if (typeof snapshot.schemaVersion !== "number") {
      throw new Error(
        "Import failed: snapshot has no schemaVersion (unsupported save)"
      );
    }
    // Store under a fresh id to avoid clobbering an existing slot.
    return this.saveSlot(slot.name || "Imported save", snapshot);
  }
}

/** Singleton for the app. Tests construct their own SaveManager. */
export const saves = new SaveManager();
