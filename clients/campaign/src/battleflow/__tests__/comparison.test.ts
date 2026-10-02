import { describe, expect, it } from "vitest";
import { compareBattles } from "../comparison.js";

const prev = {
  battleName: "Dust Bowl",
  date: 1000,
  playerWon: true,
  playerKills: 60,
  playerLosses: 30,
  loot: 500,
  ticks: 240,
};

const curr = {
  battleName: "Harbor",
  date: 2000,
  playerWon: true,
  playerKills: 80,
  playerLosses: 20,
  loot: 700,
  ticks: 200,
};

describe("battle comparison (solo task 50)", () => {
  it("computes deltas with direction", () => {
    const c = compareBattles(prev, curr);
    expect(c.deltas).toHaveLength(4);
    const kills = c.deltas.find((d) => d.metric === "Kills")!;
    expect(kills.delta).toBe(20);
    expect(kills.better).toBe(true);
    const losses = c.deltas.find((d) => d.metric === "Losses")!;
    expect(losses.delta).toBe(-10);
    expect(losses.better).toBe(true);
  });

  it("verdicts on the trend", () => {
    expect(compareBattles(prev, curr).verdict).toContain("Trending better");
    const worse = compareBattles(curr, prev);
    expect(worse.verdict).toContain("Trending worse");
  });

  it("refuses to compare a battle with itself", () => {
    expect(() => compareBattles(prev, { ...prev })).toThrow("itself");
  });

  it("formats lines", () => {
    const c = compareBattles(prev, curr);
    expect(c.deltas[0]!.line).toContain("60 → 80");
  });
});
