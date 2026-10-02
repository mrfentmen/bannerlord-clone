/**
 * Crowd-density knob tests.
 *
 * `parseCrowdParam` is the only pure, headless-safe piece of the city demo
 * (the rest needs a canvas + Babylon engine), so these tests drive it
 * directly: valid values pass through, garbage falls back to the default,
 * and out-of-range values clamp.
 */

import { describe, expect, it } from "vitest";
import { CROWD_DEFAULT, CROWD_MAX, CROWD_MIN, parseCrowdParam } from "../cityDemo.js";

describe("parseCrowdParam", () => {
  it("defaults when the param is missing or empty", () => {
    expect(parseCrowdParam(null)).toBe(CROWD_DEFAULT);
    expect(parseCrowdParam("")).toBe(CROWD_DEFAULT);
    expect(parseCrowdParam("   ")).toBe(CROWD_DEFAULT);
  });

  it("parses a valid integer", () => {
    expect(parseCrowdParam("60")).toBe(60);
    expect(parseCrowdParam("0")).toBe(0);
  });

  it("floors fractional values", () => {
    expect(parseCrowdParam("24.9")).toBe(24);
  });

  it("clamps to the supported range", () => {
    expect(parseCrowdParam("-5")).toBe(CROWD_MIN);
    expect(parseCrowdParam("9999")).toBe(CROWD_MAX);
  });

  it("falls back on non-numeric garbage", () => {
    expect(parseCrowdParam("lots")).toBe(CROWD_DEFAULT);
    expect(parseCrowdParam("NaN")).toBe(CROWD_DEFAULT);
    expect(parseCrowdParam("Infinity")).toBe(CROWD_DEFAULT);
  });

  it("honours a custom fallback", () => {
    expect(parseCrowdParam(null, 40)).toBe(40);
    expect(parseCrowdParam("bogus", 40)).toBe(40);
  });
});
