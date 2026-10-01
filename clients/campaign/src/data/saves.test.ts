/**
 * Tests for the IndexedDB save manager.
 *
 * Uses fake-indexeddb if available, else skips. The tests exercise the
 * slot lifecycle: save, list, load, autosave, delete, export/import
 * validation. They do not touch the network or the real game.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { SaveManager, AUTOSAVE_ID } from "./saves";
import type { SimSnapshot } from "./types";

function fakeSnapshot(day: number): SimSnapshot {
  return {
    schemaVersion: 1,
    day,
    year: 1950,
    eraTier: 1,
  } as SimSnapshot;
}

// Minimal in-memory IndexedDB stub for the test environment.
function installFakeIdb() {
  const stores = new Map<string, Map<string, unknown>>();

  const fakeIdb = {
    open(_name: string, _version: number) {
      const req: Record<string, unknown> = {};
      setTimeout(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          transaction(_store: string, _mode: string) {
            if (!stores.has("slots")) stores.set("slots", new Map());
            const map = stores.get("slots")!;
            return {
              objectStore(_name: string) {
                return {
                  get(id: string) {
                    const r: Record<string, unknown> = {};
                    setTimeout(() => {
                      r.result = map.get(id);
                      (r.onsuccess as () => void)?.();
                    }, 0);
                    return r;
                  },
                  getAll() {
                    const r: Record<string, unknown> = {};
                    setTimeout(() => {
                      r.result = [...map.values()];
                      (r.onsuccess as () => void)?.();
                    }, 0);
                    return r;
                  },
                  put(value: { id: string }) {
                    const r: Record<string, unknown> = {};
                    setTimeout(() => {
                      map.set(value.id, value);
                      (r.onsuccess as () => void)?.();
                    }, 0);
                    return r;
                  },
                  delete(id: string) {
                    const r: Record<string, unknown> = {};
                    setTimeout(() => {
                      map.delete(id);
                      (r.onsuccess as () => void)?.();
                    }, 0);
                    return r;
                  },
                };
              },
            };
          },
        };
        Object.defineProperty(req, "result", { value: db });
        if (typeof req.onsuccess === "function") req.onsuccess.call(req);
      }, 0);
      return req;
    },
  };

  vi.stubGlobal("indexedDB", fakeIdb);
}

describe("SaveManager", () => {
  beforeEach(() => {
    installFakeIdb();
  });

  it("saves and loads a named slot", async () => {
    const mgr = new SaveManager();
    const slot = await mgr.saveSlot("My Campaign", fakeSnapshot(42));
    expect(slot.name).toBe("My Campaign");
    expect(slot.day).toBe(42);

    const loaded = await mgr.loadSlot(slot.id);
    expect(loaded?.day).toBe(42);
  });

  it("lists named slots newest-first, excluding the autosave", async () => {
    const mgr = new SaveManager();
    await mgr.saveSlot("First", fakeSnapshot(10));
    await mgr.saveSlot("Second", fakeSnapshot(20));
    await mgr.autosave(fakeSnapshot(30));

    const slots = await mgr.listSlots();
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.id !== AUTOSAVE_ID)).toBe(true);
    expect(slots[0]?.name).toBe("Second");
  });

  it("autosave writes and loads independently of named slots", async () => {
    const mgr = new SaveManager();
    await mgr.autosave(fakeSnapshot(99));
    const loaded = await mgr.loadAutosave();
    expect(loaded?.day).toBe(99);

    // Autosave does not appear in the named-slot list.
    const slots = await mgr.listSlots();
    expect(slots).toHaveLength(0);
  });

  it("deletes a named slot but refuses to delete the autosave", async () => {
    const mgr = new SaveManager();
    const slot = await mgr.saveSlot("Temp", fakeSnapshot(5));
    await mgr.deleteSlot(slot.id);
    expect(await mgr.loadSlot(slot.id)).toBeNull();

    await expect(mgr.deleteSlot(AUTOSAVE_ID)).rejects.toThrow(
      /cannot be deleted/
    );
  });

  it("importSlot rejects non-save files", async () => {
    const mgr = new SaveManager();
    const bad = new File(["not json"], "bad.json", {
      type: "application/json",
    });
    await expect(mgr.importSlot(bad)).rejects.toThrow(/not valid JSON/);

    const wrongFormat = new File(
      [JSON.stringify({ format: "something-else" })],
      "wrong.json",
      { type: "application/json" }
    );
    await expect(mgr.importSlot(wrongFormat)).rejects.toThrow(
      /not a bannerlord-clone save file/
    );
  });

  it("importSlot round-trips an exported-shaped payload", async () => {
    const mgr = new SaveManager();
    const payload = {
      format: "bannerlord-clone-save",
      version: 1,
      exportedAt: new Date().toISOString(),
      slot: {
        id: "old-id",
        name: "Exported",
        snapshot: fakeSnapshot(77),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        day: 77,
      },
    };
    const file = new File([JSON.stringify(payload)], "save.bcsave.json", {
      type: "application/json",
    });
    const slot = await mgr.importSlot(file);
    expect(slot.name).toBe("Exported");
    // Stored under a fresh id, not the exported one.
    expect(slot.id).not.toBe("old-id");
    const loaded = await mgr.loadSlot(slot.id);
    expect(loaded?.day).toBe(77);
  });
});
