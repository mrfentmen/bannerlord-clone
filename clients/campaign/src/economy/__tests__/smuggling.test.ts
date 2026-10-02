/** Task 108: caught smugglers pay a fine and lose rep. */

import { describe, expect, it } from "vitest";
import { planSmuggling, resolveSmuggling } from "../smuggling.js";

describe("smuggling (task 108)", () => {
  it("heat and volume raise the detection odds", () => {
    const calm = planSmuggling("silk", 10, 0);
    const hot = planSmuggling("silk", 500, 90);
    expect(hot.detectionOdds).toBeGreaterThan(calm.detectionOdds);
  });

  it("a clean run pays the profit", () => {
    const plan = planSmuggling("silk", 100, 0);
    const r = resolveSmuggling(plan, () => 0.99);
    expect(r.caught).toBe(false);
    if (!r.caught) expect(r.profit).toBe(400);
  });

  it("caught = fine + rep loss", () => {
    const plan = planSmuggling("silk", 100, 50);
    const r = resolveSmuggling(plan, () => 0.0);
    expect(r.caught).toBe(true);
    if (r.caught) {
      expect(r.fine).toBeGreaterThan(0);
      expect(r.repLoss).toBeGreaterThan(0);
    }
  });
});
