/**
 * Achievements tests (MASTER_PLAN task 137).
 *
 * Accept: 100 defined, progress tracked.
 */

import { describe, expect, it } from "vitest";
import { ACHIEVEMENT_COUNT, ACHIEVEMENT_DEFS, createAchievementStore } from "../index.js";
import type { StorageLike } from "../index.js";

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

describe("catalog", () => {
  it("defines 100+ achievements (accept)", () => {
    expect(ACHIEVEMENT_COUNT).toBeGreaterThanOrEqual(100);
    expect(ACHIEVEMENT_DEFS).toHaveLength(ACHIEVEMENT_COUNT);
  });

  it("has unique ids and sane tiers", () => {
    const ids = ACHIEVEMENT_DEFS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of ACHIEVEMENT_DEFS) {
      expect(d.title.trim().length).toBeGreaterThan(0);
      expect(d.description.trim().length).toBeGreaterThan(0);
      expect(d.count).toBeGreaterThan(0);
      expect(d.points).toBeGreaterThan(0);
    }
  });

  it("covers every category", () => {
    const cats = new Set(ACHIEVEMENT_DEFS.map((d) => d.category));
    expect(cats).toEqual(new Set(["quests", "command", "knowledge", "customization", "meta"]));
  });
});

describe("createAchievementStore", () => {
  it("unlocks a definition when its count is reached", () => {
    const store = createAchievementStore(memoryStorage());
    expect(store.record("quest.completed").map((d) => d.id).sort()).toEqual(["achievements-unlocked-1", "quest-completed-1"]);
    const p = store.progress("quest-completed-1")!;
    expect(p.unlocked).toBe(true);
    expect(p.current).toBe(1);
    expect(store.progress("quest-completed-5")!.unlocked).toBe(false);
    expect(store.progress("quest-completed-5")!.current).toBe(1);
  });

  it("counts field-matched and overall defs from one event", () => {
    const store = createAchievementStore(memoryStorage());
    store.record("quest.completed", { category: "war" });
    store.record("quest.completed", { category: "war" });
    store.record("quest.completed", { category: "war" });
    expect(store.progress("quest-completed-war-3")!.unlocked).toBe(true);
    expect(store.progress("quest-completed-5")!.current).toBe(3);
    expect(store.progress("quest-completed-5")!.unlocked).toBe(false);
  });

  it("does not count non-matching fields", () => {
    const store = createAchievementStore(memoryStorage());
    store.record("quest.completed", { category: "trade" });
    expect(store.progress("quest-completed-war-3")!.current).toBe(0);
    expect(store.progress("quest-completed-1")!.current).toBe(1);
  });

  it("unlocks meta achievements in the same pass", () => {
    const store = createAchievementStore(memoryStorage());
    const seen: string[][] = [];
    store.onUnlock((defs) => seen.push(defs.map((d) => d.id)));
    store.record("quest.completed"); // unlocks quest-completed-1 AND achievements-unlocked-1
    expect(store.progress("achievements-unlocked-1")!.unlocked).toBe(true);
    expect(seen.flat()).toContain("quest-completed-1");
    expect(seen.flat()).toContain("achievements-unlocked-1");
  });

  it("supports batch counts and clamps progress display", () => {
    const store = createAchievementStore(memoryStorage());
    const newly = store.record("codex.entry_read", undefined, 50);
    expect(newly.length).toBeGreaterThan(0);
    expect(store.progress("codex-read-45")!.unlocked).toBe(true);
    expect(store.progress("codex-read-45")!.current).toBe(45);
  });

  it("persists counts and unlocks across instances", () => {
    const storage = memoryStorage();
    const a = createAchievementStore(storage);
    a.record("battle.deployed");
    a.record("battle.deployed");
    const b = createAchievementStore(storage);
    expect(b.progress("battle-deployed-1")!.unlocked).toBe(true);
    expect(b.progress("battle-deployed-5")!.current).toBe(2);
    expect(b.unlockedCount()).toBe(a.unlockedCount());
  });

  it("survives corrupt storage", () => {
    const storage = memoryStorage();
    storage.setItem("fentmen.achievements.v1", "{not json");
    const store = createAchievementStore(storage);
    expect(store.unlockedCount()).toBe(0);
    expect(store.record("quest.completed")).toHaveLength(2);
  });

  it("tracks points and reset", () => {
    const store = createAchievementStore(memoryStorage());
    store.record("quest.completed");
    expect(store.totalPoints()).toBeGreaterThan(0);
    store.reset();
    expect(store.unlockedCount()).toBe(0);
    expect(store.totalPoints()).toBe(0);
    expect(store.progress("quest-completed-1")!.unlocked).toBe(false);
  });

  it("returns undefined progress for unknown ids", () => {
    const store = createAchievementStore(memoryStorage());
    expect(store.progress("nope")).toBeUndefined();
  });
});
