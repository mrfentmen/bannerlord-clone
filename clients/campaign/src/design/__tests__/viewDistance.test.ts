import { describe, expect, it } from "vitest";
import {
  VIEW_DISTANCE_DEFAULT,
  VIEW_DISTANCE_MAX,
  VIEW_DISTANCE_MIN,
  clampViewDistance,
  fogDensityFor,
  viewDistanceFromLegacy,
} from "../viewDistance.js";

describe("view-distance slider policy (task 149)", () => {
  it("clamps to the 80-400 km slider range", () => {
    expect(clampViewDistance(260_000)).toBe(260_000);
    expect(clampViewDistance(0)).toBe(VIEW_DISTANCE_MIN);
    expect(clampViewDistance(999_999)).toBe(VIEW_DISTANCE_MAX);
    expect(clampViewDistance(undefined)).toBe(VIEW_DISTANCE_DEFAULT);
    expect(clampViewDistance(NaN)).toBe(VIEW_DISTANCE_DEFAULT);
  });

  it("migrates the legacy near/far/ultra select", () => {
    expect(viewDistanceFromLegacy("near")).toBe(120_000);
    expect(viewDistanceFromLegacy("far")).toBe(VIEW_DISTANCE_DEFAULT);
    expect(viewDistanceFromLegacy("ultra")).toBe(VIEW_DISTANCE_MAX);
    expect(clampViewDistance("near")).toBe(120_000);
    expect(clampViewDistance("ultra")).toBe(VIEW_DISTANCE_MAX);
  });

  it("hits the old tuned fog densities at the legacy stops", () => {
    expect(fogDensityFor(120_000)).toBeCloseTo(0.000016, 9);
    expect(fogDensityFor(260_000)).toBeCloseTo(0.0000085, 9);
    expect(fogDensityFor(400_000)).toBeCloseTo(0.000004, 9);
  });

  it("thins the haze monotonically as range grows", () => {
    const a = fogDensityFor(100_000);
    const b = fogDensityFor(200_000);
    const c = fogDensityFor(300_000);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
});
