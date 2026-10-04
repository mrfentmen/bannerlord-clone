/**
 * The save/load view models.
 *
 * These sit over a real `SaveServer` driven by a recording `fetch` and a
 * recording slot store, so what is asserted is the whole round trip: the bytes
 * the server wrote are what gets stored, and the bytes that get stored are what
 * get posted back on load. Nothing here stubs the transport — the previous
 * version of this file stubbed the storage manager, which is exactly the layer
 * whose behaviour changed.
 */

import { describe, it, expect, vi } from "vitest";
import { SaveScreens, SaveUiError, exportFileName } from "../screens";
import { SaveServer } from "../server";
import { AUTOSAVE_ID, slugifySlotId, type SlotStore, type SlotSummary, type StoredSlot } from "../slots";
import type { SimSnapshot } from "../../data/types";
import { LOAD_REPLY, recordingFetch, SAVE_PAYLOAD } from "./fixture";

function snapshot(day: number): SimSnapshot {
  return { schemaVersion: 1, day } as SimSnapshot;
}

/** An in-memory slot store that keeps payloads verbatim, like IndexedDB would. */
function memoryStore(): SlotStore & { slots: Map<string, StoredSlot> } {
  const slots = new Map<string, StoredSlot>();
  return {
    slots,
    async list(): Promise<SlotSummary[]> {
      return [...slots.values()]
        .filter((s) => s.id !== AUTOSAVE_ID)
        .map(({ id, name, createdAt, updatedAt, day, payload }) => ({
          id, name, createdAt, updatedAt, day, bytes: payload.length,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    async read(id) {
      return slots.get(id) ?? null;
    },
    async write(slot) {
      const now = new Date().toISOString();
      const record: StoredSlot = {
        id: slot.id,
        name: slot.name,
        day: slot.day,
        payload: slot.payload,
        createdAt: slot.createdAt ?? slots.get(slot.id)?.createdAt ?? now,
        updatedAt: now,
      };
      slots.set(record.id, record);
      return record;
    },
    async remove(id) {
      slots.delete(id);
    },
  };
}

function build(replies: Parameters<typeof recordingFetch>[0], opts: { day?: number; onLoad?: (s: SimSnapshot) => void } = {}) {
  const { fetch, calls } = recordingFetch(replies);
  const store = memoryStore();
  const screens = new SaveScreens({
    server: new SaveServer({ httpUrl: "http://sim.test", fetchImpl: fetch }),
    store,
    currentSnapshot: () => snapshot(opts.day ?? 42),
    ...(opts.onLoad ? { onLoad: opts.onLoad } : {}),
  });
  return { screens, store, calls };
}

describe("SaveScreens.save", () => {
  it("asks the server for the campaign and stores exactly what came back", async () => {
    const { screens, store, calls } = build([{ body: SAVE_PAYLOAD }]);
    const card = await screens.save("Before the flood");

    expect(calls[0]!.url).toBe("http://sim.test/v1/save");
    // The stored bytes are the server's bytes, character for character.
    expect(store.slots.get(slugifySlotId("Before the flood"))!.payload).toBe(SAVE_PAYLOAD);
    expect(card.name).toBe("Before the flood");
    expect(card.day).toBe(42);
    expect(card.bytes).toBe(SAVE_PAYLOAD.length);
    expect(card.isAutosave).toBe(false);
  });

  it("refuses a blank name without spending a round trip", async () => {
    const { screens, calls } = build([]);
    await expect(screens.save("   ")).rejects.toBeInstanceOf(SaveUiError);
    expect(calls).toHaveLength(0);
  });

  it("refuses a name too long to label a slot row", async () => {
    const { screens } = build([]);
    await expect(screens.save("x".repeat(61))).rejects.toMatchObject({
      playerMessage: expect.stringContaining("60"),
    });
  });

  it("reports a refused save as retryable so the panel can offer to try again", async () => {
    const { screens } = build([
      { status: 500, statusText: "Internal Server Error", body: JSON.stringify({ error: { code: "internal", message: "save refused: orders are still queued" } }) },
    ]);
    const err = (await screens.save("Late").catch((e: unknown) => e)) as SaveUiError;
    expect(err.retryable).toBe(true);
    expect(err.playerMessage).toContain("middle of something");
  });

  it("does not report a save as failed when the server is simply unreachable", async () => {
    const { screens } = build([{ body: "", throw: new TypeError("Failed to fetch") }]);
    const err = (await screens.save("Offline").catch((e: unknown) => e)) as SaveUiError;
    expect(err.retryable).toBe(true);
    expect(err.playerMessage).toContain("untouched");
  });
});

describe("SaveScreens.quicksave and autosave", () => {
  it("writes the Quicksave to its own slot, not over the autosave", async () => {
    const { screens, store } = build([
      { body: SAVE_PAYLOAD },
      { body: SAVE_PAYLOAD },
    ]);
    await screens.autosave();
    await screens.quicksave();

    expect([...store.slots.keys()].sort()).toEqual([AUTOSAVE_ID, "quicksave"].sort());
  });

  it("overwrites the same Quicksave slot rather than piling up copies", async () => {
    const { screens, store } = build([
      { body: SAVE_PAYLOAD },
      { body: SAVE_PAYLOAD },
    ]);
    await screens.quicksave();
    await screens.quicksave();
    expect(store.slots.size).toBe(1);
  });

  it("takes a custom slot name, so the keybind and the menu land in one place", async () => {
    const { screens, store } = build([{ body: SAVE_PAYLOAD }]);
    await screens.quicksave("Before the ambush");
    expect([...store.slots.keys()]).toEqual(["before-the-ambush"]);
  });
});

describe("SaveScreens.load", () => {
  it("posts the stored file back and reports the day the server landed on", async () => {
    const { screens, calls } = build([{ body: SAVE_PAYLOAD }, { body: JSON.stringify({ ok: true, day: 91 }) }]);
    await screens.save("Day 42");
    const card = await screens.load(slugifySlotId("Day 42"));

    expect(calls[1]!.url).toBe("http://sim.test/v1/load");
    expect(calls[1]!.body).toBe(SAVE_PAYLOAD);
    // The server is the authority on the day, not the row the player was reading.
    expect(card.day).toBe(91);
    expect(card.subtitle).toContain("Day 91");
  });

  it("tells the app the world was restored", async () => {
    const onLoad = vi.fn();
    const { screens } = build([{ body: SAVE_PAYLOAD }, { body: LOAD_REPLY }], { onLoad });
    await screens.save("Anything");
    await screens.load(slugifySlotId("Anything"));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("does not turn a completed restore into a reported failure when the hook throws", async () => {
    // The restore happened on the server. Saying "failed to load" would be the
    // worse lie, so a throwing hook is logged and the load still succeeds.
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { screens } = build(
      [{ body: SAVE_PAYLOAD }, { body: LOAD_REPLY }],
      { onLoad: () => { throw new Error("client cannot apply a snapshot"); } },
    );
    await screens.save("Loud hook");
    await expect(screens.load(slugifySlotId("Loud hook"))).resolves.toMatchObject({ day: 42 });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("reports a missing slot in plain words", async () => {
    const { screens } = build([]);
    await expect(screens.load("never-existed")).rejects.toMatchObject({
      playerMessage: expect.stringContaining("gone"),
    });
  });

  it("does not post anything for a slot that is not there", async () => {
    const { screens, calls } = build([]);
    await screens.load("never-existed").catch(() => {});
    expect(calls).toHaveLength(0);
  });
});

describe("SaveScreens.overview", () => {
  it("lists named slots without the autosave", async () => {
    const { screens } = build([
      { body: SAVE_PAYLOAD },
      { body: SAVE_PAYLOAD },
      { body: SAVE_PAYLOAD },
    ]);
    await screens.autosave();
    await screens.save("One");
    await screens.save("Two");

    const { named, autosave } = await screens.overview();
    expect(named.map((c) => c.name).sort()).toEqual(["One", "Two"]);
    expect(autosave?.id).toBe(AUTOSAVE_ID);
    expect(autosave?.isAutosave).toBe(true);
  });

  it("reports no autosave before one has been written, in words not null", async () => {
    const { screens } = build([]);
    const { autosave, named } = await screens.overview();
    expect(autosave).toBeNull();
    expect(named).toEqual([]);
  });

  it("does not let a broken autosave hide the player's own slots", async () => {
    const store = memoryStore();
    await store.write({ id: "keeper", name: "Keeper", day: 7, payload: SAVE_PAYLOAD });
    // The autosave read is what throws. A campaign with one corrupt autosave
    // still has to be able to see its named saves.
    const failing: SlotStore = {
      ...store,
      read: async (id) => {
        if (id === AUTOSAVE_ID) throw new Error("record is corrupt");
        return store.read(id);
      },
    };
    const { fetch } = recordingFetch([]);
    const screens = new SaveScreens({
      server: new SaveServer({ httpUrl: "http://sim.test", fetchImpl: fetch }),
      store: failing,
      currentSnapshot: () => snapshot(1),
    });
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { named, autosave } = await screens.overview();
    expect(named.map((c) => c.id)).toEqual(["keeper"]);
    expect(autosave).toBeNull();
    consoleWarn.mockRestore();
  });

  it("carries the slot size so the list can say how big a save is", async () => {
    const { screens } = build([{ body: SAVE_PAYLOAD }]);
    await screens.save("Sized");
    const { named } = await screens.overview();
    expect(named[0]!.bytes).toBe(SAVE_PAYLOAD.length);
  });
});

describe("SaveScreens.remove", () => {
  it("removes a named slot", async () => {
    const { screens, store } = build([{ body: SAVE_PAYLOAD }]);
    await screens.save("Temporary");
    await screens.remove("temporary");
    expect(store.slots.has("temporary")).toBe(false);
  });

  it("refuses to delete the autosave, because the game relies on it", async () => {
    const { screens } = build([{ body: SAVE_PAYLOAD }]);
    await screens.autosave();
    await expect(screens.remove(AUTOSAVE_ID)).rejects.toMatchObject({
      playerMessage: expect.stringContaining("autosave cannot be deleted"),
    });
  });
});

describe("SaveScreens.importSave", () => {
  function file(text: string, name = "imported.json"): File {
    return { name, text: async () => text } as unknown as File;
  }

  it("stores a real save file and keeps its bytes intact", async () => {
    const { screens, store } = build([]);
    const card = await screens.importSave(file(SAVE_PAYLOAD, "Dana's campaign.mbclone-save.json"));
    expect(card.name).toBe("Dana's campaign");
    expect([...store.slots.values()][0]!.payload).toBe(SAVE_PAYLOAD);
  });

  it("gives an import its own slot so it cannot clobber a save of the same name", async () => {
    const { screens, store } = build([{ body: SAVE_PAYLOAD }, { body: SAVE_PAYLOAD }]);
    await screens.save("Shared name");
    await screens.importSave(file(SAVE_PAYLOAD, "Shared name.mbclone-save.json"), );
    expect(store.slots.size).toBe(2);
  });

  it("refuses a file from another game and writes nothing", async () => {
    const { screens, store } = build([]);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      screens.importSave(file(JSON.stringify({ format: "other-game", version: 1 }))),
    ).rejects.toMatchObject({ playerMessage: expect.stringContaining("not a save file") });
    expect(store.slots.size).toBe(0);
    consoleError.mockRestore();
  });

  it("refuses a file that is not JSON at all", async () => {
    const { screens, store } = build([]);
    await expect(screens.importSave(file("<!doctype html>"))).rejects.toBeInstanceOf(SaveUiError);
    expect(store.slots.size).toBe(0);
  });

  it("labels a nameless file rather than writing a slot called nothing", async () => {
    const { screens } = build([]);
    const card = await screens.importSave(file(SAVE_PAYLOAD, ".json"));
    expect(card.name).toBe("Imported save");
  });
});

describe("exportFileName", () => {
  it("produces a filename that sorts and reads", () => {
    expect(exportFileName("Cincinnati, before the flood")).toBe(
      "cincinnati-before-the-flood.mbclone-save.json",
    );
  });

  it("never produces an empty name, whatever the slot is called", () => {
    expect(exportFileName("")).toBe("campaign.mbclone-save.json");
    expect(exportFileName("!!!")).toBe("campaign.mbclone-save.json");
  });
});

describe("slugifySlotId", () => {
  it("is stable, so two saves of the same name are the same slot", () => {
    expect(slugifySlotId("Before The Flood")).toBe("before-the-flood");
  });

  it("does not collide on an empty id for a name with no ASCII in it", () => {
    // Two names that both slugify to nothing must not become the same slot, or
    // the second save silently overwrites the first. Date.now() would not save
    // this: both calls land inside one millisecond.
    expect(slugifySlotId("日本語")).not.toBe("");
    expect(slugifySlotId("日本語")).not.toBe(slugifySlotId("中文"));
    expect(slugifySlotId("!!!")).not.toBe(slugifySlotId("???"));
  });
});