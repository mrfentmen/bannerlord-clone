/** Task 96: false rumors are marked after verification. */

import { describe, expect, it } from "vitest";
import { hearRumor, isFalseRumor, sortRumors, verifyRumor } from "../rumors.js";

describe("rumor system (task 96)", () => {
  it("hears rumors as unverified", () => {
    const r = hearRumor("The duke is broke", "tavern talk", 12);
    expect(r.status).toBe("unverified");
  });

  it("marks false rumors after verification", () => {
    const r = hearRumor("The duke is broke", "tavern talk", 12);
    const checked = verifyRumor(r, false);
    expect(checked.status).toBe("false");
    expect(isFalseRumor(checked)).toBe(true);
    // The mark sticks: re-verifying true does not unmark a lie.
    expect(verifyRumor(checked, true).status).toBe("true");
  });

  it("marks true rumors too", () => {
    const r = verifyRumor(hearRumor("Grain prices rising", "merchant", 13), true);
    expect(r.status).toBe("true");
    expect(isFalseRumor(r)).toBe(false);
  });

  it("sorts newest first", () => {
    const a = hearRumor("a", "s", 10);
    const b = hearRumor("b", "s", 14);
    expect(sortRumors([a, b]).map((r) => r.day)).toEqual([14, 10]);
  });
});
