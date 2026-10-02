import { describe, expect, it } from "vitest";
import { scoutEnemy } from "../scouting.js";

describe("pre-battle scouting report (solo task 21)", () => {
  it("estimates composition from troops and power", () => {
    const report = scoutEnemy(100, 100);
    expect(report.estimates).toHaveLength(3);
    const total = report.estimates.reduce((s, e) => s + e.count, 0);
    expect(total).toBeGreaterThan(90);
    expect(total).toBeLessThanOrEqual(110);
    const shares = report.estimates.reduce((s, e) => s + e.share, 0);
    expect(shares).toBeCloseTo(1, 5);
  });

  it("high power-per-troop implies cavalry weight", () => {
    const levy = scoutEnemy(100, 50);
    const elite = scoutEnemy(100, 200);
    const cav = (r: ReturnType<typeof scoutEnemy>) => r.estimates.find((e) => e.kind === "cavalry")!.share;
    expect(cav(elite)).toBeGreaterThan(cav(levy));
  });

  it("is deterministic", () => {
    expect(scoutEnemy(120, 150)).toEqual(scoutEnemy(120, 150));
  });

  it("confidence scales with force size", () => {
    expect(scoutEnemy(10, 10).confidence).toBe("low");
    expect(scoutEnemy(50, 50).confidence).toBe("medium");
    expect(scoutEnemy(200, 200).confidence).toBe("high");
  });

  it("labels the report an estimate", () => {
    const report = scoutEnemy(100, 100);
    expect(report.note).toContain("Estimate");
    expect(report.summary).toContain("100 troops");
  });
});
