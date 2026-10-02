/** Task 109: every active deal is listed. */

import { describe, expect, it } from "vitest";
import { activeDeals, daysLeft, signDeal } from "../deals.js";

describe("deal registry (task 109)", () => {
  it("lists every active deal, soonest expiry first", () => {
    const a = signDeal("alliance", ["Harbor", "Iron"], ["mutual defense"], 90, 1);
    const b = signDeal("trade", ["Harbor", "Rust"], ["open river"], 30, 1);
    const c = signDeal("pact", ["Iron", "Rust"], ["no raids"], 10, 1); // expired
    const list = activeDeals([a, b, c], 20);
    expect(list.map((d) => d.id)).toEqual([b.id, a.id]);
  });

  it("reports days remaining", () => {
    const d = signDeal("tribute", ["Rust", "Harbor"], ["500 gold"], 40, 1);
    expect(daysLeft(d, 35)).toBe(5);
    expect(daysLeft(d, 40)).toBe(0);
  });

  it("an empty registry lists nothing", () => {
    expect(activeDeals([], 1)).toEqual([]);
  });
});
