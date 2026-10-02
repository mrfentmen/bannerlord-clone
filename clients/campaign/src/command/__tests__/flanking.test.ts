import { describe, expect, it } from "vitest";
import { FLANK_BONUS, flankArc, flankBonus, flankBadgeText, REAR_BONUS } from "../flanking.js";

describe("flanking bonus indicator (solo task 29)", () => {
  it("detects the front arc", () => {
    // Target at origin facing +x (0 rad); attacker ahead at +x.
    expect(flankArc(10, 0, 0, 0, 0)).toBe("front");
  });

  it("detects the flank arc", () => {
    // Attacker to the side (+z) of a target facing +x.
    expect(flankArc(0, 10, 0, 0, 0)).toBe("flank");
  });

  it("detects the rear arc", () => {
    // Attacker behind (-x) a target facing +x.
    expect(flankArc(-10, 0, 0, 0, 0)).toBe("rear");
  });

  it("respects the target facing", () => {
    // Target facing -x (PI); attacker at +x is now behind it.
    expect(flankArc(10, 0, 0, 0, Math.PI)).toBe("rear");
  });

  it("applies the documented bonuses", () => {
    expect(flankBonus("front")).toBe(1);
    expect(flankBonus("flank")).toBe(FLANK_BONUS);
    expect(flankBonus("rear")).toBe(REAR_BONUS);
    expect(REAR_BONUS).toBeGreaterThan(FLANK_BONUS);
  });

  it("badge text is null without a bonus", () => {
    expect(flankBadgeText("front")).toBeNull();
    expect(flankBadgeText("flank")).toBe("FLANK +25%");
    expect(flankBadgeText("rear")).toBe("REAR +50%");
  });
});
