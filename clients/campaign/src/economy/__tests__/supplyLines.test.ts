/** Task 104: starving armies are flagged red. */

import { describe, expect, it } from "vitest";
import { assessSupply, flagSupplyLines } from "../supplyLines.js";

describe("supply line overlay (task 104)", () => {
  it("assesses by days of food", () => {
    expect(assessSupply({ armyId: "a", label: "A", x: 0, z: 0, daysOfFood: 10 })).toBe("supplied");
    expect(assessSupply({ armyId: "a", label: "A", x: 0, z: 0, daysOfFood: 2 })).toBe("low");
    expect(assessSupply({ armyId: "a", label: "A", x: 0, z: 0, daysOfFood: 0 })).toBe("starving");
    expect(assessSupply({ armyId: "a", label: "A", x: 0, z: 0, daysOfFood: -1 })).toBe("starving");
  });

  it("flags starving armies red, first", () => {
    const flags = flagSupplyLines([
      { armyId: "ok", label: "OK", x: 0, z: 0, daysOfFood: 9 },
      { armyId: "dying", label: "Dying", x: 1, z: 1, daysOfFood: 0 },
    ]);
    expect(flags[0]!.armyId).toBe("dying");
    expect(flags[0]!.status).toBe("starving");
    expect(flags[0]!.color).toBe("#e53935");
    expect(flags[1]!.color).toBe("#4caf50");
  });
});
