/**
 * The campaign journal (mandate §8): journaling is idempotent and persistent.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from "vitest";
import {
  journalByRecency,
  loadJournalStore,
  saveJournalStore,
  syncJournal,
  type JournalStore,
} from "../journal.js";
import type { Notification } from "../types.js";

function notif(id: string, kind: string, day: number, text: string): Notification {
  return { id, day, priority: "important", text, entityId: "town-1", field: null, kind };
}

const EMPTY: JournalStore = { entries: [], nextSeq: 0 };

describe("syncJournal", () => {
  it("journals battles and sieges in the sim's own words", () => {
    const store = syncJournal(EMPTY, [notif("n1", "battle", 12, "A defeated B near C")], []);
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0]).toMatchObject({ id: "n1", day: 12, text: "A defeated B near C", kind: "battle" });
  });

  it("ignores other notification kinds and never journals twice", () => {
    const notes = [notif("n1", "battle", 12, "A defeated B"), notif("n2", "rebellion", 13, "R rose up")];
    const once = syncJournal(EMPTY, notes, []);
    expect(once.entries).toHaveLength(1);
    const twice = syncJournal(once, notes, []);
    expect(twice.entries).toHaveLength(1);
    expect(twice.nextSeq).toBe(once.nextSeq);
  });

  it("journals completed objectives once", () => {
    const once = syncJournal(EMPTY, [], [{ id: "muster", title: "Muster a warband" }]);
    expect(once.entries).toHaveLength(1);
    expect(once.entries[0]!.kind).toBe("objective");
    expect(once.entries[0]!.text).toContain("Muster a warband");
    const twice = syncJournal(once, [], [{ id: "muster", title: "Muster a warband" }]);
    expect(twice.entries).toHaveLength(1);
  });

  it("caps the journal at 200 entries, oldest first", () => {
    const notes = Array.from({ length: 250 }, (_, i) => notif(`n${i}`, "battle", i, `battle ${i}`));
    const store = syncJournal(EMPTY, notes, []);
    expect(store.entries).toHaveLength(200);
    expect(store.entries[0]!.id).toBe("n50");
    expect(store.entries[199]!.id).toBe("n249");
  });
});

describe("journalByRecency", () => {
  it("reads newest first", () => {
    const store = syncJournal(
      EMPTY,
      [notif("n1", "battle", 1, "first"), notif("n2", "siege", 2, "second")],
      [],
    );
    const recent = journalByRecency(store);
    expect(recent[0]!.id).toBe("n2");
    expect(recent[1]!.id).toBe("n1");
  });
});

describe("journal store", () => {
  it("round-trips through localStorage and survives corruption", () => {
    localStorage.clear();
    expect(loadJournalStore().entries).toHaveLength(0);
    const store = syncJournal(EMPTY, [notif("n1", "battle", 5, "A defeated B")], []);
    saveJournalStore(store);
    const loaded = loadJournalStore();
    expect(loaded.entries).toHaveLength(1);
    expect(loaded.entries[0]!.text).toBe("A defeated B");
    localStorage.setItem("blc-journal-v1", "garbage{{{");
    expect(loadJournalStore().entries).toHaveLength(0);
    localStorage.clear();
  });
});
