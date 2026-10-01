/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  IRONMAN_SEASON_DAYS,
  canContinue,
  clearIronmanRun,
  loadIronmanRun,
  manualSaveBlocked,
  markRunDead,
  seasonsElapsed,
  startIronmanRun,
  type IronmanRunRecord,
} from "../ironman.js";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("ironman run record", () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memStorage();
  });

  it("loads null when nothing was stored", () => {
    expect(loadIronmanRun(storage)).toBeNull();
  });

  it("starts a run on the given day and persists it", () => {
    const record = startIronmanRun(41, storage);
    expect(record).toEqual({ active: true, dead: false, startedDay: 41 });
    expect(loadIronmanRun(storage)).toEqual(record);
  });

  it("blocks manual saves while the run is live", () => {
    const record = startIronmanRun(0, storage);
    expect(manualSaveBlocked(record)).toBe(true);
  });

  it("does not block manual saves without a run", () => {
    expect(manualSaveBlocked(null)).toBe(false);
  });

  it("a dead run cannot continue and still blocks manual saves", () => {
    const record = startIronmanRun(0, storage);
    const dead = markRunDead(record, storage);
    expect(dead.dead).toBe(true);
    expect(canContinue(dead)).toBe(false);
    expect(manualSaveBlocked(dead)).toBe(true);
    // The death survives a reload.
    expect(loadIronmanRun(storage)?.dead).toBe(true);
  });

  it("a live run can continue", () => {
    expect(canContinue(startIronmanRun(0, storage))).toBe(true);
    expect(canContinue(null)).toBe(true);
  });

  it("clears the record so a fresh campaign is not ironman", () => {
    startIronmanRun(0, storage);
    clearIronmanRun(storage);
    expect(loadIronmanRun(storage)).toBeNull();
  });

  it("derives whole seasons from the day, never negative", () => {
    const record: IronmanRunRecord = { active: true, dead: false, startedDay: 10 };
    expect(seasonsElapsed(record, 10)).toBe(0);
    expect(seasonsElapsed(record, 10 + IRONMAN_SEASON_DAYS - 1)).toBe(0);
    expect(seasonsElapsed(record, 10 + IRONMAN_SEASON_DAYS * 3)).toBe(3);
    expect(seasonsElapsed(record, 0)).toBe(0);
  });

  it("a corrupt record loads as null rather than locking the player out", () => {
    storage.setItem("fentmen.ironman.v1", "{not json");
    expect(loadIronmanRun(storage)).toBeNull();
    storage.setItem("fentmen.ironman.v1", JSON.stringify({ active: "yes" }));
    expect(loadIronmanRun(storage)).toBeNull();
  });

  it("degrades when storage is unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    expect(loadIronmanRun(broken)).toBeNull();
    // Starting still returns a working in-memory record.
    expect(startIronmanRun(5, broken).active).toBe(true);
  });
});
