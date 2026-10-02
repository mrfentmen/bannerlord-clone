import { describe, expect, it } from "vitest";
import {
  applyWarPaintPreset,
  warPaintPreset,
  WAR_PAINT_PRESETS,
} from "../warPaintPresets.js";
import { WAR_PAINT_LAYERS } from "../wardrobe.js";

describe("war paint presets (solo task 96)", () => {
  it("offers eight presets", () => {
    expect(WAR_PAINT_PRESETS).toHaveLength(8);
    const ids = new Set(WAR_PAINT_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(8);
  });

  it("one click applies a complete design", () => {
    const design = applyWarPaintPreset("blood-eagle");
    for (const layer of WAR_PAINT_LAYERS) {
      expect(layer in design.layers).toBe(true);
      expect(design.opacity[layer]).toBeGreaterThanOrEqual(0);
      expect(design.opacity[layer]).toBeLessThanOrEqual(1);
    }
    expect(design.layers.marking).toBe("eagle-wings");
  });

  it("presets have names and descriptions", () => {
    for (const p of WAR_PAINT_PRESETS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.description.length).toBeGreaterThan(0);
    }
  });

  it("applying does not mutate the preset", () => {
    const before = JSON.stringify(warPaintPreset("ghost"));
    applyWarPaintPreset("ghost");
    expect(JSON.stringify(warPaintPreset("ghost"))).toBe(before);
  });

  it("unknown presets throw", () => {
    expect(() => applyWarPaintPreset("nope")).toThrow("unknown war paint preset");
  });
});
