import { describe, expect, it } from "vitest";
import {
  ceremonyLine,
  NAME_CULTURES,
  suggestNames,
  validateName,
} from "../namingCeremony.js";

describe("child naming ceremony (solo task 53)", () => {
  it("suggests names per culture and sex", () => {
    for (const culture of NAME_CULTURES) {
      const male = suggestNames(culture, "male");
      const female = suggestNames(culture, "female");
      expect(male.length).toBeGreaterThanOrEqual(3);
      expect(female.length).toBeGreaterThanOrEqual(3);
      expect(male[0]!.meaning).toBeTruthy();
    }
  });

  it("cultures differ", () => {
    const high = suggestNames("highlander", "male").map((n) => n.name);
    const coast = suggestNames("coastal", "male").map((n) => n.name);
    expect(high).not.toEqual(coast);
  });

  it("validates custom names", () => {
    expect(validateName("Aldric").ok).toBe(true);
    expect(validateName("Mary-Kate O'Brien").ok).toBe(true);
    expect(validateName("X").ok).toBe(false);
    expect(validateName("R2D2").ok).toBe(false);
    expect(validateName("a".repeat(25)).ok).toBe(false);
  });

  it("speaks the ceremony line", () => {
    expect(ceremonyLine("Duncan", "dark warrior")).toContain("we name this child Duncan");
    expect(ceremonyLine("Duncan", "dark warrior")).toContain("dark warrior");
  });

  it("unknown cultures throw", () => {
    expect(() => suggestNames("martian" as never, "male")).toThrow("unknown name culture");
  });
});
