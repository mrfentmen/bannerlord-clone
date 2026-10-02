/** Task 112: the convoy arrives or gets ambushed. */

import { describe, expect, it } from "vitest";
import { planConvoy, resolveConvoy } from "../convoy.js";

describe("convoy planner (task 112)", () => {
  it("guards cut the ambush odds", () => {
    const bare = planConvoy("harbor", "iron", 500, 0);
    const guarded = planConvoy("harbor", "iron", 500, 6);
    expect(guarded.ambushOdds).toBeLessThan(bare.ambushOdds);
    expect(guarded.guardCost).toBe(90);
  });

  it("a lucky convoy arrives with its cargo", () => {
    const plan = planConvoy("harbor", "iron", 500, 4);
    const r = resolveConvoy(plan, () => 0.99);
    expect(r.fate).toBe("arrived");
    if (r.fate === "arrived") expect(r.delivered).toBe(500);
  });

  it("an unlucky convoy is ambushed and the cargo is lost", () => {
    const plan = planConvoy("harbor", "iron", 500, 0);
    const r = resolveConvoy(plan, () => 0.0);
    expect(r.fate).toBe("ambushed");
    if (r.fate === "ambushed") expect(r.lost).toBe(500);
  });
});
