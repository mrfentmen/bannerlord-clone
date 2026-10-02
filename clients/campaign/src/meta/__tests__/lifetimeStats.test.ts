import { describe, expect, it } from "vitest";
import {
  addPlaySeconds,
  formatCount,
  formatPlayTime,
  lifetimeHours,
  lifetimeWinRate,
  loadLifetimeStats,
  recordCampaignStart,
  recordLifetimeBattle,
  recordLifetimeGold,
  recordLifetimeKills,
  recordLifetimeScheme,
  recordLifetimeSeasons,
  recordLifetimeTreaty,
  resetLifetimeStats,
} from "../lifetimeStats.js";

function memStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

describe("lifetime stats store", () => {
  it("starts empty", () => {
    const s = loadLifetimeStats(memStorage());
    expect(s.battlesFought).toBe(0);
    expect(s.kills).toBe(0);
    expect(s.playSeconds).toBe(0);
  });

  it("accumulates battles across campaigns", () => {
    const store = memStorage();
    recordLifetimeBattle({ won: true }, store);
    recordLifetimeBattle({ won: false }, store);
    recordLifetimeBattle({ won: true, kills: 12, goldEarned: 500 }, store);
    const s = loadLifetimeStats(store);
    expect(s.battlesFought).toBe(3);
    expect(s.battlesWon).toBe(2);
    expect(s.battlesLost).toBe(1);
    expect(s.kills).toBe(12);
    expect(s.goldEarned).toBe(500);
  });

  it("persists across separate loads (cross-campaign)", () => {
    const store = memStorage();
    recordLifetimeBattle({ won: true }, store);
    // A fresh "campaign" reads the same store.
    const s = loadLifetimeStats(store);
    expect(s.battlesWon).toBe(1);
  });

  it("accumulates play time, campaigns, seasons, treaties, schemes", () => {
    const store = memStorage();
    addPlaySeconds(3661, store);
    recordCampaignStart(store);
    recordCampaignStart(store);
    recordLifetimeSeasons(9, store);
    recordLifetimeTreaty(store);
    recordLifetimeScheme(store);
    const s = loadLifetimeStats(store);
    expect(lifetimeHours(s)).toBeCloseTo(1.017, 3);
    expect(s.campaignsStarted).toBe(2);
    expect(s.seasonsPlayed).toBe(9);
    expect(s.treatiesSigned).toBe(1);
    expect(s.schemesCompleted).toBe(1);
  });

  it("records gold and kills directly", () => {
    const store = memStorage();
    recordLifetimeGold(250, store);
    recordLifetimeKills(7, store);
    const s = loadLifetimeStats(store);
    expect(s.goldEarned).toBe(250);
    expect(s.kills).toBe(7);
  });

  it("clamps hostile inputs to zero", () => {
    const store = memStorage();
    recordLifetimeBattle({ won: true, kills: -5, goldEarned: NaN }, store);
    const s = loadLifetimeStats(store);
    expect(s.kills).toBe(0);
    expect(s.goldEarned).toBe(0);
  });

  it("discards corrupt records", () => {
    const store = memStorage();
    store.setItem("fentmen.lifetimestats.v1", "{not json");
    expect(loadLifetimeStats(store).battlesFought).toBe(0);
  });

  it("resets to empty", () => {
    const store = memStorage();
    recordLifetimeBattle({ won: true }, store);
    resetLifetimeStats(store);
    expect(loadLifetimeStats(store).battlesFought).toBe(0);
  });

  it("computes win rate and formatting", () => {
    const store = memStorage();
    expect(lifetimeWinRate(loadLifetimeStats(store))).toBeNull();
    recordLifetimeBattle({ won: true }, store);
    recordLifetimeBattle({ won: false }, store);
    recordLifetimeBattle({ won: true }, store);
    const s = loadLifetimeStats(store);
    expect(lifetimeWinRate(s)).toBeCloseTo(2 / 3, 5);
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatPlayTime(45 * 60)).toBe("45m");
    expect(formatPlayTime(90 * 60)).toBe("1.5h");
    expect(formatPlayTime(20 * 3600)).toBe("20h");
  });
});
