/** Task 74: unit history log grows across a campaign. */

import { describe, expect, it } from "vitest";
import {
  appendHistory,
  createMemoryHistoryStore,
  createUnitHistoryLog,
  historyFor,
  summarizeHistory,
} from "../unitHistory.js";

function entry(day: number, kills: number, survived = true) {
  return { day, battleLabel: `Battle ${day}`, kills, survived, unitName: "Asha" };
}

describe("unit history log (task 74)", () => {
  it("grows across battles, oldest first", () => {
    const log = createUnitHistoryLog();
    appendHistory(log, "u1", entry(1, 3));
    appendHistory(log, "u1", entry(5, 7));
    appendHistory(log, "u1", entry(9, 2, false));
    const h = historyFor(log, "u1");
    expect(h.map((e) => e.day)).toEqual([1, 5, 9]);
    expect(h).toHaveLength(3);
  });

  it("isolates units from each other", () => {
    const log = createUnitHistoryLog();
    appendHistory(log, "u1", entry(1, 3));
    appendHistory(log, "u2", entry(1, 9));
    expect(historyFor(log, "u1")).toHaveLength(1);
    expect(historyFor(log, "u2")[0]!.kills).toBe(9);
    expect(historyFor(log, "u3")).toEqual([]);
  });

  it("summarizes a career", () => {
    const log = createUnitHistoryLog();
    expect(summarizeHistory(log, "u1")).toBe("No battles fought yet.");
    appendHistory(log, "u1", entry(1, 3));
    appendHistory(log, "u1", entry(5, 7, false));
    expect(summarizeHistory(log, "u1")).toBe("2 battles, 10 kills, survived 1.");
  });

  it("the memory store round-trips the log", () => {
    const store = createMemoryHistoryStore();
    const log = store.load();
    appendHistory(log, "u1", entry(1, 3));
    store.save(log);
    expect(historyFor(store.load(), "u1")).toHaveLength(1);
    // Loads are copies: mutating one does not corrupt the store.
    store.load()["u1"]!.length = 0;
    expect(historyFor(store.load(), "u1")).toHaveLength(1);
  });
});
