import { describe, expect, it } from "vitest";
import { createRosterBuilder, ROSTER_BUDGET, unitCost } from "../rosterBuilder.js";

describe("custom battle roster builder (solo task 35)", () => {
  it("tracks spent and remaining", () => {
    const b = createRosterBuilder();
    b.add("infantry", 1, 10);
    expect(b.spent()).toBe(10 * unitCost("infantry", 1));
    expect(b.remaining()).toBe(ROSTER_BUDGET - b.spent());
  });

  it("rejects over-budget picks", () => {
    const b = createRosterBuilder(50);
    expect(() => b.add("cavalry", 3, 10)).toThrow("over budget");
    expect(b.spent()).toBe(0);
  });

  it("merges repeated picks of the same kind/tier", () => {
    const b = createRosterBuilder();
    b.add("archers", 2, 5);
    b.add("archers", 2, 5);
    expect(b.entries()).toHaveLength(1);
    expect(b.entries()[0]!.count).toBe(10);
  });

  it("removes soldiers and prunes empty entries", () => {
    const b = createRosterBuilder();
    b.add("infantry", 1, 10);
    b.remove("infantry", 1, 4);
    expect(b.entries()[0]!.count).toBe(6);
    b.remove("infantry", 1, 6);
    expect(b.entries()).toHaveLength(0);
    expect(() => b.remove("infantry", 1, 1)).toThrow();
  });

  it("builds a ForceDef for the custom battle", () => {
    const b = createRosterBuilder();
    b.add("infantry", 1, 20);
    b.add("cavalry", 2, 8);
    const force = b.buildForce("roster-1", "My Warband");
    expect(force.name).toBe("My Warband");
    expect(force.units).toHaveLength(2);
    expect(force.units[0]).toEqual({ kind: "infantry", count: 20, tier: 1 });
  });

  it("higher tiers cost more", () => {
    expect(unitCost("infantry", 3)).toBeGreaterThan(unitCost("infantry", 1));
  });
});
