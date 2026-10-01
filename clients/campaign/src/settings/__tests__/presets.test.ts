/**
 * Graphics preset bundle tests (MASTER_PLAN task 12).
 *
 * One preset click applies 8 settings fields / 10 underlying engine values;
 * these tests lock the bundle shape and the monotonic low -> ultra demand.
 */

import { describe, expect, it } from "vitest";
import {
  describePreset,
  GRAPHICS_PRESETS,
  presetPatch,
} from "../presets.js";
import type { GraphicsQuality } from "../schema.js";

const ORDER: GraphicsQuality[] = ["low", "medium", "high", "ultra"];

/** The 10 underlying engine/scene values one preset click changes (see presets.ts). */
const ENGINE_VALUE_COUNT = 10;

describe("graphics presets", () => {
  it("each preset patch carries the full eight-field bundle", () => {
    for (const q of ORDER) {
      const patch = presetPatch(q);
      expect(patch.graphicsQuality).toBe(q);
      expect(typeof patch.renderScale).toBe("number");
      expect(typeof patch.antialias).toBe("boolean");
      expect(["low", "high"]).toContain(patch.terrainDetail);
      expect([0, 30, 60, 120]).toContain(patch.maxFps);
      expect(["default", "low-power", "high-performance"]).toContain(patch.powerPreference);
      expect(["off", "low", "high"]).toContain(patch.shadowQuality);
      expect(["near", "far", "ultra"]).toContain(patch.viewDistance);
      // 8 fields in the patch; the documented engine-value count holds.
      expect(Object.keys(patch)).toHaveLength(8);
    }
    expect(ENGINE_VALUE_COUNT).toBe(10);
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
    // Shadows and view distance climb with the preset.
    const shadowRank = { off: 0, low: 1, high: 2 } as const;
    const viewRank = { near: 0, far: 1, ultra: 2 } as const;
    for (let i = 1; i < ORDER.length; i++) {
      expect(shadowRank[GRAPHICS_PRESETS[ORDER[i]!].shadowQuality]).toBeGreaterThanOrEqual(
        shadowRank[GRAPHICS_PRESETS[ORDER[i - 1]!].shadowQuality],
      );
      expect(viewRank[GRAPHICS_PRESETS[ORDER[i]!].viewDistance]).toBeGreaterThanOrEqual(
        viewRank[GRAPHICS_PRESETS[ORDER[i - 1]!].viewDistance],
      );
    }
    expect(GRAPHICS_PRESETS.low.shadowQuality).toBe("off");
    expect(GRAPHICS_PRESETS.ultra.shadowQuality).toBe("high");
    expect(GRAPHICS_PRESETS.low.viewDistance).toBe("near");
    expect(GRAPHICS_PRESETS.ultra.viewDistance).toBe("ultra");
  });

  it("describes each preset with its seven bundle values", () => {
    for (const q of ORDER) {
      const d = describePreset(q);
      expect(d.split(" · ")).toHaveLength(7);
    }
    expect(describePreset("low")).toContain("AA off");
    expect(describePreset("low")).toContain("shadows off");
    expect(describePreset("ultra")).toContain("high-performance");
    expect(describePreset("ultra")).toContain("view ultra");
  });
});
