/** Task 136: the arms designer applies to shields in battle. */

import { describe, expect, it } from "vitest";
import { applyArmsToShields, armsKey, createCoatOfArms, type ShieldTarget } from "../coatOfArms.js";

describe("coat of arms (task 136)", () => {
  it("designs arms with a stable key", () => {
    const arms = { ...createCoatOfArms(), field: "blue" as const, charge: "wolf" as const };
    expect(armsKey(arms)).toBe("blue|plain|wolf");
  });

  it("paints every shield through the target", () => {
    const painted: Array<[string, string]> = [];
    const target: ShieldTarget = {
      paintShield: (id, arms) => void painted.push([id, armsKey(arms)]),
    };
    const arms = createCoatOfArms();
    applyArmsToShields(target, ["s1", "s2", "s3"], arms);
    expect(painted.map(([id]) => id)).toEqual(["s1", "s2", "s3"]);
    expect(new Set(painted.map(([, k]) => k)).size).toBe(1);
  });
});
