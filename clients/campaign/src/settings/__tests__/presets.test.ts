/**
 * Graphics preset bundle tests (MASTER_PLAN task 12).
 */

import { describe, expect, it } from "vitest";
import {
  describePreset,
  GRAPHICS_PRESETS,
  presetPatch,
} from "../presets.js";
import type { GraphicsQuality } from "../schema.js";

const ORDER: GraphicsQuality[] = ["low", "medium", "high", "ultra"];

describe("graphics presets", () => {
  it("each preset patch carries the full six-field bundle", () => {
    for (const q of ORDER) {
      const patch = presetPatch(q);
      expect(patch.graphicsQuality).toBe(q);
      expect(typeof patch.renderScale).toBe("number");
      expect(typeof patch.antialias).toBe("boolean");
      expect(["low", "high"]).toContain(patch.terrainDetail);
      expect([0, 30, 60, 120]).toContain(patch.maxFps);
      expect(["default", "low-power", "high-performance"]).toContain(patch.powerPreference);
    }
  });

  it("scales demand monotonically from low to ultra", () => {
    // Render scale: higher = cheaper. Frame cap: 0 = uncapped.
    const scales = ORDER.map((q) => GRAPHICS_PRESETS[q].renderScale);
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]!).toBeLessThan(scales[i - 1]!);
    }
    expect(GRAPHICS_PRESETS.low.maxFps).toBe(30);
    expect(GRAPHICS_PRESETS.medium.maxFps).toBe(60);
    expect(GRAPHICS_PRESETS.high.maxFps).toBe(0);
    expect(GRAPHICS_PRESETS.ultra.maxFps).toBe(0);
    expect(GRAPHICS_PRESETS.low.antialias).toBe(false);
    expect(GRAPHICS_PRESETS.ultra.antialias).toBe(true);
  });

  it("describes each preset with its five bundle values", () => {
    for (const q of ORDER) {
      const d = describePreset(q);
      expect(d.split(" · ")).toHaveLength(5);
    }
    expect(describePreset("low")).toContain("AA off");
    expect(describePreset("ultra")).toContain("high-performance");
  });
});
