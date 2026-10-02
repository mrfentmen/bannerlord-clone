/** Task 113: announcements reach all towns. */

import { describe, expect, it } from "vitest";
import { proclaim, reachedAllTowns } from "../herald.js";

describe("herald (task 113)", () => {
  it("delivers to every town", () => {
    const towns = ["harbor", "iron", "rust", "mill"];
    const a = proclaim("The war is over.", towns, 42);
    expect(a.deliveredTo).toEqual(towns);
    expect(reachedAllTowns(a, towns)).toBe(true);
  });

  it("detects a missed town", () => {
    const a = proclaim("Taxes rise.", ["harbor"], 42);
    expect(reachedAllTowns(a, ["harbor", "iron"])).toBe(false);
  });
});
