/** Task 120: low cohesion warns before battle. */

import { describe, expect, it } from "vitest";
import { armyCohesion, cohesionWarning, shouldWarnCohesion } from "../cohesion.js";

describe("army cohesion (task 120)", () => {
  it("scores morale, supply, and defeats", () => {
    expect(armyCohesion({ morale: 80, recentDefeats: 0, supply: 90 })).toBeGreaterThan(60);
    expect(armyCohesion({ morale: 20, recentDefeats: 3, supply: 10 })).toBeLessThan(30);
  });

  it("warns below 30", () => {
    expect(shouldWarnCohesion(29)).toBe(true);
    expect(shouldWarnCohesion(30)).toBe(false);
    expect(cohesionWarning(20)).toContain("may break");
    expect(cohesionWarning(80)).toBeNull();
  });
});
