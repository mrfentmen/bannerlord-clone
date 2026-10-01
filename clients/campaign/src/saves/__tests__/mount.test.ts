/**
 * @vitest-environment jsdom
 *
 * Tests for the save/load panel mount (DOM layer).
 *
 * The panel is built over the real SaveScreens + the real SaveManager with
 * an in-memory IndexedDB stub, so these tests cover the mount's own logic:
 * rendering, error surfacing, two-step delete, the autosave no-delete rule,
 * and the export/import triggers. No mock of the manager.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SaveManager, saveLoadPanel } from "../index";
import type { SimSnapshot } from "../../data/types";

function fakeSnapshot(day: number): SimSnapshot {
  return { schemaVersion: 1, day } as SimSnapshot;
}

async function settle(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
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
      if (typeof req.onsuccess === "function") req.onsuccess.call(req);
    }, 0);
    return req;
  };

  vi.stubGlobal("indexedDB", {
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
        Object.defineProperty(req, "result", { value: db });
        if (typeof req.onsuccess === "function") req.onsuccess.call(req);
      }, 0);
      return req;
    },
  });
}

function mount(
  opts: {
    manager?: SaveManager;
    onLoad?: (s: SimSnapshot) => void | Promise<void>;
    ironmanActive?: boolean;
  } = {},
) {
  const panel = saveLoadPanel({
    ...(opts.manager ? { manager: opts.manager } : {}),
    currentSnapshot: () => fakeSnapshot(42),
    onLoad: opts.onLoad ?? (() => {}),
    ...(opts.ironmanActive ? { ironmanActive: true } : {}),
  });
  document.body.appendChild(panel.root);
  return panel;
}

function byTestId(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector(`[data-testid="${id}"]`);
}

describe("saveLoadPanel", () => {
  beforeEach(() => installFakeIdb());
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the save row, slot list, and import controls", async () => {
    const { root } = mount();
    await settle();
    expect(root.getAttribute("data-testid")).toBe("save-load-panel");
    expect(byTestId(root, "save-name-input")).not.toBeNull();
    expect(byTestId(root, "save-button")).not.toBeNull();
    expect(byTestId(root, "save-slot-list")).not.toBeNull();
    expect(byTestId(root, "import-file")).not.toBeNull();
    expect(byTestId(root, "import-button")).not.toBeNull();
  });

  it("shows an empty state before any save exists", async () => {
    const { root } = mount();
    await settle();
    expect(root.textContent).toContain("No saves yet");
  });

  it("shows a readable error when saving with no name", async () => {
    const { root } = mount();
    await settle();
    (byTestId(root, "save-button") as HTMLButtonElement).click();
    await settle();
    const err = byTestId(root, "save-error") as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain("Give the save a name first.");
  });

  it("saving a named slot lists it", async () => {
    const { root } = mount();
    await settle();
    (byTestId(root, "save-name-input") as HTMLInputElement).value =
      "My campaign";
    (byTestId(root, "save-button") as HTMLButtonElement).click();
    await settle();
    const row = root.querySelector('[data-testid^="save-slot-"]');
    expect(row?.textContent).toContain("My campaign");
    expect(row?.textContent).toContain("Day 42");
  });

  it("load hands the slot's snapshot to onLoad", async () => {
    const manager = new SaveManager();
    await manager.saveSlot("Seeded", fakeSnapshot(9));
    let loaded: SimSnapshot | null = null;
    const { root } = mount({
      manager,
      onLoad: (s) => void (loaded = s),
    });
    await settle();
    const loadBtn = root.querySelector(
      '[data-testid^="load-"]',
    ) as HTMLButtonElement;
    expect(loadBtn).not.toBeNull();
    loadBtn.click();
    await settle();
    expect(loaded).not.toBeNull();
    expect(loaded!.day).toBe(9);
  });

  it("delete needs two clicks; the second removes the slot", async () => {
    const manager = new SaveManager();
    await manager.saveSlot("Doomed", fakeSnapshot(1));
    const { root } = mount({ manager });
    await settle();
    const delBtn = root.querySelector(
      '[data-testid^="delete-"]',
    ) as HTMLButtonElement;
    delBtn.click();
    await settle();
    expect(delBtn.textContent).toContain("Confirm delete");
    // Still listed after the arming click.
    expect(root.textContent).toContain("Doomed");
    delBtn.click();
    await settle();
    expect(root.textContent).not.toContain("Doomed");
  });

  it("the autosave card offers load and export but never delete", async () => {
    const manager = new SaveManager();
    await manager.autosave(fakeSnapshot(3));
    const { root } = mount({ manager });
    await settle();
    const card = byTestId(root, "save-slot-__autosave");
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("Autosave");
    expect(
      card!.querySelector('[data-testid^="delete-"]'),
    ).toBeNull();
    expect(card!.querySelector('[data-testid^="load-"]')).not.toBeNull();
    expect(card!.querySelector('[data-testid^="export-"]')).not.toBeNull();
  });

  it("import of a non-save file shows a readable error and writes nothing", async () => {
    const { root } = mount();
    await settle();
    const file = new File(
      [JSON.stringify({ hello: "world" })],
      "nope.json",
      { type: "application/json" },
    );
    const input = byTestId(root, "import-file") as HTMLInputElement;
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    (byTestId(root, "import-button") as HTMLButtonElement).click();
    await settle();
    const err = byTestId(root, "save-error") as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain("not a bannerlord-clone save file");
    expect(root.querySelector('li[data-testid^="save-slot-"]')).toBeNull();
  });

  it("export triggers a download of the slot file", async () => {
    const manager = new SaveManager();
    await manager.saveSlot("Export me", fakeSnapshot(5));
    const { root } = mount({ manager });
    await settle();

    const clicked: HTMLAnchorElement[] = [];
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this);
    };
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:fake",
      revokeObjectURL: () => {},
    });
    try {
      const exportBtn = root.querySelector(
        '[data-testid^="export-"]',
      ) as HTMLButtonElement;
      exportBtn.click();
      await settle();
    } finally {
      HTMLAnchorElement.prototype.click = origClick;
    }

    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toContain(".bcsave.json");
  });

  it("a failing onLoad surfaces a readable message, not a stack", async () => {
    const manager = new SaveManager();
    await manager.saveSlot("Unusable", fakeSnapshot(2));
    const { root } = mount({
      manager,
      onLoad: () => {
        throw new Error("no provider restore");
      },
    });
    await settle();
    (root.querySelector('[data-testid^="load-"]') as HTMLButtonElement).click();
    await settle();
    const err = byTestId(root, "save-error") as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain(
      "the game could not take it",
    );
    expect(err.textContent).not.toContain("no provider restore");
  });

  it("ironman hides the save row and named slots, leaving the autosave", async () => {
    const manager = new SaveManager();
    await manager.saveSlot("Cheat backup", fakeSnapshot(2));
    const { root } = mount({ manager, ironmanActive: true });
    await settle();
    expect(byTestId(root, "ironman-save-notice")).not.toBeNull();
    expect(byTestId(root, "save-name-input")).toBeNull();
    expect(byTestId(root, "save-button")).toBeNull();
    // The named slot is hidden even though it exists in storage.
    expect(root.textContent).not.toContain("Cheat backup");
  });
});
