/**
 * Tests for the save/load screens.
 *
 * The screens own no storage: every test runs against PAX's real
 * `SaveManager` with an in-memory IndexedDB stub, so the suite covers
 * the UI layer's validation, error mapping, and slot-list shaping —
 * not a mock of the manager.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AUTOSAVE_ID,
  SaveManager,
  SaveScreens,
  SaveUiError,
  type SaveScreenDeps,
} from "../index";
import type { SimSnapshot } from "../../data/types";

function fakeSnapshot(day: number): SimSnapshot {
  return { schemaVersion: 1, day } as SimSnapshot;
}

/** Minimal in-memory IndexedDB stub (same shape PAX's own test uses). */
function installFakeIdb() {
  const stores = new Map<string, Map<string, { id: string }>>();

  interface FakeRequest {
    result?: unknown;
    onsuccess?: (() => void) | null;
    onerror?: (() => void) | null;
    error?: unknown;
  }
  const request = (run: (req: FakeRequest) => void): FakeRequest => {
    const req: FakeRequest = {};
    setTimeout(() => {
      run(req);
      req.onsuccess?.();
    }, 0);
    return req;
  };

  const fakeIdb = {
    open() {
      const req: FakeRequest = {};
      setTimeout(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          transaction() {
            if (!stores.has("slots")) stores.set("slots", new Map());
            const map = stores.get("slots")!;
            return {
              objectStore() {
                return {
                  get: (id: string) =>
                    request((r) => {
                      r.result = map.get(id);
                    }),
                  getAll: () =>
                    request((r) => {
                      r.result = [...map.values()];
                    }),
                  put: (value: { id: string }) =>
                    request((r) => {
                      map.set(value.id, value);
                      r.result = value.id;
                    }),
                  delete: (id: string) =>
                    request((r) => {
                      map.delete(id);
                      r.result = undefined;
                    }),
                };
              },
            };
          },
        };
        req.result = db;
        req.onsuccess?.();
      }, 0);
      return req;
    },
  };

  vi.stubGlobal("indexedDB", fakeIdb);
}

function deps(overrides: Partial<SaveScreenDeps> = {}): SaveScreenDeps {
  return {
    manager: new SaveManager(),
    currentSnapshot: () => fakeSnapshot(42),
    onLoad: () => {},
    ...overrides,
  };
}

function asFile(text: string): File {
  return { text: async () => text } as unknown as File;
}

describe("SaveScreens overview", () => {
  beforeEach(() => installFakeIdb());

  it("lists named slots newest-first with subtitles", async () => {
    const screens = new SaveScreens(deps());
    await screens.save("First");
    await screens.save("Second");
    const { named, autosave } = await screens.overview();
    expect(autosave).toBeNull();
    expect(named).toHaveLength(2);
    expect(named[0]!.name).toBe("Second");
    expect(named[1]!.name).toBe("First");
    expect(named[0]!.isAutosave).toBe(false);
    expect(named[0]!.subtitle).toContain("Day 42");
  });

  it("shows the autosave card when one exists", async () => {
    const manager = new SaveManager();
    await manager.autosave(fakeSnapshot(7));
    const screens = new SaveScreens(deps({ manager }));
    const { named, autosave } = await screens.overview();
    expect(named).toHaveLength(0);
    expect(autosave).not.toBeNull();
    expect(autosave!.id).toBe(AUTOSAVE_ID);
    expect(autosave!.isAutosave).toBe(true);
    expect(autosave!.subtitle).toContain("Day 7");
  });
});

describe("SaveScreens save", () => {
  beforeEach(() => installFakeIdb());

  it("refuses a blank name without touching storage", async () => {
    const screens = new SaveScreens(deps());
    await expect(screens.save("   ")).rejects.toBeInstanceOf(SaveUiError);
    const { named } = await screens.overview();
    expect(named).toHaveLength(0);
  });

  it("refuses an overlong name", async () => {
    const screens = new SaveScreens(deps());
    await expect(screens.save("x".repeat(61))).rejects.toThrow(
      "under 60 characters"
    );
  });

  it("saves and returns the slot card", async () => {
    const screens = new SaveScreens(deps());
    const card = await screens.save("Before the big battle");
    expect(card.name).toBe("Before the big battle");
    expect(card.day).toBe(42);
    const { named } = await screens.overview();
    expect(named.map((s) => s.name)).toContain("Before the big battle");
  });
});

describe("SaveScreens load", () => {
  beforeEach(() => installFakeIdb());

  it("loads a slot and hands the snapshot to the app", async () => {
    let loaded: SimSnapshot | null = null;
    const screens = new SaveScreens(
      deps({ onLoad: (s) => void (loaded = s) })
    );
    const card = await screens.save("My campaign");
    await screens.load(card.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.day).toBe(42);
  });

  it("fails readably for a missing slot", async () => {
    const screens = new SaveScreens(deps());
    await expect(screens.load("nope")).rejects.toThrow("gone");
  });
});

describe("SaveScreens remove", () => {
  beforeEach(() => installFakeIdb());

  it("deletes a named slot", async () => {
    const screens = new SaveScreens(deps());
    const card = await screens.save("Temporary");
    await screens.remove(card.id);
    const { named } = await screens.overview();
    expect(named).toHaveLength(0);
  });

  it("refuses to delete the autosave", async () => {
    const manager = new SaveManager();
    await manager.autosave(fakeSnapshot(3));
    const screens = new SaveScreens(deps({ manager }));
    await expect(screens.remove(AUTOSAVE_ID)).rejects.toThrow(
      "cannot be deleted"
    );
  });
});

describe("SaveScreens export/import", () => {
  beforeEach(() => installFakeIdb());

  it("export of a missing slot fails readably", async () => {
    const screens = new SaveScreens(deps());
    await expect(screens.exportSave("nope")).rejects.toBeInstanceOf(
      SaveUiError
    );
  });

  it("export downloads the slot file", async () => {
    const screens = new SaveScreens(deps());
    const card = await screens.save("Export me");

    const clicked: { href?: string; download?: string }[] = [];
    const anchor = {
      click: () => clicked.push({ href: anchor.href, download: anchor.download }),
      href: "",
      download: "",
      remove: () => {},
    };
    vi.stubGlobal("document", {
      createElement: () => anchor,
      body: { appendChild: () => {}, removeChild: () => {} },
    });
    const urls: string[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: (b: Blob) => {
        urls.push("blob:fake");
        void b;
        return "blob:fake";
      },
      revokeObjectURL: () => {},
    });
    // Blob exists in node; keep the real one.

    await screens.exportSave(card.id);
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toContain(".bcsave.json");
    expect(urls).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("import rejects a non-save file and writes nothing", async () => {
    const screens = new SaveScreens(deps());
    await expect(
      screens.importSave(asFile(JSON.stringify({ hello: "world" })))
    ).rejects.toThrow("not a bannerlord-clone save file");
    const { named } = await screens.overview();
    expect(named).toHaveLength(0);
  });

  it("import rejects malformed JSON", async () => {
    const screens = new SaveScreens(deps());
    await expect(screens.importSave(asFile("{{{nope"))).rejects.toThrow(
      "not valid JSON"
    );
  });

  it("import round-trips an exported payload", async () => {
    const screens = new SaveScreens(deps());
    const payload = JSON.stringify({
      format: "bannerlord-clone-save",
      version: 1,
      exportedAt: new Date().toISOString(),
      slot: {
        id: "old-id",
        name: "Imported glory",
        snapshot: { schemaVersion: 1, day: 99 },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        day: 99,
      },
    });
    const card = await screens.importSave(asFile(payload));
    expect(card.name).toBe("Imported glory");
    expect(card.day).toBe(99);
    const { named } = await screens.overview();
    expect(named.map((s) => s.name)).toContain("Imported glory");
  });
});
