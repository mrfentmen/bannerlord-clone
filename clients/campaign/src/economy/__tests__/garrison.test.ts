/** Task 117: auto-recruit keeps the garrison at target. */

import { describe, expect, it } from "vitest";
import { setGarrisonTarget, tickGarrison } from "../garrison.js";

describe("garrison management (task 117)", () => {
  it("auto-recruit tops up toward the target", () => {
    const g = { fiefId: "harbor", troops: 40, target: 100, autoRecruit: true, troopCost: 10 };
    const t = tickGarrison(g, 10000);
    expect(t.recruited).toBe(60);
    expect(t.garrison.troops).toBe(100);
    expect(t.spent).toBe(600);
  });

  it("never overshoots and respects funds", () => {
    const g = { fiefId: "harbor", troops: 90, target: 100, autoRecruit: true, troopCost: 10 };
    const t = tickGarrison(g, 55);
    expect(t.recruited).toBe(5);
    expect(t.garrison.troops).toBe(95);
    const full = tickGarrison({ ...g, troops: 100 }, 10000);
    expect(full.recruited).toBe(0);
  });

  it("does nothing when auto-recruit is off", () => {
    const g = { fiefId: "harbor", troops: 40, target: 100, autoRecruit: false, troopCost: 10 };
    expect(tickGarrison(g, 10000).recruited).toBe(0);
  });

  it("targets clamp at zero", () => {
    const g = { fiefId: "h", troops: 10, target: 100, autoRecruit: true, troopCost: 10 };
    expect(setGarrisonTarget(g, -5).target).toBe(0);
  });
});
