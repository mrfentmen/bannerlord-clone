import { describe, expect, it } from "vitest";
import { citeMvp, mvpScore } from "../mvp.js";

const units = [
  { unitId: "u1", name: "Iron Shields", kind: "infantry", kills: 12, damageDealt: 3400, started: 60, ended: 41 },
  { unitId: "u2", name: "Longbows", kind: "archers", kills: 31, damageDealt: 5200, started: 40, ended: 38 },
  { unitId: "u3", name: "Dust Riders", kind: "cavalry", kills: 8, damageDealt: 2100, started: 24, ended: 20 },
];

describe("MVP unit citation (solo task 42)", () => {
  it("names the top performer", () => {
    const mvp = citeMvp(units)!;
    expect(mvp.name).toBe("Longbows");
    expect(mvp.kind).toBe("archers");
    expect(mvp.kills).toBe(31);
  });

  it("cites stats in the citation line", () => {
    const mvp = citeMvp(units)!;
    expect(mvp.citation).toContain("Longbows");
    expect(mvp.citation).toContain("31 kills");
    expect(mvp.survivalRate).toBeCloseTo(0.95, 5);
  });

  it("returns null with no record", () => {
    expect(citeMvp([])).toBeNull();
    expect(
      citeMvp([{ unitId: "u", name: "X", kind: "infantry", kills: 0, damageDealt: 0, started: 10, ended: 10 }]),
    ).toBeNull();
  });

  it("kills dominate the score", () => {
    const killer = { unitId: "a", name: "A", kind: "infantry", kills: 5, damageDealt: 100, started: 10, ended: 5 };
    const damager = { unitId: "b", name: "B", kind: "archers", kills: 1, damageDealt: 2000, started: 10, ended: 10 };
    expect(mvpScore(killer)).toBeGreaterThan(mvpScore(damager));
  });

  it("is deterministic", () => {
    expect(citeMvp(units)).toEqual(citeMvp(units));
  });
});
