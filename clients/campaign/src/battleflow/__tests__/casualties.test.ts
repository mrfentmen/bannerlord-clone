import { describe, expect, it } from "vitest";
import { apportion, breakdown, casualtySummary } from "../casualties.js";

describe("casualty breakdown by unit type (solo task 41)", () => {
  it("breaks down exact snapshots, worst first", () => {
    const entries = breakdown([
      { kind: "infantry", started: 100, ended: 88 },
      { kind: "archers", started: 40, ended: 30 },
      { kind: "cavalry", started: 20, ended: 20 },
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: "infantry", started: 100, lost: 12 });
    expect(entries[1]).toMatchObject({ kind: "archers", lost: 10 });
    expect(entries[0]!.lossRate).toBeCloseTo(0.12, 5);
  });

  it("apportions total losses proportionally", () => {
    const entries = apportion(20, [
      { kind: "infantry", count: 100 },
      { kind: "archers", count: 100 },
    ]);
    const total = entries.reduce((s, e) => s + e.lost, 0);
    expect(total).toBe(20);
  });

  it("apportion never exceeds the force", () => {
    const entries = apportion(500, [{ kind: "infantry", count: 100 }]);
    expect(entries[0]!.lost).toBe(100);
  });

  it("apportion is deterministic", () => {
    const comp = [
      { kind: "infantry", count: 137 },
      { kind: "archers", count: 61 },
      { kind: "cavalry", count: 33 },
    ];
    expect(apportion(45, comp)).toEqual(apportion(45, comp));
  });

  it("summarises honestly", () => {
    const entries = breakdown([
      { kind: "infantry", started: 100, ended: 88 },
      { kind: "archers", started: 40, ended: 35 },
    ]);
    expect(casualtySummary(entries)).toBe("infantry 12, archers 5");
  });

  it("empty inputs give empty breakdowns", () => {
    expect(breakdown([])).toEqual([]);
    expect(apportion(0, [{ kind: "infantry", count: 10 }])).toEqual([]);
    expect(apportion(10, [])).toEqual([]);
  });
});
