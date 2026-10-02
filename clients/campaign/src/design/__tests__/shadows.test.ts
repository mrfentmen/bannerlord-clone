import { describe, expect, it } from "vitest";
import {
  SHADOW_LEVELS,
  SHADOW_LEVEL_CONFIG,
  shadowConfigFor,
  shadowsEnabled,
} from "../shadows.js";

describe("shadow levels (task 147)", () => {
  it("has four levels", () => {
    expect(SHADOW_LEVELS).toEqual(["off", "low", "medium", "high"]);
  });

  it("off disables shadows and yields no config", () => {
    expect(shadowsEnabled("off")).toBe(false);
    expect(shadowConfigFor("off")).toBeNull();
    for (const level of ["low", "medium", "high"] as const) {
      expect(shadowsEnabled(level)).toBe(true);
      expect(shadowConfigFor(level)).not.toBeNull();
    }
  });

  it("trades resolution, distance, and cascades per level", () => {
    const low = SHADOW_LEVEL_CONFIG.low;
    const medium = SHADOW_LEVEL_CONFIG.medium;
    const high = SHADOW_LEVEL_CONFIG.high;
    // Resolution steps up, then holds while cascades take over.
    expect(low.mapSize).toBe(1024);
    expect(medium.mapSize).toBe(2048);
    expect(high.mapSize).toBe(2048);
    // Distance bands widen per level.
    expect(low.shadowDistance).toBeLessThan(medium.shadowDistance);
    expect(medium.shadowDistance).toBeLessThan(high.shadowDistance);
    // Cascades: single maps below, real cascade splits at high.
    expect(low.cascades).toBe(1);
    expect(medium.cascades).toBe(1);
    expect(high.cascades).toBeGreaterThan(1);
  });

  it("uses filtering only where it pays", () => {
    expect(SHADOW_LEVEL_CONFIG.low.filtering).toBe("none");
    expect(SHADOW_LEVEL_CONFIG.medium.filtering).toBe("pcf");
    expect(SHADOW_LEVEL_CONFIG.high.filtering).toBe("pcf");
  });

  it("labels every level with its cost", () => {
    for (const level of SHADOW_LEVELS) {
      const cfg = shadowConfigFor(level);
      if (level === "off") continue;
      expect(cfg!.label.length).toBeGreaterThan(0);
      expect(cfg!.blurb.length).toBeGreaterThan(0);
    }
  });
});
