/**
 * Tests for quicksave (F5).
 *
 * The module owns no storage and no keyboard: tests drive `performQuicksave`
 * with a recording fake store, plus two registry-level tests proving the F5
 * chord actually reaches the `game.quicksave` action and swallows the
 * browser's own reload.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from "vitest";
import {
  QUICKSAVE_ID,
  QUICKSAVE_NAME,
  performQuicksave,
  type QuicksaveDeps,
  type QuicksaveStore,
} from "../quicksave";
import { createInputRegistry } from "../../input/registry";
import type { SimSnapshot } from "../../data/types";

function fakeSnapshot(day: number): SimSnapshot {
  return { schemaVersion: 1, day } as SimSnapshot;
}

interface Call {
  name: string;
  snapshot: SimSnapshot;
  id: string | undefined;
}

function recordingStore(fail = false): { store: QuicksaveStore; calls: Call[] } {
  const calls: Call[] = [];
  const store: QuicksaveStore = {
    saveSlot: (name: string, snapshot: SimSnapshot, id?: string) => {
      if (fail) return Promise.reject(new Error("idb gone"));
      calls.push({ name, snapshot, id });
      return Promise.resolve(undefined);
    },
  };
  return { store, calls };
}

function makeDeps(over: Partial<QuicksaveDeps> = {}): {
  d: QuicksaveDeps;
  calls: Call[];
} {
  const { store, calls } = recordingStore();
  const snap = fakeSnapshot(42);
  return {
    calls,
    d: {
      store,
      currentSnapshot: () => snap,
      ironman: () => false,
      ...over,
    },
  };
}

describe("performQuicksave", () => {
  it("writes the live snapshot to the stable quicksave slot", async () => {
    const { d, calls } = makeDeps();
    const out = await performQuicksave(d);
    expect(out).toEqual({ ok: true, day: 42 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: QUICKSAVE_NAME, id: QUICKSAVE_ID });
    expect(calls[0]!.snapshot).toBe(d.currentSnapshot());
  });

  it("overwrites the same slot instead of piling up copies", async () => {
    const { d, calls } = makeDeps();
    await performQuicksave(d);
    const out = await performQuicksave({
      ...d,
      currentSnapshot: () => fakeSnapshot(43),
    });
    expect(out).toEqual({ ok: true, day: 43 });
    expect(calls.map((c) => c.id)).toEqual([QUICKSAVE_ID, QUICKSAVE_ID]);
  });

  it("refuses ironman without touching the store", async () => {
    const { d, calls } = makeDeps({ ironman: () => true });
    const out = await performQuicksave(d);
    expect(out).toEqual({ ok: false, reason: "ironman" });
    expect(calls).toHaveLength(0);
  });

  it("reports no-campaign before a campaign mounts", async () => {
    const { d, calls } = makeDeps({ currentSnapshot: () => null });
    const out = await performQuicksave(d);
    expect(out).toEqual({ ok: false, reason: "no-campaign" });
    expect(calls).toHaveLength(0);
  });

  it("turns a store failure into an outcome instead of throwing", async () => {
    const { store, calls } = recordingStore(true);
    const out = await performQuicksave({
      store,
      currentSnapshot: () => fakeSnapshot(7),
      ironman: () => false,
    });
    expect(out).toEqual({ ok: false, reason: "store-error" });
    expect(calls).toHaveLength(0);
  });
});

describe("game.quicksave binding", () => {
  it("F5 reaches the action and the browser's reload is swallowed", () => {
    const input = createInputRegistry();
    const handler = vi.fn();
    input.on("game.quicksave", handler);
    const ev = new KeyboardEvent("keydown", {
      key: "F5",
      bubbles: true,
      cancelable: true,
    });
    expect(input.handleKeyEvent(ev)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    // The def must preventDefault: a bare F5 reloads the tab.
    expect(ev.defaultPrevented).toBe(true);
  });

  it("shows up in the catalog so the keybinding editor can rebind it", () => {
    const input = createInputRegistry();
    const found = input.actions().find((a) => a.id === "game.quicksave");
    expect(found).toBeDefined();
    expect(found!.defaultKeys).toEqual([{ key: "F5" }]);
  });
});
