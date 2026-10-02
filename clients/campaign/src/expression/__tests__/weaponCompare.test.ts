/** Task 133: the DPS delta is shown. */

import { describe, expect, it } from "vitest";
import { compareWeapons, weaponDps } from "../weaponCompare.js";

describe("weapon comparison (task 133)", () => {
  it("computes DPS", () => {
    expect(weaponDps({ id: "w", name: "Axe", damage: 25, speed: 0.8 })).toBe(20);
  });

  it("shows the signed delta and the winner", () => {
    const a = { id: "a", name: "Axe", damage: 25, speed: 0.8 };
    const b = { id: "b", name: "Blade", damage: 15, speed: 1.6 };
    const c = compareWeapons(a, b);
    expect(c.dpsA).toBe(20);
    expect(c.dpsB).toBe(24);
    expect(c.dpsDelta).toBe(4);
    expect(c.winner).toBe("b");
    expect(compareWeapons(a, a).winner).toBe("tie");
  });
});
