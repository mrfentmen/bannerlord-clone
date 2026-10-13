import { describe, expect, it } from "vitest";
import { treatWounded } from "../medicine.js";

describe("battlefield medicine (solo task 45)", () => {
  it("splits wounded into saved and died", () => {
    const r = treatWounded(100, 5, 7);
    expect(r.wounded).toBe(100);
    expect(r.saved + r.died).toBe(100);
    expect(r.saved).toBeGreaterThan(0);
    expect(r.died).toBeGreaterThan(0);
  });

  it("better surgeons save more", () => {
    const bad = treatWounded(200, 0, 7);
    const good = treatWounded(200, 10, 7);
    expect(good.saved).toBeGreaterThan(bad.saved);
  });

  it("reports the result line", () => {
    const r = treatWounded(50, 5, 7);
    expect(r.line).toContain(`saved ${r.saved} of 50 wounded`);
  });

  it("no wounded means no report", () => {
    const r = treatWounded(0, 5, 7);
    expect(r.saved).toBe(0);
    expect(r.died).toBe(0);
  });

  it("is deterministic per seed", () => {
    expect(treatWounded(100, 5, 7)).toEqual(treatWounded(100, 5, 7));
  });
});
