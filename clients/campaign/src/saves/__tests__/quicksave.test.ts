/**
 * Quicksave (F5).
 *
 * The module owns no storage and no keyboard: tests drive `performQuicksave`
 * with a recording store, which is why the store surface it takes is one method
 * rather than a whole save manager. The assertions are about refusals and about
 * the sentence the HUD shows, because that is the part a player reads.
 */

import { describe, it, expect, vi } from "vitest";
import {
  bindQuicksaveKeybind,
  performQuicksave,
  quicksaveMessage,
  quicksaveStoreFor,
  QUICKSAVE_ID,
  QUICKSAVE_NAME,
  type QuicksaveDeps,
} from "../quicksave";
import { SaveScreens, SaveUiError } from "../screens";
import { SaveServer } from "../server";
import type { SlotStore } from "../slots";
import type { SimSnapshot } from "../../data/types";
import { faultBody, recordingFetch, SAVE_PAYLOAD } from "./fixture";

function deps(over: Partial<QuicksaveDeps> = {}): QuicksaveDeps & { calls: Array<{ name?: string }> } {
  const calls: Array<{ name?: string }> = [];
  return {
    calls,
    ironman: () => false,
    store: {
      quicksave: async (name?: string) => {
        calls.push({ ...(name === undefined ? {} : { name }) });
        return {
          id: QUICKSAVE_ID,
          name: name ?? QUICKSAVE_NAME,
          day: 42,
          updatedAt: "",
          createdAt: "",
          isAutosave: false,
          bytes: 10,
          subtitle: "Day 42",
        };
      },
    },
    ...over,
  };
}

describe("performQuicksave", () => {
  it("writes the Quicksave slot and reports the day", async () => {
    const d = deps();
    const outcome = await performQuicksave(d);
    expect(outcome).toEqual({ ok: true, day: 42 });
    expect(d.calls).toEqual([{ name: QUICKSAVE_NAME }]);
  });

  it("overwrites the same slot every time instead of piling up copies", async () => {
    const d = deps();
    await performQuicksave(d);
    await performQuicksave(d);
    // The id is a constant, so both presses land in the same slot by construction.
    expect(d.calls.map((c) => c.name)).toEqual([QUICKSAVE_NAME, QUICKSAVE_NAME]);
    expect(QUICKSAVE_ID).toBe("quicksave");
  });

  it("is refused on ironman, without touching the server", async () => {
    const d = deps({ ironman: () => true });
    const outcome = await performQuicksave(d);
    expect(outcome).toEqual({ ok: false, reason: "ironman" });
    expect(d.calls).toHaveLength(0);
  });

  it("reports a failure as an outcome and never throws", async () => {
    // A throw here would surface in the keybind handler, where nothing catches it.
    const d = deps({
      store: {
        quicksave: async () => {
          throw new SaveUiError("The world is in the middle of something.", "busy", true);
        },
      },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await performQuicksave(d);
    expect(outcome).toMatchObject({
      ok: false,
      reason: "store-error",
      message: "The world is in the middle of something.",
      retryable: true,
    });
    consoleError.mockRestore();
  });

  it("gives a player a sentence even for an error that is not a SaveUiError", async () => {
    const d = deps({
      store: {
        quicksave: async () => {
          throw new TypeError("Failed to fetch");
        },
      },
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await performQuicksave(d);
    expect(quicksaveMessage(outcome)).toContain("campaign is untouched");
    consoleError.mockRestore();
  });
});

describe("quicksaveMessage", () => {
  it("says nothing on success, because there is nothing to recover from", () => {
    expect(quicksaveMessage({ ok: true, day: 42 })).toBeNull();
  });

  it("says nothing on ironman, which is a rule rather than a failure", () => {
    // The settings panel already explains ironman keeps one autosave. A toast
    // every time a player presses F5 would be nagging about a design decision.
    expect(quicksaveMessage({ ok: false, reason: "ironman" })).toBeNull();
  });

  it("carries the sentence through for a real failure", () => {
    expect(quicksaveMessage({ ok: false, reason: "store-error", message: "nope" })).toBe("nope");
  });
});

describe("quicksaveStoreFor", () => {
  function screenHarness(replies: Parameters<typeof recordingFetch>[0]) {
    const { fetch, calls } = recordingFetch(replies);
    const slots = new Map<string, string>();
    const store: SlotStore = {
      list: async () => [],
      read: async (id) => (slots.has(id) ? { id, name: id, day: 1, payload: slots.get(id)!, createdAt: "", updatedAt: "" } : null),
      write: async (s) => {
        slots.set(s.id, s.payload);
        return { ...s, createdAt: "", updatedAt: "" };
      },
      remove: async (id) => { slots.delete(id); },
    };
    const screens = new SaveScreens({
      server: new SaveServer({ httpUrl: "http://sim.test", fetchImpl: fetch }),
      store,
      currentSnapshot: (): SimSnapshot => ({ schemaVersion: 1, day: 12 } as SimSnapshot),
    });
    return { store: quicksaveStoreFor(screens), calls, slots };
  }

  it("routes the keybind to a real server save, not to a local snapshot dump", async () => {
    // This is the whole point of the change: F5 asks the campaign server for the
    // campaign, so what lands in the slot is something POST /v1/load accepts.
    const { store, calls, slots } = screenHarness([
      { body: SAVE_PAYLOAD },
      { body: JSON.stringify({ ok: true, day: 3 }) },
    ]);
    await store.quicksave(QUICKSAVE_NAME);
    expect(calls[0]!.url).toBe("http://sim.test/v1/save");
    expect(slots.get(QUICKSAVE_ID)).toBe(SAVE_PAYLOAD);
  });
});
describe("bindQuicksaveKeybind", () => {
  function registry() {
    const handlers = new Map<string, Array<() => void>>();
    return {
      input: {
        on(id: string, handler: () => void) {
          const list = handlers.get(id) ?? [];
          list.push(handler);
          handlers.set(id, list);
          return () => handlers.set(id, list.filter((h) => h !== handler));
        },
      },
      fire(id: string) {
        for (const h of handlers.get(id) ?? []) h();
      },
      count: (id: string) => (handlers.get(id) ?? []).length,
    };
  }

  function screensOn(replies: Parameters<typeof recordingFetch>[0]) {
    const { fetch, calls } = recordingFetch(replies);
    const slots = new Map<string, string>();
    const store: SlotStore = {
      list: async () => [],
      read: async (id) => (slots.has(id) ? { id, name: id, day: 1, payload: slots.get(id)!, createdAt: "", updatedAt: "" } : null),
      write: async (s) => {
        slots.set(s.id, s.payload);
        return { ...s, createdAt: "", updatedAt: "" };
      },
      remove: async (id) => { slots.delete(id); },
    };
    const screens = new SaveScreens({
      server: new SaveServer({ httpUrl: "http://sim.test", fetchImpl: fetch }),
      store,
      currentSnapshot: (): SimSnapshot => ({ schemaVersion: 1, day: 12 } as SimSnapshot),
    });
    return { screens, calls, slots };
  }

  it("saves on F5 and announces the day, without a DOM", async () => {
    const { input, fire } = registry();
    const { screens, calls, slots } = screensOn([{ body: SAVE_PAYLOAD }]);
    const said: string[] = [];
    bindQuicksaveKeybind({ input, screens, ironman: () => false, announce: (m) => said.push(m) });

    fire("game.quicksave");
    await new Promise((r) => setTimeout(r, 10));

    expect(calls[0]!.url).toBe("http://sim.test/v1/save");
    expect(slots.get(QUICKSAVE_ID)).toBe(SAVE_PAYLOAD);
    expect(said.join(" ")).toContain("Quicksaved");
  });

  it("says nothing on ironman, because that is a rule and not a failure", async () => {
    const { input, fire } = registry();
    const { screens, calls } = screensOn([{ body: SAVE_PAYLOAD }]);
    const said: string[] = [];
    bindQuicksaveKeybind({ input, screens, ironman: () => true, announce: (m) => said.push(m) });

    fire("game.quicksave");
    await new Promise((r) => setTimeout(r, 10));

    expect(calls).toHaveLength(0);
    expect(said).toEqual([]);
  });

  it("announces the server's own refusal rather than swallowing it", async () => {
    const { input, fire } = registry();
    const { screens } = screensOn([
      { status: 500, statusText: "Internal Server Error", body: faultBody("save refused: orders are still queued") },
    ]);
    const said: string[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    bindQuicksaveKeybind({ input, screens, ironman: () => false, announce: (m) => said.push(m) });

    fire("game.quicksave");
    await new Promise((r) => setTimeout(r, 10));

    expect(said.join(" ")).toContain("middle of something");
    consoleError.mockRestore();
  });

  it("unbinds, so mounting twice does not leave two writers on one slot", () => {
    const { input, count } = registry();
    const { screens } = screensOn([]);
    const off = bindQuicksaveKeybind({ input, screens, ironman: () => false, announce: () => {} });
    expect(count("game.quicksave")).toBe(1);
    off();
    expect(count("game.quicksave")).toBe(0);
  });

  it("can be bound to a renamed action, so a rename does not silently lose F5", () => {
    const { input, count } = registry();
    const { screens } = screensOn([]);
    bindQuicksaveKeybind({ input, screens, ironman: () => false, announce: () => {}, actionId: "game.fastSave" });
    expect(count("game.fastSave")).toBe(1);
  });
});
