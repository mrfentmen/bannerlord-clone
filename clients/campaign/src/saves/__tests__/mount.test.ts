/**
 * @vitest-environment jsdom
 *
 * The save/load panel's DOM layer.
 *
 * The panel is built over the real `SaveScreens` and the real `SaveServer`,
 * driven by a recording `fetch`, over the real `IndexedDbSlotStore` against an
 * in-memory IndexedDB. So the DOM, the view models, the transport and the
 * storage are all the shipping code; only the network is a recorded reply.
 *
 * What these cover that the screens tests cannot: what the panel draws, the
 * two-step delete, the ironman rules, and the error states — in particular that
 * a retryable failure grows a retry button and a fatal one does not.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { saveLoadPanel, SaveServer, IndexedDbSlotStore, AUTOSAVE_ID } from "../index";
import { getAudioManager } from "../../audio/AudioManager.js";
import type { SimSnapshot } from "../../data/types";
import { faultBody, LOAD_REPLY, recordingFetch, SAVE_PAYLOAD } from "./fixture";

/** Minimal in-memory IndexedDB, the same shape the slot store's tests need. */
function installFakeIdb(): void {
  const stores = new Map<string, Map<string, unknown>>();

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
      req.onsuccess?.call(req);
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
                  get: (id: string) => request((r) => { r.result = map.get(id); }),
                  getAll: () => request((r) => { r.result = [...map.values()]; }),
                  put: (value: { id: string }) =>
                    request((r) => { map.set(value.id, value); r.result = value.id; }),
                  delete: (id: string) => request((r) => { map.delete(id); r.result = undefined; }),
                };
              },
            };
          },
        };
        Object.defineProperty(req, "result", { value: db });
        req.onsuccess?.call(req);
      }, 0);
      return req;
    },
  });
}

function snapshot(day: number): SimSnapshot {
  return { schemaVersion: 1, day } as SimSnapshot;
}

async function settle(rounds = 14): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 5));
}

function mount(
  replies: Parameters<typeof recordingFetch>[0] = [],
  opts: { day?: number; ironmanActive?: boolean; onClose?: () => void; onLoad?: (s: SimSnapshot) => void } = {},
) {
  const { fetch, calls } = recordingFetch(replies);
  const panel = saveLoadPanel({
    server: new SaveServer({ httpUrl: "http://sim.test", fetchImpl: fetch }),
    store: new IndexedDbSlotStore(),
    currentSnapshot: () => snapshot(opts.day ?? 42),
    ...(opts.onLoad ? { onLoad: opts.onLoad } : {}),
    ...(opts.ironmanActive ? { ironmanActive: true } : {}),
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
  document.body.appendChild(panel.root);
  return { panel, calls };
}

function byTestId(root: ParentNode, id: string): HTMLElement | null {
  return root.querySelector(`[data-testid="${id}"]`);
}

function click(el: HTMLElement | null): void {
  if (!el) throw new Error("expected an element to click");
  (el as HTMLElement).click();
}

/** Name the save and press Save, which is the only way to reach the server. */
function nameAndSave(root: ParentNode, name: string): void {
  const input = byTestId(root, "save-name-input") as HTMLInputElement;
  input.value = name;
  click(byTestId(root, "save-button"));
}

describe("saveLoadPanel", () => {
  beforeEach(() => {
    installFakeIdb();
    vi.spyOn(getAudioManager(), "playUiSound").mockImplementation(() => {});
    // jsdom has no object-URL support for the export button.
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:stub",
      revokeObjectURL: () => {},
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens with an empty state naming what to do, not a blank box", async () => {
    const { panel } = mount();
    await settle();
    const empty = byTestId(panel.root, "empty-state");
    expect(empty?.textContent).toContain("No saves yet");
    expect(empty?.textContent).toContain("press Save");
  });

  it("says there is no autosave yet rather than drawing an empty autosave row", async () => {
    const { panel } = mount();
    await settle();
    expect(byTestId(panel.root, "autosave-section")?.textContent).toContain("No autosave yet");
  });

  it("saves under a name the player typed and lists the result", async () => {
    const { panel, calls } = mount([{ body: SAVE_PAYLOAD }]);
    await settle();
    const input = byTestId(panel.root, "save-name-input") as HTMLInputElement;
    input.value = "Before the flood";
    click(byTestId(panel.root, "save-button"));
    await settle();

    expect(calls[0]!.url).toBe("http://sim.test/v1/save");
    const row = byTestId(panel.root, "save-slot-before-the-flood");
    expect(row?.textContent).toContain("Before the flood");
    expect(row?.textContent).toContain("Day 42");
  });

  it("shows the refusal in the server's own words and offers to try again", async () => {
    const { panel } = mount([
      { body: faultBody("save refused: orders are still queued (2 queued)") , status: 500, statusText: "Internal Server Error" },
    ]);
    await settle();
    nameAndSave(panel.root, "Interrupted");
    await settle();

    const error = byTestId(panel.root, "save-error");
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toContain("middle of something");
    expect(byTestId(panel.root, "save-error-retry")).not.toBeNull();
  });

  it("does not offer a retry for a failure retrying cannot fix", async () => {
    const { panel } = mount([
      { body: faultBody("not found"), status: 404, statusText: "Not Found" },
    ]);
    await settle();
    nameAndSave(panel.root, "Nowhere to go");
    await settle();
    expect(byTestId(panel.root, "save-error")?.textContent).toContain("does not keep campaigns");
    expect(byTestId(panel.root, "save-error-retry")).toBeNull();
  });

  it("re-runs the refused save when the retry button is pressed", async () => {
    const { panel, calls } = mount([
      { body: faultBody("save refused: orders are still queued"), status: 500, statusText: "Internal Server Error" },
      { body: SAVE_PAYLOAD },
    ]);
    await settle();
    nameAndSave(panel.root, "Second attempt");
    await settle();
    click(byTestId(panel.root, "save-error-retry"));
    await settle();

    expect(calls).toHaveLength(2);
    // The retry landed the save, so the slot row is there and the error is gone.
    expect(byTestId(panel.root, "save-slot-second-attempt")).not.toBeNull();
    expect(byTestId(panel.root, "save-error")?.hidden).toBe(true);
  });

  it("loads a slot through the server and reports the day it landed on", async () => {
    const { panel, calls } = mount([
      { body: SAVE_PAYLOAD },
      { body: JSON.stringify({ ok: true, day: 91 }) },
    ]);
    await settle();
    nameAndSave(panel.root, "Rollback");
    await settle();

    click(byTestId(panel.root, "load-rollback"));
    await settle();

    expect(calls[1]!.url).toBe("http://sim.test/v1/load");
    expect(calls[1]!.body).toBe(SAVE_PAYLOAD);
    // The confirmation is a toast in the shared region, and it quotes the day
    // the server answered with rather than the day on the row.
    expect(document.querySelector("[data-toast-region]")?.textContent).toContain("day 91");
  });

  it("tells the app the world was restored, so it can repaint", async () => {
    const onLoad = vi.fn();
    const { panel } = mount([{ body: SAVE_PAYLOAD }, { body: LOAD_REPLY }], { onLoad });
    await settle();
    nameAndSave(panel.root, "Repaint");
    await settle();
    click(byTestId(panel.root, "load-repaint"));
    await settle();
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("requires two presses to delete, and the first press only arms", async () => {
    const { panel } = mount([{ body: SAVE_PAYLOAD }]);
    await settle();
    nameAndSave(panel.root, "Doomed");
    await settle();

    const del = byTestId(panel.root, "delete-doomed");
    click(del);
    expect(del?.textContent).toBe("Confirm delete");
    expect(byTestId(panel.root, "save-slot-doomed")).not.toBeNull();

    click(del);
    await settle();
    expect(byTestId(panel.root, "save-slot-doomed")).toBeNull();
  });

  it("never offers to delete the autosave, because the game depends on it", async () => {
    const { panel } = mount([{ body: SAVE_PAYLOAD }]);
    await settle();
    // Written through the same store the autosave uses, so the row is genuine.
    await panel.screens.autosave();
    await panel.refresh();
    await settle();

    expect(byTestId(panel.root, `save-slot-${AUTOSAVE_ID}`)).not.toBeNull();
    expect(byTestId(panel.root, `delete-${AUTOSAVE_ID}`)).toBeNull();
  });

  it("hides manual saving entirely on ironman and says why", async () => {
    const { panel } = mount([], { ironmanActive: true });
    await settle();
    expect(byTestId(panel.root, "save-button")).toBeNull();
    expect(byTestId(panel.root, "ironman-save-notice")?.textContent).toContain("one autosave");
    expect(panel.root.textContent).toContain("Named slots are disabled");
  });

  it("still offers the autosave row on ironman, because that is the only way back", async () => {
    const { panel } = mount([{ body: SAVE_PAYLOAD }], { ironmanActive: true });
    await settle();
    await panel.screens.autosave();
    await panel.refresh();
    await settle();
    expect(byTestId(panel.root, `save-slot-${AUTOSAVE_ID}`)).not.toBeNull();
  });

  it("accepts the file extension its own export button writes", async () => {
    // An import filter that misses the format the exporter produces is a
    // round trip that silently does not work.
    const { panel } = mount();
    await settle();
    const accept = byTestId(panel.root, "import-file")?.getAttribute("accept") ?? "";
    expect(accept).toContain(".mbclone-save.json");
  });

  it("explains an import with no file chosen instead of doing nothing silently", async () => {
    const { panel } = mount();
    await settle();
    click(byTestId(panel.root, "import-button"));
    await settle();
    expect(byTestId(panel.root, "save-error")?.textContent).toContain("Choose a save file");
  });

  it("closes when the close control is pressed", async () => {
    const onClose = vi.fn();
    const { panel } = mount([], { onClose });
    panel.root.querySelector<HTMLButtonElement>(".panel__close")?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});