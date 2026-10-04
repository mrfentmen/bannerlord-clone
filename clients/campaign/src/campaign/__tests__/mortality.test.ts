/**
 * Mortality: Bannerlord's old-age death curve.
 */

import { describe, expect, it } from "vitest";
import { annualDeathChance, rollAnnualDeath } from "../mortality.js";

describe("mortality", () => {
  it("nobody dies young of old age", () => {
    expect(annualDeathChance(20)).toBe(0);
    expect(annualDeathChance(44)).toBe(0);
  });

  it("the risk rises steeply with age", () => {
    const at50 = annualDeathChance(50);
    const at60 = annualDeathChance(60);
    const at70 = annualDeathChance(70);
    const at80 = annualDeathChance(80);
    expect(at50).toBeGreaterThan(0);
    expect(at60).toBeGreaterThan(at50);
    expect(at70).toBeGreaterThan(at60);
    expect(at80).toBeGreaterThan(at70);
    expect(at80).toBeLessThanOrEqual(0.9);
  });

  it("rolls kill the old and spare the young", () => {
    expect(rollAnnualDeath(30, () => 0.0)).toBe(false);
    expect(rollAnnualDeath(90, () => 0.0)).toBe(true);
    expect(rollAnnualDeath(90, () => 0.999)).toBe(false);
  });
});
